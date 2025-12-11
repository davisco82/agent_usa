"""add agent travel log

Revision ID: 1f2e3d4c5b6a
Revises: 9c63b99f3ea7
Create Date: 2025-01-15 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1f2e3d4c5b6a"
down_revision = "9c63b99f3ea7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_travel_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("from_city_id", sa.Integer(), sa.ForeignKey("cities.id"), nullable=True),
        sa.Column("to_city_id", sa.Integer(), sa.ForeignKey("cities.id"), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False, server_default="travel"),
        sa.Column("game_minutes", sa.Integer(), nullable=False),
        sa.Column("game_week", sa.Integer(), nullable=False),
        sa.Column("game_day_index", sa.Integer(), nullable=False),
        sa.Column("game_day_label", sa.String(length=16), nullable=False),
        sa.Column("game_time_label", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "recorded_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_index(
        "ix_agent_travel_log_agent_id_created_at",
        "agent_travel_log",
        ["agent_id", "created_at"],
    )


def downgrade():
    op.drop_index("ix_agent_travel_log_agent_id_created_at", table_name="agent_travel_log")
    op.drop_table("agent_travel_log")
