# Borderflow AI — Zero-Stop E-Border

Demo web application for smart customs workflows: declarations with document uploads, AI-assisted HS codes and legal references, verification against extracted documents, shipment tracking, risk scoring, and a border gate simulation. The UI is a **Vite + React + TypeScript** SPA using **shadcn/ui**, **TanStack Query**, **React Router**, and **Recharts**. Optional persistence and auth are designed around **Supabase** (see `supabase/migrations/schema.sql`).

---

## ☁️ LIVE DEPLOYMENT & DEMO

### 🚀 Live Demo & Test Accounts

Experience the live system here: **[https://zero-stop-e-border-ioiz.vercel.app](https://zero-stop-e-border-ioiz.vercel.app)**

To explore role-based features, please use the following test accounts:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Customs (Hải quan)** | `haiquan@gmail.com` | `123456789` |
| **Business (Doanh nghiệp)** | `legiavan0210@gmail.com` | `123456` |

### 🤖 Core AI Solutions Showcase

The ecosystem integrates three distinct AI solutions to automate and optimize the customs clearance process:

#### 1. AI HS-Advisor
An intelligent assistant that suggests accurate HS codes based on product descriptions and cross-references them with current legal documents.

![AI HS-Advisor Demo](./public/gif/hs_code.gif)
![AI Auditor Agent Demo](./public/gif/declaration.gif)

#### 2. AI Auditor Agent
An automated agent that extracts structured data from uploaded documents (Invoices, Packing Lists) and performs side-by-side verification against the declaration to highlight mismatches and fraud risks.

![AI Auditor Agent Demo](./public/gif/verification.gif)

#### 3. Vision Edge Gate
A computer vision simulation at the physical border gate. It scans license plates and container IDs, matching them against cleared declarations to make real-time **PASS** or **HOLD** decisions.

![Vision Edge Gate Demo](./public/gif/AI_Vision.gif)

### ✨ Features

*   **Dashboard:** Overview metrics (total shipments, risk percentage, average clearance time) and charts (shipments over time, risk distribution).
*   **Smart Declaration:** Create shipments, upload invoices/packing lists, and use the AI assistant side panel for HS code suggestions and chat-style interaction.
*   **Document Verification:** View structured extracted data, side-by-side comparison (declaration vs documents) with mismatch highlighting, and status labels (Valid, Warning, Fraud risk).
*   **Shipment Tracking:** Map-oriented view, live-style status (GPS coordinates, seal status), and checkpoint timeline.
*   **Risk Analysis:** Risk score visualization, AI-generated explanation panel, and status bands aligned with risk level.
*   **Border Gate Simulation:** Vehicle scan fields, match results vs declaration, and large PASS/HOLD outcome display.
*   **Admin:** User/role management, system audit logs, and AI model configuration.

---

## 💻 LOCALHOST DEVELOPMENT

### 📁 Project Structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Feature pages: `Dashboard`, `Declaration`, `Verification`, `Tracking`, `Risk`, `Gate`, `Admin` |
| `src/components/` | Shared UI, layout, charts |
| `supabase/migrations/` | PostgreSQL schema, RLS policies, indexes |

### ⚙️ Prerequisites

- **Node.js** 18+ (recommended 20+)
- **npm** (or compatible client)
- **Supabase** project (optional, for production-like auth and data)

### 🛠️ Getting Started

Clone the repository and install dependencies:
```bash
npm install
```

Run the development server on your local machine:

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

**Quality checks:**
```bash
npm run lint
npm test
```

### 🔐 Environment Variables

When you connect the app to Supabase, set (for example in `.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

*Exact names may vary depending on how you wire the client; align them with your Supabase client initialization.*

### 🗄️ Database

Apply migrations in the Supabase SQL editor or CLI so that tables, RLS, and indexes match `supabase/migrations/schema.sql`.

**Main entities:**
- **shipments** — declaration, risk, clearance time, location, seal, HS/container/plate identifiers
- **documents** — uploads, `extracted_data`, verification status, `mismatch_fields`
- **declaration_items** — line items, HS codes, legal references
- **tracking_events** — timeline and map points
- **border_scans** — gate scan results (`pass` / `hold` / `fail`)
- **user_profiles** — roles and admin-relevant user fields
- **system_logs** — audit trail
- **ai_assistant_messages** — chat and structured AI hints (e.g. HS suggestions in `metadata`)
- **ai_model_settings** — per-feature AI configuration for admins

### 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Serve `dist/` |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest |

### 📄 License

Private project ("private": true in package.json). Adjust licensing if you open-source the repository.
```