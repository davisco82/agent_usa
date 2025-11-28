"""add state fields to city

Revision ID: a1b2c3d4e5f6
Revises: 5c32e4234f2b
Create Date: 2025-02-05
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "5c32e4234f2b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cities", sa.Column("state", sa.String(length=100), nullable=True))
    op.add_column("cities", sa.Column("state_shortcut", sa.String(length=10), nullable=True))
    op.add_column("cities", sa.Column("description", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("cities", "description")
    op.drop_column("cities", "state_shortcut")
    op.drop_column("cities", "state")
