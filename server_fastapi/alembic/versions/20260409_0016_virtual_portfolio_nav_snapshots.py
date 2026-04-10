"""Таблица дневных снимков NAV виртуальных портфелей (метрики Sharpe/drawdown)."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260409_0016"
down_revision = "20260408_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "virtual_portfolio_nav_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("profile_slug", sa.String(length=32), nullable=False),
        sa.Column("nav_date", sa.Date(), nullable=False),
        sa.Column("total_value", sa.Numeric(24, 6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_slug", "nav_date", name="uq_vp_nav_profile_date"),
    )
    op.create_index(
        "ix_vp_nav_profile_slug",
        "virtual_portfolio_nav_snapshots",
        ["profile_slug"],
        unique=False,
    )
    op.create_index(
        "ix_vp_nav_nav_date",
        "virtual_portfolio_nav_snapshots",
        ["nav_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_vp_nav_nav_date", table_name="virtual_portfolio_nav_snapshots")
    op.drop_index("ix_vp_nav_profile_slug", table_name="virtual_portfolio_nav_snapshots")
    op.drop_table("virtual_portfolio_nav_snapshots")
