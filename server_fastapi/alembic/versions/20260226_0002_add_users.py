"""add users

Revision ID: 20260226_0002
Revises: 20260226_0001
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260226_0002"
down_revision: str | None = "20260226_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("fullName", sa.String(length=255), nullable=False),
        sa.Column("passwordHash", sa.String(length=255), nullable=False),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("lastLogin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updatedAt", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username_unique", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_username_unique", table_name="users")
    op.drop_table("users")
