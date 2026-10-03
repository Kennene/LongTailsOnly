"""repository provider (github | jira)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (plain ALTER: batch mode would recreate the table that other tables reference)."""
    op.add_column('repositories', sa.Column(
        'provider', sa.Enum('github', 'jira', name='provider', native_enum=False, length=32),
        server_default='github', nullable=False,
    ))


def downgrade() -> None:
    """Downgrade schema (SQLite >= 3.35 supports DROP COLUMN)."""
    op.drop_column('repositories', 'provider')
