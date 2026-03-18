"""merge alembic heads 0006 and 0008

Revision ID: 20260317_0009
Revises: 20260226_0006, 20260317_0008
Create Date: 2026-03-17
"""

from collections.abc import Sequence

revision: str = "20260317_0009"
down_revision: tuple[str, str] = ("20260226_0006", "20260317_0008")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Merge revision: schema changes are already applied in parent branches.
    return None


def downgrade() -> None:
    return None
