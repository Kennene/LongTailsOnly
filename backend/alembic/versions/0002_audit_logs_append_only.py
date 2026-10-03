"""audit_logs is append-only (ADR 0011 §5.7)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03 18:00:00

SQLite triggers reject UPDATE and DELETE on audit_logs, also for raw SQL. Demo reset still works:
downgrade drops the triggers first and DROP TABLE never fires them. A future batch_alter_table on
audit_logs recreates the table in SQLite and loses the triggers - such a migration must recreate them.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OPERATIONS = ("UPDATE", "DELETE")


def upgrade() -> None:
    for operation in OPERATIONS:
        op.execute(
            f"CREATE TRIGGER audit_logs_no_{operation.lower()} BEFORE {operation} ON audit_logs "
            "BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END"
        )


def downgrade() -> None:
    for operation in OPERATIONS:
        op.execute(f"DROP TRIGGER IF EXISTS audit_logs_no_{operation.lower()}")
