"""Add request_number (auto-increment) and cancelled_at to workflow_instances

Revision ID: 003
Revises: 002
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create the sequence that drives request_number ────────────────────────
    op.execute("CREATE SEQUENCE IF NOT EXISTS request_number_seq START 1")

    # ── Add request_number — nullable first so existing rows can be backfilled ─
    op.add_column(
        'workflow_instances',
        sa.Column(
            'request_number',
            sa.Integer(),
            nullable=True,
            server_default=sa.text("nextval('request_number_seq')"),
            comment='Human-readable REQ_N identifier',
        ),
    )

    # Backfill any rows created before this migration (should be zero in prod)
    op.execute(
        "UPDATE workflow_instances "
        "SET request_number = nextval('request_number_seq') "
        "WHERE request_number IS NULL"
    )

    # Make the column NOT NULL now that every row has a value
    op.alter_column('workflow_instances', 'request_number', nullable=False)

    # Unique constraint so two rows can never share a number
    op.create_unique_constraint(
        'uq_instances_request_number', 'workflow_instances', ['request_number']
    )

    # ── Add cancelled_at timestamp for cancelled requests ─────────────────────
    op.add_column(
        'workflow_instances',
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('workflow_instances', 'cancelled_at')
    op.drop_constraint('uq_instances_request_number', 'workflow_instances', type_='unique')
    op.drop_column('workflow_instances', 'request_number')
    op.execute("DROP SEQUENCE IF EXISTS request_number_seq")
