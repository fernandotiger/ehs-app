# Handoff – project status and working agreements

Read this first in a new session. Updated 27 Oct 2026.

## The project
OleoQ: multi-tenant EHS SaaS (Documents, Incidents, Risk, Audits, Inspections, Law + Configuration). Three folders under `mvp1/`
were merged into this app: `docs-app` (this repo – its Documents look and UX is the reference the product owner's boss likes),
`../ehs-screens` (old prototype: reuse its domain logic in `app/<module>-model.ts`, never its layout – rejected as too complicated)
and `../skills/ehs-functional-rebuild` (functional specs: `references/<module>.md` + `examples/<module>-examples.md`).
`../_reference/docs-app-original` holds the pre-merge code.

## Status
| Area | State | Details |
| --- | --- | --- |
| Platform (tenancy, scoped roles, placement, shared services) | done | `docs/modules/platform.md` |
| Configuration hub (structure, users, roles, lists, numbering, branding, import, settings, audit log) | done | `docs/modules/configuration.md` |
| Form Builder, scheduled jobs, My work | done | `docs/modules/forms.md`, `docs/modules/jobs.md` |
| Documents (+ document surveys, own Survey page) | done | `docs/modules/platform.md`, `docs/modules/document-surveys.md` |
| Incidents (+ admins add/rename incident types; Port of Cork demo types + per-type forms; type-first report wizard, 27 Oct) | done | `docs/modules/incidents.md` |
| Risk | done | `docs/modules/risk.md` |
| Audits, Inspections, Law | **not started – deferred by the product owner** | see "Next steps" |

Quality at handoff: `tsc` 0 errors, 376 vitest tests green (27 Oct, incl. `test/seed`), eslint clean, `next build` clean (no warnings).
Migrations: `init`, `configuration`, `forms_jobs`, `incidents`, `risk`, `document_surveys`, `survey_optional_file`.
**Git:** first commit 27 Oct 2026 on `master`, pushed to `https://github.com/fernandotiger/ehs-app` (owner's personal repo).
Ask before committing or pushing. `Port of Cork Incident Module Templates 19022021.xlsx` (client file) stays local – it is
in `.gitignore`; its content is transcribed in `prisma/seed/incident-types.ts`.
**Vercel:** the owner deploys from that repo to Vercel with the **same Neon database** as `.env`. `vercel-build` runs
`prisma migrate deploy`, so a deploy applies pending migrations to Neon. Keep `BETTER_AUTH_SECRET` / `AUDIT_SIGNING_SECRET`
identical to `.env` there, or existing audit/acknowledgement signatures stop verifying.

## Databases and running it
- `.env` → the product owner's **Neon** test database `mvp1` (`DATABASE_DRIVER=neon`). Migrated through `document_surveys` (**`survey_optional_file` not applied yet** – ask the owner first) and seeded
  on 27 Oct 2026. `npm run dev` uses it (http://localhost:3000; `BETTER_AUTH_URL` must match the port).
- `.env.localdb` → local `prisma dev` server `oleoq` (database `template1` on :51221, shadow :51222). Start with
  `npx prisma dev -n oleoq -d`; prefix commands with `bash scripts/localdb.sh` (Git Bash). Keep `DATABASE_POOL_MAX=1`.
  Other port: `BETTER_AUTH_URL=http://localhost:3100 bash scripts/localdb.sh npx next dev -p 3100`.
- Demo accounts (password `Password123!`): `docs/modules/platform.md` (admin/helen/emma/sam/liam/john @northstar.example,
  admin@oleo-demo.example). Northstar has all modules; Oleo Demo has documents + incidents only.
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

## Known issues and gotchas
- Pages a user may not see render the not-found / access-denied UI with HTTP **200** (`(app)/loading.tsx` streams first); APIs return 404/403.
- Better Auth cookie cache (5 min): a password reset/deactivation can take up to 5 minutes to bite on other devices.
- Production sign-in is rate-limited (HTTP 429 after several quick sign-ins) – space out scripted logins.
- Vercel Hobby runs crons daily only (`/api/cron/reminders` 06:00, `/api/cron/jobs` 09:00 UTC); AWS: EventBridge every 15 min.
- Windows: stopping a background `next start` from the shell tool can leave `node` listening – find it by port
  (`Get-NetTCPConnection -LocalPort <port>`) and stop it, or the user's `npm run dev` silently moves to port 3001.
- The full seed (`npx prisma db seed`) is idempotent but re-applies demo users' names/placements and Administrator permissions;
  module seeds skip when data exists. To add new demo data to an existing database, run only that module's seed function.
  Demo incident types + forms: `bash scripts/localdb.sh npm run db:seed:incident-types` (local DB applied 27 Oct 2026;
  **Neon not yet** – ask the owner first).
- `next dev` rewrites the block in `AGENTS.md` – leave it.

## Next steps
1. Product owner to answer the open questions above.
2. Audit, Inspection, Law – one phase each, brief modelled on `docs/briefs/05-risk.md`. Already prepared: permission keys
   (`src/lib/permissions.ts`), module keys (`src/lib/modules.ts`), Form Builder purposes (audits `STANDARD|SCORABLE|EXPRESS`,
   inspections `INSPECTION`, law `LAW` – currently design/preview only; audit settings and scorable validation still to do),
   due-work kinds `audit | inspection | law.evaluation` (declared, not registered), and the Incident follow-up contract
   (`raiseIncidentDraft`, `raiseAction`, `followUpStatus` – `docs/modules/incidents.md`). Specs: `../skills/ehs-functional-rebuild/
   references/{audit,inspection,law,cross-module}.md`; logic: `../ehs-screens/app/{audit,inspection,law}-model.ts`.
3. Vercel: demo document files seeded from this PC live in `./storage` (`storageDriver = local`) and cannot be opened on
   Vercel – copy them to Vercel Blob (one-off script) or re-upload them as new versions.
