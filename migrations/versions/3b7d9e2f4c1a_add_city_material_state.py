"""add city material state

Revision ID: 3b7d9e2f4c1a
Revises: 2d8f4e6a9c1b
Create Date: 2025-02-14 10:35:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3b7d9e2f4c1a"
down_revision = "2d8f4e6a9c1b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "cities",
        sa.Column("material_info_qty", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "cities",
        sa.Column("market_material_qty", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "cities",
        sa.Column("market_material_price", sa.Integer(), nullable=True),
    )
    op.add_column(
        "cities",
        sa.Column("material_refreshed_at", sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column("cities", "material_refreshed_at")
    op.drop_column("cities", "market_material_price")
    op.drop_column("cities", "market_material_qty")
    op.drop_column("cities", "material_info_qty")
