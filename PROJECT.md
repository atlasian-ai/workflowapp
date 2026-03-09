# ForgeflowPoC — Project Reference

> **Status:** Proof of Concept
> **Deployed on:** Railway (two services: frontend + API; Celery worker co-located in the API container)
> **Repo root:** `workflowapp/`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Infrastructure & Services](#3-infrastructure--services)
4. [Database Schema](#4-database-schema)
5. [Backend](#5-backend)
6. [Frontend](#6-frontend)
7. [Field Types](#7-field-types)
8. [OCR Feature](#8-ocr-feature)
9. [Workflow Engine](#9-workflow-engine)
10. [Auth Model](#10-auth-model)
11. [Design Decisions](#11-design-decisions)
12. [PoC Limits & Known Constraints](#12-poc-limits--known-constraints)
13. [Environment Variables](#13-environment-variables)
14. [Changelog](#14-changelog)

---

## 1. Overview

ForgeflowPoC is a configurable workflow / form-routing application that lets admins define multi-step approval workflows with rich form fields. Users (preparers) fill in forms step-by-step; designated approvers review and approve or reject each step. The system supports file attachments, calculated fields, reference list dropdowns, AI-powered OCR extraction, and step comments.

**Primary personas:**
| Role | Can do |
|---|---|
| `admin` | Define workflows, manage users/groups/reference lists, publish/unpublish workflows |
| `preparer` | Browse published workflows, start instances, fill forms, upload files |
| `approver` | Review submitted steps, approve or reject with optional comment |

> Admin role is assigned via the Users admin page.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│  Railway — Frontend service                     │
│  React 18 + Vite SPA (frontend/)                │
│  ─ React Router v6                              │
│  ─ TanStack Query v5 (server state)             │
│  ─ Zustand (local auth state)                   │
│  ─ Radix UI + Tailwind CSS                      │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS / REST JSON
┌───────────────────▼─────────────────────────────┐
│  Railway — API service                          │
│  FastAPI + Uvicorn (backend/)                   │
│  ─ Async SQLAlchemy 2 + asyncpg                 │
│  ─ Alembic migrations                           │
│  ─ Pydantic v2 schemas + Settings               │
└───────────┬───────────────────┬─────────────────┘
            │                   │
  ┌─────────▼──────┐   ┌────────▼────────────┐
  │  Supabase      │   │  Railway Redis       │
  │  ─ Auth (JWT)  │   │  (Celery broker +    │
  │  ─ PostgreSQL  │   │   result backend)    │
  │  ─ Storage     │   └────────┬────────────┘
  └────────────────┘            │
                       ┌────────▼────────────┐
                       │  Anthropic API       │
                       │  Claude Haiku        │
                       │  (OCR + AI chat)    │
                       └─────────────────────┘
```

---

## 3. Infrastructure & Services

| Service | Purpose | Notes |
|---|---|---|
| **Railway** | Two services: `workflowapp-frontend` (static SPA) and `workflowapp-api` (FastAPI + Celery worker co-located via `start.sh`) | Auto-deploys from `main` branch push |
| **Supabase** | Auth (magic link / password), PostgreSQL DB, file Storage | JWT issued by Supabase, verified by backend |
| **Railway Redis** | Celery broker and result store | Railway Redis plugin; `REDIS_URL` auto-injected into `workflowapp-api` |
| **Anthropic API** | Claude Haiku for OCR field extraction and AI chat | Key stored in Railway backend env vars |

### Railway services

- **`workflowapp-frontend`** — builds with `npm install && npm run build`, serves the `dist/` static site
- **`workflowapp-api`** — runs `start.sh`: launches Celery worker in background, then starts Uvicorn in foreground; both processes share the same container and env vars

---

## 4. Database Schema

All tables use UUID primary keys (`gen_random_uuid()`). Managed by **Alembic** with versioned migration files.

### Migration history

| Version | Description |
|---|---|
| `001` | Initial schema — all core tables |
| `002` | Added `step_comments`, `config_snapshot` on instances |
| `003` | Added `request_number` (auto-increment), `cancelled` status, cancel reason |
| `004` | Added `updated_at` to `step_submissions` |
| `005` | Enabled Row Level Security (RLS) on all 13 public schema tables |

### Core tables

```
users
  id (UUID PK), supabase_id (UUID unique), email, full_name, role, is_active, created_at

groups
  id, name (unique), description, created_at

user_group_memberships
  user_id → users, group_id → groups  (composite PK)

workflow_definitions
  id, name, description, config (JSON), status (draft|published), created_by, created_at, published_at

workflow_instances
  id, definition_id → workflow_definitions, title, status (in_progress|completed|cancelled),
  current_step_id (int), created_by, created_at, completed_at, cancelled_at,
  request_number (serial), config_snapshot (JSON)

step_assignments
  id, instance_id → workflow_instances, step_id (int), assigned_to → users,
  assigned_by → users, assigned_at

step_submissions
  id, instance_id, step_id, submitted_by, form_data (JSON), status (draft|submitted),
  submitted_at, created_at, updated_at

approvals
  id, instance_id, step_id, approver_id → users, decision (approved|rejected|null),
  comment, decided_at, created_at

file_attachments
  id, instance_id, step_id, field_id, r2_key (storage path), file_name, mime_type,
  uploaded_by, uploaded_at

step_comments
  id, instance_id, step_id, author_id, body (text with @mention support), created_at

reference_lists
  id, list_name (unique), options (JSON array of strings), created_at
```

### `workflow_definitions.config` JSON structure

```jsonc
[
  {
    "step_id": 1,
    "step_name": "Initial Request",
    "approvers": ["group:managers", "user:jane@acme.com"],
    "fields": [
      {
        "field_id": "vendor_name",
        "label": "Vendor Name",
        "field_type": "text",
        "required": true
      },
      {
        "field_id": "invoice_scan",
        "label": "Invoice Scan",
        "field_type": "ocr_reader",
        "accepted_formats": ["pdf", "png", "jpg"],
        "extract_fields": {
          "vendor_name": "Vendor or supplier name on the invoice",
          "total_amount": "Total amount due including tax"
        }
      }
    ]
  }
]
```

---

## 5. Backend

**Root:** `workflowapp/backend/`

### Key files

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI app setup, CORS, router registration |
| `app/config.py` | Pydantic Settings — reads all env vars |
| `app/database.py` | Async SQLAlchemy engine + session factory |
| `app/auth.py` | Supabase JWT verification (`python-jose`) |
| `app/deps.py` | FastAPI dependency injection: `get_current_user`, `require_admin` |
| `app/routers/auth.py` | `/auth/sync`, `/auth/me`, `/auth/profile` |
| `app/routers/` | Full CRUD routers for workflows, instances, users, groups, files, etc. |
| `app/models/` | SQLAlchemy ORM models (one file per table) |
| `app/schemas/` | Pydantic v2 request/response schemas |
| `app/services/workflow_engine.py` | State machine — step activation, approval processing |
| `app/services/ocr_service.py` | Claude Haiku OCR extraction |
| `app/routers/user/ai_chat.py` | `POST /ai/chat` — data query and workflow builder AI modes |
| `app/services/storage_service.py` | Supabase Storage upload/download/URL |
| `app/workers/celery_app.py` | Celery app config (Railway Redis) |
| `app/workers/tasks.py` | `ocr_extract_task` — async OCR Celery task |
| `alembic/` | Migration scripts |
| `start.sh` | Railway entry: `alembic upgrade head && uvicorn ...` |

### Auth flow

1. User signs in via **Supabase Auth** (frontend calls `supabase.auth.signIn*`)
2. Frontend calls `POST /auth/sync` with `supabase_id + email + full_name`
3. Backend upserts the user into local `users` table; first user auto-gets `admin` role
4. All subsequent API calls carry `Authorization: Bearer <supabase_jwt>`
5. Backend's `get_current_user` dep verifies JWT against `SUPABASE_JWT_SECRET`, loads user from DB

### Approver spec format (in workflow config)

```
"group:managers"       → all active members of the "managers" group
"user:jane@acme.com"   → specific user by email
"jane@acme.com"        → bare email (legacy fallback)
```

---

## 6. Frontend

**Root:** `workflowapp/frontend/`

### Key files

| Path | Purpose |
|---|---|
| `src/App.tsx` | Route definitions, role-gated routes |
| `src/components/Layout.tsx` | Sidebar nav (collapsible on mobile), admin/user sections, hosts `AiChatPanel` overlay |
| `src/components/AiChatPanel.tsx` | Collapsible AI chat panel — floating button → 380px slide-in; auto-detects mode from route; persists history to `localStorage`; creates workflows via API |
| `src/components/ForgeflowLogo.tsx` | Logo with "PoC" superscript, used on login + sidebar |
| `src/components/admin/WorkflowBuilder.tsx` | Admin step/field builder — the core admin UI |
| `src/components/form-renderer/DynamicForm.tsx` | Renders a step's fields from config |
| `src/components/form-renderer/fields/` | One component per field type |
| `src/pages/admin/Workflows.tsx` | List/create/edit/publish workflow definitions |
| `src/pages/admin/Users.tsx` | User management |
| `src/pages/admin/Groups.tsx` | Group management |
| `src/pages/admin/ReferenceLists.tsx` | Reference list management |
| `src/pages/user/Dashboard.tsx` | "My Requests" list |
| `src/pages/user/WorkflowBrowse.tsx` | Browse published workflows, start instance |
| `src/pages/user/InstanceDetail.tsx` | Fill form, submit step, view history |
| `src/pages/user/Approvals.tsx` | Approver review queue |
| `src/lib/api.ts` | All axios API calls (typed, centralised) |
| `src/lib/calc-engine.ts` | Expression evaluator for calculated fields |
| `src/lib/supabase.ts` | Supabase client init |
| `src/types/workflow.ts` | Shared TypeScript types for workflow config |
| `src/hooks/useAuth.ts` | Zustand store for auth state |
| `src/hooks/useAiStore.ts` | Zustand store for `pendingWorkflow` (AI → WorkflowBuilder handoff) |

### Routing structure

```
/login                          Login page
/dashboard                      User: my requests
/workflows                      User: browse published workflows
/instances/:id                  User: fill/view an instance
/approvals                      Approver: review queue
/notifications                  Notification inbox
/profile                        Edit profile
/admin/workflows                Admin: workflow definitions
/admin/users                    Admin: user list
/admin/groups                   Admin: group management
/admin/reference-lists          Admin: dropdown reference data
```

---

## 7. Field Types

Defined in `WorkflowBuilder.tsx` (`FIELD_TYPES` array) and rendered by `DynamicForm.tsx`.

| `field_type` | Component | Notes |
|---|---|---|
| `text` | `TextField.tsx` | Single-line text |
| `textarea` | `TextareaField.tsx` | Multi-line text |
| `number` | `NumberField.tsx` | Numeric input |
| `date` | `DateField.tsx` | Date picker |
| `dropdown` | `DropdownField.tsx` | Static options list OR reference list by name |
| `radio` | `RadioField.tsx` | Radio button group |
| `checkbox` | `CheckboxField.tsx` | Single checkbox (boolean) |
| `file_upload` | `FileUploadField.tsx` | Single file upload to Supabase Storage |
| `table` | `TableField.tsx` | Dynamic row table (add/remove rows) |
| `calculated` | `CalculatedField.tsx` | Read-only, evaluates expression against `form_data` |
| `ocr_reader` | `OcrReaderField.tsx` | File upload + AI extraction, populates other fields |

### `calculated` field expression syntax

Uses `calc-engine.ts`. References other fields by `{field_id}`. Supports: `+`, `-`, `*`, `/`, numeric literals, parentheses. Returns numeric result. Fields with no value are treated as 0.

### `ocr_reader` field config properties

```typescript
{
  field_id: string        // e.g. "invoice_doc"
  label: string
  field_type: "ocr_reader"
  accepted_formats: string[]   // ["pdf", "png", "jpg"] — at least one required
  extract_fields: Record<string, string>
  // key = field_id in THIS step's form (auto-populated after extraction)
  // value = human description for Claude prompt
}
```

---

## 8. OCR Feature

### Flow

```
User uploads file (OcrReaderField)
  → POST /files/upload → stored in Supabase Storage
  → POST /files/ocr/trigger { file_id, extract_fields }
      ├── validates max 10 fields
      ├── enqueues ocr_extract_task (Celery)
      └── returns { task_id }
  → frontend polls GET /files/ocr/result/{task_id}
      └── on success: returns { field_id: value, ... }
          → DynamicForm auto-populates matching fields
```

### Key constants (`ocr_service.py`)

| Constant | Value |
|---|---|
| `MAX_PDF_PAGES` | 5 |
| `MAX_EXTRACT_FIELDS` | 10 |
| Claude model | `claude-haiku-4-5-20251001` |

### PDF page validation

`_check_pdf_pages()` uses `pypdf` to count pages before sending to Claude. If `pypdf` cannot parse the file, it falls through gracefully and lets Claude attempt it anyway.

### Prompt strategy

Claude receives the document as base64 (image or PDF) and a prompt listing `field_name (description)` pairs. It is instructed to return **only** a JSON object with the exact field names as keys, using `null` for fields not found. The service strips any markdown wrapper before JSON parsing.

---

## 9. Workflow Engine

**File:** `app/services/workflow_engine.py`

### State machine rules

| Event | Action |
|---|---|
| Instance created | Activate step with lowest `step_id` |
| Step submitted | Create `Approval` record for first resolved approver |
| Approval: **approved**, not last step | Activate next step (by `step_id` order) |
| Approval: **approved**, last step | Mark instance `completed`, freeze `config_snapshot` |
| Approval: **rejected** | Reset step submission to `draft`; instance stays `in_progress` |
| Instance cancelled | `status = cancelled`, store `cancel_reason` |

### `config_snapshot`

On completion, the live `workflow_definitions.config` is copied into `workflow_instances.config_snapshot`. This means future admin edits to the workflow definition do not alter the historical record of how a completed instance was configured.

### Step ordering

Steps are sorted by `step_id` integer ascending. `step_id` values do not need to be contiguous (gaps allowed). They are set by the admin in `WorkflowBuilder`.

---

## 10. Auth Model

| Layer | Technology |
|---|---|
| Identity provider | Supabase Auth (email/password + magic link) |
| Session token | Supabase JWT (HS256, signed with `SUPABASE_JWT_SECRET`) |
| Backend verification | `python-jose` decodes and verifies JWT on every request |
| User record | Local `users` table synced from Supabase on first login |
| Role | Stored in local DB: `admin` or `preparer` |
| Role assignment | New users get `preparer` by default; role is updated to `admin` manually via the Users admin page |

---

## 11. Design Decisions

| Decision | Rationale |
|---|---|
| **Supabase Auth** rather than custom auth | Avoids building password reset, email verification, MFA from scratch |
| **Local `users` table** mirrors Supabase users | Enables FK relationships, role storage, group membership, and rich queries without depending on Supabase Auth API for every call |
| **Workflow config stored as JSON** in the definition | Flexible schema — fields, steps, approvers all vary per workflow without DB migrations |
| **`config_snapshot` on completion** | Prevents completed instance records from being silently altered when an admin edits the workflow definition |
| **Celery for OCR** | Claude API calls can take 5–30 seconds; async task prevents API timeout and allows frontend to poll |
| **Railway Redis plugin** | Keeps all infra on one platform; `REDIS_URL` auto-injected into sibling services; no SSL workaround needed (plain `redis://`) |
| **Rejection is non-terminal** | Preparer can edit and resubmit without creating a new instance; keeps the audit trail on one record |
| **Approvals created at submit time** (not instance creation) | Approvers only see items actually ready for their review; avoids empty approval records for steps not yet reached |
| **pypdf for page counting** | Lightweight pure-Python, no system binary needed; graceful fallback if it can't parse |
| **Claude Haiku** for OCR | Fast and cheap for structured data extraction; sufficient for PoC |
| **`extract_fields` as `Record<string,string>`** | Key = target field_id in same step (auto-populates form); value = description for Claude prompt |
| **Single-file Supabase Storage** uploads | Each file gets a UUID-keyed path; no naming conflicts; URL presigned for download |
| **Admin role management** | Role promotion handled via admin UI to control access |
| **Step assignment / full delegation** | Instance creator or admin assigns a step to another user; assignee sees the instance in their Dashboard and has exclusive edit/submit rights on that step; others see read-only |
| **AI chat — synchronous Claude call** | Acceptable latency for PoC; avoids Celery complexity; `data_query` uses Haiku (fast, low cost); `workflow_builder` uses Sonnet 4.6 (higher accuracy for structured JSON output) |
| **AI chat workflow creation via API** | `workflow_builder` mode creates the workflow directly via `POST /admin/workflows` (saved as draft); `useAiStore` / Zustand handoff is kept but no longer the primary path |
| **DnD field reordering uses `_id` ephemeral key** | `_id` is generated client-side for stable DnD identity and stripped before saving to DB; fields loaded from DB get `_id` auto-assigned via `fieldsWithIds` |
| **Status tile click filtering** | Simple `useState` toggle; combined with existing text search; active tile shows ring highlight and clear button above the list |

---

## 12. PoC Limits & Known Constraints

| Area | Limit / Note |
|---|---|
| OCR fields per request | Max 10 |
| OCR document pages | Max 5 pages (PDF) |
| File storage | Supabase Storage (free tier ~1 GB) |
| Approvers per step | Only the **first** resolved approver gets an approval record created (multi-approver parallel approval not yet implemented) |
| Group-based approval | All members of the group are resolved, but only `approvers[0]` from the resolved list gets the record |
| No email notifications | Approvers must check the Approvals page manually |
| No SSO / SAML | Supabase email/password only |
| No audit log beyond DB records | No structured event log table |
| Mobile | Mostly responsive; Workflow Definitions admin page has responsive layout; some dense tables may still be cramped on very small screens |

---

## 13. Environment Variables

### Backend (Railway — `workflowapp-api` service)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Service role key (for storage operations) |
| `DATABASE_URL` | PostgreSQL connection string (`asyncpg://...`) |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name (default: `workflow-files`) |
| `UPSTASH_REDIS_URL` | Redis URL (`rediss://...` for TLS) |
| `ANTHROPIC_API_KEY` | Claude API key (for OCR and AI chat) |
| `SECRET_KEY` | App secret (used for signing; can be any random string) |
| `FRONTEND_URL` | Railway frontend service URL (used for CORS) |

### Frontend (Railway — Frontend service)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_SUPABASE_STORAGE_BUCKET` | Storage bucket name (default: `workflow-files`) |
| `VITE_API_URL` | Railway API service URL |

---

## 14. Changelog

### 2026-03-09

- **improve: AI workflow_builder prompt accuracy**
  - Fixed field types in schema (removed non-existent `radio`/`table`; corrected list to 8 supported types)
  - Fixed approvers format: `user:email` / `group:name` (was documenting bare email strings)
  - Fixed `calculated` formula syntax: bare `field_id` references, not `{field_id}`
  - Added detailed per-field rules and a complete 2-step example in the system prompt
  - Upgraded `workflow_builder` model from `claude-haiku-4-5-20251001` → `claude-sonnet-4-6` for better structured JSON accuracy
  - Increased `max_tokens` 2048 → 4096 to prevent JSON truncation on larger workflows

- **Infra: replaced Upstash Redis with Railway Redis plugin**
  - `settings.upstash_redis_url` renamed to `settings.redis_url` (reads `REDIS_URL` env var)
  - Railway Redis plugin auto-injects `REDIS_URL` into `workflowapp-api` (used by both Uvicorn and the co-located Celery worker)
  - Removed SSL workaround block from `celery_app.py` — Railway Redis uses plain `redis://`
  - Updated `.env.example` accordingly

### 2026-03-07

- **Row Level Security (RLS) enabled on all tables**
  - Migration `005_enable_rls.py` enables RLS on all 13 public schema tables
  - FastAPI backend uses PostgreSQL superuser credentials, bypassing RLS transparently
  - No permissive policies added — backend access unaffected, direct DB access restricted

- **Feature: Drag-and-drop field reordering in WorkflowBuilder**
  - Installed `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
  - `FieldConfig` gains optional `_id` ephemeral key for DnD stability (stripped before DB save)
  - `SortableFieldRow` wraps `FieldRow` with `useSortable`; `GripVertical` drag handle added
  - `handleDragEnd` reorders via `arrayMove`; `stripInternalIds()` applied in both save paths in `Workflows.tsx`

- **Feature: Step assignment / full delegation**
  - Backend: `list_my_instances` extended with left join on `step_assignments` + `or_` filter + `.distinct()` so assigned users see instances in their Dashboard
  - Backend: `get_instance` access control extended to include assigned users; `StepAssignmentOut` enriched with `assigned_to_name`, `assigned_to_email`, `assigned_by_name` resolved from DB
  - Frontend: `InstanceDetail.tsx` shows assignment chip on active step; creator/admin gets "Assign/Reassign" button with searchable user picker popover; only the assignee (or creator/admin if unassigned) can edit/submit; delegation notice shown to viewers
  - Frontend: `Dashboard.tsx` shows "Delegated" badge on instances where current user is not the creator

- **Feature: Clickable status tiles in Dashboard**
  - Status tiles are now `<button>` elements that toggle a `statusFilter` state
  - Active tile highlighted with `ring-2` matching the status colour
  - Filter applied alongside existing text search; active filter shows clear button

- **Feature: AI agent chat panel**
  - Backend: `POST /ai/chat` (`ai_chat.py`) — `data_query` mode fetches user's instances + submitted step data and injects as Claude context; `workflow_builder` mode returns parsed workflow JSON; uses `claude-haiku-4-5-20251001` via existing `ANTHROPIC_API_KEY`
  - Frontend: `AiChatPanel.tsx` — floating sparkle button → 380px slide-in panel; auto-detects mode from route (`/admin/workflows` → workflow_builder, else data_query)
  - `workflow_builder` responses show step/field count summary + "Create Workflow" button that calls `POST /admin/workflows` to save a draft; navigates to workflows list on success
  - Chat history persisted to `localStorage` (key: `forgeflow_ai_chat_messages`); green dot on floating button indicates active history; "Clear" button wipes it

- **fix: duplicate `_id` in `FieldConfig` interface** — removed second declaration that caused TS2300 build error

- **fix: AI chat workflow JSON extraction**
  - Added `_extract_json_array()` helper in `ai_chat.py` — strips markdown code fences, uses regex to find JSON arrays even when model prepends prose
  - When JSON is parsed successfully, backend returns a clean summary reply ("Workflow ready: N steps, M fields.") rather than raw JSON, so the frontend `WorkflowActionBubble` renders correctly

- **fix: DnD field reordering — stable IDs across renders**
  - Replaced unstable `fieldsWithIds` computed value (generated new random `_id` on every render) with a `useRef`-backed map that assigns a stable `_id` per `field_id` for the lifetime of the `StepRow` component
  - Fixed `handleDragEnd` to search `fieldsWithIds` (not `step.form_fields`) so the index lookup always succeeds; `arrayMove` now receives `fieldsWithIds` to preserve order correctly
  - Fixed `updateField` and `deleteField` to also operate on `fieldsWithIds`

### 2026-03-03
- **OCR Document Reader field type in admin WorkflowBuilder**
  - Added `ocr_reader` to `FIELD_TYPES` array in `WorkflowBuilder.tsx`
  - Extended `FieldConfig` interface with `accepted_formats` and `extract_fields`
  - Added full OCR config UI: file format checkboxes (PDF/PNG/JPG), extraction fields table (field_id + AI description), field counter badge, help text
  - Added `pypdf>=4.0.0` to `requirements.txt`
  - Added `_check_pdf_pages()` to `ocr_service.py` with `MAX_PDF_PAGES=5` and `MAX_EXTRACT_FIELDS=10`
  - Added field count and type validation in `files.py` `trigger_ocr` endpoint

- **"PoC" superscript on logo**
  - `ForgeflowLogo.tsx`: added `<sup>` with `PoC` to wordmark; applies to login page and all sidebar instances

- **Mobile-responsive Workflow Definitions page**
  - `Workflows.tsx`: `flex-wrap` on header and card rows, responsive padding (`sm:` prefix), `hidden sm:inline` on verbose badge text, removed rigid `flex-shrink-0 ml-4` from action group

- **Promo video**
  - Removed "no IT required" from last slide of `forgeflow-promo.html`
  - Added `capture_promo.py` — Playwright + ffmpeg script to export HTML promo to MP4

### Earlier sessions
- Initial project scaffolding: FastAPI backend, React frontend, Supabase auth, Alembic migrations
- Workflow engine: state machine, approvals, step submissions
- All core field types implemented (text, number, date, dropdown, radio, checkbox, file_upload, table, calculated)
- OCR backend service (`ocr_service.py`, `tasks.py`, `files.py` router)
- `OcrReaderField.tsx` user-facing component
- Reference lists, groups, user management admin pages
- Step comments with @mention support (`MentionInput.tsx`)
- Request numbers, cancellation, config snapshot on completion
- Storage migrated from Cloudflare R2 to Supabase Storage
