"""create agents table

Revision ID: c7a8f9b1c2d3
Revises: a1b2c3d4e5f6
Create Date: 2025-02-11
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c7a8f9b1c2d3"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("xp", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("level", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("current_city_id", sa.Integer(), sa.ForeignKey("cities.id"), nullable=True),
        sa.Column("last_city_id", sa.Integer(), sa.ForeignKey("cities.id"), nullable=True),
        sa.Column("energy_current", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("energy_max", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("data_current", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("data_max", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("material_current", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("material_max", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("total_trips", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_cleaned_cities", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_failed_cities", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("codename", sa.String(length=100), nullable=True, unique=True),
        sa.Column("credits", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("infection_level", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_action_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("is_infected", sa.Boolean(), nullable=False, server_default=sa.text("0")),
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
    )


def downgrade():
    op.drop_table("agents")
