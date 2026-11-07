"""create runs"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision, down_revision = "0001", None


def upgrade():
    op.create_table("runs",
        sa.Column("id", sa.String(32), primary_key=True), sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("state", sa.String(24), nullable=False), sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_runs_user_id", "runs", ["user_id"])
    op.create_index("ix_runs_state", "runs", ["state"])


def downgrade():
    op.drop_table("runs")
