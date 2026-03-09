# Forgeflow — PoC

A multi-tenant SaaS workflow management platform. Admins define business process workflows, publish them, and users run instances through sequential form-fill → approval cycles.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.x async |
| Database | Supabase Postgres |
| Auth | Supabase Auth (JWT) |
| File Storage | Supabase Storage |
| Background Tasks | Celery + Railway Redis |
| OCR | Claude API (claude-haiku-4-5) |
| Frontend | React 18 + Vite + Tailwind + Shadcn |

---

## Cloud Platform Summary

| Platform | Role | What it does |
|---|---|---|
| **Supabase** | Database + Auth + Storage | Hosts the Postgres database, handles user authentication (JWT), and stores all uploaded files in Supabase Storage buckets |
| **Railway** | Redis (message broker) | Provides the Redis instance used by Celery as a message broker and result backend for background OCR tasks |
| **Railway** | Hosting (backend + frontend) | Hosts the FastAPI backend (Docker container running Uvicorn + Celery) and serves the React frontend as a static web service |

---

## Project Structure

```
workflowapp/
├── backend/           FastAPI application
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/    SQLAlchemy ORM models
│   │   ├── schemas/   Pydantic schemas
│   │   ├── routers/   API endpoints (admin/ + user/)
│   │   ├── services/  workflow_engine, ocr_service, storage_service
│   │   └── workers/   Celery tasks
│   └── alembic/       DB migrations
└── frontend/          React application
    └── src/
        ├── pages/     admin/ + user/ pages
        ├── components/
        │   └── form-renderer/  DynamicForm + all 11 field types
        ├── hooks/
        ├── lib/       api.ts, supabase.ts, calc-engine.ts
        └── types/     TypeScript types
```

---

## Local Development Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. From **Settings → API**, copy:
   - `SUPABASE_URL`
   - `SUPABASE_JWT_SECRET` (JWT secret, not anon key)
   - `SUPABASE_SERVICE_KEY` (service_role key)
   - `VITE_SUPABASE_ANON_KEY` (anon key)
3. From **Settings → Database → Connection string (URI)**, copy the asyncpg URL:
   ```
   postgresql+asyncpg://postgres:[password]@db.[ref].supabase.co:5432/postgres
   ```
4. Create a Storage bucket named `workflow-files` (or your chosen bucket name)

### 2. Upstash Redis

1. Create a Redis database at [console.upstash.com](https://console.upstash.com)
2. Copy the **TLS URL** (starts with `rediss://`) — this is your `UPSTASH_REDIS_URL`

### 3. Backend

```bash
cd backend
cp .env.example .env
# Fill in .env values

pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL

npm install
npm run dev
```

---

## Deployment (Railway)

Both backend and frontend are deployed on [Railway](https://railway.app).

### Backend service (`workflowapp-api`)
- **Runtime:** Docker (uses `backend/Dockerfile`)
- **Root directory:** `backend`
- **Start:** `bash start.sh` — launches Celery worker in background, then Uvicorn in foreground
- **Required environment variables:**

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | service_role key from Supabase → Settings → API |
| `SUPABASE_STORAGE_BUCKET` | Supabase Storage bucket name (default: `workflow-files`) |
| `DATABASE_URL` | asyncpg connection string from Supabase |
| `UPSTASH_REDIS_URL` | TLS Redis URL from Upstash (`rediss://...`) |
| `ANTHROPIC_API_KEY` | API key for Claude OCR |
| `SECRET_KEY` | Long random string for app security |
| `FRONTEND_URL` | Railway frontend URL (for CORS) |

### Frontend service (`workflowapp-frontend`)
- **Runtime:** Node (npm build)
- **Root directory:** `frontend`
- **Build command:** `npm install && npm run build`
- **Start command:** `npx serve dist`
- **Required environment variables:**

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | anon key from Supabase → Settings → API |
| `VITE_SUPABASE_STORAGE_BUCKET` | Supabase Storage bucket name |
| `VITE_API_URL` | Railway backend URL (e.g. `https://workflowapp-api-xxxx.up.railway.app`) |

---

## Workflow JSON Config

The workflow definition is a JSON array of steps. Each step has:
- `step_id` — integer ordering
- `step_label` — display name
- `approvers` — list of `"group:name"` or `"user:email"` specs (bare emails also accepted)
- `form_fields` — array of field definitions

### Supported Field Types

| Type | Description |
|---|---|
| `textbox` | Single-line text input |
| `textarea` | Multi-line text input |
| `number` | Numeric input |
| `date` | Date picker (supports `"default": "today"`) |
| `dropdown` | Select from options (inline or `list_name`) |
| `radio` | Radio button group |
| `checkbox` | Single checkbox or multi-option |
| `file_upload` | File upload to Supabase Storage |
| `ocr_reader` | Upload document → Claude extracts fields → auto-populates |
| `calculated` | Auto-computed from formula (e.g. `"f008 * f009"`) |
| `table` | Editable data table with calculated columns |

---

## User Roles

| Role | Capabilities |
|---|---|
| `admin` | All admin + user capabilities |
| `preparer` | Create instances, fill forms |
| `reviewer` | Approve/reject steps |
| `approver` | Approve/reject steps |

The first user to sign in is automatically made **admin**. New users must be added directly via **Supabase → Authentication → Users → Add user** (sign-up is disabled on the login page).

---

## Key API Endpoints

```
POST /auth/sync               Sync Supabase user to local DB
GET  /auth/me                 Get current user

GET  /admin/users             List users
PUT  /admin/users/{id}        Update role/status

GET  /admin/groups            List groups
POST /admin/groups/{id}/members   Add member

GET  /admin/workflows         List all definitions
POST /admin/workflows         Create definition (JSON config)
POST /admin/workflows/{id}/publish   Publish

GET  /workflows               List published workflows
POST /instances               Start a workflow instance
GET  /instances/{id}          Get instance + config
POST /instances/{id}/steps/{step_id}/submit   Submit step form

GET  /approvals/pending       Get my pending approvals
POST /approvals/{instance_id}/steps/{step_id}   Approve/reject

POST /files/register          Register a file uploaded to Supabase Storage
GET  /files/download          Stream a file from Supabase Storage
POST /files/ocr               Extract fields from document via Claude
```

Full API docs available at `https://workflowapp-api-xxxx.up.railway.app/docs` when deployed.
