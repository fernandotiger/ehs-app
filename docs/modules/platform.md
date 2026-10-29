# Platform core (Phase 1) – what exists

Read with `docs/PLATFORM.md` (contract) and `docs/ARCHITECTURE.md`. This file lists the concrete pieces so you
don't have to read their code.

## Tenancy
- `prisma` (`@/server/db/client`) is tenant-scoped; `systemPrisma` is unscoped (auth, provisioning, cron fan-out only).
  Pure rules + tests: `src/server/db/tenant-scope.ts` (`scopeArgs`). Creates must pass `organizationId` (nested too).
- Context: `apiHandler` → `runWithTenant`; server components resolve it from the session; cron → `forEachTenant(fn)`
  (`org` now includes `enabledModules`); scripts → `runWithTenant(orgId, fn)`. `requireTenantId()` inside a context.
- Storage keys: `org/<organizationId>/<folder>/…` (`UPLOAD_FOLDERS` in `src/lib/validation/uploads.ts`).
  Server-generated files: `uploadService.createFromBytes(user, { purpose, fileName, mimeType, bytes }, onUploaded?)` → an
  UPLOADED session owned by the user (consumed like a browser upload; used by Risk → Save as document (PDF));
  `GET /api/uploads/:id` = owner-only summary (name, type, size) of an unused upload.
- Provisioning (no `server-only`, takes a PrismaClient): `src/server/tenancy/provisioning.ts`
  `provisionTenant(db, { name, slug, adminEmail, adminName, password, modules?, branding?, failIfExists? })` +
  helpers `ensureDefaultRoles/Lookups/Settings`, `ensureUserWithPassword`, `ensureAssignment`. Default roles:
  `src/lib/default-roles.ts`. CLI: `npm run tenant:create -- --name … --slug … --admin-email … --admin-name … --password … [--modules a,b]`.
- Tenant record: `organizationService.branding(orgId)`; branding colours `parseBranding/brandingCss` (`src/lib/branding.ts`)
  are injected by `AppShell` as CSS vars (`--brand`, `--brand-dark`, `--brand-light`, `--brand-soft`, `--primary`).

## Shared services (server → API → client)
| Service | Server | API | Client |
| --- | --- | --- | --- |
| Settings | `settingsService.get("system")`, `.update(key, value, actor, meta)` (audited); registry `src/lib/settings/registry.ts` (`SETTINGS`, `resolveSetting`) | `GET/PUT /api/configuration/settings` (system), `GET/PUT /api/configuration/settings/[key]` (permission from registry) | `useSystemSettings()`, `useSetting(key)`, `useSaveSetting(key)` (`features/shared/settings.ts`) |
| Numbering | `await numberingService.next(tx, "incident")` → `INC-2026-0001` (raw `INSERT … ON CONFLICT` counter, per year when `includeYear`) | via `numbering` setting | – |
| Lookups | `lookupService.values/create/update/deactivate/reorder` (case-insensitive duplicate → 409); catalogue `src/lib/lookups.ts` (`general.category`, `general.template`) | `GET/POST /api/configuration/lookups/[listKey]`, `PATCH/DELETE …/[id]` (DELETE = deactivate), `POST …/reorder` | `useLookup("general.category")`, `useCreateLookupValue`, `useUpdateLookupValue`, `useReorderLookup` (`features/shared/lookups.ts`) |
| Entity registry | `src/server/modules/entities/registry.ts`: `ENTITIES = { Document, Incident, Investigation, CorrectiveAction, ActionTask }`; `canViewEntity`, `canEditEntity`, `requireEntityAccess(user, type, id, "view"\|"edit")`, `describeEntity` | – | – |
| Evidence | `evidenceService.list/add/remove/streamFile` (Attachment; upload purpose `"evidence"`, limit `system.evidenceMaxUploadMb` = 2 MB; links need description + http(s) URL; remove sets `removedAt`; audited on the owning record) | `GET/POST /api/evidence`, `DELETE /api/evidence/[id]`, `GET /api/evidence/[id]/file[?download=1]` | `<EvidencePanel entityType="Incident" entityId={id} readOnly? />` |
| Comments | `commentService.list/create` (view access on the record; `clientId` idempotent) + offline op `comment.create` | `GET/POST /api/comments` | `<CommentsPanel entityType entityId />` (queues in the outbox when offline) |
| Record links | `recordLinkService.ensure(tx, { sourceType, sourceId, sourceKey?, kind }, (tx) => createTarget(tx))` → `{ link, created }` (advisory lock + unique key); `ensureAtomic(...)` (own tx, P2002 → returns winner); `listForSource/listForTarget/linked` | `GET /api/record-links?entityType&entityId` | `<LinkedRecords entityType entityId />` |
| Notifications | `notificationService.notify({ userIds, type: "incident.assigned", title, body?, link?, entityType?, entityId?, items?, dedupeKey? })` → created count (dedupe per recipient `<key>:<userId>`) | `/api/notifications` (bell) | `NotificationBell` |
| Placement | `resolvePlacement()`; `PLACED_MODELS` + `repositionDescendants(tx, "SITE"\|"LOCATION"\|"DEPARTMENT", nodeId, newAncestors)` in `src/server/modules/organisation/placed-models.ts` | – | – |
| Users picker | `userService.search(q, { permission?, ids? })` (assignment-aware) | `GET /api/lookups/users` | `UserPicker`, `useUserSearch` |
| Structure lookups | – | `GET /api/lookups` → `businessUnits, sites(+businessUnitId), locations(+siteId,businessUnitId), departments(+locationId,…), roles` | `useLookups()`, `structureOptions(data)` (labels like "Operations · Production Floor") |

To plug a new entity type in: write `<module>/<entity>.entity.ts` implementing `EntityDescriptor`
(`module`, `label`, `href`, `canView`, `canEdit`) and add it to `ENTITIES`.

## Access & client
- `useCurrentUser()` → `{ user, can, canAny, canAt(permission, placement), hasModule(module) }`; `SessionUser` mirrors
  `CurrentUser` (organization*, enabledModules, placement, roleIds/keys/names, permissions, grants).
- Tests cover `scopeWhere/canAt/requireAt` (`src/server/auth/authorization.test.ts`) and `normalisePermissions` + default roles.

## Navigation & pages
- `src/components/layout/nav-config.ts`: `TOP_ITEMS` (Home `/dashboard`, My work `/my-work`, Favourites `/favourites` – see
  `docs/modules/favourites.md`; every new page needs an entry in `src/lib/favourites/route-registry.ts`) + `NAV_SECTIONS` (each module
  section has `module: "<key>"`, filtered by `enabledModules` and item permissions). Sidebar sections are collapsible
  (the one holding the current page opens); sidebar header shows the organisation name. Mobile bottom nav: Home, My work,
  Documents (if enabled), Menu.
- **Menu folds after picking a page** (owner's choice, 28 Oct 2026 – "shrink to icons, the same when a user clicks on
  Toggle Sidebar"): on desktop, a plain click on a sidebar link (menu item or the organisation name) that opens another
  page folds the sidebar to its icon strip with the sidebar's own `setOpen(false)` – the same state and `sidebar_state`
  cookie as Toggle Sidebar / Ctrl+B, so that button opens it again and the choice survives reloads. Not folded: clicking
  the page already shown, opening a section header, Ctrl/Cmd/Shift/middle clicks (new tab or window). Rule
  `changesPage()` in `nav-config.ts` (tested); hook `useCloseAfterNavigate()` in `app-sidebar.tsx`. The phone menu
  (below 768 px, a sheet) closes after every tap as before and does not change the desktop state.
- Configuration hub `/configuration`: cards in `src/features/configuration/hub-cards.ts` (groups Organisation / Access /
  Forms & automation / Customisation / Account). A card without `href` shows "Coming soon" – add `href` when you build it.
  Built: `/configuration/settings` (System settings), `/configuration/audit-log` (`/api/configuration/audit-log`).
- `/my-work` lists everything from the due-work providers (Phase 3, see `docs/modules/jobs.md`).
- Old `/admin/*` screens and APIs (users, roles, departments, locations) were deleted – rebuild under `/configuration`.

## Documents module changes
- Audiences: `ALL_EMPLOYEES | ROLE | BUSINESS_UNIT | SITE | LOCATION | DEPARTMENT | USER`, matched on the user's home
  placement; ROLE = holds the role in any scope (`roleAssignments`). Policy + tests: `document-access.policy(.test).ts`.
- All routes `module: "documents"`, pages `guardModulePage("documents", …)`; reminders cron runs per tenant.
- Notification types: `document.assigned | document.ack_required | document.version_issued | document.ack_reminder | document.ack_escalation`.
- Acknowledgement signatures now include `organizationId`.
- Document surveys (one optional survey per document, anonymous answers, results, due work `document.survey`): see `docs/modules/document-surveys.md`.
- Document tags (per-tenant, case-insensitive; filter + search in Document Library and My Documents): see `docs/modules/document-tags.md`.
- Document surveys are shown to people as **Employee Induction** (28 Oct 2026; routes, APIs and code keep "survey").

## Standalone Actions module (28 Oct 2026)
Module key `actions` (sidebar section "Actions" before Configuration: My Actions, Create Action), entity `Action` in the
registry, placed model `action`, due-work kind `action`, Form Builder purpose `actions / ACTION`, permissions
`action.view|create|manage`. See `docs/modules/actions.md`.

## Data, migrations, local DB
- Baseline migration `prisma/migrations/20261026092415_init` (+ immutable triggers for `audit_logs`, `document_acknowledgements`).
- `.env.localdb` now sets `SHADOW_DATABASE_URL` (the `prisma dev` shadow server, port 51222) and `prisma.config.ts` passes it as
  `shadowDatabaseUrl` – required because `prisma dev` (PGlite) has one physical database per port, so Migrate cannot create
  its own shadow DB. New module migration: `bash scripts/localdb.sh npx prisma migrate dev --name <module>`.
- Seed: `bash scripts/localdb.sh npm run db:seed` (idempotent; documents skipped when a tenant already has some).

## Demo accounts (password `Password123!`, development only)
| Tenant | Email | Roles / placement |
| --- | --- | --- |
| Northstar Manufacturing (`northstar`, all 6 modules) | `admin@northstar.example` Alex Morgan | Administrator (protected, company) |
| | `sam@northstar.example` Sam O'Brien | Manager + EHS Manager at SITE Dublin Plant; Whole Site dept |
| | `priya@northstar.example` Priya Shah | Employee + Inspector (company); Engineering |
| | `helen@northstar.example` Helen Hughes | HR Admin + Manager (company) – author of the demo documents |
| | `emma@northstar.example` Emma Walsh | EHS Manager + Manager (company) |
| | `liam@northstar.example` Liam Byrne | EHS Investigator; Warehouse (Cork) |
| | `sarah@northstar.example` Sarah O'Connor | Manager at SITE Cork Distribution; Warehouse |
| | `john@northstar.example` John Murphy | Employee; Warehouse (always outstanding on acknowledgements) |
| Oleo Demo Ltd (`oleo-demo`, documents + incidents + actions, green branding) | `admin@oleo-demo.example` Morgan Kelly | Administrator |
| | `jordan@oleo-demo.example` Jordan Lee | Employee |

Northstar structure: BU Operations → sites Dublin Plant (location Production Floor: Engineering, Operations, Port Central
Management & Admin, Whole Site) and Cork Distribution (location Warehouse: Third Parties). Plus 30 generated employees.

## Deviations / open points
- `system` setting dropped `organisationName` (the company name is `Organization.name`; edit it with Branding next phase).
- Old `/api/admin/settings` moved to `/api/configuration/settings` (same GET/PUT behaviour).
- The init migration was marked applied on the existing local DB (it already matched the schema; a reset needs the user's
  consent) and replayed cleanly on the shadow DB by `migrate dev`.
- A cross-tenant document *page* renders the not-found UI with HTTP 200 (the `(app)/loading.tsx` shell streams first);
  APIs return 404.
- Configuration screens (structure, users, roles, lists, numbering, branding, import, subscription) were built in Phase 2 – see `docs/modules/configuration.md`. Form Builder and scheduled jobs: Phase 3 (`forms.md`, `jobs.md`).
