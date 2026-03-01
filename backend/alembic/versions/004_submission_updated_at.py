"""Add updated_at to step_submissions for last-saved tracking

Revision ID: 004
Revises: 003
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'step_submissions',
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text('now()'),
        ),
    )
    # Backfill existing rows
    op.execute("UPDATE step_submissions SET updated_at = created_at WHERE updated_at IS NULL")
    op.alter_column('step_submissions', 'updated_at', nullable=False)


def downgrade() -> None:
    op.drop_column('step_submissions', 'updated_at')
