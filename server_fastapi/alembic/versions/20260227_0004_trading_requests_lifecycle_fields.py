"""trading_requests lifecycle fields

Revision ID: 20260227_0004
Revises: 20260227_0003
Create Date: 2026-02-27

Добавляет поля для полного lifecycle заявки: approved_at, executed_at, expires_at,
confidence, score, ticker, name, reject_reason, actual_price, actual_amount.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260227_0004"
down_revision: str | None = "20260227_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "trading_requests",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("confidence", sa.Numeric(precision=6, scale=4), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("score", sa.Numeric(precision=6, scale=4), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("ticker", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("reject_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("actual_price", sa.Numeric(precision=18, scale=6), nullable=True),
    )
    op.add_column(
        "trading_requests",
        sa.Column("actual_amount", sa.Numeric(precision=18, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trading_requests", "actual_amount")
    op.drop_column("trading_requests", "actual_price")
    op.drop_column("trading_requests", "reject_reason")
    op.drop_column("trading_requests", "name")
    op.drop_column("trading_requests", "ticker")
    op.drop_column("trading_requests", "score")
    op.drop_column("trading_requests", "confidence")
    op.drop_column("trading_requests", "expires_at")
    op.drop_column("trading_requests", "executed_at")
    op.drop_column("trading_requests", "approved_at")
