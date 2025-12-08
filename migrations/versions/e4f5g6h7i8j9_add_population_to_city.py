"""add population to city

Revision ID: e4f5g6h7i8j9
Revises: 687c45aabe1d
Create Date: 2025-12-08 13:01:03.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e4f5g6h7i8j9"
down_revision = "687c45aabe1d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cities", sa.Column("population", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("cities", "population")
