# OleoQ EHS – Platform Contract

The rules every module follows. Read this with `docs/ARCHITECTURE.md` (layers, patterns, offline).
Functional specs live in `../skills/ehs-functional-rebuild/` (one reference + examples per module).
`../ehs-screens/` is the old prototype: reuse its **domain logic** (`app/<module>-model.ts`),
never its layout. `../_reference/docs-app-original/` is the pre-merge code (old Incident module).

## 1. Product map

| Area | Route | Who | Notes |
| --- | --- | --- | --- |
| Home | `/dashboard` | everyone | KPI cards per enabled module + quick actions |
| My work | `/my-work` | everyone | One inbox of everything assigned to me, across modules (due-work providers) |
| Documents | `/documents` | module `documents` | Existing module – the UX reference |
| Incidents | `/incidents` | module `incidents` | Report → triage → investigate → actions → effectiveness → close |
| Risk | `/risk` | module `risk` | Assessments, scoring, reviews, objectives/targets/programmes, tasks |
| Audits | `/audits` | module `audits` | Plans, programmes, audits, findings, recurrence |
| Inspections | `/inspections` | module `inspections` | Checklists, findings, repeat inspections, equipment QR |
| Law | `/law` | module `law` | Profiles, registers, evaluations, updates |
| Configuration | `/configuration` | config permissions | Structure, users, roles, Form Builder, jobs, lists, settings, branding, import |

**Delivery order (product decision):** Documents, Incident and Risk first; Audit, Inspection and Law later.
Shared services (Form Builder, jobs, follow-ups) stay generic so the later modules plug in without refactoring.

Modules are switched on per tenant (`Organization.enabledModules`, keys in `src/lib/modules.ts`).
Use `apiHandler({ module: "risk", ... })` and `guardModulePage("risk", ...)` so a disabled module 404s.

## 2. Multi-tenancy (shared database, row-level tenant id)

- `Organization` is the tenant. A user belongs to exactly one tenant (`User.organizationId`, email globally unique).
- **Every model has `organizationId String`** (no relation field, indexed) – except `Organization` and the
  Better Auth tables (`Session`, `Account`, `Verification`). Unique keys are per tenant:
  `@@unique([organizationId, name])`. Child rows get it too (defence in depth, fast indexes).
- `prisma` (from `@/server/db/client`) is **tenant-scoped**: it adds `organizationId = <tenant>` to every
  read/update/delete of a model that has the column (auto-detected) and rejects cross-tenant creates.
  No tenant context → `TenantContextError` (fail closed).
- **Creates must pass `organizationId: user.organizationId` explicitly**, including nested creates (the types require it).
- The context is set by `apiHandler` (`runWithTenant`). Server components resolve it from the session.
  Cron/scripts: `forEachTenant(fn)` (`src/server/tenancy/tenants.ts`) or `runWithTenant(orgId, fn)`.
- `systemPrisma` is unscoped – only for auth, principal loading, tenant provisioning and cron fan-out.
- Foreign ids received from the client (locationId, ownerId, formId …) must be loaded through `prisma`
  before use (a foreign-tenant id simply isn't found → `ValidationError`/`NotFoundError`).
- Storage keys start with `org/<organizationId>/…`. Files are only streamed after a tenant-scoped record lookup.
- Reference numbers come from `numberingService.next(tx, key)` (per-tenant counters, configurable format).

## 3. Company structure and placement

Business unit → Site → Location → Department. Each level stores its ancestors (denormalised).
A record that "happens somewhere" (incident, assessment, audit, inspection, task …) is **placed**:
it stores all four nullable columns `businessUnitId, siteId, locationId, departmentId` (+ `@@index` on
`[organizationId, siteId]`). Fill them with `resolvePlacement({ departmentId | locationId | siteId })`
(`src/server/modules/organisation/placement.ts`). Register placed models in
`src/server/modules/organisation/placed-models.ts` so re-parenting a structure node updates them.

## 4. Access control (roles are data, assignments are scoped)

- Permission keys: `src/lib/permissions.ts` (all modules are already declared – do not invent new keys
  without adding them there with a label). Dependencies: `normalisePermissions()`.
- `Role.permissions` holds keys. `RoleAssignment` = user + role + scope (`COMPANY | BUSINESS_UNIT | SITE | LOCATION | DEPARTMENT`).
- `CurrentUser.permissions` = held anywhere (menus, coarse gates). `CurrentUser.grants` = permission → scopes.
- Record checks (`src/server/auth/authorization.ts`):
  - lists: `scopeWhere(user, P.INCIDENT_VIEW)` → `{}` (company) | `{ OR: [...] }` | `null` (none). Combine with
    "own records" rules in the module policy, e.g. `OR: [scope, { reporterId: user.id }]`.
  - single record: `canAt(user, permission, record)` / `requireAt(...)`. Reads → 404 when not allowed.
- Policies live in `src/server/modules/<module>/<entity>-access.policy.ts` and return Prisma `where`
  fragments used for **both** lists and detail reads (Specification pattern).
- The seeded **Administrator** role has every permission at COMPANY scope; the tenant owner's assignment
  is `isProtected`. Admins can act on work owned by others **without changing the owner**.
- UI: `useCurrentUser().can(p)` hides controls; the API always re-checks.

## 5. Shared platform services (use them, don't re-implement)

| Need | Use |
| --- | --- |
| Audit history | `recordAudit({ entityType, entityId, action, actor, changes, meta }, tx)` – same transaction |
| Notifications | `notificationService.notify(...)` (type is a free string like `"incident.assigned"`, optional `dedupeKey`) |
| Evidence (files + links) | `Attachment` model, `evidenceService`, `<EvidencePanel entityType entityId />`; register an access resolver per entity type |
| Comments | `Comment` model, `<CommentsPanel entityType entityId />` |
| Cross-module follow-ups | `recordLinkService.ensure({ source, sourceKey, kind }, create)` – idempotent routing |
| Pick-lists | `src/lib/lookups.ts` catalogue + `lookupService.values(listKey)`; editable in Configuration → Lists |
| Settings | `src/lib/settings/registry.ts` (zod schema + defaults per key) + `settingsService.get(key)` |
| Reference numbers | `numberingService.next(tx, "incident")` |
| Uploads | two-phase `uploadFile()` → `uploadService.consume()` (see ARCHITECTURE.md) |
| Dynamic questionnaires | Form Builder (`src/server/modules/forms`): published versions, snapshot captured on use |
| Reminders | Scheduled jobs: modules register a `DueWorkProvider` (`src/server/modules/jobs/providers.ts`) – also feeds My work |
| Placement | `resolvePlacement()` |

## 6. Module file layout

```
prisma/schema/<module>.prisma            models (organizationId + placement columns + indexes)
src/lib/validation/<module>.ts           zod schemas shared by forms and API
src/server/modules/<module>/             *.service.ts, *-access.policy.ts, workflow.ts (pure), *.dto.ts,
                                         mappers, due-work provider, sync-handlers (if offline)
src/app/api/<module>/**/route.ts         thin: apiHandler({ module, permission, body/query }) → service
src/features/<module>/                   api.ts (query keys + hooks) + components/
src/app/(app)/<module>/**/page.tsx       thin pages: guardModulePage → feature component
prisma/seed/<module>.ts                  demo data for the Northstar tenant (idempotent)
src/server/modules/<module>/*.test.ts    vitest for pure logic (workflow, scoring, policies)
```
Registries to plug into: navigation (`src/components/layout/nav-config.ts`), Configuration hub cards,
settings registry, lookups catalogue, due-work providers, evidence resolvers, sync registry, seed.

## 7. Data conventions

- Ids `cuid()`. Dates travel as ISO strings. Money/scores as numbers, never strings.
- Soft delete: `archivedAt` (+ restore). Never hard-delete business records.
- Optimistic concurrency on editable aggregates: `version Int @default(1)`; update with
  `updateMany({ where: { id, version }, data: { ..., version: { increment: 1 } } })` → 0 rows = `ConflictError`
  ("This record was changed by someone else – reload to see their changes"). The UI keeps the draft.
- Questionnaire answers keep the form version/snapshot they were captured with.
- Status/lifecycle rules in a pure `workflow.ts` (state machine + guards) with unit tests.

## 8. UX rules (the Documents module is the reference look)

The audience is people with little EHS-software experience. Keep every screen obvious.
- **Module landing (Overview)**: `PageBanner` (title, one-line purpose, ≤2 primary buttons) + `StatCard` row +
  "Needs attention" list + recent items. No dense dashboards.
- **Register (list)**: header, search + ≤4 filter selects (more under "More filters"), table on desktop / cards on
  mobile, server pagination, status badges, row click opens detail. Friendly empty state with the next step.
- **Detail**: `PageHeader` with back link, reference + status badge, ONE primary action for the next lifecycle step
  (from the workflow), secondary actions in a "More" menu, a lifecycle stepper, then `Tabs`
  (Overview first, History last). Blocked transitions explain what is missing.
- **Create**: short forms in a `Sheet`/`Dialog`; longer flows as a 2-4 step wizard (like Report incident).
  Ask only what is needed now; advanced fields collapsed. Required fields marked; inline validation.
- Plain words ("Actions to do", not "CAPA backlog"); never show raw ids; dates as "12 Mar 2026".
- Saving feedback via toasts; failed saves keep the user's input and offer retry. Warn on unsaved changes.
- Sidebar: one collapsible section per enabled module with ≤6 items; Configuration is a hub page with cards.
  Module setup (types, matrices, settings) lives under **Configuration**, not in the module menus.
- Mobile: bottom nav (Home, My work, Report, Menu). Every page works at 375 px.
- Colours come from CSS variables (`--brand*`, set from tenant branding). Status colours keep their meaning.

## 9. Infrastructure

Unchanged from ARCHITECTURE.md: `DATABASE_DRIVER=neon|pg`, `STORAGE_DRIVER=local|vercel-blob|s3`.
Local development uses `npx prisma dev -n oleoq -d` and `bash scripts/localdb.sh <command>` (never the
`.env` database). AWS: RDS/Aurora PostgreSQL (`pg`) + S3 + any Node host (ECS/App Runner/EC2); cron
endpoints are plain HTTP GETs with `CRON_SECRET` (EventBridge Scheduler on AWS, Vercel Cron on Vercel).

## 10. Working rules for contributors and agents (token budget)

- Load only: this file, ARCHITECTURE.md, your module's spec + examples, the matching `ehs-screens/app/<module>-model.ts`.
  Skim `<module>-pages.tsx` with grep for behaviours; don't read other modules.
- Copy patterns from the Documents module rather than inventing new ones.
- Migrations: `bash scripts/localdb.sh npx prisma migrate dev --name <module>`; then `npx prisma generate`.
- Quality gate before finishing: `npx tsc --noEmit`, `npx vitest run`, `npx eslint <your paths>`.
- Update `docs/modules/<module>.md` (what was built, deviations from the spec, open questions).
