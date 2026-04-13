"""Таблица portfolio_position_recommendations (вердикт по позиции в scope портфеля)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON, UUID


revision = "20260413_0018"
down_revision = "20260410_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portfolio_position_recommendations",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("portfolio_scope", sa.String(length=48), nullable=False),
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
        sa.Column("market_score", sa.Numeric(8, 6), nullable=True),
        sa.Column("market_confidence", sa.Numeric(8, 6), nullable=True),
        sa.Column("final_action", sa.String(length=16), nullable=False),
        sa.Column("final_confidence", sa.Numeric(8, 6), nullable=False),
        sa.Column("llm_payload", JSON, nullable=True),
        sa.Column("position_snapshot", JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("raw_llm_text", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_portfolio_position_recommendations_portfolio_scope",
        "portfolio_position_recommendations",
        ["portfolio_scope"],
    )
    op.create_index(
        "ix_portfolio_position_recommendations_figi",
        "portfolio_position_recommendations",
        ["figi"],
    )
    op.create_index(
        "ix_portfolio_position_recommendations_analysis_run_id",
        "portfolio_position_recommendations",
        ["analysis_run_id"],
    )
    op.create_index(
        "ix_ppr_scope_figi_created",
        "portfolio_position_recommendations",
        ["portfolio_scope", "figi", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ppr_scope_figi_created", table_name="portfolio_position_recommendations")
    op.drop_index(
        "ix_portfolio_position_recommendations_analysis_run_id",
        table_name="portfolio_position_recommendations",
    )
    op.drop_index(
        "ix_portfolio_position_recommendations_figi",
        table_name="portfolio_position_recommendations",
    )
    op.drop_index(
        "ix_portfolio_position_recommendations_portfolio_scope",
        table_name="portfolio_position_recommendations",
    )
    op.drop_table("portfolio_position_recommendations")
