# WorkflowApp SaaS — PoC Architecture Plan

## Overview

A multi-tenant workflow SaaS where admins define business process workflows as JSON schemas, publish them for users, and users run instances of those workflows through sequential form-fill → approval cycles.

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend API | FastAPI (Python 3.12) | Async-native, fast, great OpenAPI docs |
| ORM | SQLAlchemy 2.x async | Type-safe, supports async Postgres |
| Database | Supabase Postgres | Free tier, managed Postgres + built-in auth JWT |
| Auth | Supabase Auth (JWT) | Free, handles email/password, returns JWT for FastAPI |
| File Storage | Cloudflare R2 | S3-compatible, free egress, 10GB free |
| Cache / Broker | Upstash Redis | Free serverless Redis (HTTP-based, no persistent connections needed) |
| Background Tasks | Celery + Upstash Redis | OCR jobs, notification jobs run async |
| OCR | Anthropic Claude API (`claude-haiku-4-5`) | Vision+JSON extraction, cheap per call |
| Frontend | React 18 + Vite | Fast dev builds |
| Styling | Tailwind CSS + Shadcn/UI | Pre-built accessible components |
| State | Zustand | Lightweight global state |
| Forms | React Hook Form + Zod | Validation, dynamic field registration |
| HTTP Client | TanStack Query (React Query) | Caching, mutation, invalidation |

---

## Project Structure

```
workflowapp/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app factory
│   │   ├── config.py                # Pydantic settings from env
│   │   ├── database.py              # Async SQLAlchemy engine + session
│   │   ├── auth.py                  # JWT verification via Supabase public key
│   │   ├── deps.py                  # FastAPI dependency injection (current_user, db, etc.)
│   │   │
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── group.py
│   │   │   ├── workflow_definition.py
│   │   │   ├── workflow_instance.py
│   │   │   ├── step_submission.py
│   │   │   ├── approval.py
│   │   │   ├── file_attachment.py
│   │   │   └── reference_list.py
│   │   │
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   │   ├── user.py
│   │   │   ├── group.py
│   │   │   ├── workflow.py          # Also includes WorkflowConfig (JSON shape)
│   │   │   ├── instance.py
│   │   │   ├── submission.py
│   │   │   └── approval.py
│   │   │
│   │   ├── routers/
│   │   │   ├── auth.py              # POST /auth/me (sync user to DB after Supabase signup)
│   │   │   ├── admin/
│   │   │   │   ├── users.py         # CRUD users
│   │   │   │   ├── groups.py        # CRUD groups + membership
│   │   │   │   └── workflows.py     # CRUD workflow definitions + publish
│   │   │   └── user/
│   │   │       ├── workflows.py     # GET published workflows
│   │   │       ├── instances.py     # CRUD instances + step assignment
│   │   │       ├── submissions.py   # POST form data per step
│   │   │       ├── approvals.py     # POST approve/reject
│   │   │       └── files.py         # Upload to R2, trigger OCR
│   │   │
│   │   ├── services/
│   │   │   ├── workflow_engine.py   # State machine: step transitions, approval resolution
│   │   │   ├── ocr_service.py       # Claude API vision extraction
│   │   │   ├── storage_service.py   # R2 upload/presigned URL
│   │   │   └── notification.py      # Email stub (future)
│   │   │
│   │   └── workers/
│   │       ├── celery_app.py        # Celery + Redis config
│   │       └── tasks.py             # ocr_task, notification_task
│   │
│   ├── alembic/                     # DB migrations
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx                  # Router setup
    │   │
    │   ├── lib/
    │   │   ├── api.ts               # Axios instance with JWT header
    │   │   ├── supabase.ts          # Supabase client (auth only)
    │   │   └── calc-engine.ts       # Calculated field formula evaluator
    │   │
    │   ├── types/
    │   │   └── workflow.ts          # TypeScript types matching JSON schema
    │   │
    │   ├── hooks/
    │   │   ├── useAuth.ts
    │   │   ├── useWorkflows.ts
    │   │   └── useInstance.ts
    │   │
    │   ├── components/
    │   │   ├── form-renderer/
    │   │   │   ├── DynamicForm.tsx        # Root renderer — iterates fields
    │   │   │   ├── fields/
    │   │   │   │   ├── TextField.tsx
    │   │   │   │   ├── TextareaField.tsx
    │   │   │   │   ├── NumberField.tsx
    │   │   │   │   ├── DateField.tsx
    │   │   │   │   ├── DropdownField.tsx
    │   │   │   │   ├── RadioField.tsx
    │   │   │   │   ├── CheckboxField.tsx
    │   │   │   │   ├── FileUploadField.tsx
    │   │   │   │   ├── OcrReaderField.tsx
    │   │   │   │   ├── CalculatedField.tsx
    │   │   │   │   └── TableField.tsx
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── admin/
    │   │   │   ├── UserTable.tsx
    │   │   │   ├── GroupManager.tsx
    │   │   │   └── WorkflowEditor.tsx     # JSON editor + preview
    │   │   │
    │   │   ├── user/
    │   │   │   ├── InstanceList.tsx
    │   │   │   ├── StepNavigator.tsx      # Sidebar: list steps, show status
    │   │   │   └── ApprovalPanel.tsx
    │   │   │
    │   │   └── ui/                        # Shadcn components (auto-generated)
    │   │
    │   └── pages/
    │       ├── Login.tsx
    │       ├── admin/
    │       │   ├── Users.tsx
    │       │   ├── Groups.tsx
    │       │   └── Workflows.tsx
    │       └── user/
    │           ├── Dashboard.tsx
    │           ├── WorkflowBrowse.tsx
    │           ├── InstanceDetail.tsx
    │           └── Approvals.tsx
    │
    ├── package.json
    └── vite.config.ts
```

---

## Database Schema

### `users`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
supabase_id UUID UNIQUE NOT NULL          -- maps to Supabase Auth UID
email       TEXT UNIQUE NOT NULL
full_name   TEXT
role        TEXT DEFAULT 'preparer'       -- admin | preparer | reviewer | approver
is_active   BOOLEAN DEFAULT true
created_at  TIMESTAMPTZ DEFAULT now()
```

### `groups`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
name        TEXT UNIQUE NOT NULL          -- e.g. "reviewers", "approvers"
description TEXT
created_at  TIMESTAMPTZ DEFAULT now()
```

### `user_group_memberships`
```sql
user_id     UUID REFERENCES users(id)
group_id    UUID REFERENCES groups(id)
PRIMARY KEY (user_id, group_id)
```

### `workflow_definitions`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
name        TEXT NOT NULL
description TEXT
config      JSONB NOT NULL               -- array of step objects (the JSON schema)
status      TEXT DEFAULT 'draft'         -- draft | published | archived
created_by  UUID REFERENCES users(id)
created_at  TIMESTAMPTZ DEFAULT now()
published_at TIMESTAMPTZ
```

### `workflow_instances`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
definition_id   UUID REFERENCES workflow_definitions(id)
title           TEXT NOT NULL
status          TEXT DEFAULT 'in_progress'   -- in_progress | completed | rejected
current_step_id INTEGER                      -- step_id from JSON config
created_by      UUID REFERENCES users(id)
created_at      TIMESTAMPTZ DEFAULT now()
completed_at    TIMESTAMPTZ
```

### `step_assignments`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
instance_id     UUID REFERENCES workflow_instances(id)
step_id         INTEGER NOT NULL             -- matches step_id in JSON config
assigned_to     UUID REFERENCES users(id)
assigned_by     UUID REFERENCES users(id)
assigned_at     TIMESTAMPTZ DEFAULT now()
```

### `step_submissions`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
instance_id     UUID REFERENCES workflow_instances(id)
step_id         INTEGER NOT NULL
submitted_by    UUID REFERENCES users(id)
form_data       JSONB NOT NULL               -- { field_id: value, ... }
status          TEXT DEFAULT 'draft'         -- draft | submitted
submitted_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```

### `approvals`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
instance_id     UUID REFERENCES workflow_instances(id)
step_id         INTEGER NOT NULL
approver_id     UUID REFERENCES users(id)
decision        TEXT                         -- approved | rejected
comment         TEXT
decided_at      TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```

### `file_attachments`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
instance_id     UUID REFERENCES workflow_instances(id)
step_id         INTEGER NOT NULL
field_id        TEXT NOT NULL
r2_key          TEXT NOT NULL
file_name       TEXT NOT NULL
mime_type       TEXT
uploaded_by     UUID REFERENCES users(id)
uploaded_at     TIMESTAMPTZ DEFAULT now()
```

### `reference_lists`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
list_name   TEXT UNIQUE NOT NULL
options     JSONB NOT NULL               -- [{"label": "...", "value": "..."}]
created_at  TIMESTAMPTZ DEFAULT now()
```

---

## API Design

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/sync` | Sync Supabase user to local DB after registration |

### Admin — Users
| Method | Path | Description |
|---|---|---|
| GET | `/admin/users` | List all users |
| POST | `/admin/users` | Create user (triggers Supabase invite) |
| PUT | `/admin/users/{id}` | Update user role/name |
| DELETE | `/admin/users/{id}` | Deactivate user |

### Admin — Groups
| Method | Path | Description |
|---|---|---|
| GET | `/admin/groups` | List groups |
| POST | `/admin/groups` | Create group |
| POST | `/admin/groups/{id}/members` | Add user to group |
| DELETE | `/admin/groups/{id}/members/{user_id}` | Remove from group |

### Admin — Workflow Definitions
| Method | Path | Description |
|---|---|---|
| GET | `/admin/workflows` | List all workflow definitions |
| POST | `/admin/workflows` | Create definition (upload JSON config) |
| GET | `/admin/workflows/{id}` | Get definition + config |
| PUT | `/admin/workflows/{id}` | Update definition / replace config |
| POST | `/admin/workflows/{id}/publish` | Publish definition |
| POST | `/admin/workflows/{id}/archive` | Archive definition |

### User — Browse & Instantiate
| Method | Path | Description |
|---|---|---|
| GET | `/workflows` | List published workflow definitions |
| POST | `/instances` | Create new instance from a definition |
| GET | `/instances` | List my instances |
| GET | `/instances/{id}` | Get instance detail + current step |
| PUT | `/instances/{id}/steps/{step_id}/assign` | Assign step to user |

### User — Submissions
| Method | Path | Description |
|---|---|---|
| GET | `/instances/{id}/steps/{step_id}/submission` | Get current submission (draft) |
| PUT | `/instances/{id}/steps/{step_id}/submission` | Save draft |
| POST | `/instances/{id}/steps/{step_id}/submit` | Submit for approval |

### User — Approvals
| Method | Path | Description |
|---|---|---|
| GET | `/approvals/pending` | List pending approval tasks for current user |
| POST | `/approvals/{instance_id}/steps/{step_id}` | Approve or reject |

### Files
| Method | Path | Description |
|---|---|---|
| POST | `/files/upload` | Upload file → R2, returns `r2_key` |
| GET | `/files/{r2_key}/url` | Get presigned download URL |
| POST | `/files/ocr` | Upload image/PDF → Claude OCR → return extracted JSON |

---

## Workflow State Machine

```
[Instance Created]
       │
       ▼
[Step N — ACTIVE]
       │
       ├── Preparer fills form → saves draft
       │
       └── Preparer submits form
              │
              ▼
       [Pending Approval]
              │
       ┌──────┴──────────────┐
  [Approved]            [Rejected]
       │                     │
       ▼                     ▼
[Step N+1 ACTIVE]    [Step N REOPENED or
  (or COMPLETE          Instance REJECTED]
   if last step)
```

**Approver resolution** (`approvers` field in config):
- `"group:reviewers"` → look up `groups` table by name `reviewers`, expand to all user IDs in that group
- `"user:john.doe@company.com"` → look up user by email

Sequential approvals: only one pending approval record is active at a time per step. For PoC, single approver per step (first resolved approver) — multi-approver support is a future enhancement.

---

## Calculated Field Engine

Client-side (React) expression evaluator using a safe arithmetic parser (no `eval()`):

```typescript
// lib/calc-engine.ts
// Formula: "f008 * f009"
// formValues: { f008: "5", f009: "10" }
function evaluateFormula(formula: string, formValues: Record<string, any>): number {
  // Replace field_ids with numeric values
  // Parse arithmetic expression safely
  // Return computed result
}
```

Rules:
- Only supports `+`, `-`, `*`, `/`, `(`, `)`
- References must resolve to numeric fields
- Table cell calculated columns use row-scoped values (e.g., `c002 * c003` per row)

---

## OCR Service Flow

```
1. User clicks "Extract from Invoice" on an ocr_reader field
2. Frontend POSTs the file to /files/ocr with field config (extract_fields)
3. Backend uploads to R2, gets temp URL
4. Celery task calls Claude API:
   - Model: claude-haiku-4-5-20251001 (cheap, fast, vision-capable)
   - Prompt: "Extract the following fields from this document: vendor_name (string), invoice_total (number), invoice_date (date). Return JSON only."
   - Attach image/PDF as base64 vision content
5. Claude returns JSON: { "vendor_name": "Acme", "invoice_total": 1250.00, "invoice_date": "2024-01-15" }
6. Backend returns JSON to frontend
7. Frontend auto-populates the relevant form fields
```

---

## Frontend — Dynamic Form Rendering

`DynamicForm.tsx` receives a `step` object (from JSON config) and renders fields:

```tsx
const fieldComponents: Record<FieldType, React.FC<FieldProps>> = {
  textbox: TextField,
  textarea: TextareaField,
  number: NumberField,
  date: DateField,
  dropdown: DropdownField,
  radio: RadioField,
  checkbox: CheckboxField,
  file_upload: FileUploadField,
  ocr_reader: OcrReaderField,
  calculated: CalculatedField,
  table: TableField,
};

// DynamicForm iterates step.form_fields, renders correct component,
// registers with React Hook Form, validates on submit
```

Key behaviors:
- **Calculated fields**: subscribe to watched form values, re-evaluate formula on change, display as read-only
- **Table fields**: maintain row array in state, each row is a mini-form, column calculated fields evaluate per-row
- **OCR fields**: show file picker + "Extract" button, on success populate sibling fields via `setValue`
- **Dropdown with `options_source: "list"`**: fetch from `/reference-lists/{list_name}` on mount

---

## Key Design Decisions & Rationale

### 1. JSON Config as Source of Truth
Workflow definitions are stored as JSONB in Postgres. No GUI workflow builder in PoC — admin pastes/uploads JSON directly. This keeps the backend simple and makes the schema explicit.

### 2. Supabase Auth → FastAPI JWT Verification
Supabase issues JWTs signed with a project-specific secret. FastAPI verifies them using `python-jose` + Supabase's JWT secret. No separate auth service needed.

### 3. Cloudflare R2 (S3-compatible)
Used for file uploads. Free egress. boto3 with custom endpoint — zero code changes from S3 usage.

### 4. OCR via Claude (not Textract/Google Vision)
Claude handles both structured extraction AND reasoning about ambiguous documents in one API call. The `extract_fields` config maps directly into the Claude prompt.

### 5. Upstash Redis (HTTP-based)
Serverless Redis that works without persistent TCP connections — ideal for a PoC deployed on a free Render/Railway instance where long-lived connections are a problem.

### 6. Sequential Approvals Only
One approver per step at a time. The workflow engine resolves the approver list and picks the first available. Multi-approver parallel/consensus flows are a v2 feature.

---

## Implementation Phases

### Phase 1 — Backend Core (Week 1)
- [ ] Project scaffold: FastAPI app, SQLAlchemy async, Alembic migrations
- [ ] DB models and migrations
- [ ] Supabase auth integration (JWT verification)
- [ ] Admin endpoints: users, groups, workflow definitions
- [ ] Workflow engine: instance creation, step activation, submission
- [ ] Approval endpoints + state machine transitions

### Phase 2 — File & OCR (Week 1-2)
- [ ] R2 storage service (upload, presigned URLs)
- [ ] Celery + Upstash Redis setup
- [ ] Claude OCR task

### Phase 3 — Frontend Core (Week 2)
- [ ] React + Vite + Tailwind + Shadcn setup
- [ ] Auth pages (login via Supabase)
- [ ] Admin pages: users, groups, workflow definition editor (JSON editor + preview)
- [ ] User pages: browse workflows, create instance, view instance
- [ ] Dynamic form renderer (all field types)

### Phase 4 — Integration & Polish (Week 3)
- [ ] Step navigator UI (sidebar showing step statuses)
- [ ] Approval panel for reviewers/approvers
- [ ] Calculated field engine
- [ ] OCR field UX (upload → extract → auto-fill)
- [ ] Table field with editable rows + calculated columns
- [ ] Reference list management in admin

---

## Environment Variables (.env.example)

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_KEY=your-service-key

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host/dbname

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret
R2_BUCKET_NAME=workflowapp-files
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Upstash Redis
UPSTASH_REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# App
SECRET_KEY=your-secret-key
FRONTEND_URL=http://localhost:5173
```
