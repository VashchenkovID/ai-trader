import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortfolioService } from '@/api/generated/services/PortfolioService'
import { RiskService } from '@/api/generated/services/RiskService'
import { TradingRequestsService } from '@/api/generated/services/TradingRequestsService'
import { previewTradingRequest, type TradingRequestPreviewBody } from '@/api/tradingRequestsExtras'
import { Button, SurfaceCard, Text } from '@/components/ui'
import './QuickTrade.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export type QuickTradeSource =
  | { kind: 'recommendationFigi'; figi: string }
  | { kind: 'recommendationData'; data: Record<string, unknown> }

export type QuickTradeModalProps = {
  open: boolean
  onClose: () => void
  intent: 'buy' | 'sell'
  source: QuickTradeSource
  confidence: number
  score: number
  mode: string
  portfolioTotalValue?: number | null
  onSuccess?: () => void
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)
}

export function QuickTradeModal({
  open,
  onClose,
  intent,
  source,
  confidence,
  score,
  mode,
  portfolioTotalValue,
  onSuccess,
}: QuickTradeModalProps) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [risk, setRisk] = useState<Record<string, unknown> | null>(null)

  const action = intent === 'buy' ? 'BUY' : 'SELL'

  const runPreviewAndRisk = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    setRisk(null)
    try {
      let pv = portfolioTotalValue
      if ((pv == null || !Number.isFinite(pv)) && mode === 'paper') {
        const res = await PortfolioService.getVirtualPortfolioApiV1PortfolioVirtualGet()
        pv = Number(asRecord(asRecord(res).data).totalValue ?? 0)
      }
      if (pv == null || !Number.isFinite(pv)) {
        pv = 1_000_000
      }

      const body: TradingRequestPreviewBody = {
        options: { action, mode },
      }
      if (source.kind === 'recommendationFigi') {
        body.recommendationFigi = source.figi
      } else {
        body.recommendationData = source.data
      }

      const prevRes = await previewTradingRequest(body)
      const pdata = asRecord(asRecord(prevRes).data)
      setPreview(pdata)

      if (pdata.ok === false) {
        setError(String(pdata.message ?? 'Предрасчёт недоступен'))
        return
      }

      const qty = Number(pdata.quantity ?? 0)
      const price = Number(pdata.price ?? 0)
      const conf = Number(pdata.confidence ?? confidence ?? 0.5)
      const scr = Number(pdata.score ?? score ?? 0.5)

      const riskRes = await RiskService.riskValidateApiV1RiskValidatePost({
        requestBody: {
          figi: String(pdata.figi ?? ''),
          action: String(pdata.action ?? action),
          quantity: qty >= 1 ? qty : 1,
          price: price > 0 ? price : 1,
          confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
          score: Number.isFinite(scr) ? Math.min(1, Math.max(0, scr)) : 0.5,
          portfolioValue: pv,
          currentExposure: 0,
        },
      })
      setRisk(asRecord(asRecord(riskRes).data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [action, confidence, mode, portfolioTotalValue, score, source])

  useEffect(() => {
    if (open) {
      void runPreviewAndRisk()
    }
  }, [open, runPreviewAndRisk])

  const handleCreate = async () => {
    if (!preview || preview.ok === false) return
    setSubmitting(true)
    setError(null)
    try {
      const createBody =
        source.kind === 'recommendationFigi'
          ? {
              recommendationFigi: source.figi,
              options: { action, mode },
            }
          : {
              recommendationData: source.data,
              options: { action, mode },
            }
      await TradingRequestsService.tradingRequestCreateApiV1TradingRequestsCreatePost({
        requestBody: createBody as never,
      })
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать заявку')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const pdata = preview
  const ok = pdata && pdata.ok !== false
  const hasActive = Boolean(pdata?.hasActiveRequest)
  const recLabel = pdata ? String(pdata.recommendation ?? '') : ''
  const actionUpper = String(pdata?.action ?? action)
  const recU = recLabel.toUpperCase()
  const actU = actionUpper.toUpperCase()
  const signalMismatch = ok && (recU === 'BUY' || recU === 'SELL') && recU !== actU

  const riskOk = risk && risk.isValid === true
  const riskErrors = Array.isArray(risk?.errors) ? (risk.errors as string[]) : []
  const riskWarnings = Array.isArray(risk?.warnings) ? (risk.warnings as string[]) : []

  const holdWarning = ok && recLabel.toUpperCase() === 'HOLD'

  /** Создание заявки не блокируется результатом risk/validate — заявка уходит на ручное одобрение. */
  const canSubmit = ok && !hasActive && !submitting && !loading

  return (
    <div className="quick-trade__backdrop" role="presentation" onClick={onClose}>
      <SurfaceCard
        as="div"
        className="quick-trade__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-trade-title"
        onClick={e => e.stopPropagation()}
      >
        <Text as="h2" variant="title" id="quick-trade-title">
          {intent === 'buy' ? 'Покупка' : 'Продажа'}
        </Text>

        {loading && (
          <Text as="p" variant="body" tone="muted">
            Расчёт и проверка риска…
          </Text>
        )}

        {error && (
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        )}

        {ok && pdata && (
          <div className="quick-trade__grid">
            <Text as="p" variant="body">
              <span className="quick-trade__mono">{String(pdata.ticker ?? pdata.figi)}</span> · FIGI{' '}
              <span className="quick-trade__mono">{String(pdata.figi)}</span>
            </Text>
            <Text as="p" variant="body">
              Количество: <strong>{String(pdata.quantity)}</strong>, цена:{' '}
              <strong>{formatMoney(Number(pdata.price ?? 0))}</strong>, сумма:{' '}
              <strong>{formatMoney(Number(pdata.budget ?? 0))}</strong>
            </Text>
            <Text as="p" variant="hint" tone="muted">
              Режим: {String(pdata.mode ?? mode)} · сигнал в БД: {recLabel || '—'}
            </Text>
            {hasActive && (
              <Text as="p" variant="body" tone="danger">
                Уже есть активная заявка по этому инструменту — новую не создать.
              </Text>
            )}
            {holdWarning && (
              <Text as="p" variant="body" tone="danger">
                Рекомендация в БД — HOLD. Сделка может не совпадать с аналитическим сценарием.
              </Text>
            )}
            {signalMismatch && (
              <Text as="p" variant="body" tone="danger">
                Выбрано действие {actionUpper}, в БД рекомендация {recLabel} — проверьте решение.
              </Text>
            )}
          </div>
        )}

        {risk && ok && (
          <div className="quick-trade__grid">
            <Text as="p" variant="label">
              Риск-контур
            </Text>
            {riskOk ? (
              <Text as="p" variant="body" tone="muted">
                Проверка пройдена
              </Text>
            ) : (
              riskErrors.map((msg, i) => (
                <Text key={`e-${i}`} as="p" variant="body" tone="danger">
                  {msg}
                </Text>
              ))
            )}
            {riskWarnings.map((msg, i) => (
              <Text key={`w-${i}`} as="p" variant="hint" tone="muted">
                {msg}
              </Text>
            ))}
            {!riskOk && (
              <Text as="p" variant="hint" tone="muted">
                Это предупреждение не блокирует создание заявки — её можно одобрить или отклонить позже.
              </Text>
            )}
          </div>
        )}

        <div className="quick-trade__actions">
          <Button variant="secondary" type="button" disabled={loading} onClick={() => void runPreviewAndRisk()}>
            Обновить
          </Button>
          <Button variant="secondary" type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" type="button" disabled={!canSubmit} onClick={() => void handleCreate()}>
            Создать заявку
          </Button>
        </div>

        {ok && (
          <Text as="p" variant="hint" tone="muted">
            После создания заявку можно одобрить на странице{' '}
            <Link to="/trading-requests">торговых заявок</Link>.
          </Text>
        )}
      </SurfaceCard>
    </div>
  )
}
