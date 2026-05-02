# Borderflow AI — Zero-Stop E-Border

Demo web application for smart customs workflows: declarations with document uploads, AI-assisted HS codes and legal references, verification against extracted documents, shipment tracking, risk scoring, and a border gate simulation. The UI is a **Vite + React + TypeScript** SPA using **shadcn/ui**, **TanStack Query**, **React Router**, and **Recharts**. Optional persistence and auth are designed around **Supabase** (see `supabase/migrations/schema.sql`).

## Features

### Dashboard
- Overview metrics: total shipments, risk percentage, average clearance time
- Charts: shipments over time (line/bar), risk distribution

### Smart Declaration
- Create shipments with product description
- Upload invoices and packing lists
- AI assistant side panel: HS code suggestions, legal references, chat-style interaction

### Document Verification
- View structured data extracted from uploaded documents
- Side-by-side comparison: declaration vs documents
- Mismatch fields highlighted (e.g. in red in the UI)
- Status labels: **Valid** (green), **Warning** (yellow), **Fraud risk** (red)

### Shipment Tracking
- Map-oriented view and route visualization
- Live-style status: GPS coordinates, seal status
- Timeline of checkpoints and customs events

### Risk Analysis
- Risk score (gauge / progress visualization)
- AI-generated explanation panel
- Green / yellow / red status bands aligned with risk level

### Border Gate Simulation
- Vehicle scan fields: license plate, container ID
- Match result vs declaration
- Large **PASS** (green) vs **HOLD** (red) outcome display

### Admin
- User / role management (roles: admin, operator, inspector, viewer)
- System audit logs
- AI model configuration (model name, temperature, prompts, and related settings)

## Project structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Feature pages: `Dashboard`, `Declaration`, `Verification`, `Tracking`, `Risk`, `Gate`, `Admin` |
| `src/components/` | Shared UI, layout, charts |
| `supabase/migrations/` | PostgreSQL schema, RLS policies, indexes |

## Prerequisites

- **Node.js** 18+ (recommended 20+)
- **npm** (or compatible client)
- **Supabase** project (optional, for production-like auth and data)

## Getting started

Clone the repository and install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Quality checks

```bash
npm run lint
npm test
```

## Environment variables

When you connect the app to Supabase, set (for example in `.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

Exact names may vary depending on how you wire the client; align them with your Supabase client initialization.

## Database

Apply migrations in the Supabase SQL editor or CLI so that tables, RLS, and indexes match `supabase/migrations/schema.sql`.

Main entities:

- **shipments** — declaration, risk, clearance time, location, seal, HS/container/plate identifiers
- **documents** — uploads, `extracted_data`, verification status, `mismatch_fields`
- **declaration_items** — line items, HS codes, legal references
- **tracking_events** — timeline and map points
- **border_scans** — gate scan results (`pass` / `hold` / `fail`)
- **user_profiles** — roles and admin-relevant user fields
- **system_logs** — audit trail
- **ai_assistant_messages** — chat and structured AI hints (e.g. HS suggestions in `metadata`)
- **ai_model_settings** — per-feature AI configuration for admins

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Serve `dist/` |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest |

## License

Private project (`"private": true` in `package.json`). Adjust licensing if you open-source the repository.
