"""Персистентные llm_consensus / llm_dispersion в recommendations (финал §8)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260410_0017"
down_revision = "20260409_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recommendations",
        sa.Column("llm_consensus", sa.Numeric(8, 6), nullable=True),
    )
    op.add_column(
        "recommendations",
        sa.Column("llm_dispersion", sa.Numeric(8, 6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recommendations", "llm_dispersion")
    op.drop_column("recommendations", "llm_consensus")
