"""create lab actions tables

Revision ID: f1a2b3c4d5e6
Revises: e4f5g6h7i8j9
Create Date: 2025-12-08 14:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "e4f5g6h7i8j9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "lab_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unlock_level", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("unlock_cleaned_cities", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("unlock_requirements", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("energy_cost", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("data_cost", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("material_cost", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_lab_actions_code"),
    )

    op.create_table(
        "lab_action_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lab_action_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("is_unlocked", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ),
        sa.ForeignKeyConstraint(["lab_action_id"], ["lab_actions.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lab_action_id", "agent_id", name="uq_lab_action_state"),
    )


def downgrade():
    op.drop_table("lab_action_states")
    op.drop_table("lab_actions")
