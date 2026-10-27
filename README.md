# OleoQ EHS

Multi-tenant Environment, Health & Safety SaaS. Each company (tenant) switches on the modules it subscribes to.
**Documents, Incidents, Risk and Configuration** are live; Audits, Inspections and Law are next and plug into the
same shared services (Form Builder, scheduled jobs, follow-up actions).
See [docs/PLATFORM.md](docs/PLATFORM.md) (platform contract) and [docs/modules/](docs/modules/) (what exists, per module).

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query – installable, offline-capable PWA
- **Backend:** Next.js Route Handlers (modular monolith), Prisma 7, Better Auth, Zod
- **Infrastructure:** Neon Postgres + Vercel Blob on Vercel, switchable to AWS RDS/Aurora + S3, or local Postgres + local disk

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for layers, design patterns and coding conventions.

---

## Features

### Document Management
- HR uploads documents (any file type, size limit configurable in System Settings, default 10 MB) into categories.
- Assign each document to **multiple audiences**: all employees, roles (e.g. Managers), departments, locations, named employees.
- **My Documents** shows each employee only what they're authorised to see. Unauthorised direct links (page, API and file) return *not found*.
- **Acknowledgement required** documents: the employee must open the document, then confirm *"I have read and understood this document"*. The record captures employee, document, exact version, timestamp, IP and user agent, and is **immutable** (database triggers plus an HMAC signature).
- **Version control** with full history; HR decides whether a new version needs re-acknowledgement.
- Compliance dashboard (*required / acknowledged / outstanding / overdue*), outstanding lists, **CSV audit trail export**.
- Automatic in-app **reminders** and **escalation** to the line manager or HR for overdue acknowledgements.
- **Document surveys** ([docs/modules/document-surveys.md](docs/modules/document-surveys.md)): add a short survey to a document (text answer, one choice, several choices), optionally mandatory with a deadline; readers answer after opening the document, optionally **anonymously** (anonymous answers are stored without any link to the person and only shown once enough exist); the owner sees results, who has answered, can send reminders and export CSV.

### Incident Management ([docs/modules/incidents.md](docs/modules/incidents.md))
- 3-step report wizard (works offline, save draft any time) using the incident type's published report form.
- Investigation (findings, root cause, causes in 5 groups, H&S/environmental impact, reportability, absences and days lost), reopen with history.
- Corrective/preventive actions shared by several incidents, child tasks, effectiveness review, follow-ups for ineffective actions.
- Status derived from the work done; closure only when every gate is met (the screen lists what is missing).
- Trends with preventive actions, 5 reports with CSV and print. Types, subtypes, causes and reportees in Configuration.

### Risk Management ([docs/modules/risk.md](docs/modules/risk.md))
- 3-step assessment wizard (Scope → Hazards → Review & decide) on a published Risk form: 5×5, 3×3, FMEA or checklist.
- Overall score = highest hazard; bands from the form's matrix rules (edited under Configuration → Risk matrix).
- Approval creates a revision with a score/hazard snapshot; periodic reviews; start revision, clone, archive/restore.
- Objectives, targets and programmes with progress; tasks and sub-tasks, including scoring tasks that rescore a hazard.
- QR labels that open the assessment (after sign-in) or its periodic review; 7 reports with CSV and print.

### Configuration
Company structure, users, roles with scoped assignments, Form Builder, scheduled jobs (reminders/digests that also
feed **My work**), pick-lists, numbering formats, branding, module settings, import, subscription and the audit log.

### Platform
- Multi-tenant (shared database, row-level `organizationId`, tenant-scoped Prisma client). Company structure: business unit → site → location → department.
- Roles are data; role assignments are scoped (whole company, business unit, site, location or department).
- In-app notifications, per-company append-only audit log, System settings, evidence/comments/linked records for any record.
- **PWA / offline:** installable; previously viewed data stays available offline; comments and acknowledgements recorded offline are queued on the device and sent with the **Sync** button in the header.
- Responsive layout: sidebar on desktop, bottom navigation on mobile.

---

## Local development

Requirements: Node.js 20.9+ (22 recommended) and a PostgreSQL database.

```bash
npm install
cp .env.example .env        # then edit values
```

**Database options for local testing**

- Prisma's local Postgres (no Docker): `npx prisma dev -n oleoq -d`. `.env.localdb` already points at it
  (`DATABASE_DRIVER=pg`, `DATABASE_POOL_MAX=1`, `DATABASE_IDLE_TIMEOUT_MS=1` – this lightweight server drops idle and
  parallel connections); prefix commands with `bash scripts/localdb.sh` to use it instead of `.env`, e.g.
  `bash scripts/localdb.sh npx prisma migrate deploy`. For the dev server on another port also set `BETTER_AUTH_URL`:
  `BETTER_AUTH_URL=http://localhost:3100 bash scripts/localdb.sh npx next dev -p 3100`.
- Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ehs postgres:17`.
- A Neon development branch: set `DATABASE_DRIVER=neon`, `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).

**Store uploaded files on your computer:** set `STORAGE_DRIVER=local` (files go to `LOCAL_STORAGE_DIR`, default `./storage`).

```bash
npx prisma migrate deploy   # create tables and immutability triggers
npm run db:seed             # two demo tenants (Northstar, Oleo Demo) with users and documents
npm run dev                 # http://localhost:3000
npm run tenant:create -- --name "Acme Ltd" --slug acme --admin-email jo@acme.example --admin-name "Jo Bloggs" --password "…" [--modules documents,incidents,risk]
```

Module keys: `documents, incidents, risk, audits, inspections, law` (change later with `npm run tenant:modules`).

### Demo accounts (password `Password123!`)

Development only. Full list in [docs/modules/platform.md](docs/modules/platform.md).

| Email | Tenant | Role |
| --- | --- | --- |
| `admin@northstar.example` | Northstar Manufacturing | Administrator (everything, Configuration) |
| `helen@northstar.example` | Northstar | HR Admin – Document Library, audiences, reports |
| `emma@northstar.example` | Northstar | EHS Manager for the whole company (incidents, risk) |
| `sam@northstar.example` | Northstar | Manager + EHS Manager at site Dublin Plant only |
| `liam@northstar.example` | Northstar | EHS Investigator (Warehouse, Cork) |
| `john@northstar.example` | Northstar | Employee (Warehouse, Cork) |
| `admin@oleo-demo.example` | Oleo Demo Ltd | Administrator of the second tenant (isolation checks) |

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` · `npm run lint` · `npm test` | Quality gates |
| `npm run db:migrate` | Create a migration from schema changes (dev) |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Seed demo data (idempotent) |
| `npm run db:seed:incident-types` | Re-apply only the demo incident types + their forms to an existing database (local unless `ALLOW_REMOTE_SEED=1`) |
| `npm run tenant:create -- …` | Provision a company with default roles, lists, settings and its first administrator |
| `bash scripts/localdb.sh <cmd>` | Run any command against the local `prisma dev` database instead of `.env` |
| `npm run icons` | Regenerate PWA icons |

To test the service worker locally, either run a production build (`npm run build && npm start`) or set `NEXT_PUBLIC_ENABLE_SW=true` in dev.

---

## Deploying to Vercel (Neon + Vercel Blob)

1. **Create the project** on Vercel from this repository (framework preset: Next.js).
2. **Database:** add the Neon integration (Storage → Neon) or create a Neon project, then set:
   - `DATABASE_DRIVER=neon`
   - `DATABASE_URL` = pooled connection string
   - `DIRECT_URL` = direct (non-pooled) connection string, used for migrations
3. **Files:** create a Vercel Blob store (Storage → Blob) and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`. Set `STORAGE_DRIVER=vercel-blob`. Files are stored as **private** blobs and only served through authorised API routes. Browsers upload directly to Blob, so files larger than the 4.5 MB function body limit work.
4. **Auth:** `BETTER_AUTH_SECRET` (long random string) and `BETTER_AUTH_URL` (e.g. `https://ehs.example.com`).
5. **Jobs:** `CRON_SECRET` (random string). `vercel.json` schedules `/api/cron/reminders` (06:00 UTC, acknowledgement reminders and escalations) and `/api/cron/jobs` (09:00 UTC, the scheduled jobs configured per company). Vercel sends the secret automatically. On the Hobby plan crons run at most daily, so a job set for another time runs at the next daily call; on Pro you can call `/api/cron/jobs` every 15 minutes.
6. Optional: `AUDIT_SIGNING_SECRET` (defaults to `BETTER_AUTH_SECRET`). **Never rotate it without keeping the old value**, or existing signatures can no longer be verified. Reusing a database you already used locally: copy `BETTER_AUTH_SECRET` (and `AUDIT_SIGNING_SECRET` if set) from that `.env`.
7. Deploy. The `vercel-build` script runs `prisma generate`, `prisma migrate deploy` and `next build`.
8. Seed once from your machine against the direct URL if you want demo data: `DATABASE_URL=<direct url> npm run db:seed`. Otherwise sign in with a user you create in the seed or database. Demo incident types only: `npm run db:seed:incident-types`.
   Files seeded or uploaded with `STORAGE_DRIVER=local` stay on that machine – documents that point to them cannot be opened on Vercel until they are re-uploaded.

> **Existing database from the pre-merge app:** the multi-tenant schema replaces the old one (new `init` migration),
> so `prisma migrate deploy` fails on it. Reset that database first (**deletes all its data**):
> `DATABASE_URL=<direct url> npx prisma migrate reset`, which re-applies all migrations and runs the seed.

> Scale: with ~15,000 active users, keep the Neon pooled URL for the app (serverless functions open many short connections) and size compute to your traffic. All user-scaled lists and audience calculations run in SQL with pagination.

## Switching to AWS later

No code changes are needed, only configuration:

| Concern | Setting |
| --- | --- |
| Amazon RDS / Aurora PostgreSQL | `DATABASE_DRIVER=pg`, `DATABASE_URL=postgresql://…` (use RDS Proxy for serverless workloads) |
| Amazon S3 | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, plus credentials via IAM role or `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`. Keep *Block Public Access* on, and add a CORS rule that allows `PUT` from your app origin (browsers upload with presigned URLs). |
| S3-compatible (MinIO, R2) | also set `S3_ENDPOINT` |
| App server (ECS / App Runner / EC2) | `npm ci && npm run build && npm start` (run `npm run db:deploy` once per release); set the same `BETTER_AUTH_*`, `CRON_SECRET` variables |
| Scheduled work | EventBridge Scheduler → HTTP GET with header `Authorization: Bearer $CRON_SECRET`: `/api/cron/jobs` every 15 min, `/api/cron/reminders` daily |

Every stored file records the driver it was written with, so older files stay readable while you migrate objects.

## Security notes
- Authorisation is enforced server-side on every route via permissions. The UI only hides controls.
- Records outside a user's scope return 404 to avoid leaking their existence.
- Acknowledgements and audit logs are append-only at the database level and HMAC-signed.
- Files are streamed only after an access check. Only safe types render inline; everything else downloads with `nosniff`.
- Sessions are database-backed; deactivating a user revokes their sessions immediately.
