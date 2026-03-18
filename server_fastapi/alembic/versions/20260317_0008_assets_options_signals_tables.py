"""add assets/options/signals tables

Revision ID: 20260317_0008
Revises: 20260301_0007
Create Date: 2026-03-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260317_0008"
down_revision: str | None = "20260301_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("uid", sa.String(length=64), nullable=True),
        sa.Column("figi", sa.String(length=64), nullable=True),
        sa.Column("ticker", sa.String(length=32), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("instrument_type", sa.String(length=64), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assets_uid", "assets", ["uid"], unique=False)
    op.create_index("ix_assets_figi", "assets", ["figi"], unique=False)
    op.create_index("ix_assets_ticker", "assets", ["ticker"], unique=False)

    op.create_table(
        "options",
        sa.Column("uid", sa.String(length=64), nullable=True),
        sa.Column("position_uid", sa.String(length=64), nullable=True),
        sa.Column("figi", sa.String(length=64), nullable=True),
        sa.Column("ticker", sa.String(length=32), nullable=True),
        sa.Column("basic_asset_uid", sa.String(length=64), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_options_uid", "options", ["uid"], unique=False)
    op.create_index("ix_options_figi", "options", ["figi"], unique=False)
    op.create_index("ix_options_ticker", "options", ["ticker"], unique=False)

    op.create_table(
        "signals",
        sa.Column("signal_uid", sa.String(length=64), nullable=True),
        sa.Column("figi", sa.String(length=64), nullable=True),
        sa.Column("ticker", sa.String(length=32), nullable=True),
        sa.Column("direction", sa.String(length=16), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_signals_signal_uid", "signals", ["signal_uid"], unique=False)
    op.create_index("ix_signals_figi", "signals", ["figi"], unique=False)
    op.create_index("ix_signals_ticker", "signals", ["ticker"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_signals_ticker", table_name="signals")
    op.drop_index("ix_signals_figi", table_name="signals")
    op.drop_index("ix_signals_signal_uid", table_name="signals")
    op.drop_table("signals")

    op.drop_index("ix_options_ticker", table_name="options")
    op.drop_index("ix_options_figi", table_name="options")
    op.drop_index("ix_options_uid", table_name="options")
    op.drop_table("options")

    op.drop_index("ix_assets_ticker", table_name="assets")
    op.drop_index("ix_assets_figi", table_name="assets")
    op.drop_index("ix_assets_uid", table_name="assets")
    op.drop_table("assets")
