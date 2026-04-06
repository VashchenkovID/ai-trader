"""virtual_portfolio: paper portfolio snapshot (singleton id=1)

Revision ID: 20260406_0013
Revises: 20260327_0012
Create Date: 2026-04-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260406_0013"
down_revision: str | None = "20260327_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "virtual_portfolio",
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
    op.create_index("ix_virtual_portfolio_last_updated", "virtual_portfolio", ["last_updated"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_virtual_portfolio_last_updated", table_name="virtual_portfolio")
    op.drop_table("virtual_portfolio")
