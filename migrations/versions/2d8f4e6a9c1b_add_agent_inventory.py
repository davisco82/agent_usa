"""add agent inventory

Revision ID: 2d8f4e6a9c1b
Revises: 1f2e3d4c5b6a
Create Date: 2025-01-20 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2d8f4e6a9c1b"
down_revision = "1f2e3d4c5b6a"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("agents", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("inventory", sa.JSON(), nullable=False, server_default=sa.text("'{}'"))
        )


def downgrade():
    with op.batch_alter_table("agents", schema=None) as batch_op:
        batch_op.drop_column("inventory")
