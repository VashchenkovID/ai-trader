"""REWRITE_CORE: virtual profiles, trading_requests.virtual_profile_slug, backtest_runs, analyzer reports

Revision ID: 20260408_0015
Revises: 20260407_0014
Create Date: 2026-04-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260408_0015"
down_revision: str | None = "20260407_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "virtual_portfolio",
        sa.Column("profile_slug", sa.String(length=32), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE virtual_portfolio SET profile_slug = 'moderate' WHERE profile_slug IS NULL"
        )
    )
    op.alter_column(
        "virtual_portfolio",
        "profile_slug",
        existing_type=sa.String(length=32),
        nullable=False,
        server_default="moderate",
    )
    op.create_unique_constraint(
        "uq_virtual_portfolio_profile_slug",
        "virtual_portfolio",
        ["profile_slug"],
    )

    for slug in ("conservative", "aggressive", "experimental"):
        op.execute(
            sa.text(
                """
                INSERT INTO virtual_portfolio (
                    cash, positions, trades, total_value, positions_value,
                    initial_capital, version, profile_slug, last_updated
                )
                SELECT m.cash, m.positions, m.trades, m.total_value, m.positions_value,
                       m.initial_capital, 1, :slug, NOW()
                FROM virtual_portfolio m
                WHERE m.profile_slug = 'moderate'
                  AND NOT EXISTS (SELECT 1 FROM virtual_portfolio vp WHERE vp.profile_slug = :slug)
                LIMIT 1
                """
            ).bindparams(slug=slug)
        )

    op.add_column(
        "trading_requests",
        sa.Column("virtual_profile_slug", sa.String(length=32), nullable=True),
    )

    op.create_table(
        "backtest_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("universe_key", sa.String(length=512), nullable=False),
        sa.Column("strategy", sa.String(length=64), nullable=False, server_default="sma_cross"),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("stats", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_backtest_runs_created_at", "backtest_runs", ["created_at"])

    op.create_table(
        "portfolio_analyzer_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("user_query", sa.Text(), nullable=False),
        sa.Column("profiles_payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("text_report", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_portfolio_analyzer_reports_created_at",
        "portfolio_analyzer_reports",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_portfolio_analyzer_reports_created_at", table_name="portfolio_analyzer_reports")
    op.drop_table("portfolio_analyzer_reports")
    op.drop_index("ix_backtest_runs_created_at", table_name="backtest_runs")
    op.drop_table("backtest_runs")
    op.drop_column("trading_requests", "virtual_profile_slug")
    op.drop_constraint("uq_virtual_portfolio_profile_slug", "virtual_portfolio", type_="unique")
    op.drop_column("virtual_portfolio", "profile_slug")
