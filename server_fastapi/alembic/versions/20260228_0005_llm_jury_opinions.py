"""llm_jury_opinions and llm_jury_aggregates

Revision ID: 20260228_0005
Revises: 20260227_0004
Create Date: 2026-02-28

Таблицы для сохранения мнений LLM-жюри и агрегатов по дате/инструменту.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260228_0005"
down_revision: str | None = "20260227_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "llm_jury_opinions",
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("model_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=8), nullable=False),
        sa.Column("confidence", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_llm_jury_opinions_figi_created",
        "llm_jury_opinions",
        ["figi", "created_at"],
        unique=False,
    )

    op.create_table(
        "llm_jury_aggregates",
        sa.Column("figi", sa.String(length=64), nullable=False),
        sa.Column("aggregate_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consensus", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("dispersion", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("confidence_avg", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_llm_jury_aggregates_figi_date",
        "llm_jury_aggregates",
        ["figi", "aggregate_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_llm_jury_aggregates_figi_date", table_name="llm_jury_aggregates")
    op.drop_table("llm_jury_aggregates")
    op.drop_index("ix_llm_jury_opinions_figi_created", table_name="llm_jury_opinions")
    op.drop_table("llm_jury_opinions")
