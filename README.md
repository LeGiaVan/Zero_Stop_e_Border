# Borderflow AI

**Zero-Stop E-Border** — a web platform for smart customs workflows: digitized declarations, document uploads, AI-assisted HS classification, structured document extraction and verification, trajectory anomaly monitoring, border gate decisioning, and admin tooling.

The front end is a **Vite**, **React 18**, and **TypeScript** single-page application, styled with **Tailwind CSS** and **shadcn/ui**, with **TanStack Query**, **React Router**, and **Recharts**. Persistence and authentication are integrated with **Supabase** (PostgreSQL schema in `supabase/migrations/schema.sql`). AI workloads are served by a Python **FastAPI** service under `ai_service/`.

---

## Live demo

- **Application:** [zero-stop-e-border-ioiz.vercel.app](https://zero-stop-e-border-ioiz.vercel.app)

Demo accounts:

| Role | Email | Password |
|------|------|----------|
| Customs | `haiquan@gmail.com` | `123456789` |
| Business | `legiavan0210@gmail.com` | `123456` |
| Admin | `admin@gmail.com` | `123456789` |

---

## Highlights

### AI HS-Advisor (Smart Declaration)

The declaration assistant supports dual mode:
- `n8n` mode (default for current MVP): use your existing webhook flow.
- `inhouse` mode: call `ai_service` APIs (`/api/hs/suggest`, `/api/hs/confirm`) with Qdrant retrieval (or local fallback seed `ai_service/data/hs_knowledge.json`).

<p align="center">
  <img src="./public/gif/hs_code.gif" alt="AI HS-Advisor" width="720" />
</p>

<p align="center">
  <img src="./public/gif/declaration.gif" alt="Smart Declaration flow" width="720" />
</p>

### AI Auditor Agent (verification pipeline)

Uploaded PDFs (invoices, packing lists, etc.) are processed by **`ai_service`**: text extraction from PDFs, structured field inference via **OpenAI** chat models, normalization, and deterministic comparison against the saved declaration to populate verification status and mismatch fields in Supabase.

<p align="center">
  <img src="./public/gif/verification.gif" alt="Document verification" width="720" />
</p>

### Vision Edge Gate (decision-enabled MVP)

The UI performs container OCR via a detection endpoint, then posts to `/api/gate/scan`. Gate PASS/HOLD is decided from three checks: document verification, trajectory anomalies, and container/plate match against declaration.

<p align="center">
  <img src="./public/gif/AI_Vision.gif" alt="Gate simulation" width="720" />
</p>

---

## Feature overview

| Area | Description |
|------|--------------|
| **Dashboard** | Shipment KPIs, risk share, timelines |
| **Declaration** | Shipment capture, PDF attachments, HS assistant chat |
| **Verification** | Extracted fields, declaration-vs-document comparison, re-scan orchestration via API |
| **Tracking** | DB-backed trajectory feed (`trajectory_points`) + anomaly timeline (`tracking_events`) |
| **Risk analysis** | DB-backed score synthesis from verification, trajectory anomalies, and gate outcomes |
| **Border gate** | Detection + `/api/gate/scan` PASS/HOLD decision persisted to `border_scans` |
| **Admin** | Profiles, audit-style logs, AI settings placeholders |

---

## Architecture & technology stack

```
Browser (React) ──► Supabase (auth, Postgres, Storage)
       │
       ├──► ai_service `/api/hs/*` (HS advisor)
       │
       ├──► ai_service `/api/declaration/process-documents` (auditor)
       │
       ├──► ai_service `/api/trajectory/*` (guardian)
       │
       └──► ai_service `/api/gate/scan` (gate decision)
```

| Layer | Technologies |
|--------|----------------|
| **Web** | React 18, TypeScript, Vite, TanStack Query, React Router, Recharts |
| **UI** | Radix primitives, Tailwind CSS, shadcn/ui patterns |
| **Backend (data)** | Supabase (PostgreSQL + Auth + Storage) |
| **AI Service** | Python 3, FastAPI, OpenAI API, pdfplumber, Pydantic, scikit-learn |
| **Vector Retrieval** | Qdrant (optional, for HS advisor context); local fallback seed JSON |

---

## Repository layout

| Path | Purpose |
|------|---------|
| `src/pages/` | Feature routes: Dashboard, Declaration, Verification, Tracking, Risk, Gate, Admin |
| `src/components/` | Shared layout, widgets, charts |
| `src/lib/` | Supabase helpers, AI pipeline client (`declarationAiPipeline.ts`) |
| `ai_service/` | FastAPI — HS advisor, auditor, trajectory guardian, gate decision |
| `supabase/migrations/` | PostgreSQL schema, indexes, policies |
| `ai-manager/AI HS-Advisor/HS_Code_Recommender.json` | Legacy n8n workflow export (reference only) |

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**
- **Supabase project** — required for full declaration save, uploads, and post-save AI processing
- **Python 3.10+** — only if you run `ai_service` locally

---

## Local development — web app

```bash
git clone <repository-url>
cd borderflow-ai
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Quality checks:

```bash
npm run lint
npm test
```

### Front-end environment variables

Create `.env` at the repo root. Vite exposes only variables prefixed with `VITE_`:

| Variable | Required | Description |
|----------|----------|--------------|
| `VITE_SUPABASE_URL` | For Supabase-backed flows | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same | Anonymous (public) key |
| `VITE_SUPABASE_BUCKET` | Optional | Storage bucket name (default `documents`) |
| `VITE_AI_API_BASE_URL` | Optional | AI service origin (default `http://127.0.0.1:8000`) |
| `VITE_HS_ADVISOR_MODE` | Optional | `n8n` (default) or `inhouse` |
| `VITE_N8N_WEBHOOK_URL` | Optional | HS advisor webhook URL when mode is `n8n` |
| `VITE_N8N_FEEDBACK_WEBHOOK_URL` | Optional | Feedback webhook URL when mode is `n8n` |

Without Supabase credentials, the app degrades gracefully but saving declarations and triggering document processing will not work.

---

## Local development — AI service (`ai_service`)

Runs all MVP APIs:
- `/api/hs/suggest`, `/api/hs/confirm`
- `/api/declaration/process-documents`, `/api/verify`
- `/api/trajectory/ingest`, `/api/trajectory/analyze`
- `/api/gate/scan`

```bash
cd ai_service
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py
# or: uvicorn main:app --reload --port 8000
```

Ensure the web app points to this service (`VITE_AI_API_BASE_URL`).

### AI service environment variables

Set in **`ai_service/.env`**:

| Variable | Description |
|----------|--------------|
| `OPENAI_API_KEY` | Required for extraction |
| `OPENAI_MODEL` | Optional chat model override (default `gpt-4o-mini`) |
| `SUPABASE_URL` | Required for `/api/declaration/process-documents` |
| `SUPABASE_SERVICE_ROLE_KEY` | Required to read Storage and write `documents` |
| `QDRANT_URL` | Optional but recommended for HS retrieval |
| `QDRANT_COLLECTION_NAME` | Optional collection name (default `hs_codes_agriculture_viet`) |
| `HS_EMBEDDING_MODEL` | Optional embedding model for retrieval/ingestion |

`CORS_ORIGINS` can override allowed browser origins for the FastAPI host.

### Optional: Docker Compose (ai_service + Qdrant)

```bash
# ensure ai_service/.env exists before running
docker compose up --build
```

Then keep frontend running with:

```bash
npm run dev
```

---

## Database

Apply `supabase/migrations/schema.sql` and follow-up alignment migrations in `supabase/migrations/` via Supabase SQL editor or CLI.

**Core entities:**

- **shipments** — declaration header, risk fields, identifiers, geography
- **documents** — file metadata, `extracted_data`, `verification_status`, `mismatch_fields`
- **declaration_items** — line items (HS codes, values, optional legal references metadata)
- **tracking_events**, **border_scans** — tracking and gate-related records
- **trajectory_points** — raw e-seal points used by Trajectory Guardian
- **user_profiles**, **system_logs** — directory and audit
- **ai_assistant_messages**, **ai_model_settings** — assistant history and admin-facing model settings rows

---

## Scripts (npm)

| Command | Description |
|---------|--------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production bundle |
| `npm run build:dev` | Dev-mode bundle |
| `npm run preview` | Preview `dist/` |
| `npm run lint` | ESLint |
| `npm run test` / `npm run test:watch` | Vitest |
