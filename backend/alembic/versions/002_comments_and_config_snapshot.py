"""Add config_snapshot, step_comments, comment_mentions

Revision ID: 002
Revises: 001
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Feature 2: config snapshot on completed workflow instances ────────────
    op.add_column(
        'workflow_instances',
        sa.Column(
            'config_snapshot',
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
            comment='Frozen copy of definition.config captured at completion time',
        ),
    )

    # ── Feature 3: step-level comments ───────────────────────────────────────
    op.create_table(
        'step_comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('instance_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('step_id', sa.Integer(), nullable=False),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['instance_id'], ['workflow_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_step_comments_instance_step', 'step_comments',
                    ['instance_id', 'step_id'])

    # ── Feature 3: @mention notifications ────────────────────────────────────
    op.create_table(
        'comment_mentions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('comment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('instance_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('step_id', sa.Integer(), nullable=False),
        sa.Column('mentioned_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['comment_id'], ['step_comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['mentioned_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_comment_mentions_user_unread', 'comment_mentions',
                    ['mentioned_user_id', 'is_read'])


def downgrade() -> None:
    op.drop_index('ix_comment_mentions_user_unread', table_name='comment_mentions')
    op.drop_table('comment_mentions')
    op.drop_index('ix_step_comments_instance_step', table_name='step_comments')
    op.drop_table('step_comments')
    op.drop_column('workflow_instances', 'config_snapshot')
