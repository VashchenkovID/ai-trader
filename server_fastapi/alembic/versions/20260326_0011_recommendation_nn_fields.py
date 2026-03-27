"""add nn fields to recommendations

Revision ID: 20260326_0011
Revises: 20260317_0010
Create Date: 2026-03-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260326_0011"
down_revision: str | None = "20260317_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("recommendations", sa.Column("nn_score", sa.Numeric(precision=6, scale=4), nullable=True))
    op.add_column("recommendations", sa.Column("nn_confidence", sa.Numeric(precision=6, scale=4), nullable=True))
    op.add_column("recommendations", sa.Column("nn_checkpoint", sa.String(length=255), nullable=True))
    op.add_column("recommendations", sa.Column("nn_payload", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("recommendations", "nn_payload")
    op.drop_column("recommendations", "nn_checkpoint")
    op.drop_column("recommendations", "nn_confidence")
    op.drop_column("recommendations", "nn_score")
