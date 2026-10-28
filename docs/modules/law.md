# Law – what exists

Product owner's request (28 Oct 2026): "Create the law module as the law module specifications and descriptions you already
have; remember there is an integration between law, risk and incident modules. Make it simple, use the best practice of UX so
anyone can use it and understand it." Brief: `docs/briefs/07-law.md`. Spec: `../skills/ehs-functional-rebuild/references/law.md`
(+ examples L-01…L-11) and the Law rows of `references/cross-module.md`. Logic ported from `../ehs-screens/app/law-model.ts`.

## Words on screen (plain words for the spec's terms)
| Spec | Screen |
| --- | --- |
| Legal profile | Profile ("a site, its country and what happens there") |
| Compliance checklist (in a profile) | Requirement – the register is **Laws that apply to us** |
| Evaluate / evaluation | **Check compliance** / the check |
| Not started · Partial · Complete · Review required · Not relevant | Not checked · Partly checked · Checked · Law changed – review · Doesn't apply |
| Relevant / Not relevant / Outside current profile | Applies to us / Doesn't apply / Outside this profile |
| Legislation register | **Law library** |
| Other requirements | Company requirement (register "Other requirements") |
| Changes & updates | Configuration → Law content & settings (install) + profile page "Review update" (accept) |
| Compliance rating | Self-assessed compliance rating (optional, 0–100 %) |

## Data (`prisma/schema/law.prisma`, migration `20261028150612_law` – additive, no data statements)
- `LawContentVersion` – installed legal-content package (`2026.Q3`, rank, release date, summary). `content` Json = the WHOLE
  library at that version (legislation + checklists, merged with the previous version), `changes` Json = its New / Amended items.
  Tenant-scoped (each tenant installs packages). Profiles point at the version they accepted, so screens never silently show
  newer content.
- `LawProfile` – name (unique per tenant), owner, site (placement: business unit + site; fixed after creation), jurisdiction,
  activities[], description, shared/private, show rating, accepted `contentVersion`, `version`, `archivedAt`.
- `LawRequirement` – one row per profile × checklist (`CONTENT`, `contentKey`) or a company requirement (`OTHER`, own title /
  text / category / keywords). Rows appear when a checklist first applies (profile create / edit / accept) and are never deleted.
  Holds the evaluation: relevant + exclusion reason, two narratives, rating, owner, department (placement), next review date,
  evaluated date, `reviewRequired` + reason, captured Law form + answers, `version`, `archivedAt` (OTHER only). Reference
  `legal-evaluation` numbering (LEV-2026-0001). Title / register / category are copied from the accepted content.
- `LawTask` – reference `law-task` (LT-2026-0001, new numbering key), requirement, title, details, owner, department, due date,
  priority LOW/MEDIUM/HIGH, status OPEN/COMPLETED, completion comment/date, `archivedAt`, `version`.
- `LawLink` – explicit association requirement ↔ `RiskAssessment` / `Incident` / `CorrectiveAction` with context; unique per
  (requirement, target). Raised follow-ups use the Incident follow-up contract (RecordLink).
- Placed models registered: `lawProfile`, `lawRequirement`, `lawTask`. Entity registry: `LawProfile`, `LawRequirement`,
  `LawTask` (evidence, comments, links). Module entity types updated in `src/lib/modules.ts`.

## Rules (pure, tested – 48 vitest tests)
- `src/lib/law/content.ts` (+ `content.test.ts`): registers, categories, activities, levels; package validation (newer YYYY.Qn
  version, valid release date, summary, required fields, known register/category/activity, unique ids, hierarchy Primary →
  Secondary → Tertiary in one jurisdiction without loops, checklist references, http(s) source links, "changes nothing");
  merge; change list; applicability (active checklist, ≥1 selected activity, ≥1 active referenced legislation in the
  jurisdiction); changed checklists between versions (checklist or referenced legislation changed). Fictional sample content:
  `src/lib/law/sample-content.ts` (2026.Q3 library, 2026.Q4 sample update).
- `src/server/modules/law/workflow.ts` (+ `workflow.test.ts`): status; partial saves always allowed; "Checked" needs both
  narratives + owner + department + next review date and no review flag; the review flag clears only with the explicit
  confirmation on a complete check; exclusion needs a reason and keeps everything; summary (relevant total, checked, excluded,
  attention = flag or overdue review, rating average of rated relevant in-scope items rounded, coverage, `null` = Not assessed);
  task gates (description, owner, department, due date; completion comment); next step + stepper.
- `law-access.policy.ts` (+ test): see = `law.view` in scope on **shared** profiles, `law.requirement.manage` in scope (private
  too), profile owner, requirement owner, owners of the requirement's tasks (read-only), and for tasks the task owner/creator.
  Evaluate / add tasks / link / raise follow-ups = `law.evaluation.create` in scope, requirement owner or profile owner.
  Confirm a content review = `law.evaluation.approve` in scope or the owners. Profiles and company requirements =
  `law.requirement.manage` at the site (the profile owner may edit their profile); installing content = that permission
  company-wide. Records outside scope → 404.

## Server (`src/server/modules/law/`)
`content.service.ts` (library, preview, install – advisory lock, notifies profile owners), `profile.service.ts` (create / edit /
archive / restore, update preview, accept), `requirement.service.ts` (save evaluation, exclude / include, company requirements),
`connections.service.ts` (links, link options of the profile's site, follow-ups, raise incident / action, back-link list),
`task.service.ts`, `law-query.service.ts` (registers, details, overview, library, tasks, summary, histories – the audit trail
is the evaluation history), `reports.service.ts`, `settings.service.ts`, `due-work.ts`, `law.entity.ts`, `incident-type.ts`
(Non Compliance set-up), `requirement-sync.ts` (row sync + content-change flags; also used by the seed). Every mutation is
audited in its transaction; optimistic concurrency (`version`) → 409; gates → 422 `details.blockers`.

API (`/api/law/…`, module `law`, 38 thin routes): `overview`, `summary`, `profiles[/:id[/archive|restore|update|history]]`,
`requirements[/:id[/evaluation|exclude|include|archive|restore|history|links[/:linkId]|link-options|follow-ups|incident|action]]`,
`connections`, `tasks[/:id[/complete|archive|restore|history]]`, `legislation[/:id]`, `content[/sample|preview|install]`,
`settings[/incident-type]`, `reports/:key` (`register | tasks | links`, `format=csv`).

## Risk ↔ Law ↔ Incident integration
- **Link** an existing Risk assessment, Incident or Incident action **of the profile's site** (picker shows only records the
  user may open) with context. Repeating returns the existing link; links never change either record. Remove = audited.
- **Report as an incident** → `raiseIncidentDraft` type `non-compliance`, subtype "Legal requirement" / "Other requirement",
  department of the profile's site, optional investigator, legal source label/href. **One incident per requirement** (repeat
  returns it; the menu then shows "Open the Non Compliance incident"). Blocked with guidance when the type / published Report
  form is missing or switched off.
- **Raise a corrective action** → `raiseAction` (corrective, owner, department, due date, legal provenance, no incident);
  several actions per requirement, double submits deduped by a per-dialog request key.
- Both sides show the association: requirement tab "Risk & incidents" (links + raised follow-ups with status via
  `followUpStatus`) and a **"Legal requirements"** card on Risk assessments, Incidents and Incident actions
  (`LawConnectionsCard`, `GET /api/law/connections`). Raised records also show the origin through the existing
  "Raised from" / "Origin" cards and `LinkedRecords`. Nothing a follow-up does changes the check, rating or review flag.
- **Non Compliance type (HANDOFF question 12, Law side):** Law owns key `non-compliance`. `ensureNonComplianceType` creates
  "Non Compliance" (or "Non Compliance (Law)" if the name is taken) with subtypes Legal requirement / Other requirement, binds
  the published "Incident report" form (else the oldest published Report form) and the first Investigation form, investigation
  optional, assignment not required; an existing type keeps its settings and is only switched on / given a form when it has
  none. Run by the seed and by Configuration → Law content & settings → "Set it up for me" (needs `incident.configure`
  company-wide). `non-compliance` was removed from the Incident seed's retired list so re-seeding no longer switches it off.

## Form Builder
Purpose `LAW` is now "Extra evaluation questions" (`available: true`, no system questions – the old design-only system
questions duplicated the fixed fields and were removed; no LAW form existed). The latest published Law form for the profile's
site shows under the check ("More questions"); it is captured on the first save that sends it and kept; required questions
are enforced only when the check is complete. No demo Law form is seeded.

## Due work and reminders
`law.evaluation` (relevant, in-scope requirements of active profiles with a next review date → requirement owner, else profile
owner) and **`law.task`** (new kind: open tasks → owner) – registered providers; they feed My work and Scheduled jobs. The seed
adds both targets to "Daily overdue reminders" (local test run matched LEV-2026-0002 and LT-2026-0001). No separate cron
notice (Actions has one) – reminders come from Scheduled jobs.

## UI (`src/features/law/`, pages `src/app/(app)/law/**`, `src/app/(app)/configuration/law`)
- Sidebar **Law**: Overview · Laws that apply to us · Tasks · Law library · Profiles · Reports (`law.view`). Configuration hub
  card **Law content & settings** (`law.requirement.manage` or `incident.configure`). Home widget "Law & compliance".
- **Overview**: banner, profile select (remembered per browser, `?profile=`), 4 stat cards (Apply to us, Checked x of y,
  Need attention, Self-assessed compliance or upcoming reviews), Needs attention (update available, law changed, review overdue,
  overdue tasks, not checked yet), Recently checked, disclaimer. People without a profile get a pointer to their tasks.
- **Laws that apply to us**: profile select, tabs Applies to us / Doesn't apply / Outside this profile / Everything, search,
  status / register / category filters + "Only mine" / "Needs attention", table / cards, pagination, "Add a company requirement".
- **Requirement detail**: one primary button (Check compliance / Finish the check / Review the change / Review again / It applies
  again), More (Add a task, Link a risk assessment or incident, Report as an incident, Raise a corrective action, This doesn't
  apply to us, edit / archive company requirement), stepper (Why it applies → How we checked → Owner & next review → Checked /
  Review the change), tabs Overview · Check (+ comments) · Tasks · Risk & incidents · Evidence · History. The **Check compliance**
  sheet: 4 numbered questions, optional rating (collapsed), extra questions, the review confirmation, a live "Will be saved as"
  preview listing what is missing. Defaults: owner = me, department = mine when on the site, next review = +1 year.
- **Tasks** register (Mine / Everyone's with `law.view`) + task detail (Mark as done with comment, Edit, Archive / Restore).
- **Profiles**: cards with progress, update badge; create / edit sheet (activities explained in plain words; removing one says
  the work moves outside the profile); detail with "Review update" → change list + what it does to this profile → Accept.
- **Law library**, **Reports** (3 tabs, stat cards, CSV, Print) and **Configuration → Law content & settings** (installed versions,
  sample update / upload with preview before install, sample download, Non Compliance readiness + set-up, read-only lists).
- Every page checked at 375 px without page-level horizontal scroll.

## Seed (`prisma/seed/law.ts`, `npm run db:seed:law`; also part of the full Northstar seed)
Library 2026.Q3; Non Compliance type; law targets on the overdue job; profiles **Dublin Plant – operations** (owner Sam, all
activities: 5 requirements in every state incl. one review overdue) and **Cork Distribution – warehouse** (owner Emma: transport
checked 45 %, emergency "doesn't apply", waste not checked, company requirement "Customer safety briefing commitment"); tasks
LT-2026-0001 (Priya, overdue), LT-2026-0002 (Sam, done), LT-2026-0003 (**John**, due in 5 days); links to the first Cork / Dublin
risk assessments and a Cork incident. Idempotent (profiles only when the tenant has none). 2026.Q4 is NOT installed by the seed.

Local smoke test (28 Oct 2026) left: Cork on **2026.Q4** (installed + accepted; Dublin still on Q3 with "update available"),
LEV-2026-0007 waste checked 80 % and linked to RA-2026-0006, **INC-2026-0018** Non Compliance draft and **ACT-2026-0009**
corrective action raised from it, LEV-2026-0006 review confirmed, LT-2026-0003 completed by John.

## Simplifications / deviations from the spec
1. Menu: 6 items instead of 8 – Legislation = Law library, Compliance checklists + Other requirements = "Laws that apply to us",
   Changes & updates = Configuration (install) + profile page (accept).
2. The legal library is per tenant (installed by an administrator), not a shared vendor library.
3. Activities, categories and registers are fixed by the content (not editable in Lists); jurisdictions come from the library.
4. A profile's site cannot change after creation (create a new profile instead); jurisdiction and activities can.
5. Evaluation history = the signed audit trail (no separate history table).
6. One Non Compliance incident per requirement; corrective actions are unlimited.
7. Links and follow-ups only to records of the profile's site.
8. "Approve evaluations" (`law.evaluation.approve`) is used for confirming a content-change review; there is no separate
   approval step in the spec.
9. Shared / private labels are fixed ("Shared with everyone who can see Law" / "Private"), not configurable.
10. No live legal feed, no automatic acceptance; sample package only (as the spec says).

## Open questions for the owner
1. Should one requirement allow several Non Compliance incidents over time (e.g. a new one after the first is closed)? (one)
2. Who may confirm a "Law changed – review": evaluators too, or only `law.evaluation.approve` + owners? (approve + owners)
3. Should task owners without Law access see the requirement behind their task? (yes, read-only)
4. Should the legal library be shared across tenants (vendor-maintained) instead of installed per tenant? (per tenant)
5. Allow links / follow-ups to records of other sites, or to standalone Actions? (same site; incident actions only)
6. Should the check default the next review date (+1 year) and owner (me)? (yes)
7. A cron "overdue" notice like Actions, or Scheduled jobs only? (Scheduled jobs only)
8. Make activities / categories editable per tenant (would need package mapping)? (fixed)
9. Show the self-assessed rating to employees / in Home? (profile setting; Home shows counts only)
10. Demo Law Form Builder form with extra evaluation questions? (none seeded)
