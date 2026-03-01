import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.routers import auth as auth_router
from app.routers.admin import groups as admin_groups
from app.routers.admin import users as admin_users
from app.routers.admin import workflows as admin_workflows
from app.routers.user import approvals as user_approvals
from app.routers.user import comments as user_comments
from app.routers.user import files as user_files
from app.routers.user import instances as user_instances
from app.routers.user import submissions as user_submissions
from app.routers.user import workflows as user_workflows

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up the DB connection pool and JWKS keys at startup."""
    logger.info("Warming up database connection pool…")
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        logger.info("Database connection pool ready.")
    except Exception as exc:
        logger.warning(f"DB warm-up failed (will retry on first request): {exc}")

    from app.auth import _load_jwks
    await _load_jwks()

    yield  # app runs here


app = FastAPI(
    title="WorkflowApp API",
    description="SaaS workflow management platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])

# Admin routes
app.include_router(admin_users.router, prefix="/admin/users", tags=["admin-users"])
app.include_router(admin_groups.router, prefix="/admin/groups", tags=["admin-groups"])
app.include_router(admin_workflows.router, prefix="/admin/workflows", tags=["admin-workflows"])

# User routes
app.include_router(user_workflows.router, prefix="/workflows", tags=["workflows"])
app.include_router(user_instances.router, prefix="/instances", tags=["instances"])
app.include_router(user_submissions.router, prefix="/instances", tags=["submissions"])
app.include_router(user_approvals.router, prefix="/approvals", tags=["approvals"])
app.include_router(user_files.router, prefix="/files", tags=["files"])
app.include_router(user_comments.router, prefix="/instances", tags=["comments"])
app.include_router(user_comments.notifications_router, prefix="/notifications", tags=["notifications"])
app.include_router(user_comments.users_router, prefix="/users", tags=["users"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
