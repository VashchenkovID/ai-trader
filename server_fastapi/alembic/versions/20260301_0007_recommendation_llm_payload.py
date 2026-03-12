"""add llm_jury_payload to recommendations

Revision ID: 20260301_0007
Revises: 20260228_0005
Create Date: 2026-03-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260301_0007"
down_revision: str | None = "20260228_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "recommendations",
        sa.Column("llm_jury_payload", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recommendations", "llm_jury_payload")
