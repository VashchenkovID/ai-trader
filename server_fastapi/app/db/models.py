from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampedUUIDModel


class TradingRequest(TimestampedUUIDModel):
    """Каноничная write-сущность торговой заявки."""
    __tablename__ = "trading_requests"

    status: Mapped[str] = mapped_column(String(50), nullable=False)
    figi: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(8), nullable=False, default="BUY")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    budget: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Поля для state machine и lifecycle
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    score: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    ticker: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    actual_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    virtual_profile_slug: Mapped[str | None] = mapped_column(String(32), nullable=True)

    __table_args__ = (
        Index("ix_trading_requests_status", "status"),
        Index("ix_trading_requests_created_at", "created_at"),
        Index("ix_trading_requests_figi", "figi"),
        Index("ix_trading_requests_mode", "mode"),
    )


class User(Base):
    """Пользователь системы для JWT-аутентификации."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Instrument(TimestampedUUIDModel):
    """Справочник торговых инструментов."""
    __tablename__ = "instruments"

    figi: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    ticker: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RUB")
    lot: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)


class Recommendation(TimestampedUUIDModel):
    """Рекомендация по инструменту от аналитического контура."""
    __tablename__ = "recommendations"

    figi: Mapped[str] = mapped_column(String(64), nullable=False)
    recommendation: Mapped[str] = mapped_column(String(16), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    analysis_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    llm_jury_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    nn_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    nn_confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    nn_checkpoint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nn_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weekly_forecast: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weekly_forecast_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Мягкий сигнал для paper / симуляции (основные поля — консервативные для UI/real)
    paper_recommendation: Mapped[str | None] = mapped_column(String(16), nullable=True)
    paper_confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    paper_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    llm_consensus: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    llm_dispersion: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)


class Candle(TimestampedUUIDModel):
    """Историческая свеча инструмента."""
    __tablename__ = "candles"

    figi: Mapped[str] = mapped_column(String(64), nullable=False)
    candle_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    open: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    volume: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (Index("ix_candles_figi_time", "figi", "candle_time"),)


class NewsItem(TimestampedUUIDModel):
    """Новостная запись по инструменту."""
    __tablename__ = "news_items"

    figi: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentiment: Mapped[str] = mapped_column(String(32), nullable=False, default="neutral")
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_news_items_figi_published_at", "figi", "published_at"),)


class ModelPerformance(TimestampedUUIDModel):
    """Метрики производительности моделей/бенчмарков."""
    __tablename__ = "model_performances"

    benchmark: Mapped[str] = mapped_column(String(64), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=0)


class AppSetting(Base):
    """Системная настройка приложения."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    value_type: Mapped[str] = mapped_column(String(32), nullable=False, default="string")
    module: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Asset(TimestampedUUIDModel):
    """Сырые asset-данные из Tinkoff API."""
    __tablename__ = "assets"

    uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    figi: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ticker: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instrument_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_assets_uid", "uid"),
        Index("ix_assets_figi", "figi"),
        Index("ix_assets_ticker", "ticker"),
    )


class Option(TimestampedUUIDModel):
    """Сырые option-данные из Tinkoff API."""
    __tablename__ = "options"

    uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    position_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    figi: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ticker: Mapped[str | None] = mapped_column(String(32), nullable=True)
    basic_asset_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_options_uid", "uid"),
        Index("ix_options_figi", "figi"),
        Index("ix_options_ticker", "ticker"),
    )


class Signal(TimestampedUUIDModel):
    """Сырые analyst signals из Tinkoff API."""
    __tablename__ = "signals"

    signal_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    figi: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ticker: Mapped[str | None] = mapped_column(String(32), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(64), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_signals_signal_uid", "signal_uid"),
        Index("ix_signals_figi", "figi"),
        Index("ix_signals_ticker", "ticker"),
    )


class LlmJuryOpinion(TimestampedUUIDModel):
    """Мнение одного провайдера LLM-жюри по инструменту."""
    __tablename__ = "llm_jury_opinions"

    figi: Mapped[str] = mapped_column(String(64), nullable=False)
    model_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(8), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_llm_jury_opinions_figi_created", "figi", "created_at"),)


class RealPortfolio(Base):
    """Снимок реального портфеля из Tinkoff (аналог Node RealPortfolio)."""
    __tablename__ = "real_portfolio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cash: Mapped[float] = mapped_column(nullable=False, default=0)
    positions: Mapped[dict] = mapped_column(JSON, nullable=False, default=lambda: {})  # {figi: quantity}
    trades: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: [])
    total_value: Mapped[float] = mapped_column(nullable=False, default=0)
    positions_value: Mapped[float] = mapped_column(nullable=False, default=0)
    initial_capital: Mapped[float | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_real_portfolio_last_updated", "last_updated"),)


class VirtualPortfolio(Base):
    """Виртуальный (paper) портфель по профилю (REWRITE_CORE §13); обновляется при исполнении paper-заявок."""

    __tablename__ = "virtual_portfolio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_slug: Mapped[str] = mapped_column(String(32), nullable=False, default="moderate")
    cash: Mapped[float] = mapped_column(nullable=False, default=0)
    positions: Mapped[dict] = mapped_column(JSON, nullable=False, default=lambda: {})  # {figi: quantity}
    trades: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: [])
    total_value: Mapped[float] = mapped_column(nullable=False, default=0)
    positions_value: Mapped[float] = mapped_column(nullable=False, default=0)
    initial_capital: Mapped[float | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_virtual_portfolio_last_updated", "last_updated"),
        UniqueConstraint("profile_slug", name="uq_virtual_portfolio_profile_slug"),
    )


class VirtualPortfolioNavSnapshot(TimestampedUUIDModel):
    """Дневной снимок total_value виртуального портфеля (Sharpe / drawdown)."""

    __tablename__ = "virtual_portfolio_nav_snapshots"

    profile_slug: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    nav_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_value: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)

    __table_args__ = (
        UniqueConstraint("profile_slug", "nav_date", name="uq_vp_nav_profile_date"),
        Index("ix_vp_nav_nav_date", "nav_date"),
    )


class BacktestRun(TimestampedUUIDModel):
    """Сохранённый результат бэктеста (Фаза C)."""

    __tablename__ = "backtest_runs"

    universe_key: Mapped[str] = mapped_column(String(512), nullable=False)
    strategy: Mapped[str] = mapped_column(String(64), nullable=False, default="sma_cross")
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    stats: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class PortfolioAnalyzerReport(TimestampedUUIDModel):
    """Текстовый отчёт анализатора портфелей (Фаза E)."""

    __tablename__ = "portfolio_analyzer_reports"

    user_query: Mapped[str] = mapped_column(Text, nullable=False)
    profiles_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    text_report: Mapped[str] = mapped_column(Text, nullable=False)


class LlmJuryAggregate(TimestampedUUIDModel):
    """Агрегаты мнений LLM-жюри по дате и инструменту для пайплайна фичей."""
    __tablename__ = "llm_jury_aggregates"

    figi: Mapped[str] = mapped_column(String(64), nullable=False)
    aggregate_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consensus: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    dispersion: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    confidence_avg: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)

    __table_args__ = (Index("ix_llm_jury_aggregates_figi_date", "figi", "aggregate_date"),)
