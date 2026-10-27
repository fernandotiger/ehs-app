# Configuration (Phase 2) – what exists

Read with `docs/PLATFORM.md` and `docs/modules/platform.md`. Spec: `../skills/ehs-functional-rebuild/references/configuration.md`.
All screens live under `/configuration` (hub cards in `src/features/configuration/hub-cards.ts`; Form Builder and
Scheduled jobs were added in Phase 3 – `forms.md`, `jobs.md`; Module settings stays "Coming soon"). Pages are `guardPage(<permission>)`; every API re-checks.

## Access rule
Configuration permissions only count when held at **Whole company** scope (`requireCompanyConfig()` in
`src/server/modules/configuration/config-access.ts`, called by every configuration service). A site-scoped
"Manage roles" grant therefore cannot hand out company-wide access (verified: 403).

## Screens → services → APIs
| Screen | Server (`src/server/modules/configuration/`) | API (`/api/configuration/…`) |
| --- | --- | --- |
| Company structure `/structure?tab=business-units\|sites\|locations\|departments` | `structure.service.ts` | `structure/counts`, `structure/:level` (GET list, POST), `structure/:level/:id` (PATCH), `…/:id/active` (PUT) |
| Users `/users` | `user-admin.service.ts` | `users` (GET, POST), `users/:id` (GET, PATCH), `users/:id/active`, `users/:id/password` (PUT) |
| Roles & permissions `/roles?view=roles\|assignments&role=&q=` | `role.service.ts` (`roleService`, `assignmentService`, `insertAssignment`), `scope-labels.ts` | `roles` (GET, POST), `roles/:id` (GET, PATCH, DELETE), `assignments` (GET, POST), `assignments/:id` (DELETE) |
| Lists & categories `/lists?list=` | existing `lookupService`; `category-list.service.ts` (DocumentCategory) | existing `lookups/*`; `document-categories` (GET, POST), `…/:id` (PATCH), `…/reorder` |
| Reference numbers `/numbering` | `settingsService.getVersioned/updateVersioned` | `settings/:key/versioned` (GET, PUT `{ value, expectedVersion }`) |
| Branding `/branding` | `branding.service.ts` (`brandingService`, `companyService`, `publicBrandingService`), `logo-image.ts` | `branding` (GET, PUT), `branding/logo` (GET any user, POST `{uploadId}`, DELETE); public `/api/public/branding/:slug[/logo]` |
| Bulk import `/import` | `bulk-import.ts` (pure) + `bulk-import.service.ts` | `import/template` (CSV), `import/review`, `import/apply` |
| Subscription `/subscription` | `subscription.service.ts` | `subscription` (GET) |
| System settings `/settings` | + `companyService` (time zone, locale on Organization) | `company` (GET, PUT) + `settings/system/versioned` |
| Home → Insights | `src/server/modules/insights/insights.service.ts`, registry `module-counts.ts` | `/api/insights` (permissions in `src/lib/insights.ts`) |

Client: hooks in `src/features/configuration/api.ts`; components in `src/features/configuration/components/*`;
zod schemas in `src/lib/validation/configuration.ts`.

## Behaviour (as built)
- **Structure**: parent required and loaded through the tenant client; ancestors derived and stored; case-insensitive
  duplicate names under the same parent (business units: company-wide) → 409. Changing a parent re-derives
  descendants + placed records via `repositionDescendants` (toast reports people updated). Deactivate/reactivate only
  (blocked while active children exist; reactivation needs an active parent). Rows show child and people counts.
- **Users**: paginated directory (search, department, role, status). Create = name, normalised email (globally unique,
  checked without revealing the tenant), job title, department (sets placement), manager (no loops), initial role +
  scope, and either a temporary password ("Can sign in") or "Directory only" (no credential account). No e-mail is
  sent – the UI says so. Edit keeps assignments. Deactivate revokes all sessions; self and the protected owner cannot be
  deactivated. "Reset password"/"Allow sign-in" sets a temporary password and signs other sessions out.
- **Roles**: empty roles only; case-insensitive duplicate → 409; matrix grouped by `PERMISSION_GROUPS` with group/total
  counts, select-all per group, dependencies via `normalisePermissions()` (server enforces too: `forms.publish` →
  `forms.design` + `forms.view`). Draft with sticky Save/Discard; switching role or creating a role while dirty asks
  Save / Discard / Keep editing. `Role.version` → 409 `STALE_VERSION` keeps the draft (download/reload offered). The
  Administrator role is read-only (always every permission). Delete only non-system roles without assignments.
- **Assignments**: person search after 2 chars, role, scope level + exact item; identical person+role+scope → 409;
  filters (person text, role, scope level), 20 per page, page reset on filter change, exact labels such as
  "Location · Warehouse (Cork Distribution)"; protected owner assignment cannot be removed. "View people" filters by role.
- **Lists**: catalogue lists grouped by `group` + "Documents → Document categories" (DocumentCategory gained notes,
  colour, sortOrder, isActive). Add, rename, reorder (up/down), colour, notes, deactivate/reactivate. Nothing is deleted.
- **Branding**: logo via two-phase upload (purpose `branding-logo`, fixed 2 MB); bytes checked server-side (PNG/JPEG
  structure, SVG without scripts/handlers/external refs); failure keeps the previous logo; replaced files are deleted.
  Logo served only through authorised routes (SVG with a locked-down CSP). Colours via picker + hex; live preview of the
  whole app through `BrandingProvider.setPreview`; saved to `Organization.branding` with `Organization.version`.
  Readable text: `--brand-foreground`/`--primary-foreground` computed from contrast (`readableTextColour`); status
  colours untouched. Tenant logo in sidebar header and mobile header; `/login?workspace=<slug>` shows name/logo/colours.
- **Bulk import**: template `type,key,name,parent_key,email,permissions,notes`; ≤2 MB, ≤500 rows, quoted cells; full
  validation (types, unique keys, parents by key incl. later rows or one unambiguous existing name/code of the right kind,
  emails, known permissions on role rows only, duplicates in file and against existing data); review table with per-line
  errors; apply re-validates and creates everything in dependency order in ONE transaction (all or nothing), audited per
  row + one `BulkImport` entry. Users → directory entries with `User.directoryRoleId` (no sign-in, no access).
  Categories/templates → `general.category` / `general.template` lookups. Tests: `bulk-import.test.ts` (C-07/C-08).
- **Subscription**: read-only plan + modules; "Manage subscription" explains billing is not connected.
  Platform scripts: `npm run tenant:create -- … --modules a,b` (existing) and new `npm run tenant:modules -- --slug x
  [--modules a,b | --enable a --disable b] [--plan p]` (`scripts/set-modules.ts`).
- **Unsaved changes**: `useUnsavedChangesGuard(dirty)` (`src/hooks/use-unsaved-changes-guard.tsx`) – beforeunload +
  in-app link interception + `confirm(action)`; used by role editor, settings, numbering, branding and all sheets.
  `StaleVersionAlert` (`src/components/common/stale-version-alert.tsx`) for 409 `STALE_VERSION`.

## Schema (migration `20261026094545_configuration`)
`Organization.version`, `Role.version`, `OrgSetting.version`, `User.directoryRoleId` (→ Role, SetNull),
`DocumentCategory.notes/color/sortOrder/isActive/updatedAt`.

## Platform changes made in this phase
- `src/server/tenancy/context.ts`: AsyncLocalStorage + fallback resolver kept on `globalThis`. In `next dev` the module
  is instantiated per route bundle while the Prisma client is a global singleton, so the client sometimes missed the
  request context, fell back to a session lookup on a second connection and deadlocked inside interactive
  transactions on `prisma dev` (all transactional endpoints, incl. Phase 1 lookups, timed out after 5 s).
- `.env.localdb`: `DATABASE_POOL_MAX=1` – `prisma dev` (PGlite) closes parallel connections ("Server has closed the
  connection"; 9 of 12 parallel requests failed with 10). Local only; production pools are unchanged.
- `StaleVersionError` (409 `STALE_VERSION`) in `src/server/http/errors.ts`; `settingsService.updateVersioned`.
- `FileDropzone` gained `accept`; `--brand-foreground`/`--brand-dark-foreground` tokens; PageBanner, sidebar,
  dashboard and login use them. `documentService.categories()` hides deactivated categories and uses `sortOrder`.
- `organizationService.shellBranding()`; `AppShell` takes `BrandingDto` (name, colours, logoUrl).

## Deviations
- Optimistic `version` only on roles, settings (system, numbering) and Organization (branding, time zone/locale).
  Structure nodes, users and list values are last-write-wins.
- Lookup values / categories are never hard-deleted (deactivate instead), including non-system values.
- Import `user` rows need a `parent_key` pointing at a role (directory role reference, as in the prototype template);
  `parent_key`/`email`/`permissions` on rows that do not use them are rejected rather than ignored.
- Insights are shown to people with users/roles/structure/audit permissions (`INSIGHTS_PERMISSIONS`).
- Module settings card uses `config.settings.manage` until the module settings screen exists.
- Branding colour saves and logo changes share `Organization.version` only for colours/name/time zone; logo upload
  does not bump the version (JSON is merged with `jsonb ||`).

## Open questions
- Should deactivating a department/location also be allowed while people are still placed there (currently yes)?
- Role deletion clears import directory references (SetNull) – acceptable, or block?
- Password reset relies on Better Auth's 5-minute cookie cache: a revoked session may survive up to 5 minutes for an
  active user (deactivated users are rejected immediately because the principal check fails).
- The local smoke run left test data in Northstar (sites "Galway Service Hub 0129", "Limerick Hub 0129", BU
  "West Region 0129", roles "Form Approver 0129"/"Site Coordinator 0129", users Jamie Lee-Smith / Pat Import 0129).
