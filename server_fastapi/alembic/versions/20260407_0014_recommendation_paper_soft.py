"""recommendations: paper_* soft signal for paper pipeline

Revision ID: 20260407_0014
Revises: 20260406_0013
Create Date: 2026-04-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0014"
down_revision: str | None = "20260406_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "recommendations",
        sa.Column("paper_recommendation", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "recommendations",
        sa.Column("paper_confidence", sa.Numeric(6, 4), nullable=True),
    )
    op.add_column(
        "recommendations",
        sa.Column("paper_score", sa.Numeric(6, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recommendations", "paper_score")
    op.drop_column("recommendations", "paper_confidence")
    op.drop_column("recommendations", "paper_recommendation")
