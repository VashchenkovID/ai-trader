"""
Ручной импорт батч-ответов LLM (GigaChat + Алиса): промпт по чанкам инструментов,
парсинг, persist жюри, NN + fusion и upsert рекомендаций с analysis_date = сейчас (МСК).
"""

from __future__ import annotations

import logging
import os
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time_utils import now_msk
from app.db.models import AppSetting
from app.services.container import AppContainer
from app.services.llm_jury_service import persist_llm_jury_batch_chunk
from training.llm_jury.prompts import build_jury_batch_prompt
from training.llm_jury.providers.alisa_gpt import AlisaGptProvider
from training.llm_jury.providers.gigachat import GigaChatProvider
from training.llm_jury.run import build_by_figi_from_manual_dual_raw

logger = logging.getLogger(__name__)


def _manual_jury_providers() -> list[Any]:
    return [GigaChatProvider(), AlisaGptProvider()]


async def _load_app_settings_map(session: AsyncSession) -> dict[str, str]:
    if not hasattr(session, "execute"):
        return {}
    rows = (await session.execute(select(AppSetting.key, AppSetting.value))).all()
    return {str(k): str(v) for k, v in rows if isinstance(k, str)}


async def _build_chunk_items(
    session: AsyncSession,
    market_repo: Any,
    *,
    chunk_index: int,
    batch_size: int,
) -> tuple[list[dict[str, str]], int]:
    """Список элементов батча и chunk_total (число чанков по всем инструментам)."""
    n = await market_repo.count_instruments(session)
    if n <= 0:
        raise AppError("BAD_REQUEST", message="В справочнике нет инструментов")
    chunk_total = (int(n) + batch_size - 1) // batch_size
    if chunk_index < 0 or chunk_index >= chunk_total:
        raise AppError(
            "BAD_REQUEST",
            message="Некорректный chunkIndex",
            details={"chunkIndex": chunk_index, "chunkTotal": chunk_total},
        )
    offset = chunk_index * batch_size
    inst_rows = await market_repo.list_instruments(session, offset=offset, limit=batch_size)
    items: list[dict[str, str]] = []
    for inst in inst_rows:
        figi = getattr(inst, "figi", None)
        if not figi:
            continue
        ticker = str(getattr(inst, "ticker", None) or figi)
        sector = str(getattr(inst, "sector", None) or "—")
        candles = await market_repo.get_candles_by_figi(session, figi=str(figi), offset=0, limit=30)
        if candles:
            parts = [f"close: {c.close}" for c in candles[-5:]]
            context = f"Тикер {ticker}, сектор {sector}. Последние свечи: {', '.join(parts)}."
        else:
            context = f"Тикер {ticker}, сектор {sector}."
        items.append({"figi": str(figi), "ticker": ticker, "context": context})
    return items, chunk_total


async def get_manual_prompt_chunk(
    session: AsyncSession,
    market_repo: Any,
    *,
    chunk_index: int,
    batch_size: int,
) -> dict[str, Any]:
    items, chunk_total = await _build_chunk_items(
        session, market_repo, chunk_index=chunk_index, batch_size=batch_size
    )
    lines: list[str] = []
    for it in items:
        figi = str(it.get("figi") or "").strip()
        if not figi:
            continue
        ticker = str(it.get("ticker") or "").strip()
        ctx = str(it.get("context") or "").strip()
        tick_part = f"тикер {ticker}; " if ticker else ""
        lines.append(f"{len(lines) + 1}. FIGI={figi}; {tick_part}{ctx}")
    prompt = build_jury_batch_prompt(lines)
    return {
        "chunkIndex": chunk_index,
        "chunkTotal": chunk_total,
        "batchSize": batch_size,
        "figis": [str(i["figi"]) for i in items if i.get("figi")],
        "prompt": prompt,
    }


async def apply_manual_llm_chunk(
    session: AsyncSession,
    container: AppContainer,
    market_repo: Any,
    *,
    chunk_index: int,
    batch_size: int,
    figis: list[str],
    gigachat_raw: str,
    alisa_raw: str,
) -> dict[str, Any]:
    from app.scheduler import (
        _adaptive_fusion_params,
        _analysis_runtime_settings,
        _calibrate_confidence,
        _clamp01,
        _latest_checkpoint_path,
        _nn_conf_with_llm_fallback,
        _nn_score_with_llm_fallback,
        _run_nn_inference_for_figi,
    )

    items, _chunk_total = await _build_chunk_items(
        session, market_repo, chunk_index=chunk_index, batch_size=batch_size
    )
    expected = [str(i["figi"]) for i in items if i.get("figi")]
    posted = [str(f).strip() for f in figis if str(f).strip()]
    if posted != expected:
        raise AppError(
            "BAD_REQUEST",
            message="Список FIGI не совпадает с выбранным чанком (порядок и состав).",
            details={"expected": expected, "posted": posted},
        )

    if not posted:
        raise AppError("BAD_REQUEST", message="Пустой список FIGI")

    app_settings = await _load_app_settings_map(session)
    runtime = _analysis_runtime_settings(app_settings)
    conf_temp_nn_only = runtime.conf_temp_nn_only
    conf_temp_llm_only = runtime.conf_temp_llm_only
    conf_temp_nn_llm = runtime.conf_temp_nn_llm
    llm_margin = runtime.llm_margin
    quality_gates_enabled = runtime.quality_gates_enabled

    out = build_by_figi_from_manual_dual_raw(posted, gigachat_raw, alisa_raw)
    providers = _manual_jury_providers()
    await persist_llm_jury_batch_chunk(
        session,
        figis=posted,
        providers=providers,
        raw_opinions=out["rawOpinions"],
    )

    models_dir = os.path.join("models", "python_nn")
    nn_ckpt = _latest_checkpoint_path(models_dir)
    if not nn_ckpt:
        fallback = "./models/python_nn/cond_mlp-latest.ckpt"
        nn_ckpt = fallback if os.path.exists(fallback) else None

    analysis_dt = now_msk()
    updated: list[str] = []
    errors: list[dict[str, str]] = []

    for figi in posted:
        br = (out.get("byFigi") or {}).get(figi)
        if not br:
            errors.append({"figi": figi, "message": "Нет агрегата по FIGI в батче"})
            continue

        nn_data: dict[str, Any] | None = None
        if nn_ckpt:
            try:
                nn_data = await _run_nn_inference_for_figi(figi, nn_ckpt)
            except Exception as e:
                logger.warning("NN inference failed for %s: %s", figi, e)
                errors.append({"figi": figi, "message": f"nn_exception: {e}"})
                nn_data = {"ok": False, "reason": "exception", "detail": str(e)}
        else:
            nn_data = {"ok": False, "reason": "checkpoint_missing"}

        nn_ok = bool(nn_data and nn_data.get("ok"))
        regime = str(((nn_data or {}).get("payload") or {}).get("marketRegime") or "normal")
        w_nn, w_llm, buy_threshold, sell_threshold = _adaptive_fusion_params(regime)
        nn_score_preview = _clamp01(float(nn_data.get("score")), default=0.5) if nn_ok else None
        margin_use_llm = True
        if nn_score_preview is not None:
            margin_use_llm = abs(nn_score_preview - 0.5) <= max(0.01, llm_margin)

        llm_payload: dict[str, Any] = {
            "providers": br.get("provider_payload") or {},
            "consensus": float(br["consensus"]),
            "dispersion": float(br["dispersion"]),
            "confidenceAvg": float(br["confidence_avg"]),
            "requiredProvidersPresent": bool(br.get("required_providers_present")),
            "source": "scheduler_analysis",
        }
        if bool(br.get("required_providers_present")):
            llm_consensus = _clamp01(float(br["consensus"]))
            llm_confidence = _clamp01(float(br["confidence_avg"]))
            llm_reason = "ok" if margin_use_llm else "skipped_confident_nn"
        else:
            llm_consensus = None
            llm_confidence = None
            llm_reason = "unavailable" if margin_use_llm else "skipped_confident_nn"

        llm_ok = (
            margin_use_llm and llm_consensus is not None and llm_confidence is not None
        )
        final_score: float | None = None
        final_conf: float | None = None
        fusion_mode = "none"

        if nn_ok and llm_ok:
            nn_score = _clamp01(float(nn_data.get("score")), default=0.5)
            nn_conf = _clamp01(float(nn_data.get("confidence")), default=0.5)
            nn_score_fused = _nn_score_with_llm_fallback(nn_score, llm_consensus)
            nn_conf_fused = _nn_conf_with_llm_fallback(nn_conf, llm_confidence)
            final_score = _clamp01(w_nn * nn_score_fused + w_llm * float(llm_consensus))
            raw_conf = _clamp01(w_nn * nn_conf_fused + w_llm * float(llm_confidence))
            final_conf = _calibrate_confidence(raw_conf, mode="nn_llm", temperature=conf_temp_nn_llm)
            fusion_mode = "nn_llm"
        elif nn_ok:
            nn_score = _clamp01(float(nn_data.get("score")), default=0.5)
            nn_conf = _clamp01(float(nn_data.get("confidence")), default=0.5)
            nn_score_fused = _nn_score_with_llm_fallback(nn_score, llm_consensus)
            nn_conf_fused = _nn_conf_with_llm_fallback(nn_conf, llm_confidence)
            final_score = nn_score_fused
            final_conf = _calibrate_confidence(
                nn_conf_fused, mode="nn_only", temperature=conf_temp_nn_only
            )
            fusion_mode = "nn_only"
        elif llm_ok:
            final_score = float(llm_consensus)
            final_conf = _calibrate_confidence(
                float(llm_confidence), mode="llm_only", temperature=conf_temp_llm_only
            )
            fusion_mode = "llm_only"
        else:
            if quality_gates_enabled:
                final_score = 0.5
                final_conf = 0.5
                fusion_mode = "degrade_to_hold"
            else:
                errors.append({"figi": figi, "message": "no_signal_skip"})
                continue

        fusion_payload: dict[str, Any] = {
            "source": "scheduler_analysis_hybrid",
            "weights": {"nn": w_nn, "llm": w_llm},
            "thresholds": {"buy": buy_threshold, "sell": sell_threshold},
            "marketRegime": regime,
            "mode": fusion_mode,
            "nnAvailable": nn_ok,
            "llmAvailable": llm_ok,
            "llmReason": llm_reason,
            "finalScore": final_score,
            "finalConfidence": final_conf,
            "calibration": {
                "nnOnlyTemperature": conf_temp_nn_only,
                "llmOnlyTemperature": conf_temp_llm_only,
                "nnLlmTemperature": conf_temp_nn_llm,
            },
        }
        if nn_data is not None:
            fusion_payload["nn"] = nn_data
        if llm_payload is not None:
            fusion_payload["llm"] = llm_payload

        nn_score_v = _clamp01(float(nn_data.get("score")), default=0.5) if nn_ok else None
        nn_conf_v = _clamp01(float(nn_data.get("confidence")), default=0.5) if nn_ok else None
        final_recommendation = (
            "BUY"
            if final_score is not None and final_score >= buy_threshold
            else "SELL"
            if final_score is not None and final_score <= sell_threshold
            else "HOLD"
        )

        await market_repo.upsert_recommendation(
            session,
            figi=figi,
            recommendation=final_recommendation,
            confidence=Decimal(str(round(float(final_conf), 4))),
            score=Decimal(str(round(float(final_score), 4))),
            analysis_date=analysis_dt,
            llm_jury_payload=fusion_payload,
            nn_score=Decimal(str(round(float(nn_score_v), 4))) if nn_score_v is not None else None,
            nn_confidence=Decimal(str(round(float(nn_conf_v), 4))) if nn_conf_v is not None else None,
            nn_checkpoint=str(nn_data.get("checkpoint")) if nn_ok else None,
            nn_payload=(
                (nn_data or {}).get("payload")
                if nn_ok
                else {"ok": False, "reason": (nn_data or {}).get("reason", "unavailable")}
            ),
        )
        try:
            await container.market_service.compute_and_store_weekly_forecast(session, figi)
        except Exception as wf_exc:
            logger.warning("weekly forecast persist failed for %s: %s", figi, wf_exc)
        updated.append(figi)

    await session.commit()
    return {"updated": updated, "errors": errors, "figis": posted}
