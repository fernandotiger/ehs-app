# Favourites – what exists

## The request

Product owner's request (29 Oct 2026), in short:
- A new left side-bar menu "Favourites" under My work.
- A user can bookmark a page "like the browsers do", including its tab, its filters and what they typed.
- Opening the favourite brings back the same page and runs the search again automatically.
- Pages the user can no longer access are blocked.
- Pages that need a previous step can't be added (info message). If one was saved anyway, it is blocked with an
  explanation.
- External links can be added.
- The tiles look good, have default icons, and the icon can be picked from the system library.

**Amendments** (made when the plan was approved):
- Only **search pages and create pages** are offered, and **no Configuration pages**.
- The user chooses the **title and colour** of each tile.
- **The Law module is excluded; Simplified law stays.**

Brief: `docs/briefs/09-favourites.md` (scope, design, phases). Read with `docs/PLATFORM.md` and
`docs/modules/platform.md`.

## Scope (route registry)

`src/lib/favourites/route-registry.ts` has one entry for every page under `src/app/(app)` (73 entries, including
`/favourites`). A test globs `page.tsx` files, so a new page must be registered.

**Offered (19):**
- **14 search pages:**
  - `/documents`, `/documents/manage`, `/documents/surveys`, `/documents/surveys/library`
  - `/incidents/register`, `/incidents/actions`, `/incidents/reports`
  - `/actions`
  - `/risk/assessments`, `/risk/tasks`, `/risk/strategy`, `/risk/reports`
  - `/simplified-law/legislation`, `/simplified-law/actions`
- **5 create pages:** `/incidents/new`, `/actions/new`, `/risk/assessments/new`, `/documents/manage/new`,
  `/documents/surveys/new`.

**Not offered** (`kind: "other"`; the ☆ is hidden):
- Home, My work and the module overviews
- every detail and edit page
- print, scan and redirect routes
- all of `/configuration/**` and `/simplified-law/configuration/**`
- every `/law/**` page
- `/favourites` itself

Tests make sure no Configuration or Law route and no `[id]` route is ever offered.

**What each entry carries:**
- `pattern`, `title`, `icon` (lucide name; registers reuse their menu icon)
- `module` and `permissions` (any-of, mirroring the page guard)
- `kind`
- an optional `tab` (key + labels, for the default title and the chip)
- `oneTimeParams` and `previousStep` (reason, start page, plain alternative)
- `seed` (the create-form key)

## UX

- **Menu:** "Favourites" (Star icon) in `TOP_ITEMS`, right after My work (`nav-config.ts`). It has no permission and no
  module. On phones it shows in the Menu sheet; the bottom nav is unchanged.
- **☆ in the top bar** (`favourite-star-button.tsx` in `app-header.tsx`, inside its own `<Suspense>`):
  - It appears only on offered pages the user can open.
  - The filled ★ ("In your favourites – edit") renders after mount and opens the edit dialog.
  - Saving is refused offline with a toast.
- **Add / edit dialog:**
  - Title: prefilled with the page name and a non-default tab, e.g. "Incidents register – Investigations"; 1–60 characters.
  - Icon picker: a searchable popover of 146 curated lucide icons in groups, with "Use default".
  - Colour swatches: Default (company colour) plus Blue, Teal, Green, Amber, Orange, Red, Pink, Purple and Grey.
  - A live preview tile.
  - A "What is kept" line, e.g. "This page · Investigations tab · search "forklift" + 1 filter", or "What you typed
    (files are not kept)", followed by "Only you can see what's kept."
  - The edit dialog also offers **Update to this page now**.
- **Page that needs a previous step:** the star opens an info dialog instead of saving. Today this is only
  `/documents/manage/new?uploadId=…`, filled in by Risk "Save as document". The dialog offers "Add the empty Upload
  document page instead".
- **Favourites page** (`/favourites`): a `PageBanner` with "Add website link" and a grid of tiles (1 column at 375 px,
  2 on tablet, 3–4 on desktop).
  - Each tile has an icon circle tinted with the chosen colour, an accent bar, the title, a subtitle (module · page, or
    "Website · host ↗") and chips ("Investigations tab", "2 filters", "Your typed details").
  - The "⋯" menu has Edit title, icon & colour · Move earlier / Move later (disabled at the ends) · Remove.
  - The empty state explains the ☆.
- **Blocked tiles** are greyed. They are buttons, not links, and open an explanation:
  - "No access" offers Remove from favourites.
  - "Needs an earlier step" offers Go to the start page.
  - "Page no longer exists" offers Remove.

## Search pages – state in the URL (`src/lib/url-state.ts`, `src/hooks/use-url-state.ts`)

**Hooks:**
- `useUrlState(schema, { resetKeys })`
- `useUrlSearchText(key = "q", 300 ms)`
- `useUrlTab(key, fallback, allowed?)`

**Pure helpers** (tested): `parseUrlState`, `buildUrlSearch`, `applyUrlPatch`, `resolveUrlTab`, `syncSearchText`,
`countActiveFilters`, `URL_ALL`.

**Writing helpers:** `replaceUrlSearch`, `patchUrlParams`, `stripUrlParams`, `deferUrlPatch`.

**Rules:**
- State is parsed from the URL on every render. Each key is validated with the module's own zod list schema, and an
  invalid value falls back to its default.
- Defaults are left out of the URL. `all` / `ALL` is used where the default isn't "everything".
- Changing a filter resets `page`, and unknown params are kept.
- **Next 16.3 detail:** the history state passed to `replaceState` must not carry Next's `__NA`/`_N` markers. Otherwise
  Next treats the call as internal and doesn't update `useSearchParams`. `replaceUrlSearch` drops the markers and Next
  copies them back, so Back still works. Always write URLs through these helpers.
- **Search box:** local text, written to the URL after 300 ms. It takes outside changes (a link, Back/Forward, a
  favourite) but ignores the echo of its own write (`syncSearchText`, fixed during the smoke test).

**Converted components:**

| Area | Components | Tab key |
| --- | --- | --- |
| Incidents | incident register, incident action register, incident reports | `view`, `view`, `tab` |
| Documents | My Documents, Document Library, My Inductions, Induction Library | `filter` on the two "My" pages |
| Actions | My Actions | `view` |
| Risk | assessment register, task register, strategy, reports | `tab` on strategy, `report` on reports |
| Simplified law | legislation list, actions page | `view` on the actions page |

**Details per page:**
- **Incident reports, Trends:** the criteria are written on Preview (`useTrendPreviewQuery`), and the search runs on
  load once a type, subtype or cause is in the URL.
- **Simplified law legislation list:** `hideRepealed` is written only once the user flips it (the company setting
  decides until then).
- **Simplified law actions:** `?open=` is removed after the sheet opens.
- **Documents:** the four search `page.tsx` files got `<Suspense>`.
- **Existing values kept:** My Actions, both document libraries, risk assessments and Simplified law actions keep their
  existing uppercase `ALL` value.
- **Existing deep links still parse:** `register?status=ACTIVE_WORK`, `actions?state=ACTIVE`,
  `/actions?view=assigned&overdue=true`, `?band=ATTENTION`, `?review=due`, `?category=`, …
- The Law module's pages were deliberately left unchanged.

## Create pages – typed values as a "seed"

**Capture:**
- A form registers a capture source with `useFavouriteCapture` (a module-level store read with `useSyncExternalStore`;
  `enabled` option).
- Each form's pure `pick` names the fields it keeps (`*-seed.ts` next to each form, with tests).
- `sanitiseSnapshot` (`src/lib/favourites/snapshot.ts`) is the backstop. It drops File/Blob/function values, forbidden
  keys (password, uploadId/s, clientId, requestKey, token, anonymous, signature), `data:` strings, Maps/Sets, very deep
  nesting and non-finite numbers. It caps the snapshot at 16 KB.
- Values equal to the fresh form aren't kept, so an untouched form saves empty.

**Restore:**
1. The tile opens `path?fav=<id>`.
2. `useFavouriteSeed(key)` checks that the saved page's `seed` matches the page.
3. It fetches `GET /api/favourites/:id` (not persisted, `gcTime: 0`; the service worker never caches this URL).
4. It renders the form with `key={favId}` and merges the seed inside the form's `useState` initialiser. The form is not
   dirty, `clientId` stays fresh, and the offline outbox is untouched.
5. `fav` is removed with `deferUrlPatch`.

If the user is offline, or the favourite was deleted or belongs to another page, the form opens empty with a toast. The
banner reads: "Filled in from your favourite – a starting point, not a draft. Nothing is sent until you press <the
page's real buttons>. Files are not kept."

**What each form keeps:**

| Form | Keeps | Drops |
| --- | --- | --- |
| Report incident | type/subtype, title, severity, department, location, shift, narrative, text/choice answers | occurredAt, investigation target, people, first aid, confidential, files, anonymous |

  Report incident opens on "What & where" when the type still exists, otherwise on the type step. **While "Report
  anonymously" is on, nothing is captured**, and the dialog explains why.

| Form | Keeps | Drops |
| --- | --- | --- |
| Create Action | fields, chosen form, text/choice answers | due date, file and date answers |
| New risk assessment | scope and hazards | review date (re-suggested from today) |
| Upload document | details, audience, ack settings | files |
| Create induction | settings, questions, audience, ack | the file ("Confirm the file" is forced off) |

**Notes per form:**
- **New risk assessment:** answers and scores come back only if the same form version is still published. The edit page
  never captures.
- **Upload document:** nothing is captured when Risk's prefill is present.
- **All forms:** department, role and structure ids are re-checked against the lookups.

## Data and API

**Model and migration:**
- **Model** `Favourite` (`prisma/schema/favourites.prisma`, table `favourites`, enum `FavouriteKind PAGE | EXTERNAL`):
  - fields: `organizationId`, `userId` (cascade), `kind`, `title` (60), `icon`, `color`, `url` (2000), `snapshot` (Json),
    `sortOrder`, timestamps;
  - index `[organizationId, userId, sortOrder]`;
  - tenant-scoped automatically.
- **Migration** `20261029090441_favourites`: additive (one table and one enum, no data statements), applied to the local
  DB only. Neon gets it with the next Vercel deploy.

**Service** `src/server/modules/favourites/favourite.service.ts`:
- Every query filters on `userId: user.id`, so another user's favourite returns 404.
- Up to 50 favourites per user.
- A duplicate (same cleaned address or website) is refused.
- The server re-checks registry, access, previous-step rules and the URL.
- Typed values are refused for pages without a `seed` key.
- `favourite-status.ts` adds `status` (`ok | no-access | needs-previous-step | gone`) and `reason` to the list. The
  check is pure: registry, module and permissions only.

**Routes** (`apiHandler`, any signed-in user, no module):
- `GET/POST /api/favourites` – the list returns `hasSnapshot`, never the snapshot.
- `GET/PATCH/DELETE /api/favourites/[id]`
- `POST /api/favourites/[id]/move` with `{ direction: "up" | "down" }`

**Shared rules and validation:**
- `src/lib/favourites/rules.ts`: `matchRoute`, `cleanPagePath`, `bookmarkability`, `routeAccess`, `favouriteStatus`,
  `sameFavourite`.
- `cleanPagePath` accepts relative paths only and strips `fav`, `uploadId`, `token`, `password`, `next`, `open`, `new`
  and the route's one-time params. It sorts the keys and limits the URL to 2 000 characters.
- `src/lib/favourites/external-url.ts`: http(s) only (no `javascript:`, `data:`, `file:` or `//host`), no credentials,
  spaces or control characters, 2 000 characters at most. "www.hsa.ie" gets `https://` added. Links render with
  `target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"`.
- Validation: `src/lib/validation/favourites.ts`.

## Deviations from the platform rules

- **No audit records.** Favourites are personal settings, like notification read-marks, and an audit entry would show
  the typed text to admins.
- **Hard delete.** A favourite isn't a business record.

## Privacy

- **What a snapshot can hold:** typed text, e.g. an injured person's name in an incident narrative.
- **Who can see it:** only the owner. It goes through the owner-only API. It is never in audit logs, the list, exports,
  the persisted React Query cache or the service-worker cache.
- **When it's deleted:** with the favourite, or with the user (cascade).
- **Anonymous reports:** typed text is never captured.

## Decisions (defaults chosen – easy to change)

These are the defaults for the brief's open questions:
- the ☆ is hidden on pages that can't be favourites;
- reports pages count as search pages;
- create pages bring back typed values;
- the phone bottom nav is unchanged;
- the limit is 50 per user;
- favourites don't appear individually in the sidebar;
- there are no admin "recommended favourites" and no admin switch-off;
- typed values are stored on the server;
- favourites are not audited;
- blocked favourites are kept (greyed) until removed;
- "No access" and "record removed" share one message.

Removing a favourite from the blocked dialog has no second confirmation; the dialog itself is the confirmation. From the
tile menu, Remove asks first.

## Smoke test (29 Oct 2026, local DB, `next start` :3101)

**As admin@northstar.example:**
- **Search page, saved:** Incidents register → Investigations tab + search "forklift" + severity Minor. The URL showed
  `?view=investigations&q=forklift&severity=MINOR`. The ☆ dialog prefilled "Incidents register – Investigations", and I
  saved it as "Forklift near misses" with a teal colour and a forklift icon (found by searching "truck").
- **Search page, restored:** the sidebar link reset the register. Opening the tile restored the tab, search, severity
  and the single result, with ★ filled.
- **Back button:** Back after filtering worked. The search box missed the restored text; fixed (`syncSearchText`) and
  re-verified after the rebuild.
- **Previous step:** `/documents/manage/new?uploadId=…` showed the info dialog with the plain alternative, and nothing
  was saved.
- **No ☆:** none on an incident detail page, `/configuration/users` or `/law/requirements`. The ☆ shows on both
  Simplified law search pages.
- **Create page:** Report incident with a typed title, location and narrative, saved as "Loading bay report". Opening it
  restored all three on "What & where" with a fresh date/time and the banner. `fav` was stripped, and no
  unsaved-changes warning appeared on leaving.
- **Website links:** `javascript:alert(1)` was refused in the form and by the API (`data:` too). Law and Configuration
  pages, `//evil.example/…` and the uploadId page were refused by the API. "www.hsa.ie" became `https://www.hsa.ie/`
  (title "Health and Safety Authority") and renders as a new-tab link with `noopener noreferrer`.
- **Tile menu:** moving earlier worked, and "Move later" is disabled on the last tile.
- **375 px:** one column, no horizontal scroll.

**As john@northstar.example:**
- A favourite for `/documents/manage` was inserted in SQL to simulate lost access. It showed as a greyed "No access"
  tile with the explanation, and "Remove from favourites" removed it.
- `POST` of that page was refused ("You can't open this page, so it can't be a favourite").
- GET, PATCH and DELETE of admin's favourite returned 404.

**Testing gotcha:** while the in-app browser pane is hidden, `requestAnimationFrame` doesn't run, so React 19.2 never
reveals streamed Suspense boundaries. On slower pages (Simplified law) the header ☆ then stays in a hidden `<div>`. Call
`$RV($RB)` in the page to flush, or show the pane. This is not an app bug. Right after a rebuild the service worker can
serve the previous build's cached page while the server warms up – reload once before testing new code.

The three admin favourites made in the smoke test (Forklift near misses, Loading bay report, Health and Safety Authority)
were left in the local DB as demo data; john's test row was removed through the UI.

## Open questions

The brief's 10 questions, built with the defaults above. Also:
1. Should Law pages become favourites if the Law module is kept instead of Simplified law? Today they are excluded; one
   registry line per page would add them, plus a URL-state conversion of the Law registers.
2. Should detail pages (a single incident or risk assessment) be offered later? The owner limited the scope to search
   and create pages.
3. Should the search-page URL state (now shareable links) also get a "Copy link" button?
