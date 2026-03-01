# WorkflowApp — PoC

A multi-tenant SaaS workflow management platform. Admins define business process workflows as JSON schemas, publish them, and users run instances through sequential form-fill → approval cycles.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.x async |
| Database | Supabase Postgres |
| Auth | Supabase Auth (JWT) |
| File Storage | Cloudflare R2 |
| Background Tasks | Celery + Upstash Redis |
| OCR | Claude API (claude-haiku-4-5) |
| Frontend | React 18 + Vite + Tailwind + Shadcn |

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

## Setup

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

### 2. Cloudflare R2

1. Create an R2 bucket at [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. Create an API token with R2 permissions
3. Enable public access if you want public file URLs

### 3. Upstash Redis

1. Create a Redis database at [console.upstash.com](https://console.upstash.com)
2. Copy the `UPSTASH_REDIS_URL` (TLS URL)

### 4. Backend

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

### 5. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL

npm install

# Install Shadcn components
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input label select badge card dialog

npm run dev
```

---

## Workflow JSON Config

The workflow definition is a JSON array of steps. Each step has:
- `step_id` — integer ordering
- `step_label` — display name
- `approvers` — list of `"group:name"` or `"user:email"` specs
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
| `file_upload` | File upload to R2 |
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

First user to sign up is automatically made **admin**.

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

POST /files/upload            Upload file to R2
POST /files/ocr               Extract fields from document via Claude
```

Full API docs available at `http://localhost:8000/docs` when backend is running.
