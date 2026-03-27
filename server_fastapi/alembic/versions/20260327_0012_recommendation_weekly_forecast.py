"""weekly forecast columns on recommendations

Revision ID: 20260327_0012
Revises: 20260326_0011
Create Date: 2026-03-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260327_0012"
down_revision: str | None = "20260326_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("recommendations", sa.Column("weekly_forecast", sa.JSON(), nullable=True))
    op.add_column(
        "recommendations",
        sa.Column("weekly_forecast_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recommendations", "weekly_forecast_at")
    op.drop_column("recommendations", "weekly_forecast")
