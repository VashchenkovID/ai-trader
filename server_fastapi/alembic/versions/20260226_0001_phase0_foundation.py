"""phase0 foundation

Revision ID: 20260226_0001
Revises:
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260226_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trading_requests",
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
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


def downgrade() -> None:
    op.drop_index("ix_trading_requests_mode", table_name="trading_requests")
    op.drop_index("ix_trading_requests_figi", table_name="trading_requests")
    op.drop_index("ix_trading_requests_created_at", table_name="trading_requests")
    op.drop_index("ix_trading_requests_status", table_name="trading_requests")
    op.drop_table("trading_requests")
