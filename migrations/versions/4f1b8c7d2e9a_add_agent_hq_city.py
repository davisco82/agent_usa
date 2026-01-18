"""add agent hq city

Revision ID: 4f1b8c7d2e9a
Revises: 3b7d9e2f4c1a
Create Date: 2025-02-14 11:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4f1b8c7d2e9a"
down_revision = "3b7d9e2f4c1a"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col["name"] for col in inspector.get_columns("agents")]
    if "hq_city_id" not in columns:
        op.add_column("agents", sa.Column("hq_city_id", sa.Integer(), nullable=True))

    fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("agents")}
    if "fk_agents_hq_city_id" not in fk_names:
        with op.batch_alter_table("agents") as batch:
            batch.create_foreign_key(
                "fk_agents_hq_city_id",
                "cities",
                ["hq_city_id"],
                ["id"],
            )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("agents")}
    if "fk_agents_hq_city_id" in fk_names:
        with op.batch_alter_table("agents") as batch:
            batch.drop_constraint("fk_agents_hq_city_id", type_="foreignkey")

    columns = [col["name"] for col in inspector.get_columns("agents")]
    if "hq_city_id" in columns:
        op.drop_column("agents", "hq_city_id")
