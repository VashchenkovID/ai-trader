"""real_portfolio (Tinkoff Phase 5)

Revision ID: 20260226_0006
Revises: 20260228_0005
Create Date: 2026-02-26

Таблица снимка реального портфеля из Tinkoff Invest API (аналог Node RealPortfolio).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260226_0006"
down_revision: str | None = "20260228_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "real_portfolio",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("cash", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("positions", postgresql.JSONB(none_as_null=False), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("trades", postgresql.JSONB(none_as_null=False), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("total_value", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("positions_value", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("initial_capital", sa.Float(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("last_updated", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_real_portfolio_last_updated", "real_portfolio", ["last_updated"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_real_portfolio_last_updated", table_name="real_portfolio")
    op.drop_table("real_portfolio")
