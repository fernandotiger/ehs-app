# Documents Module – Migration Brief

**Audience:** a Claude Code session working in a *different* Next.js project (the "target project").
**Goal:** rebuild the **Documents module** of this EHS platform in the target project with **identical
functionality, workflow, layout and infrastructure behaviour** (offline/PWA, Vercel Blob / S3 / local
storage, Neon / pg database drivers, cron reminders, audit trail…). The **only intended difference is
the colour palette**, which must come from the target project.

> **Source code is on this machine.** The source project is at
> `C:\Users\User\Documents\claude_code\code\milestone0` (Next.js 16.3.5 / React 19.2 / Prisma 7 /
> Tailwind 4 / shadcn). Every file referenced below is relative to that folder. **Read the original
> files rather than re-inventing them** – this brief tells you *what* exists, *why*, and *how to port
> it*; the source is the ground truth for exact code, copy and class names.

---

## 0. How to use this brief

1. Read sections 1–3 to understand the feature.
2. Do the **discovery step (§10)** in the target project before writing code – the target may already
   have auth, users, roles, notifications, storage or offline infrastructure that should be reused
   instead of duplicated.
3. Port in the order given in **§12 (implementation plan)**, copying source files and adapting
   imports, then re-skin with the target palette (**§9**).
4. Verify with the **acceptance checklist (§13)**.
5. If the target project's conventions conflict with this module's (e.g. a different auth library,
   no Prisma, no `departments`), **stop and ask the user** rather than guessing.

Both projects use Next.js 16 – its APIs differ from older versions (`proxy.ts` instead of
`middleware.ts`, `params` is a `Promise`, global `PageProps<"/route">` / `LayoutProps` types). Read
`node_modules/next/dist/docs/` in the target before writing route/page code.

---

## 1. What the module does (functional spec)

A policy/procedure library where managers publish documents to audiences and employees must
**open, read and confirm** ("I confirm that I have read and understood this document.").

### 1.1 Actors & permissions
Permissions are data-driven (roles hold permission keys; code never checks role names).

| Permission key | Constant | Grants |
| --- | --- | --- |
| `documents.manage` | `DOCUMENTS_MANAGE` | Upload, edit, version, publish, archive/restore, set audiences & ack rules. Sees all documents. |
| `documents.view_all` | `DOCUMENTS_VIEW_ALL` | Open any document in any status (incl. superseded versions). |
| `documents.acknowledgements.report` | `DOCUMENTS_ACK_REPORTS` | Library (read-only), acknowledgement reports, CSV exports, history, compliance dashboard. |
| *(none – any signed-in user)* | | My Documents, viewer, acknowledge, categories. |

Permission groups used by endpoints (`src/server/modules/documents/document-permissions.ts`):
`MANAGE = [manage]`, `LIBRARY = [manage, view_all, ack_reports]`, `REPORTS = [ack_reports, manage]`.

### 1.2 Document lifecycle
- **Statuses:** `DRAFT → PUBLISHED → ARCHIVED`; `ARCHIVED → restore →` `PUBLISHED` (if it was ever
  published) or `DRAFT`.
- **Create** = file + details + audience + acknowledgement settings, then **"Publish now"** or
  **"Save as draft"**. Version 1 is created with change note "Initial version".
- **Publish** (draft only) requires a current file **and** at least one audience; notifies the audience.
- **Archive** hides it from employees (versions, acknowledgements, history kept). Archived docs
  cannot be edited or versioned until restored.
- **Uniqueness:** title unique (case-insensitive) among non-archived documents; reference code unique
  (case-insensitive) across all. Restore re-checks title clash.
- **Categories:** free-text combobox – pick an existing one or type a new name (created on save,
  case-insensitive match). Empty = uncategorised.

### 1.3 Audiences (who can see / must read)
Any combination of: **All employees**, **Roles**, **Departments**, **Locations**, **Named employees**.
A user is in the audience if they match **any** row. Only **active** users count. A live
"≈ N people will have access" estimate is shown while building (single SQL COUNT).
When "All employees" is on, the narrower pickers are disabled and ignored.

### 1.4 Visibility rules (Specification pattern – one rule for lists, detail and file download)
- Managers / view-all: every document, every status.
- Everyone else: only **PUBLISHED** documents whose audience matches them.
- Out-of-scope records return **404, never 403** (existence is not leaked).
- Superseded versions: only managers / view-all may fetch them; employees get the current version only.

### 1.5 Versions & re-acknowledgement
- "Upload new version" dialog: file + "What changed?" note + checkbox **"Employees must acknowledge
  this version again"** (only shown when ack is required; defaults to on).
- With re-ack: `ackRequiredFromVersion` moves to the new version number → earlier acknowledgements
  stop counting, audience is notified (`DOCUMENT_UPDATED`). Without: existing acks keep counting.
- All versions retained; version table shows current/re-ack badges and per-version ack counts.

### 1.6 Acknowledgement flow (employee)
1. Open the document (inline preview load, **Open** or **Download** – each hits the audited file
   route, which writes `DOCUMENT_FILE_ACCESSED`). On phones the PDF iframe is *not* mounted, so
   merely visiting the page doesn't count as "opened".
2. Tick the statement checkbox (disabled until opened).
3. Press **Acknowledge**.

Server guards: document visible & assigned, published, requires ack; version is current (online) or
still satisfies the requirement (offline replay); the user has a `DOCUMENT_FILE_ACCESSED` audit row
for that version. Acknowledgements are **insert-only, HMAC-signed, unique per (user, version)**;
re-acknowledging (double-click, online+sync race) returns the original record.
The receipt card shows statement, date/time, version, and "Confirmed offline" time when synced.

### 1.7 Due dates, reminders, escalation
Per-document settings with system defaults (`SystemSetting` row `system`):

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| `ackDueDays` | 14 | 1–365 | Days to acknowledge |
| `reminderIntervalDays` | 3 | 1–90 | Days between reminders while outstanding |
| `escalationDays` | 7 | 0–365 | Days overdue before escalation |
| `escalationTarget` | `MANAGER` | `MANAGER` / `HR` / `NONE` | Escalate to line manager, HR (= users with `documents.manage`), or nobody |

Rules (pure, unit-tested – `acknowledgement-rules.ts`):
- `requiredSince = max(publishedAt, createdAt of the required version, ackEnabledAt)`.
  `ackEnabledAt` is set when ack is switched on for an already-published doc, so nobody is
  instantly overdue.
- Per-user `dueAt = max(requiredSince, user.createdAt) + ackDueDays` (new joiners get the full window).
- Status per user: `not_required` | `acknowledged` | `outstanding` | `overdue`.
- **Daily cron**: remind when within `REMINDER_LEAD_DAYS = 2` of due (or past), then every
  `reminderIntervalDays`; escalate **once** when overdue ≥ `escalationDays`. Manager escalations are
  grouped per manager ("Ann, Bob and 3 more have not acknowledged…"); users without a manager fall
  back to HR. Bookkeeping in `AcknowledgementReminder` (per document, user, required version).
  Processes documents and users in keyset-paginated batches; one broken doc never stops the run.

### 1.8 Compliance & reporting
- Per document: `required / acknowledged / outstanding / overdue / percent` computed with **COUNT
  queries in SQL** (designed for ~15k users – never load the whole directory).
- Report: paginated people list with tabs **Outstanding / Overdue / Acknowledged**, search
  (name/email/employee no.), department and location filters; shows due date, reminders sent,
  escalation date, ack date/version/source (Online / Offline sync).
- **CSV exports** (streamed, UTF-8 BOM, CSV-injection-safe, audited as
  `DOCUMENT_ACKNOWLEDGEMENTS_EXPORTED`):
  - *Audit trail* – every signed acknowledgement of every version, incl. IP, user agent, statement,
    signature and "Counts toward current requirement".
  - *Outstanding* – who still has to acknowledge, with manager, due date, overdue, reminders, escalation.
- Compliance summary (dashboard / library header): totals across all published docs requiring ack,
  top N sorted by most outstanding.

### 1.9 History (audit)
Append-only, HMAC-signed `AuditLog` entries for the document and its versions. Default view
"changes" hides per-employee noise (`DOCUMENT_FILE_ACCESSED`, `DOCUMENT_ACKNOWLEDGED`); an
**"Employee activity"** switch shows everything. Entries render human-readable diffs
("Title: A → B", "Audience changed", "Version 3", "Synced from offline").

Audit actions: `DOCUMENT_CREATED, DOCUMENT_UPDATED, DOCUMENT_PUBLISHED, DOCUMENT_ARCHIVED,
DOCUMENT_RESTORED, DOCUMENT_VERSION_ADDED, DOCUMENT_ACKNOWLEDGED, DOCUMENT_FILE_ACCESSED,
DOCUMENT_ACKNOWLEDGEMENTS_EXPORTED`. Entity types `Document`, `DocumentVersion`.

### 1.10 Notifications (in-app)
Types used: `DOCUMENT_ASSIGNED`, `DOCUMENT_UPDATED`, `ACK_REMINDER`, `ACK_OVERDUE_ESCALATION`.
Sent after the transaction commits, in batches of 1000 user ids. Link: `/documents/{id}`.
- Create+publish / publish → whole audience ("New document: …").
- Edit while published → if ack was just switched on: whole audience ("Acknowledgement required: …");
  else if audience changed: **only newly included people**.
- New version with re-ack → whole audience ("Updated: … (version N)").
- Toasts report "N people notified".

### 1.11 Offline
- My Documents, viewer data and previously opened files work offline (persisted React Query cache +
  service worker file cache).
- Acknowledging offline (or on a network error) queues a `document.acknowledge` operation in an
  IndexedDB outbox; UI shows **"Acknowledgement pending sync"**. The header **Sync** button replays it
  via `POST /api/sync` with `source = OFFLINE_SYNC` and the device's `clientAcknowledgedAt`
  (future device clocks are clamped to now). Operation ids are idempotency keys.

---

## 2. Screens & layout (replicate exactly; only colours change)

All pages live in the authenticated app shell (sidebar + header with Sync button and notification
bell + mobile bottom nav). Mobile-first: tables become card lists below `md`.

| Route | Guard | Component | Layout |
| --- | --- | --- | --- |
| `/documents` | signed in | `MyDocuments` | **PageBanner** (navy banner with hex pattern) "My Documents" + 3 banner stats (To acknowledge / Overdue / Documents). Tabs **All · Action required (count pill) · Acknowledged**; search + category filter. Card list: file-type tile, title, "Category · Version N · Updated d MMM yyyy", ack badge + "Due in / Overdue by …", chevron. Pagination 20/page. Empty: "You're all caught up". |
| `/documents/[id]` | signed in + visibility (else `notFound()`) | `DocumentViewer` | **PageHeader** (back → My Documents) with badges (status if not published, category, version, ack). "Manage" button for manage/report users. Two columns `lg:grid-cols-[minmax(0,1fr)_340px]`: left **FilePreview** (header row with file tile, name, "Version N · size", Open + Download buttons; desktop iframe for PDF/text at `h-[75vh]`, `<img>` for images, otherwise "can't be previewed" message); right sticky aside: **AcknowledgementPanel** (2-step checklist, statement checkbox, big Acknowledge button / receipt card / pending-sync alert / "for information") and "About this document" card (description, reference, published, last updated, size, "What changed" for v>1). |
| `/documents/manage` | LIBRARY perms | `DocumentLibrary` | PageBanner "Document Library" + white "Upload document" button (manage only). 4 StatCards (Tracked documents, Required, Acknowledged + % hint, Outstanding + overdue hint) for report users. Filter card: search · category · status (default "Active (published & drafts)"). Table: Document (tile + title + "ref · category"), Status pill, Version, Audience label, Acknowledgement progress bar, Updated. Row click → manage page. |
| `/documents/manage/new` | MANAGE | `NewDocumentForm` | PageHeader "Upload document" (back → Library). `max-w-4xl` stacked **FormSection** cards with numbered step bubbles: **1 File** (dropzone + progress) · **2 Details** (title, reference code, category combobox, description) · **3 Who should have access?** (AudienceBuilder) · **4 Acknowledgement** (switch + 4 fields in a grid). Sticky bottom action bar: "Save as draft" (outline) + "Publish now". |
| `/documents/manage/[id]` | LIBRARY perms (404 if missing) | `DocumentManage` | PageHeader (back → Library) with status/category/version/reference/"Acknowledgement required" badges; actions: View as employee, Publish (confirm dialog), Archive (destructive confirm), Restore. Tabs: **Overview** (edit form – Details / Audience / Acknowledgement sections + sticky Save/Discard bar with "Unsaved changes"; read-only summary for non-managers or archived; right aside: Acknowledgement progress + Record card) · **Versions** (table + "Upload new version" dialog) · **Acknowledgements** (4 StatCards, progress card, status tabs with counts, CSV buttons, search/department/location filters, table) · **History** (timeline with "Employee activity" switch). Acknowledgements & History tabs only for report users. |
| `/dashboard` (widgets) | – | `MyAcknowledgementsWidget`, `DocumentComplianceWidget` | Card widgets: top 5 outstanding for me; top 5 docs by outstanding with compact progress bars (report users only). Place them in the target project's dashboard. |

Navigation entries (`src/components/layout/nav-config.ts`): section **Documents** with
"My Documents" `/documents` (BookOpenCheck icon) and "Document Library" `/documents/manage`
(FileStack icon, visible with `documents.manage` or `documents.acknowledgements.report`). Active item =
longest matching href prefix (so `/documents/manage/x` highlights Library).

Badge semantics (`StatusBadge` tones): Draft = neutral, Published = success, Archived = warning;
Acknowledged = success, Acknowledgement required = warning, Overdue = danger,
Pending sync = info, category = brand, Offline sync source = info.
Progress bar colour: ≥90% success, else overdue>0 warning, else brand.

Copy text (toasts, empty states, descriptions) should be taken verbatim from the source components.

---

## 3. Architecture (keep the same layering)

```
Browser (PWA) ──fetch──▶ app/api/**/route.ts ──▶ apiHandler pipeline ──▶ module service ──▶ Prisma ─▶ Postgres
      │                                                                   └─▶ StorageProvider ─▶ Vercel Blob / S3 / local disk
      └─ IndexedDB outbox ──(Sync button)──▶ /api/sync ──▶ sync registry ──▶ documents sync handler
```

| Layer | Source location | Rule |
| --- | --- | --- |
| Pages | `src/app/(app)/documents/**/page.tsx` | Server components; guard with `guardPage(...)`, render one feature component. |
| Feature UI | `src/features/documents/` | `api.ts` (query keys + React Query hooks), `format.ts`, `components/**`. Client components. |
| Route handlers | `src/app/api/documents/**/route.ts` | 3–10 lines: permission + zod schema + call service. |
| HTTP pipeline | `src/server/http/api-handler.ts`, `errors.ts` | auth → permission → zod body/query → handler → error mapping (`AppError` → JSON `{error:{code,message,details}}`). |
| Services | `src/server/modules/documents/*.service.ts` | Business logic, transactions, audit, notifications. |
| Pure rules | `acknowledgement-rules.ts`, `document-access.policy.ts`, `csv.ts` | No I/O, unit-tested. |
| Validation | `src/lib/validation/documents.ts` | Zod schemas shared by forms and API. Form schemas avoid transforms (RHF-friendly). |

Invariants to preserve:
1. Authorisation on the server; UI hiding is convenience only.
2. 404 for out-of-scope records.
3. Every mutation writes its audit record **in the same transaction** (`recordAudit({...}, tx)`).
4. Acknowledgements & audit logs are append-only (DB triggers) and HMAC-signed.
5. Files leave storage **only** through the authorised file route (`streamFile`); storage keys/URLs are
   never sent to the client.
6. Uploads are two-phase (`uploadFile()` → `uploadId` → `uploadService.consume(..., tx)`).
7. Services throw `AppError` subclasses; never build HTTP responses in services.
8. Server-side pagination (`paginationQuerySchema`, `Paginated<T>`), dates as ISO strings, format with `date-fns`.

---

## 4. Data model

Copy from `prisma/schema.prisma` (section "Document management") and adapt relation names to the
target's `User` / `Role` / `Department` / `Location` models.

**Enums:** `DocumentStatus {DRAFT, PUBLISHED, ARCHIVED}`,
`AudienceType {ALL_EMPLOYEES, ROLE, DEPARTMENT, LOCATION, USER}`,
`EscalationTarget {NONE, MANAGER, HR}`; plus `NotificationType` values listed in §1.10 and
`UploadStatus {PENDING, UPLOADED, CONSUMED}`.

**Models (tables):**
- `DocumentCategory` (`document_categories`) – `name @unique`.
- `Document` (`documents`) – title, description, `referenceCode @unique`, categoryId, status,
  `currentVersionId @unique` (relation "DocumentCurrentVersion"), `requiresAcknowledgement`,
  `ackRequiredFromVersion Int?`, `ackEnabledAt DateTime?`, `ackDueDays?`, `reminderIntervalDays?`,
  `escalationDays?`, `escalationTarget @default(MANAGER)`, `reviewDate?`, `publishedAt?`,
  `archivedAt?`, `createdById`, timestamps. Indexes on status, categoryId, title.
- `DocumentVersion` (`document_versions`) – documentId, versionNumber, fileName, mimeType, sizeBytes,
  **`storageDriver`**, storageKey, checksum?, changeNote?, `requiresReacknowledgement`, uploadedById,
  createdAt. `@@unique([documentId, versionNumber])`, `onDelete: Restrict`.
- `DocumentAudience` (`document_audiences`) – documentId, type, roleId?/departmentId?/locationId?/userId?
  (cascade). Indexed on each FK + type.
- `DocumentAcknowledgement` (`document_acknowledgements`) – **immutable**: documentId, versionId,
  versionNumber, userId, snapshots (`documentTitle`, `userName`, `userEmail`), `statement`,
  `acknowledgedAt`, `clientAcknowledgedAt?`, `source` ("ONLINE"|"OFFLINE_SYNC"), ipAddress?, userAgent?,
  `signature`. `@@unique([userId, versionId])`, index `[documentId, versionNumber]`. All FKs Restrict.
- `AcknowledgementReminder` (`acknowledgement_reminders`) – documentId, userId, versionNumber,
  remindersSent, lastRemindedAt?, escalatedAt?. `@@unique([documentId, userId, versionNumber])`.

**Cross-cutting models the module needs** (reuse the target's if equivalent):
`User` (needs `isActive`, `createdAt`, `departmentId`, `locationId`, `managerId`, `employeeNumber`,
`jobTitle`), `Role` (`permissions String[]`), `UserRole`, `Department`, `Location`,
`SystemSetting` (key/value JSON), `AuditLog` (immutable, signed), `Notification`, `UploadSession`,
`SyncOperation`.

**Migrations to replicate:**
- `prisma/migrations/20260914113000_immutable_audit_trail/migration.sql` – function
  `prevent_mutation_of_immutable_rows()` + `BEFORE UPDATE OR DELETE` row triggers and
  `BEFORE TRUNCATE` statement triggers on `document_acknowledgements` and `audit_logs`. Must be a
  hand-written migration (Prisma doesn't generate triggers).
- `20260914150000_document_ack_enabled_at` – adds `ackEnabledAt` (fold into the initial migration if
  creating fresh).

Prisma 7 specifics used in the source: `generator client { provider = "prisma-client"; output =
"../src/generated/prisma" }`, imports from `@/generated/prisma/client`, driver adapters, and
`prisma.config.ts` with `datasource.url = DIRECT_URL ?? DATABASE_URL` and seed `tsx prisma/seed.ts`.

---

## 5. API contract

All JSON, wrapped by `apiHandler`. Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`,
`409 CONFLICT`, `422 VALIDATION_ERROR | BUSINESS_RULE_VIOLATION`, `500 INTERNAL_ERROR`.

| Method & path | Perm | Body / query | Service |
| --- | --- | --- | --- |
| `GET /api/documents/my` | signed in | `page, pageSize, q, categoryId, filter=all\|action\|acknowledged` | `documentQueryService.myDocuments` → `{items,total,page,pageSize,summary:{total,outstanding,overdue,acknowledged}}` |
| `GET /api/documents/:id` | signed in (visibility) | – | `viewerDetail` (adds `assigned`, `openedCurrentVersion`, `requiredVersionNumber`, `statement`) |
| `PUT /api/documents/:id` | MANAGE | `updateDocumentSchema` | `documentService.update` → `{id, notified}` |
| `GET /api/documents` | LIBRARY | `page, pageSize, q, categoryId, status=ACTIVE\|ALL\|DRAFT\|PUBLISHED\|ARCHIVED` | `library` (per-row compliance) |
| `POST /api/documents` | MANAGE | `createDocumentSchema` (= update + `uploadId`, `publish`) | `create` → `{id,status,notified}` |
| `GET /api/documents/categories` | signed in | – | `[{id,name,documentCount}]` |
| `POST /api/documents/audience-estimate` | MANAGE | `{audience}` | `{count}` |
| `GET /api/documents/compliance` | REPORTS | `limit` (1–100, def 10) | `{items:[{id,title,category,stats}], totals}` |
| `GET /api/documents/:id/manage` | LIBRARY | – | `manageDetail` |
| `POST /api/documents/:id/publish` \| `archive` \| `restore` | MANAGE | – | lifecycle commands |
| `GET /api/documents/:id/versions` | LIBRARY | – | version history |
| `POST /api/documents/:id/versions` | MANAGE | `{uploadId, changeNote, requireReacknowledgement}` | `addVersion` |
| `GET /api/documents/:id/versions/:versionId/file` | signed in (visibility + version rule) | `?download=1` | streams file, audits `FILE_ACCESSED` |
| `POST /api/documents/:id/acknowledge` | signed in | `{versionId}` | `acknowledgementService.acknowledge` (source ONLINE) |
| `GET /api/documents/:id/compliance` | REPORTS | – | stats |
| `GET /api/documents/:id/acknowledgements` | REPORTS | `status=outstanding\|overdue\|acknowledged, q, departmentId, locationId, page, pageSize` | report |
| `GET /api/documents/:id/acknowledgements/export` | REPORTS | `status=acknowledged\|outstanding, departmentId, locationId` | streamed CSV |
| `GET /api/documents/:id/audit` | REPORTS | `kind=changes\|all, q, page, pageSize` | history |

Supporting endpoints the module calls (port or map to the target's equivalents):
`POST /api/uploads`, `PUT /api/uploads/:id/content` (local driver), `POST /api/uploads/:id/blob-token`
(Vercel Blob), `POST /api/uploads/:id/complete`, `POST /api/sync`, `GET /api/lookups`
(departments, locations, roles), `GET /api/lookups/users?q|ids|limit` (people picker),
`GET /api/admin/settings` (any signed-in user may read – forms need defaults/upload limit),
`GET /api/me`, `GET|POST /api/notifications`, `POST /api/notifications/:id/read`,
`GET /api/cron/reminders` (Bearer `CRON_SECRET`).

---

## 6. Infrastructure (must behave identically)

### 6.1 Environment variables (`src/server/config/env.ts`, `.env.example`)
| Var | Values / default | Notes |
| --- | --- | --- |
| `DATABASE_DRIVER` | `neon` \| `pg` (default `pg`) | `neon` = `@prisma/adapter-neon` for Vercel+Neon; `pg` = `@prisma/adapter-pg` for local Postgres / AWS RDS / Aurora |
| `DATABASE_URL` | required | |
| `DIRECT_URL` | optional | non-pooled URL for `prisma migrate` (Neon) |
| `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT_MS` | optional | pool tuning |
| `STORAGE_DRIVER` | `local` \| `vercel-blob` \| `s3` (default `local`) | |
| `LOCAL_STORAGE_DIR` | `./storage` | local dev only (gitignored) |
| `BLOB_READ_WRITE_TOKEN` | | Vercel Blob (private blobs) |
| `S3_BUCKET` (required if s3), `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | endpoint enables path-style for MinIO/R2; no keys → default AWS credential chain |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | | auth (the source uses better-auth) |
| `AUDIT_SIGNING_SECRET` | defaults to `BETTER_AUTH_SECRET` | HMAC for audit + acknowledgements |
| `CRON_SECRET` | | Vercel Cron bearer token |
| `NEXT_PUBLIC_ENABLE_SW` | `true` to test SW in `next dev` | |

Env is validated once with zod and cached; misconfiguration throws a readable error.

### 6.2 Storage (Strategy pattern – `src/server/storage/`)
`StorageProvider { driver, put, get, head, delete, createUploadInstruction }` with three
implementations. `getStorage(driver?)` caches providers; **each file row stores its `storageDriver`**
so files written by an old driver stay readable after switching.

Upload instructions returned to the browser:
- `local` → `{mode:"server", url:"/api/uploads/:id/content", method:"PUT"}` (streamed, size-checked, sha256).
- `vercel-blob` → `{mode:"vercel-blob", pathname, handleUploadUrl:"/api/uploads/:id/blob-token"}`;
  token restricted to that exact pathname, max size, no overwrite, valid until session expiry.
  Bypasses Vercel's ~4.5 MB body limit.
- `s3` → `{mode:"presigned", url, method:"PUT", headers}` (15-min presigned PUT; bucket should block
  public access).

Upload service (`src/server/modules/uploads/upload.service.ts`): `init` (checks
`maxUploadSizeMb` setting, default 10 MB; key `documents/YYYY/MM/<uploadId>/<sanitised-name>`;
1-hour TTL) → bytes → `complete` (HEAD verify, delete if oversize; idempotent) → `consume(uploadId,
user, "document-version", tx)` atomically flips `UPLOADED → CONSUMED` inside the domain transaction.
Client: `src/lib/upload-client.ts` `uploadFile(file, purpose, {onProgress})` handles all three modes
(XHR for progress).

File streaming (`src/server/storage/file-response.ts`): inline only for safe types (PDF, common
images, text/plain, mp4/webm, audio), otherwise attachment + `Content-Security-Policy: sandbox`;
`Cache-Control: private, no-cache`, `nosniff`, RFC 5987 filename.

### 6.3 Database client (`src/server/db/client.ts`)
Driver adapter chosen by `DATABASE_DRIVER`; single client cached on `globalThis`; `DbClient` type
usable inside/outside interactive transactions.

### 6.4 Vercel
`vercel.json`:
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run vercel-build",
  "crons": [{ "path": "/api/cron/reminders", "schedule": "0 6 * * *" }]
}
```
Scripts: `build = prisma generate && next build`, `vercel-build = prisma generate && prisma migrate
deploy && next build`, `postinstall = prisma generate`. Cron route: `maxDuration = 300`,
`dynamic = "force-dynamic"`, checks `Authorization: Bearer $CRON_SECRET`, runs module jobs with
`Promise.allSettled`, returns a JSON summary (500 if any failed). If the target already has a cron
route, **add** `runAcknowledgementReminders(now)` to it instead of creating a second one.

### 6.5 AWS
Same code runs on AWS: `DATABASE_DRIVER=pg` against RDS/Aurora, `STORAGE_DRIVER=s3`. Without Vercel
Cron, schedule `GET /api/cron/reminders` daily (EventBridge Scheduler / any scheduler) with the bearer
header.

### 6.6 Security headers (`next.config.ts`)
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (required for the same-origin PDF
iframe), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self),
microphone=(), geolocation=(self)`, HSTS, `poweredByHeader: false`; `/sw.js` served with
`Cache-Control: no-cache, no-store, must-revalidate`, JS content type and `Service-Worker-Allowed: /`.
Merge into the target's config rather than replacing it.

---

## 7. Offline / PWA (port as a whole – the module depends on it)

| Piece | Source | What it does |
| --- | --- | --- |
| Service worker | `public/sw.js` | Cache-first static assets; network-first navigations (fallback cache → `/offline`); network-first API GETs; **document file route cached** in `ehs-files-*` (`/api/documents/:id/versions/:vid/file`, `ignoreSearch`); never intercepts non-GET, `/api/auth`, `/api/uploads`. `WARM_ROUTES` message pre-caches core screens (include `/documents`); `CLEAR_USER_CACHES` on sign-out. Returns 503 `{error:{code:"NETWORK_ERROR"}}` when offline with no cache. |
| SW registration | `src/components/pwa/service-worker-registrar.tsx` | Registers in production (or `NEXT_PUBLIC_ENABLE_SW=true`); `warmOfflineRoutes()` after sign-in. |
| Persisted query cache | `src/components/providers/query-provider.tsx` | `PersistQueryClientProvider` + `idb-keyval`, 7-day max age, `networkMode: "offlineFirst"`, buster scoped per user, skip queries with `meta: { persist: false }` (reports, audit, estimate, user search). No retry on 4xx. |
| Outbox | `src/lib/offline/db.ts`, `outbox.ts`, `operations.ts`, `sync-engine.ts` | Dexie DB `ehs-offline` (`outbox`, `files`); `enqueue`, `useOutbox(userId, type)`, `syncNow(userId)`; `{ $file }` placeholders upload staged files before replay; operations replayed one at a time; network loss stops the run and keeps items pending; rejections marked failed with message. |
| Sync API | `src/app/api/sync/route.ts`, `src/server/modules/sync/*` | Registry of per-module handlers; idempotent via `SyncOperation` table. Documents contributes `document.acknowledge` (`src/server/modules/documents/sync-handlers.ts`). |
| Sync UI | `src/components/layout/sync-button.tsx` | Header popover: online/offline indicator, queued count badge, Sync button, per-item retry/discard. |
| Sign-out cleanup | `src/lib/offline/clear.ts` | Clears persisted cache and `ehs-api/files/pages` caches (outbox kept, scoped by user). |
| Manifest/offline page | `src/app/manifest.ts`, `src/app/offline/page.tsx`, `public/icons/*` | Installable PWA. |
| Client API | `src/lib/api-client.ts` | `ApiError` with `isNetworkError`; dispatches `ehs:unauthorized` on 401. |

Client hooks in `features/documents/api.ts`: `useAcknowledgeDocument` queues when `!navigator.onLine`
**or** on `ApiError.isNetworkError`; `usePendingAcknowledgements()` → `Set<documentId>` from the outbox.

**If the target project already has an offline/outbox/SW layer**, add the documents pieces to it
(operation type, sync handler, SW file-route pattern, warm route, query `meta.persist` flags) instead of
installing a parallel system. Rename the `ehs-*` cache/DB prefixes to the target's app name if
appropriate (keep them consistent across `sw.js` and `clear.ts`).

---

## 8. Shared building blocks the UI depends on

Port these (or map to existing equivalents in the target):

- **Layout:** `components/layout/page-header.tsx` (`PageBanner` – brand-coloured banner with
  `bg-hex-pattern`, title, description, actions, children; `PageHeader` – back link, title, meta
  badges, actions), app shell/sidebar/nav config, `notification-bell.tsx`, `sync-button.tsx`.
- **Common:** `status-badge.tsx`, `stat-card.tsx`, `states.tsx` (`EmptyState`, `ErrorState`,
  `LoadingRows`), `pagination-bar.tsx`, `confirm-dialog.tsx`, `file-dropzone.tsx` (with per-file
  progress), `multi-select.tsx`, `user-picker.tsx` (`UserMultiPicker`), `access-denied.tsx`.
- **Providers:** `current-user-provider.tsx` (`useCurrentUser()` → `{user, can, canAny}`),
  `query-provider.tsx`.
- **shadcn/ui** (newer variants – `Card` supports `size="sm"` and `CardAction`; `Field*` components;
  `InputGroup`; `Spinner`; `Empty`): alert, badge, button, card, checkbox, command, dialog,
  dropdown-menu, field, input, input-group, label, popover, scroll-area, select, separator, skeleton,
  sonner, spinner, switch, table, tabs, textarea, tooltip. Add missing ones with the shadcn CLI;
  don't overwrite customised target components without checking.
- **Shared hooks:** `features/shared/lookups.ts` (`useLookups`, `useUserSearch`, `useUsersByIds`),
  `features/shared/settings.ts` (`useSystemSettings` with `DEFAULT_SETTINGS` placeholder),
  `hooks/use-online-status.ts`.
- **Server:** `server/auth/current-user.ts` (`CurrentUser` incl. `roleIds`, `departmentId`,
  `locationId`, `permissions`), `page-guard.ts`, `authorization.ts`, `server/audit/*`,
  `server/modules/notifications/notification.service.ts`, `server/modules/settings/settings.service.ts`.

npm packages used by the module: `@prisma/client`, `@prisma/adapter-pg`, `@prisma/adapter-neon`,
`@neondatabase/serverless`, `pg`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
`@vercel/blob`, `@tanstack/react-query`, `@tanstack/react-query-persist-client`,
`@tanstack/query-async-storage-persister`, `idb-keyval`, `dexie`, `dexie-react-hooks`,
`react-hook-form`, `@hookform/resolvers`, `zod` (v4 – note `z.number({ error })`), `date-fns`,
`lucide-react`, `sonner`, `cmdk`, `radix-ui`, `server-only`; dev: `prisma`, `tsx`, `vitest`, `dotenv`.
Install only what the target lacks; match the target's major versions where they differ.

---

## 9. Colour palette – use the TARGET project's

The module never hard-codes the palette except in a few spots; it uses Tailwind tokens defined in
`src/app/globals.css`. In the target project:

1. **Do not copy** the source `:root` / `.dark` colour values (they are the Oleo navy palette:
   brand `#3b5382`, brand-dark `#293d5d`, brand-light `#567ebc`, brand-soft `#e9eef8`, background
   `#f5f6fa`).
2. Ensure the target's theme exposes these **semantic tokens** (map each to the closest target colour;
   add any that are missing, light *and* dark):

| Token (Tailwind class) | Used for |
| --- | --- |
| `brand` (`text-brand`, `bg-brand`) | Banner background, icons, history dots, progress bar default, info icons |
| `brand-dark` | Text on white banner buttons (`bg-white text-brand-dark`), dark CTA buttons |
| `brand-light` | Accent/ring |
| `brand-soft` | File-type tiles, step bubbles, audience estimate box, selected checkbox row, `brand` badge |
| `success`, `success-foreground` | Acknowledged, ≥90% progress, receipt card |
| `warning`, `warning-foreground` | Outstanding, archived, pending count badge |
| `info` | Pending sync, offline-sync source |
| `destructive` | Overdue, errors |
| `muted`, `muted-foreground`, `border`, `card`, `background`, `primary` | Standard shadcn tokens |
| `chart-2` | `purple` badge tone (unused by documents but part of `StatusBadge`) |
| `font-heading` | Headings / stat numbers (maps to the target's display font) |

3. Replace the few **hard-coded hex values** with target equivalents (or new tokens):
   - `text-[#9a5b00]` – dark amber text on warning badges (`status-badge.tsx`, "Action required"
     count pill in `my-documents.tsx`).
   - `text-[#1f6fb8]` – dark blue text on info badges (`status-badge.tsx`).
4. `PageBanner` uses `bg-brand` + `.bg-hex-pattern` (white stroke at 7% opacity) and white text; keep
   the structure but let the colour follow the target's brand. If the target already has its own page
   banner/header component, use it with the same content.
5. Update `manifest.ts` `theme_color` / `background_color` to the target palette.
6. If the target already defines different token names (e.g. `primary` only, no `brand`), either add
   `brand*` aliases in its `@theme inline` block pointing to its colours, or search-and-replace the
   class names in the ported components – prefer aliases (fewer diffs).

---

## 10. Discovery step in the target project (do this first)

Answer these by reading the target code, then decide reuse vs port:

- Next/React/Prisma/Tailwind/shadcn/zod versions; `src/` layout; path alias `@/`.
- **Auth:** better-auth? Session lookup function? Is there a `CurrentUser`-like principal with
  permissions, role ids, department and location? (The visibility policy needs `id, roleIds,
  departmentId, locationId, permissions`.)
- **Users/org:** do `User`, `Role`, `Department`, `Location`, manager relation, `isActive`,
  `employeeNumber` exist? If departments/locations don't exist, ask the user whether to add them or
  drop those audience types.
- **Permissions:** is there a permission catalogue? Add the three document permissions to it (and to
  any role-editor UI and seed roles).
- Existing **API handler/error pattern**, **audit log**, **notifications**, **system settings**,
  **uploads/storage**, **offline/SW**, **cron**, **dashboard**, **nav config**, **app shell** – reuse
  if present, port from source if not.
- Theme tokens in the target `globals.css` (for §9).
- Existing Prisma migrations – generate a new migration for the document tables; add the trigger
  migration by hand.

---

## 11. File manifest (source → port)

**Server – documents (copy, fix imports):**
```
src/server/modules/documents/
  acknowledgement-rules.ts (+ .test.ts)     pure rules
  document-access.policy.ts (+ .test.ts)    visibility specification
  csv.ts (+ .test.ts)                       CSV helpers + streaming response
  document-audit-actions.ts                 audit vocabulary
  document-permissions.ts                   permission groups
  document.dto.ts                           response types (client imports types from here)
  document-mappers.ts                       row → DTO helpers
  document-requirement.ts                   requirement/population/compliance SQL builders, notifyUsers
  document.service.ts                       commands
  document-query.service.ts                 read models
  document-file.service.ts                  audited file streaming
  acknowledgement.service.ts                acknowledge
  compliance.service.ts                     stats, report, CSV export, summary, history
  acknowledgement-reminders.ts              cron job
  sync-handlers.ts                          offline replay
src/lib/validation/documents.ts             zod schemas + constants (ACKNOWLEDGEMENT_STATEMENT…)
src/app/api/documents/**                    17 route files (see §5)
```

**Pages & UI:**
```
src/app/(app)/documents/page.tsx
src/app/(app)/documents/[id]/page.tsx
src/app/(app)/documents/manage/page.tsx
src/app/(app)/documents/manage/new/page.tsx
src/app/(app)/documents/manage/[id]/page.tsx
src/features/documents/api.ts, format.ts
src/features/documents/components/
  ack-status-badge.tsx  acknowledgement-panel.tsx  compliance-progress.tsx  dashboard-widgets.tsx
  document-viewer.tsx   file-preview.tsx           file-type-icon.tsx       filters.tsx  my-documents.tsx
  manage/ ack-settings-fields.tsx  acknowledgements-tab.tsx  audience-builder.tsx  category-combobox.tsx
          document-fields.tsx      document-library.tsx      document-manage.tsx   form-section.tsx
          history-tab.tsx          new-document-form.tsx     new-version-dialog.tsx overview-tab.tsx
          versions-tab.tsx
```

**Infrastructure (port only what the target lacks):** `src/server/http/*`, `src/server/config/env.ts`,
`src/server/db/client.ts`, `src/server/storage/*`, `src/server/modules/uploads/*`,
`src/app/api/uploads/**`, `src/lib/validation/{common,uploads,settings}.ts`,
`src/server/audit/*` (+ `signing.test.ts`), `src/server/modules/{notifications,settings,sync}/*`,
`src/app/api/{sync,lookups,notifications,me,cron/reminders}/**`, `src/app/api/admin/settings/route.ts`,
`src/lib/{api-client,upload-client,permissions}.ts`, `src/lib/offline/*`, `public/sw.js`,
`src/components/{pwa,providers}/*`, `src/app/manifest.ts`, `src/app/offline/page.tsx`,
`next.config.ts` headers, `vercel.json`, `prisma.config.ts`, `.env.example` entries,
`vitest.config.ts` (alias `server-only` → `test/stubs/server-only.ts`).

**Seed:** `prisma/seed/documents.ts` (`seedDocuments(prisma, base)`) – sample categories, documents,
versions, audiences and signed acknowledgements; adapt to the target's seed structure. Seeded files
must exist in the configured storage (see how the source seed writes them).

**Do not port** the incidents module, incident-specific sync handlers/operation types, or
`runActionReminders` – remove those references from the registry, operation enum, SW
`isFileDownload` pattern, cron route and dashboard.

---

## 12. Implementation plan (suggested order)

1. Discovery (§10); write down reuse-vs-port decisions; ask the user about any blocking mismatch.
2. Dependencies & env (`.env.example`, env schema).
3. Prisma: add enums/models/relations, migrate, add the immutable-trigger SQL migration, add
   notification types and settings defaults; regenerate client.
4. Cross-cutting server infra not already present: errors + `apiHandler`, db client, storage + uploads,
   audit + signing, notifications, settings, permissions, current user & page guard.
5. Documents server module + validation + API routes; run the ported unit tests
   (`acknowledgement-rules`, `document-access.policy`, `csv`, `signing`).
6. Shared UI building blocks + shadcn components; theme tokens mapped to the target palette (§9).
7. Feature UI (`features/documents`), pages, nav entries, dashboard widgets.
8. Offline: query persistence, outbox, sync route/registry/handler, sync button, service worker,
   manifest, offline page, sign-out cleanup.
9. Cron route + `vercel.json` (or merge into existing).
10. Seed data; typecheck, lint, tests, then manual verification (§13).

---

## 13. Acceptance checklist

- [ ] Manager uploads a PDF → draft; publish → audience notified ("N people notified" toast).
- [ ] Duplicate active title / reference code → 409 with friendly message.
- [ ] Audience estimate updates live; "All employees" disables other pickers.
- [ ] Employee outside the audience gets 404 on `/documents/:id` and on the file URL.
- [ ] Employee cannot tick the statement until the file was opened; server rejects acknowledging an
      unopened version ("Please open and read the document before acknowledging it.").
- [ ] Acknowledge → receipt card; double submit returns the same record; DB refuses UPDATE/DELETE on
      `document_acknowledgements` and `audit_logs`.
- [ ] New version with re-ack → previous acks stop counting, users notified, viewer says
      "Version N has changed – please read it again."; without re-ack → acks keep counting.
- [ ] Turning ack on for a published doc sets `ackEnabledAt`; nobody becomes overdue immediately.
- [ ] Compliance numbers match report tabs; CSV exports download, open in Excel (BOM), formula
      cells prefixed with `'`, export is audited.
- [ ] History shows readable diffs; "Employee activity" switch reveals opens/acks.
- [ ] Archive hides from My Documents; restore returns it to Published (or Draft if never published).
- [ ] Offline: My Documents + viewer + previously opened file load with network off (production build
      or `NEXT_PUBLIC_ENABLE_SW=true`); acknowledging offline shows "pending sync"; Sync replays it
      with source `OFFLINE_SYNC` and the offline timestamp.
- [ ] Storage: works with `STORAGE_DRIVER=local`; Vercel Blob and S3 modes return the right upload
      instruction; switching driver keeps old files readable.
- [ ] `GET /api/cron/reminders` without the bearer → 401; with it → JSON summary; reminders and a
      single escalation are created per the rules.
- [ ] Mobile (375px): card lists instead of tables, sticky action bars clear the bottom nav,
      no PDF iframe on phones.
- [ ] Colours come from the target palette in light and dark mode; no leftover Oleo navy hex values.
- [ ] `tsc --noEmit`, lint and vitest pass.

---

## 14. Gotchas

- `X-Frame-Options: SAMEORIGIN` (not `DENY`) – the PDF preview iframe is same-origin.
- Don't add a sandbox CSP to inline PDF responses – Chrome's PDF viewer refuses to render.
- `useIsDesktop` in `file-preview.tsx` deliberately returns `false` during SSR/hydration so phones
  never fetch the file just by visiting (fetching = "opened").
- `AcknowledgementPanel` is keyed by current version id so its local state resets on a new version.
- The viewer refetches ~1.2 s after Open/Download so `openedCurrentVersion` updates.
- Library compliance is computed sequentially per row to keep the DB pool free; keep page size ≤ 100.
- `notifyUsers` / reminders / exports iterate users with keyset pagination – never `findMany` the whole
  directory.
- Acknowledgement signing payload must stay byte-for-byte canonical (sorted keys, ISO dates) – use
  `acknowledgementSigningPayload` + `signRecord`, including in the seed.
- `GET /api/admin/settings` is readable by every signed-in user (forms need defaults); only `PUT` is
  restricted.
- Vitest runs in Node: alias `server-only` to an empty stub.
