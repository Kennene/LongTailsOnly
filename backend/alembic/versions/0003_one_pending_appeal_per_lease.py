"""at most one PENDING appeal per lease (ADR 0010 §5.4)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-03 21:00:00

A partial unique index closes the race of two concurrent submissions that both pass the service check.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("uq_appeals_one_pending_per_lease", "appeals", ["lease_id"], unique=True,
                    sqlite_where=sa.text("status = 'PENDING'"))


def downgrade() -> None:
    op.drop_index("uq_appeals_one_pending_per_lease", table_name="appeals")
