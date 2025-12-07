"""create agent task progress

Revision ID: 0b1f6a3cfe1e
Revises: c7a8f9b1c2d3
Create Date: 2025-12-05 15:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0b1f6a3cfe1e"
down_revision = "c7a8f9b1c2d3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_task_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("task_id", sa.String(length=120), nullable=False),
        sa.Column("objectives_state", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("xp_earned", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("agent_id", "task_id", name="uq_agent_task_progress_agent_task"),
    )


def downgrade():
    op.drop_table("agent_task_progress")
