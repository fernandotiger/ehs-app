You are implementing Phase 9 ("Favourites") of OleoQ, a multi-tenant EHS SaaS. Work ONLY inside `C:\Users\User\Documents\claude_code\code\mvp1\docs-app` (Next.js 16, React 19, Prisma 7 multi-file schema, TanStack Query, shadcn/ui, Tailwind 4). Bash tool = Git Bash. Do not commit or push. Never use the database in `.env` (Neon); run DB/dev-server commands via `bash scripts/localdb.sh <cmd>` (local `prisma dev` on :51221, shadow :51222; start with `npx prisma dev -n oleoq -d` if down). Never run `prisma migrate reset`. The repo mixes CRLF and LF files – preserve each file's line endings. Next 16 differs from your training data: read the relevant guide in `node_modules/next/dist/docs/` before using an unfamiliar API.

Owner's words (29 Oct 2026): "This would be a new left side bar Menu under 'My Work' called Favourites. The idea is any user should be able to add any page of the application and its status as a bookmark like the browsers do. When a page is a search like /incidents/register where it shows the incident table list with filters, once the user does a search with certain filters and this is added to favourites, he can open the favourites page, click on its button and then the system brings him to the same page with the same filters and automatically executes the search. Also if the bookmarked page was in a specific tab when it was bookmarked, the page appears on that tab – so exactly the same page, tab, fields with the information entered by the user. The restriction: if the user does not have access/permission anymore to that specific page then the system should block that; if the user tries to bookmark a page that needs a previous step to show up, the system should not allow it and show an info message about that; if a page somehow was bookmarked and it needs a previous step to be accessible, the system should block and inform the user. Also the user should be able to add external links in the favourites. The bookmark buttons in the favourites page should be beautiful, UX friendly, default icons, and the user should be able to choose an icon from the system library."
Amendment on approving the plan: "Configuration pages should not be included, only search pages and creation pages. The user should be allowed to choose the colour and the title of the favourites buttons."
Second amendment: "don't do it for law module, but keep for Simplified law".

## Read first (only these)
`docs/HANDOFF.md`, `docs/PLATFORM.md`, `docs/ARCHITECTURE.md`, `docs/modules/platform.md`, this brief, then only the files
your phase touches. Patterns: Documents look (PLATFORM.md §8), `src/features/actions/api.ts` (query keys + hooks),
`src/app/api/notifications/**` (per-user resource), Configuration → Lists (up/down reorder).

## Scope
Only **search pages** and **create pages** can be favourites; **no Configuration pages** and **no Law module pages**
(Simplified law stays).
- **Search pages (14):** `/documents`, `/documents/manage`, `/documents/surveys`, `/documents/surveys/library`, `/incidents/register`,
  `/incidents/actions`, `/incidents/reports`, `/actions`, `/risk/assessments`, `/risk/tasks`, `/risk/strategy`, `/risk/reports`,
  `/simplified-law/legislation`, `/simplified-law/actions`. Reports pages count as search pages because they have filters
  and a Find/Trends search.
- **Create pages (5):** `/incidents/new`, `/actions/new`, `/risk/assessments/new`, `/documents/manage/new`, `/documents/surveys/new`.
- **Not offered (star hidden):**
  - Home, My work, module overviews, every record/detail page and every edit page.
  - Print, scan and the redirect routes.
  - Everything under `/configuration/**` and `/simplified-law/configuration/**`.
  - Every Law module page (`/law/**`).
  - `/favourites` itself.

Audit facts:
- **No shared URL-state helper exists.** About 27 components call `router.replace` with a hard-coded query, and some of
  those calls drop other params.
- **Most search pages read deep-link params once at mount and never write filter changes back.** Examples: incident
  register, incident actions, My Actions, risk assessments and tasks, law requirements.
- **The documents search pages keep all filters in `useState`.** They have no `useSearchParams` and no `<Suspense>`.
- **Create forms are hand-written `useState` objects.** The two document forms use react-hook-form.
- **One-time params:**
  - `/documents/manage/new?uploadId&title&description` comes from Risk "Save as document". That upload expires after 24 h.
  - `?open=` on Simplified-law actions and `?new=1` on law profiles open a sheet.
- **Next 16 navigation:** native `window.history.replaceState` syncs with `useSearchParams` with no server round trip.
  `router.replace` re-renders the dynamic page on the server and re-runs the guard.

## 1. UX
**Menu:**
- `TOP_ITEMS` in `src/components/layout/nav-config.ts` gets `{ title: "Favourites", href: "/favourites", icon: Star }` right after
  *My work*. No permission and no module: it is a platform feature. Update `nav-config.test.ts`.
- The phone bottom nav is unchanged. Favourites appears in the Menu sheet under My work automatically.

**Adding: a ☆ star in the top bar.** It goes in `src/components/layout/app-header.tsx`, left of Sync, with tooltip and
aria-label "Add to favourites".
- **Where it shows:** only on search and create pages, phones included.
- **Filled ★:** when the current page (same cleaned URL) is already a favourite. Render the filled state only after mount
  (hydration). Clicking it then opens the edit dialog.
- **Page needs an earlier step:** an **info dialog** opens and nothing is saved, e.g. "This page was filled in by *Save as
  document* on a risk assessment. That file is only kept for 24 hours, so this page can't be a favourite." Offer
  **[Add the empty Upload document page instead]** (registry `plainAlternative`).
- **Otherwise the *Add to favourites* dialog opens:**
  - **Title:** prefilled with the registry title + selected tab label, e.g. "Incidents register – Investigations".
    Required, 1–60 chars.
  - **Icon:** the default, plus a **Change icon** picker.
  - **Colour:** round swatches Default (brand) · Blue · Teal · Green · Amber · Orange · Red · Pink · Purple · Grey, with
    plain-word aria-labels and a check mark on the selected one.
  - **Live preview tile.**
  - **One plain line on what is kept,** e.g. "This page · Investigations tab · search 'forklift' + 3 filters". On create
    pages: "What you typed (files are not kept) · only you can see it".
- **Saving:**
  - Toast "Added to Favourites"; the star turns filled.
  - Saving is refused offline (toast).
  - `POST /api/favourites` re-checks the registry and access, and refuses with a plain `BusinessRuleError`.

**Favourites page** (`src/app/(app)/favourites/page.tsx`, `guardPage()`):
- **Banner:** `PageBanner` "Favourites" – "Your shortcuts – open one to land exactly where you left it." One button:
  **Add website link**.
- **Grid:** 1 column at 375 px, 2 on tablet, 3–4 on desktop.
- **Tile:** a rounded card; the whole tile is the link.
  - A large icon in a circle tinted with the chosen colour, plus a thin accent bar.
  - The title, up to two lines.
  - A muted subtitle: "Incidents · Incidents register", or "Website · hsa.ie ↗".
  - Chips: "Investigations tab", "4 filters" (non-default params, excluding page), "Your typed details".
  - Hover lift and focus ring.
- **Tile menu "⋯":**
  - Edit title, icon & colour (same dialog).
  - Move earlier / Move later (keyboard friendly, like Lists).
  - Remove (`ConfirmDialog`).
  - The star's edit dialog also offers **Update to this page now**.
- **Blocked tiles** are greyed (opacity, grey icon). The badge explains itself on click:
  - 🔒 **No access** – "You can no longer open this page. Your role or your company's modules changed. Ask your
    administrator if you need it again." Buttons: [Remove from favourites] [Close].
  - ↪ **Needs an earlier step** (a saved URL whose rules changed in an update) – an explanation plus [Go to <start page>]
    (registry `startHref`) and [Remove].
  - **Page no longer exists** (route removed or no longer offered) – [Remove].
- **Empty state** (`EmptyState`, star icon): "No favourites yet. Open a search page (like the Incidents register) or a
  create page (like Report incident) and tap the ☆ star at the top – we keep your filters, tab and what you typed. You
  can also add a link to a website." Button: [Add website link].
- **Icon picker:**
  - `src/lib/favourites/icon-names.ts` holds `ICON_NAMES`, shared so the server can validate.
  - A client-only `icon-map.tsx` holds a curated **static** map of about 140 lucide icons, each with a plain label and
    search words. Do not use `lucide-react/dynamic`.
  - Groups: Safety (ShieldAlert, HardHat, Flame, FireExtinguisher, Siren…), Health, Environment, Documents, People,
    Places (Factory, Warehouse, Ship, Anchor, Truck…), Work & dates, Charts, Links (Globe, Link, Bookmark, Star), General.
  - A popover with a search box ("fire", "boat") and a grouped grid of 40 px buttons, plus "Use default".
  - Load the dialogs lazily. An unknown name falls back to the default.
- **Colours:** `src/lib/favourites/colours.ts` holds `TILE_COLOURS`, a list of names mapped to Tailwind classes for the
  icon circle, accent and tint, with dark-mode variants. "Default" uses the tenant's `--brand` variables. Status colours
  keep their meaning elsewhere.
- **Default icons:** search and create pages reuse their nav icon (registry); external links use `Globe`.
- **Wording:** plain words, no IT terms (PLATFORM.md §8).

## 2. State capture and restore
**A. Search pages – the URL holds the state** (filters, search text, sort, page, tabs). The saved URL *is* the restore:
the React Query key comes from the URL, so opening it runs the search. New `src/hooks/use-url-state.ts`:
```ts
useUrlState<S extends z.ZodObject>(schema: S, o?: { resetKeys?: string[] /* default ["page"] */ }): [z.output<S>, (patch: Partial<z.input<S>>) => void]
useUrlSearchText(key = "q", delay = 300): [string, (v: string) => void]
useUrlTab<T extends string>(key: string, fallback: T, allowed?: readonly T[]): { value: T; onValueChange(v: string): void }
parseUrlState(schema, sp) / buildUrlSearch(schema, sp, patch)   // pure, unit-tested
```
Rules:
- **Parse every render; never copy into `useState`.** Same-path links don't remount pages in Next 16.
- **Validate key by key with the module's existing zod list schema** (e.g. `incidentListQuerySchema`,
  `actionListQuerySchema`, omitting `pageSize`). An invalid or old value falls back to its default, so it never causes a
  400.
- **Permission-dependent fallbacks** (e.g. `view=all` without `ACTION_VIEW`) are applied after parsing and never written
  back.
- **Writes:**
  - Build from `window.location.search` at write time, so two writes in one tick don't clobber each other.
  - Call `history.replaceState(history.state, "", url)`. Keeping Next's state keeps Back working.
  - Skip the write when the URL is unchanged.
  - Mount-time writes (stripping `fav` or one-time params, the law profile) wait for `setTimeout(0)`.
- **Defaults are left out of the URL.** Filters whose default isn't empty (My Actions `status: ACTIVE`, incident register
  `archived: active`) get an explicit `all` value.
- **Changing a filter resets `page`.** Unknown params are preserved.
- **Search boxes** keep local text and write it after 300 ms. Copy the URL value back only when it changed from outside.
  Drop `useDeferredValue`; `keepPreviousData` still works.
- **"Press Find" screens** (incident Trends, report filters) keep half-entered criteria local. **Find** writes them to
  the URL, so an opened favourite runs at once.
- **`useUrlTab`** falls back to the first allowed tab when a saved tab is no longer visible. `allowed` is optional.
- **One-time params** are stripped by their own pages after use: `open`, `uploadId`/`title`/`description`.
- **Existing deep links keep working:** `register?status=ACTIVE_WORK`,
  `register?view=investigations&investigationStatus=OVERDUE`, `actions?state=ACTIVE`, `actions?state=AWAITING_EFFECTIVENESS`,
  `/actions?view=assigned&overdue=true`, `/actions?view=created`, `?band=ATTENTION`, `?review=due`, `?overdue=true`,
  `?category=`.
- The Law module's pages are not converted.

Search pages that change (under `src/features/`; use these URL key names – the registry's `tab.key` relies on them):
| Module | Component | URL keys |
| --- | --- | --- |
| Incidents | `incidents/components/register/incident-register.tsx` | view, q, status, investigationStatus, mine, typeId, subtypeId, severity, siteId, departmentId, from, to, archived, sort, dir, page |
| | `incidents/components/actions/action-register.tsx` | view, q, state, mine, overdue, kind, siteId, done, sort, dir, page |
| | `incidents/components/reports/reports-page.tsx` | tab, from, to, siteId + Trends criteria on Find |
| Documents | `documents/components/my-documents.tsx` | filter, q, categoryId, tagId, page |
| | `documents/components/manage/document-library.tsx` | q, categoryId, tagId, status, page |
| | `documents/components/survey/my-surveys.tsx` | filter, q, page |
| | `documents/components/survey/survey-library.tsx` | q, status, createdBy, page |
| | + `<Suspense>` in those four `page.tsx` files | |
| Actions | `actions/components/my-actions.tsx` | view, q, overdue, status, priority, page |
| Risk | `risk/components/assessments/assessment-register.tsx` | q, status, band, review, mine, departmentId, ownerId, sort, dir, page |
| | `risk/components/tasks/task-register.tsx` | q, status, overdue, mine, ownerId, topLevel, sort, dir, page |
| | `risk/components/strategy/strategy-page.tsx` | tab, q, status, siteId, page |
| | `risk/components/reports/risk-reports.tsx` | report, from, to, siteId |
| Simplified law | `simplified-law/components/legislation-list.tsx` | category, q, check, jurisdiction, status, hideRepealed, page |
| | `simplified-law/components/actions-page.tsx` | view, overdue, status, q, page (strip `open` after use) |
If an existing param name differs from the table (check the component and its API's query schema), keep the existing name and
note it in the module doc.

**B. Create pages – typed values as a starting "seed".**
- **Capture:**
  - The form calls `useFavouriteCapture(key, () => pick(values))`. This registers it in a module-level store read with
    `useSyncExternalStore` (no provider).
  - Each form's `pick` names the fields it keeps.
  - `sanitiseSnapshot()` is the backstop: it drops File/Blob/function values and forbidden keys (`password`, `uploadId`,
    `uploadIds`, `clientId`, `requestKey`, `token`, `anonymous`) and caps the size at **16 KB** of JSON.
- **Restore:**
  1. A favourite with typed values opens as `path?fav=<id>`.
  2. `useFavouriteSeed(key)` fetches `GET /api/favourites/:id` with `meta: { persist: false }` and `gcTime: 0`, showing
     loading meanwhile.
  3. It renders `<Form key={favId} seed={…} />`, which merges the seed inside its `useState(() => initial…)` through a
     per-form `merge(fresh, saved)`.
  4. `fav` is stripped from the URL.

  Result: the form is **not dirty** (no false unsaved-changes warning), nothing races the user's typing, `clientId` stays
  fresh, and the offline outbox is untouched. If the fetch fails or the user is offline, the form opens empty and a toast
  explains.
- **Merge re-checks references:**
  - `typeId` must still exist; otherwise drop the type, subtype and answers.
  - `formVersionId` must still be published.
  - Answers are filtered to the current form's fields.
  - Answers holding `{uploadId}` are dropped.
- **Steps:**
  - The report wizard opens on **What** if the type is still valid, else on the type step.
  - The risk wizard opens on step 0.
  - Never land on the review step.
- **Banner:** "Filled in from your favourite – a starting point, not a draft. Nothing is sent until you press Submit. Files
  are not kept."
- **Never kept:**
  - files and uploads;
  - `clientId` and request keys;
  - signatures;
  - one-time params;
  - "now"-based dates (`occurredAt`, investigation target, review and due dates);
  - `anonymous: true`.
- **Anonymous reports:** when "report anonymously" is on, capture is switched off, because keeping the text under the
  user's account would link them to an anonymous report. The page is then saved empty, with a note in the dialog.

| Create page | Component | Keeps |
| --- | --- | --- |
| `/incidents/new` | `incidents/components/report/report-wizard.tsx` | type + What/Where text fields |
| `/actions/new` | `actions/components/action-form.tsx` | fields + text/choice answers |
| `/risk/assessments/new` | `risk/components/assessments/assessment-wizard.tsx` | scope + hazards |
| `/documents/manage/new` | `documents/components/manage/new-document-form.tsx` | metadata (react-hook-form), no files |
| `/documents/surveys/new` | `documents/components/survey/new-survey-form.tsx` | settings + questions draft |

## 3. Route registry and rules
**Registry:** `src/lib/favourites/route-registry.ts` is pure and shared by client and server, with **one entry for every
route** under `src/app/(app)`:
```ts
{ pattern: "/incidents/register", title: "Incidents register", icon: "TriangleAlert", module: "incidents",
  permissions?: [...],                         // any-of, mirrors the page guard (guardModulePage args)
  kind: "search" | "create" | "other",         // only search/create are offered; Configuration and Law are always "other"
  tab?: { key: "view", labels: { incidents: "Incidents", investigations: "Investigations" } }, // default title + chip
  oneTimeParams?: ["uploadId", "title", "description"],
  previousStep?: { reason: string; startHref?: string; plainAlternative?: string },          // applies when a one-time param is present
  seed?: "incident.report" }
```
**Pure rules** (`src/lib/favourites/rules.ts`):
- `matchRoute(pathname)` – static segments beat `[id]`.
- `cleanPagePath(url)`:
  - relative `/…` only, no `//`;
  - strips the global keys `fav`, `uploadId`, `token`, `password`, `next`, `open`, `new`, plus the route's
    `oneTimeParams`;
  - sorts the keys;
  - ≤ 2 000 chars.
- `bookmarkability(entry, url)` → `ok | needs-previous-step | not-offered`.
- `routeAccess(entry, user)` – module enabled + any of the permissions.
- `favouriteStatus(entry, user, url)` → `ok | no-access | needs-previous-step | gone`.
- `sameFavourite(a, b)`.

**Where the rules run:**
- On add: in the browser (star visibility and the info dialog), then again on `POST`.
- On list: `GET /api/favourites` adds `status` + `reason` per item. The check is pure, with no record checks.
- On open: blocked tiles open their info dialog instead of navigating, and the list refetches on mount.
- Page guards stay the real gate.

**Tests:**
- every `src/app/(app)/**/page.tsx` has exactly one entry (fs glob);
- no search/create pattern contains `[id]`;
- no `/configuration`, `/simplified-law/configuration` or `/law` entry is search/create;
- every nav-config href is registered with a compatible module and permissions.

## 4. External links
- **Dialog "Add website link":** address, title (prefilled from the host name), icon (default `Globe`), colour. No favicon
  is fetched.
- **Validation** (shared zod):
  - `new URL()` must parse;
  - `http:`/`https:` only – rejects `javascript:`, `data:`, `vbscript:`, `file:`, relative and `//host`;
  - no embedded credentials, no control characters or whitespace;
  - ≤ 2 000 chars;
  - "www.hsa.ie" gets `https://` added, shown in the hint before saving.
- **Rendering:** `<a target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">` with ↗ and screen-reader
  text "opens in a new tab".

## 5. Data and API
**Prisma model:** `prisma/schema/favourites.prisma`, plus `favourites Favourite[]` on `User` (`platform.prisma`):
```prisma
enum FavouriteKind { PAGE EXTERNAL }
model Favourite {
  id             String        @id @default(cuid())
  organizationId String
  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind           FavouriteKind
  title          String        @db.VarChar(60)
  icon           String?       @db.VarChar(40)   // ICON_NAMES entry; null = registry default
  color          String?       @db.VarChar(20)   // TILE_COLOURS name; null = default (brand)
  url            String        @db.VarChar(2000) // "/incidents/register?status=OPEN&view=investigations" or https://…
  snapshot       Json?                           // typed values of create pages, ≤ 16 KB, sanitised, owner-only
  sortOrder      Int
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  @@index([organizationId, userId, sortOrder])
  @@map("favourites")
}
```
- **Storage choices:** the tab lives in the query string, and the route and seed key are derived from the registry.
- **Migration:** `bash scripts/localdb.sh npx prisma migrate dev --name favourites`, additive, local DB only. Then
  `npx prisma generate`.
- **Limits:** 50 per user ("You can keep up to 50 favourites – remove one first"); title 60, snapshot 16 KB, url 2 000.
- **Validation** (`src/lib/validation/favourites.ts`):
  - `createFavouriteSchema` – discriminated union: page (url, title, icon?, color?, snapshot?) | external (url, title,
    icon?, color?);
  - `updateFavouriteSchema` – title, icon, color; url for external; or `replaceUrl` + snapshot for "Update to this page
    now";
  - `moveFavouriteSchema` – `direction: "up" | "down"`.
- **Service** (`src/server/modules/favourites/favourite.service.ts`: list, get, create, update, remove, move):
  - every query uses `where: { id, userId: user.id }`; another user's favourite → `NotFoundError`;
  - tenant scoping is automatic; creates pass `organizationId: user.organizationId`;
  - the snapshot is accepted only for routes with a `seed` key.
- **Routes:** thin `apiHandler({ body })`, any signed-in user, no permission or module:
  - `src/app/api/favourites/route.ts` – GET (with status; the list returns `hasSnapshot`, never the snapshot) and POST;
  - `src/app/api/favourites/[id]/route.ts` – GET (with snapshot), PATCH, DELETE;
  - `src/app/api/favourites/[id]/move/route.ts` – POST.
- **Client:** `src/features/favourites/`:
  - `api.ts` – `favouriteKeys`, `useFavourites`, `useCreateFavourite`, `useUpdateFavourite`, `useDeleteFavourite`,
    `useMoveFavourite`, `useFavouriteSeed`;
  - components – `favourites-page`, `favourite-tile`, `favourite-dialog`, `external-link-dialog`, `icon-picker`,
    `colour-picker`, `favourite-star-button`, `blocked-favourite-dialog`;
  - `use-favourite-capture.ts`.
- **Deviations** (document them in `docs/modules/favourites.md`):
  - **No audit records** – favourites are personal settings, like notification read-marks, and an audit entry would show
    typed text to admins.
  - **Hard delete** – a favourite isn't a business record.
- **Privacy:** typed values may hold personal details. They are owner-only, never in audit, lists, exports or the
  persisted cache, are deleted with the favourite or the user, and are never kept for anonymous reports. The dialog says
  "Only you can see what's kept".

## 6. Phases, tests, open questions
**Phases:**
- **A – Platform:**
  - model + migration;
  - registry (all routes, 19 offered) + rules + tests;
  - service + API;
  - Favourites page, tiles, dialogs, icon and colour pickers, external links;
  - header star;
  - sidebar item.
- **B – Search pages:** the URL-state hooks + tests, then the 14 search pages.
- **C – Create pages:** capture/seed hooks, `sanitiseSnapshot`, per-form `pick`/`merge` for the 5 forms; anonymous
  switch-off; banner.
- **D – Finish:**
  - gate;
  - smoke test;
  - `docs/modules/favourites.md`;
  - HANDOFF;
  - `git add -A`.

**Quality gate:** `npx tsc --noEmit`, `npx vitest run`, `npx eslint src prisma scripts test`,
`bash scripts/localdb.sh npx next build`.

**Vitest coverage:**
- **Registry:** coverage and scope rules, match specificity, nav consistency.
- **Rules:** `cleanPagePath`, `bookmarkability`, `routeAccess`, the `favouriteStatus` matrix, `sameFavourite`.
- **External URL validation.**
- **`parseUrlState`/`buildUrlSearch`:**
  - defaults omitted;
  - invalid → default;
  - `all` sentinel;
  - page reset;
  - unknown params kept;
  - concurrent patches.
- **`useUrlTab` fallback.**
- **`sanitiseSnapshot`:** forbidden keys, Blobs, 16 KB.
- **Per-form `pick`/`merge`:** stale type, file answers, "now" dates, anonymous.
- **Validation:** limits, colour/icon names, the union.

**Open product questions** (built with the default in brackets):
1. Hide the ☆ on pages that can't be favourites? (hide)
2. Reports pages count as search pages? (yes)
3. Create pages bring back what was typed? (yes, with the banner; files never)
4. Favourites in the phone bottom nav? (no – Menu sheet + top-bar ☆)
5. Limit per user? (50)
6. A few favourites directly in the sidebar? (no)
7. Admin "recommended favourites" or an admin switch-off? (not built)
8. Typed values on the server or this device only? (server, owner-only)
9. Keep favourites out of the audit log? (yes)
10. Remove blocked favourites automatically? (no – greyed with Remove)

**Follow-up outside this feature:** sign-out doesn't clear the persisted IndexedDB query cache (`ehs-query-cache`).
