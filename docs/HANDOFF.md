# Handoff – project status and working agreements

Read this first in a new session. Updated 29 Oct 2026.

## The project
OleoQ: multi-tenant EHS SaaS (Documents, Incidents, Risk, Audits, Inspections, Law + Configuration). Three folders under `mvp1/`
were merged into this app: `docs-app` (this repo – its Documents look and UX is the reference the product owner's boss likes),
`../ehs-screens` (old prototype: reuse its domain logic in `app/<module>-model.ts`, never its layout – rejected as too complicated)
and `../skills/ehs-functional-rebuild` (functional specs: `references/<module>.md` + `examples/<module>-examples.md`).
`../_reference/docs-app-original` holds the pre-merge code.

## Status
| Area | State | Details |
| --- | --- | --- |
| Platform (tenancy, scoped roles, placement, shared services; sidebar folds to icons after picking a page, 28 Oct) | done | `docs/modules/platform.md` |
| Configuration hub (structure, users, roles, lists, numbering, branding, import, settings, audit log) | done | `docs/modules/configuration.md` |
| Form Builder, scheduled jobs, My work | done | `docs/modules/forms.md`, `docs/modules/jobs.md` |
| Documents (+ document surveys – shown as **Employee Induction** since 28 Oct, own page; tags 28 Oct) | done | `docs/modules/platform.md`, `docs/modules/document-surveys.md`, `docs/modules/document-tags.md` |
| Incidents (+ admins add/rename incident types; Port of Cork demo types + per-type forms; type-first report wizard, 27 Oct; anonymous reporting; "Add action" wording without "preventive", 28 Oct) | done | `docs/modules/incidents.md` |
| Risk (+ hazard lists per risk type on Configuration → Risk matrix; assessment Print + Save as document (PDF → Upload document), 28 Oct) | done | `docs/modules/risk.md` |
| Actions – standalone (sidebar "Actions": My Actions, Create Action; Form Builder extra questions; My work, scheduled jobs, overdue notice; 28 Oct) | done | `docs/modules/actions.md` |
| Law (profiles, "Laws that apply to us" + Check compliance, tasks, Law library, content updates install/accept, reports; links + Non Compliance incident drafts + corrective actions with Risk/Incident back-links; 28 Oct) | done | `docs/modules/law.md` |
| Simplified law (the boss's storyboard version of Law, built next to Law so one can be kept: category → legislation → "applicable to us?" questions → requirements checklist with one action per gap and an "Actions to do" tracker; own Configuration submenu; real Irish/EU demo law; Home widget; 29 Oct) | done | `docs/modules/simplified-law.md` |
| Audits, Inspections | **not started – deferred by the product owner** | see "Next steps" |

Quality at handoff: `tsc` 0 errors, 515 vitest tests green (29 Oct, incl. `test/seed`), eslint clean, `next build` clean (no warnings).
Migrations: `init`, `configuration`, `forms_jobs`, `incidents`, `risk`, `document_surveys`, `survey_optional_file`, `document_tags`,
`anonymous_incident_reports`, `actions`, `law`, `simplified_law` (28–29 Oct, additive; local DB only – reach Neon with the next Vercel deploy). `actions` also
holds two idempotent data statements: it switches the `actions` module on for every existing tenant and appends the new
`action.*` keys to the system roles (by role key) – so a deploy turns the Actions section on for the Neon tenants too.
`law` has no data statements (the `law` module key and `law.*` role keys existed from the start; Northstar already has it on).
After the deploy the Neon tenants have an empty Law module until the library is installed: run `db:seed:law` there (owner's
consent) or install a content package in Configuration → Law content & settings.
`simplified_law` adds six `slaw_*` tables and, like `actions`, idempotent data statements: it switches the `simplified-law` module
on for every tenant and appends `slaw.view` (administrator, manager, ehs-manager) and `slaw.assess` + `slaw.manage` (administrator,
ehs-manager) to the system roles. After the deploy the Neon tenants see an empty register (categories and laws can be added in
Simplified law → Configuration) until `db:seed:simplified-law` is run there with the owner's consent.
New dependency: `pdf-lib` 1.17.1 (Risk → Save as document).
**Git:** first commit 27 Oct 2026 on `master`, pushed to `https://github.com/fernandotiger/ehs-app` (owner's personal repo).
Ask before committing or pushing. `Port of Cork Incident Module Templates 19022021.xlsx` (client file) stays local – it is
in `.gitignore`; its content is transcribed in `prisma/seed/incident-types.ts`.
**Vercel:** the owner deploys from that repo to Vercel with the **same Neon database** as `.env`. `vercel-build` runs
`prisma migrate deploy`, so a deploy applies pending migrations to Neon. Keep `BETTER_AUTH_SECRET` / `AUDIT_SIGNING_SECRET`
identical to `.env` there, or existing audit/acknowledgement signatures stop verifying.

## Databases and running it
- `.env` → the product owner's **Neon** test database `mvp1` (`DATABASE_DRIVER=neon`). Migrated through `document_surveys` (**`survey_optional_file`, `document_tags`, `anonymous_incident_reports`, `actions`, `law` and `simplified_law` not applied yet** – the next Vercel deploy applies them; ask the owner before applying by hand) and seeded
  on 27 Oct 2026. `npm run dev` uses it (http://localhost:3000; `BETTER_AUTH_URL` must match the port).
- `.env.localdb` → local `prisma dev` server `oleoq` (database `template1` on :51221, shadow :51222). Start with
  `npx prisma dev -n oleoq -d`; prefix commands with `bash scripts/localdb.sh` (Git Bash). Keep `DATABASE_POOL_MAX=1`.
  Other port: `BETTER_AUTH_URL=http://localhost:3100 bash scripts/localdb.sh npx next dev -p 3100`.
- Demo accounts (password `Password123!`): `docs/modules/platform.md` (admin/helen/emma/sam/liam/john @northstar.example,
  admin@oleo-demo.example). Northstar has all modules; Oleo Demo has documents + incidents + actions.
- Storage is `local` in both env files: demo document files live in `./storage` on this PC. For Vercel set
  `STORAGE_DRIVER=vercel-blob` + `BLOB_READ_WRITE_TOKEN` first (then the demo documents need re-seeding there). AWS: README.

## Working agreements (product owner's preferences)
- **Ask before** touching the Neon database, committing, pushing or anything destructive. Never `prisma migrate reset` without
  explicit consent (Prisma also blocks agents unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` carries the user's words).
- Development and tests run against the local database only.
- UX for people with no EHS-software or IT background: Documents look, plain words, one obvious primary action (PLATFORM.md §8).
- Decide sensible defaults yourself, then document the decision and list real product questions for the owner.
- Token budget: the coordinating session keeps context small – each sizeable feature/module is built by ONE focused background
  agent from a brief (examples in `docs/briefs/`), which reads only PLATFORM.md, ARCHITECTURE.md, the relevant `docs/modules/*.md`
  and its spec. The coordinator then verifies itself: `npx tsc --noEmit`, `npx vitest run`, `npx eslint src prisma scripts`,
  `bash scripts/localdb.sh npx next build`, migration present, module doc written; smoke-tests risky paths; stages with `git add -A`.
  If an agent stops on a rate limit, resume it with a message (it re-checks state first) instead of starting over.

## Open product questions (current behaviour in brackets)
1. Incident reporters without `incident.view` see the investigation and actions of their own report? (yes)
2. Assigned investigators see confidential incident details? (yes)
3. Reopening an investigation reopens its actions? (no)
4. Form Builder F-06: a form being edited stays usable through its last published version (spec: unavailable)? (usable)
5. Configuration permissions only count at company scope – site-level admins cannot configure? (company only)
6. Risk "confidential" is a label shown to admins only, nothing hidden? (label only)
7. Restrict who can be picked as risk approver? (anyone)
8. Risk "reviews due" uses the form's advance-notice days, not the job window? (advance notice)
9. Document surveys: managers outside the audience may answer? (no); automatic reminder cadence for mandatory surveys? (manual +
   scheduled jobs only); stronger anonymity via delayed batched inserts? (not done – see document-surveys.md)
10. Surveys (owner's decisions: own Create survey page, no "Add survey" on documents, file optional, listed apart in My
    Surveys / Survey Library): one notification instead of "new document" + "new survey"? (two); should the reader page of a
    survey say "survey" instead of "document" in its texts/notifications? (still "document" in places)
11. Incident types (admins can now add them – the spec said fixed catalogue): may built-in types be renamed too? (yes – key
    and history unaffected); a new type is active at once when a Report form is chosen? (yes); re-ordering types? (no – added
    types go last)
12. Port of Cork demo incident types: Audit / Law follow-ups need "Audit Non Conformance" / "Non Compliance" back, or route
    to Inspection Finding → "Audit Finding"? (not decided – keys reserved); First Aid Outcome as a choice list? (free text)
13. Anonymous incident reports: allow admins to switch them off (company / per type)? progress notifications to the
    anonymous reporter? block (instead of warn about) their comments? whistleblowing-grade channel without any account link?
    (always available; none; warn; no – see incidents.md "Anonymous reporting")
14. Document tags: rename / merge / delete tags (e.g. in Configuration → Lists)? filter by several tags at once? tags on
    surveys too? employees tagging? (not built; one tag at a time; no; managers only – see document-tags.md)
15. Risk hazard lists: "Other – type it" next to the list? manual order? block removing an option that assessments use?
    (strict list; alphabetical; allowed – assessments keep the name. See risk.md "Hazard lists per risk type")
16. Employee Induction (the renamed surveys): should "Let people answer anonymously" default to off – or go – for inductions?
    keep the "Feedback" example template? merge "New document" + "New induction" notifications? should "answers" counts and
    the CSV column say "completed"? (on by default; kept; two; "answers" – see document-surveys.md "Name: Employee Induction")
17. Risk Print / Save as document: link the saved document back to the assessment? re-export automatically on approval?
    which fields belong in the PDF (heat-map, open tasks, logo)? watermark or block drafts? pre-select an audience/category?
    (no link; manual; current set; drafts exportable without watermark; nothing pre-selected – see risk.md)
18. Incident actions without "preventive": hide the Corrective / Preventive kind everywhere (it is still offered when an
    action is raised from an incident and shown in filters/badges/CSV)? keep "Create a preventive action" in Trends &
    prevention? rename the Incidents menu item "Actions" to "Incident actions" now that a standalone Actions section exists?
    (kept; kept; not renamed – see incidents.md)
19. Standalone Actions: section name "Actions" or "Action" (owner's words)? may employees assign actions to anyone? may the
    owner change the due date or decline? verification step by the creator? repeating actions, archive, CSV export, offline
    create? overdue notice also to the creator / line manager? (Actions; yes; no; no; not built; owner only + Scheduled jobs
    escalation – see actions.md)
20. Law (see law.md "Open questions"): several Non Compliance incidents per requirement over time? (one); who confirms a
    "Law changed – review"? (owners + `law.evaluation.approve`); task owners without Law access see the requirement behind
    their task? (yes, read-only); shared vendor library instead of per-tenant installs? (per tenant); links / follow-ups to
    other sites or to standalone Actions? (same site, incident actions); default owner = me and next review = +1 year in
    the check? (yes); cron overdue notice like Actions? (Scheduled jobs only); editable activities / categories? (fixed).
21. Simplified law (see simplified-law.md "Open questions"): which of Law / Simplified law stays? (both on); one company register or
    one per site? (company); site-level `slaw.*` grants count? (yes, wherever held); employees see the register read-only? (own
    actions only); several actions per requirement or route gaps to standalone Actions? (one, built-in tracker); completing an
    action marks the requirement compliant? (no – "Action done – check again"); yearly re-check reminders? (not built); the boss's
    "Active + affected" status filter instead of "Status: all" + "Hide repealed"? (switch).

## Known issues and gotchas
- Pages a user may not see render the not-found / access-denied UI with HTTP **200** (`(app)/loading.tsx` streams first); APIs return 404/403.
- Better Auth cookie cache (5 min): a password reset/deactivation can take up to 5 minutes to bite on other devices.
- Production sign-in is rate-limited (HTTP 429 after several quick sign-ins) – space out scripted logins.
- Vercel Hobby runs crons daily only (`/api/cron/reminders` 06:00, `/api/cron/jobs` 09:00 UTC); AWS: EventBridge every 15 min.
- Windows: stopping a background `next start` from the shell tool can leave `node` listening – find it by port
  (`Get-NetTCPConnection -LocalPort <port>`) and stop it, or the user's `npm run dev` silently moves to port 3001.
- The full seed (`npx prisma db seed`) is idempotent but re-applies demo users' names/placements and Administrator permissions;
  module seeds skip when data exists. To add new demo data to an existing database, run only that module's seed function.
  Demo risk hazard / aspect lists: `bash scripts/localdb.sh npm run db:seed:risk-hazards` (local DB applied 28 Oct 2026; Neon not).
  Demo incident types + forms: `bash scripts/localdb.sh npm run db:seed:incident-types` (local DB applied 27 Oct 2026;
  Neon applied 27 Oct 2026 with the owner's consent via `ALLOW_REMOTE_SEED=1 npm run db:seed:incident-types` – Northstar keeps
  "Environmental Incident" switched off because 2 incidents use it).
  Demo standalone actions ("Action details" form, 7 actions, `action` target on the overdue job):
  `bash scripts/localdb.sh npm run db:seed:actions` (local DB applied 28 Oct 2026; Neon not – the Neon tenants get the module
  and role keys from the migration but no demo actions until this is run there with the owner's consent).
  Law demo data (library 2026.Q3, Non Compliance incident type, law targets on the overdue job, 2 profiles, evaluations, tasks,
  links): `bash scripts/localdb.sh npm run db:seed:law` (local DB applied 28 Oct 2026; Neon not). The local smoke test also
  installed the 2026.Q4 sample update and accepted it into Cork only (Dublin shows "update available").
  Simplified law demo data (real Irish / EU legislation: 3 categories, 7 sub-categories, 17 laws incl. the storyboard's PPWR
  example; demo answers and actions; `slaw.action` target on the overdue job): `bash scripts/localdb.sh npm run db:seed:simplified-law`
  (local DB applied 29 Oct 2026; Neon not). Re-running only adds missing categories / laws and never overwrites company edits.
- Browser-pane testing: the in-app browser pane can be hidden (viewport 0×0) – `read_page` then returns an empty page; set a size with
  `resize_window` first. Law stat-card grids need `grid-cols-1` on phones (long hints otherwise widen the page).
- Risk "Save as document (PDF)": each click stores a new PDF upload (usable 24 h); unused ones stay in storage like abandoned
  browser uploads (no clean-up job yet). The Print page opens the browser print dialog itself – in the in-app browser pane
  that dialog blocks the page; test Print through the menu with `window.print` stubbed.
- `next dev` rewrites the block in `AGENTS.md` – leave it.

## Next steps
1. Product owner to answer the open questions above.
2. Owner and boss compare Law and Simplified law, then decide which stays (removal steps: `docs/modules/simplified-law.md`).
3. Audit, Inspection – one phase each, brief modelled on `docs/briefs/05-risk.md` / `07-law.md`. Already prepared: permission keys
   (`src/lib/permissions.ts`), module keys (`src/lib/modules.ts`), Form Builder purposes (audits `STANDARD|SCORABLE|EXPRESS`,
   inspections `INSPECTION`; audit settings and scorable validation still to do), due-work kinds `audit | inspection`
   (declared, not registered), and the Incident follow-up contract (`raiseIncidentDraft`, `raiseAction`, `followUpStatus` –
   `docs/modules/incidents.md`; Law is its first user, `src/server/modules/law/connections.service.ts`). Specs:
   `../skills/ehs-functional-rebuild/references/{audit,inspection,cross-module}.md`; logic: `../ehs-screens/app/{audit,inspection}-model.ts`.
4. Vercel: demo document files seeded from this PC live in `./storage` (`storageDriver = local`) and cannot be opened on
   Vercel – copy them to Vercel Blob (one-off script) or re-upload them as new versions.
