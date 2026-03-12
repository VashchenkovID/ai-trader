"""clean schema baseline

Revision ID: 20260227_0003
Revises: 20260226_0002
Create Date: 2026-02-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260227_0003"
down_revision: str | None = "20260226_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Переходим на чистую каноничную схему (legacy таблицы считаем нецелевыми).
    op.execute("DROP TABLE IF EXISTS candles CASCADE")
    op.execute("DROP TABLE IF EXISTS news_items CASCADE")
    op.execute("DROP TABLE IF EXISTS recommendations CASCADE")
    op.execute("DROP TABLE IF EXISTS instruments CASCADE")
    op.execute("DROP TABLE IF EXISTS model_performances CASCADE")
    op.execute("DROP TABLE IF EXISTS app_settings CASCADE")
    op.execute("DROP TABLE IF EXISTS trading_requests CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username_unique", "users", ["username"], unique=True)

    op.create_table(
        "trading_requests",
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=8), nullable=False, server_default=sa.text("'BUY'")),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("price", sa.Numeric(precision=18, scale=6), nullable=False, server_default=sa.text("0")),
        sa.Column("budget", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trading_requests_status", "trading_requests", ["status"], unique=False)
    op.create_index("ix_trading_requests_created_at", "trading_requests", ["created_at"], unique=False)
    op.create_index("ix_trading_requests_figi", "trading_requests", ["figi"], unique=False)
    op.create_index("ix_trading_requests_mode", "trading_requests", ["mode"], unique=False)

    op.create_table(
        "instruments",
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("ticker", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sector", sa.String(length=100), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default=sa.text("'RUB'")),
        sa.Column("lot", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("last_price", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("figi", name="uq_instruments_figi"),
    )

    op.create_table(
        "recommendations",
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("recommendation", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("score", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("analysis_date", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "candles",
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("candle_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("high", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("low", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("close", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("volume", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_candles_figi_time", "candles", ["figi", "candle_time"], unique=False)

    op.create_table(
        "news_items",
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("sentiment", sa.String(length=32), nullable=False, server_default=sa.text("'neutral'")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_news_items_figi_published_at", "news_items", ["figi", "published_at"], unique=False)

    op.create_table(
        "model_performances",
        sa.Column("benchmark", sa.String(length=64), nullable=False),
        sa.Column("score", sa.Numeric(precision=10, scale=4), nullable=False, server_default=sa.text("0")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("value_type", sa.String(length=32), nullable=False, server_default=sa.text("'string'")),
        sa.Column("module", sa.String(length=64), nullable=False, server_default=sa.text("'system'")),
        sa.Column("description", sa.String(length=255), nullable=False, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("model_performances")
    op.drop_index("ix_news_items_figi_published_at", table_name="news_items")
    op.drop_table("news_items")
    op.drop_index("ix_candles_figi_time", table_name="candles")
    op.drop_table("candles")
    op.drop_table("recommendations")
    op.drop_table("instruments")
    op.drop_index("ix_trading_requests_mode", table_name="trading_requests")
    op.drop_index("ix_trading_requests_figi", table_name="trading_requests")
    op.drop_index("ix_trading_requests_created_at", table_name="trading_requests")
    op.drop_index("ix_trading_requests_status", table_name="trading_requests")
    op.drop_table("trading_requests")
    op.drop_index("ix_users_username_unique", table_name="users")
    op.drop_table("users")
