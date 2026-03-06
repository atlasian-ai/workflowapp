"""Enable Row Level Security on all public tables

Revision ID: 005
Revises: 004
Create Date: 2026-03-07

Why:
    Supabase exposes the public schema via PostgREST. Without RLS, any request
    carrying the project's anon key can query these tables directly, bypassing
    the FastAPI backend entirely.

    Enabling RLS (without FORCE) blocks PostgREST anon/authenticated access
    while leaving FastAPI unaffected — the backend connects via DATABASE_URL as
    the postgres superuser, which always bypasses RLS in PostgreSQL.

    No permissive policies are added because this application does NOT use
    PostgREST / Supabase client-side data access. All data access goes through
    the FastAPI REST API.
"""

from alembic import op

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None

# All tables in the public schema (application + Alembic internal)
TABLES = [
    'alembic_version',
    'users',
    'groups',
    'user_group_memberships',
    'workflow_definitions',
    'workflow_instances',
    'step_assignments',
    'step_submissions',
    'approvals',
    'file_attachments',
    'reference_lists',
    'step_comments',
    'comment_mentions',
]


def upgrade() -> None:
    for table in TABLES:
        # ENABLE ROW LEVEL SECURITY — blocks PostgREST (anon/authenticated role)
        # Does NOT use FORCE, so the postgres superuser continues to bypass RLS.
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
