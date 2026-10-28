# Risk (Phase 5) – what exists

Spec: `../skills/ehs-functional-rebuild/references/risk.md` (+ examples R-01…R-11), Risk rows of `references/cross-module.md`.
Read with `docs/PLATFORM.md` and `docs/modules/{platform,forms,jobs,incidents}.md`.

## Data (`prisma/schema/risk.prisma`, migration `20261026211807_risk`)
- `RiskAssessment`: reference (`risk-assessment` numbering → `RA-2026-0001`), stable `labelId` (QR), `clientId`
  (idempotent create), title, description, placement (department → `resolvePlacement`), owner, approver, review date,
  `participantIds`, item type/identity, operation mode, work area, people exposed (H&S) / impact context (Environment),
  status `DRAFT | AWAITING_APPROVAL | APPROVED | ARCHIVED`, revision, captured `form` snapshot + `formVersionId`,
  `method`, `domain`, captured `rules` (RiskFormSettings), custom `answers`, `currentScore` + `band`, `isConfidential`,
  approval/review dates, `archivedAt`, `clonedFromId`, `version`.
- `RiskHazard` (activity, hazard/aspect, consequence, controls, recommendation, justification, likelihood/severity,
  FMEA `factors` JSON, `checklistResult`, computed `score`), `RiskRevision` (revision, date, `APPROVED | TASK_RESCORE`,
  comment, score/band, hazards snapshot JSON, task id/reference), `RiskReview` (review date, comment, next date,
  reviewer, revision + score at the time).
- `RiskObjective`, `RiskTarget` (`INCREASE | DECREASE`, unit, baseline/current/goal), `RiskProgramme` (+ join
  `RiskProgrammeTarget`), `RiskTask` (reference `risk-task` → `RT-…`, kind `RA | MP`, programme required, assessment +
  hazard + factor + original/target/actual for RA, `parentId` sub-tasks, `OPEN | IN_PROGRESS | COMPLETED`, completion
  comment/date). Related assessments = `RecordLink` kind `related-assessment` (same site only).
- Placed models registered: `riskAssessment`, `riskTask`, `riskObjective`, `riskProgramme`. Lookups (group "Risk",
  editable by `risk.configure` too): `risk.activity-type | operation-mode | work-area | objective-domain | target-unit`.

## Rules (pure, tested – `src/server/modules/risk/*.test.ts`, `src/lib/risk/qr.test.ts`)
- `scoring.ts` on top of `src/lib/risk/scoring.ts`: per-hazard score (5×5/3×3 L×S, FMEA rounded product of group
  averages, Checklist No=1), overall = highest hazard (never sum/average), band with the CAPTURED thresholds, RA-task
  scoring factors (`likelihood | severity | <FMEA factor> | checklist 0/1`), `applyFactor`, heat-map cells.
- `workflow.ts`: draft gate (title + form available at the site), submit/approve gates (scope, ≥1 complete hazard,
  method values, required custom answers), command gates per status, `nextStep` (ONE primary button), lifecycle,
  periodic-review gates (review ≤ today, comment, next ≥ review; Approved only), task gates (programme required, due ≥
  created, RA needs assessment + hazard), completion gates (open sub-tasks, comment, date between creation and today,
  scoring task needs an Approved assessment + valid achieved value), same-site related links.
- `strategy.ts`: target progress (rounded, clamped 0–100), goal direction, target completion needs the goal reached,
  programme needs ≥1 target of its objective, deadline ≥ start, completion needs all linked tasks completed, programme
  progress = completed / all linked tasks (sub-tasks included) or 0.

## Access (`risk-access.policy.ts`, tested)
Assessments: `scopeWhere(risk.view)` OR owner / approver / participant. Tasks: `scopeWhere(risk.task.view)` OR task owner.
Objectives/programmes: `risk.view` scope OR owner; targets: visible objective OR owner. Same `where` for lists, detail,
reports, exports, scan and the entity registry → 404 outside scope (and across tenants). Create = `risk.create` at the
department; edit = `risk.edit` at the placement, or the author/owner of a Draft holding `risk.create`; approve =
`risk.approve` at the placement or the named approver holding it; periodic review = owner or `risk.approve` at the
placement; tasks: create `risk.task.create`, edit `risk.task.create|assign`, start/complete = owner with
`risk.task.complete` or `risk.task.assign` at the placement (admin completes without changing the owner).
Confidential flag: set and shown only for company-wide `risk.configure` (baseline "administrator-visible flag").

## Services & API (`src/server/modules/risk/`, `/api/risk/…`)
- `assessment.service.ts`: create (draft / submit / save & approve, captures the published Risk form for the
  department's site, maps the mandatory form questions from the controls, file answers → evidence), update (Draft /
  Awaiting approval), submit, approve (revision + 1 with snapshot), start revision (Approved → Draft), archive, restore
  (→ Draft), clone (Draft, no revisions/reviews/attachments), periodic review, related link/unlink.
  `task.service.ts`: create/update/start/complete (scoring completion rescored in the same transaction:
  `TASK_RESCORE` revision with task reference + audit on the assessment). `strategy.service.ts`, `reports.service.ts`,
  `assessment-query.service.ts` (list/detail/history/export/overview/scan), `matrix.service.ts`, `due-work.ts`.
- Routes: `GET/POST /assessments`, `/assessments/export` (CSV), `GET/PUT /assessments/:id`,
  `POST /:id/{submit,approve,revise,archive,restore,clone,review,related}`, `DELETE /:id/related/:otherId`,
  `GET /:id/history`, `GET/POST /tasks`, `GET/PUT /tasks/:id`, `POST /tasks/:id/{start,complete}`,
  `GET/POST /{objectives,targets,programmes}`, `GET/PUT /…/:id`, `GET /reports/:key`, `GET /scan?qr=`, `GET /overview`,
  `GET /matrix`, `GET /matrix/:formId`. Gates → 422 `details.blockers`; stale `expectedVersion` → 409 `STALE_VERSION`.
- Entity registry: `RiskAssessment`, `RiskTask`, `RiskProgramme`, `RiskObjective` (evidence, comments, links).
- Due work (registered): `risk.review` (Approved with review date → owner, link opens the review) and `risk.task`
  (Open/In-progress tasks incl. sub-tasks → task owner). The seeded "Daily overdue reminders" Test run matches them.
- Home: `RiskDashboardWidget` (active, high/critical, reviews due/overdue, overdue tasks); Insights count added.

## UI (`src/features/risk/`)
Nav "Risk": Overview `/risk`, Assessments `/risk/assessments`, Objectives & programmes `/risk/strategy` (tabs Objectives ·
Targets · Programmes; drill-down `/risk/strategy/{objectives,targets,programmes}/[id]` → tasks), Tasks `/risk/tasks`
(+ `/risk/tasks/[id]`), Reports `/risk/reports`. Wizard `/risk/assessments/new` and `/[id]/edit` (Scope → Hazards/Aspects
→ Review & decide; live score chips; 5×5/3×3 pickers, FMEA sliders by group, checklist Yes/No/N/A; Save draft · Submit
for approval · Save & approve when permitted). Detail: one primary step (Submit / Approve / Record review / Start
revision / Restore), More menu (edit, revise, approve, QR label, clone, archive), stepper, tabs Overview (scope, heat-map
or ranked list, related, linked records) · Scorecard · Tasks · History & reviews (snapshots, reviews, audit) · Evidence ·
Comments. `?review=1` opens the periodic review. QR label dialog (`qrcode-generator` 2.0.4): SVG/PNG download, print,
test link. `/scan` (behind sign-in): label link, typed reference, camera / image where `BarcodeDetector` exists.
Configuration → "Risk matrix & review rules" `/configuration/risk` (company-wide `risk.configure` or `forms.publish`).

## Hazard lists per risk type (added 28 Oct 2026)
Product owner's request: on Configuration → Risk matrix, the selected risk type (= Risk form) also has its own list of
hazards (aspects for Environment forms) – the options of the Hazard dropdown of its assessments.

**How hazards were stored before:** only as free text on each assessment (`RiskHazard.name`); no list existed (spec and
prototype have none). **What was extended:** the platform pick-list model `LookupValue` – one list per Risk form under
the key `risk.hazard:<formId>` (`src/lib/risk/hazard-options.ts`). Same table, case-insensitive uniqueness, active flag
and audit entity (`LookupValue`, actions CREATED / UPDATED / DELETED with `listKey` + form name) as the other lists, but
managed on the Risk matrix page – these lists are not in Configuration → Lists. No migration.

- **Configuration** (`HazardListPanel` under the rules panel; company-wide `risk.configure` or `forms.publish`): add,
  rename, switch on/off, remove (with confirmation). Each option shows how often its name is used on this form's
  assessments. Changes apply at once – the list is NOT versioned with the form (unlike the matrix rules), so existing
  drafts see the current list too. Alphabetical; no manual ordering.
- **Assessment wizard** (`HazardNamePicker` in `hazard-editor.tsx`, options from `GET /api/risk/hazard-options?formVersionId=`):
  while the form has at least one switched-on option, the Hazard field is a searchable dropdown of the switched-on
  options; a name the hazard already has stays selectable under "Current – no longer in the list". Without a list in use
  (none, or all switched off) the name is typed, as before.
- **Server rule** (`checkHazardNames`, tested; called in `assessment.service` `prepare`): a new or changed name must be a
  switched-on option (stored with the option's spelling, e.g. "lone  WORKING" → "Lone working"); unchanged names stay
  valid. Otherwise 422 "Choose the hazard from the list – “…” is not in it" / "… has been switched off".
- **Existing assessments keep their hazard labels:** names are copied text, so renaming, switching off or removing an
  option changes no assessment, revision snapshot, task or report. Clones and task rescores copy names unchanged.
- API: `GET/POST /api/risk/matrix/:formId/hazards`, `PUT/DELETE /api/risk/matrix/:formId/hazards/:hazardId`.
- Demo data (`prisma/seed/risk-hazards.ts`, part of the Northstar seed; existing DBs: `bash scripts/localdb.sh npm run
  db:seed:risk-hazards`, idempotent, local unless `ALLOW_REMOTE_SEED=1`): 16 hazards for the 5×5 Health & Safety form,
  8 aspects for the FMEA Environment form (both include the names the demo assessments use); the Checklist form has no
  list (its rows are checklist items), so it shows the typed field. Applied to the LOCAL DB on 28 Oct 2026, not Neon.

## Seed (`prisma/seed/risk.ts`, idempotent – skipped when the tenant has assessments)
Northstar: 8 assessments using the published Risk forms – Approved 5×5 (forklift, 20 Critical; ladder RA-…-0002, rev 2
via a task rescore 15 → 10, review overdue), Awaiting approval, Draft (incomplete), FMEA environment (72 Medium, review
due), Cork checklist (Action required, confidential), Cork 5×5 with a recent review, Archived; revisions + reviews +
audit rows; 2 objectives, 3 targets (R-08 50 %), 2 programmes; 7 RA/MP tasks incl. sub-tasks (Sam, Priya, Sarah;
some overdue); one related link. Counters for `risk-assessment` / `risk-task` are set.

## Deviations from the spec
- Menu: Objectives, Targets and Programmes are tabs of one page; Risk matrix lives in Configuration
  (`/configuration/risk`) and edits the Risk form rules through the Form Builder service (`PUT /api/forms/:id/risk-rules`
  via the shared `RiskRulesPanel`) – saving a published form publishes a new version, captured rules stay.
- Numbering keys are `risk-assessment` (RA) and `risk-task` (RT) (already declared in `src/lib/settings/numbering.ts`).
- Starting a revision is an explicit "Start revision" command (Approved → Draft); editing is only allowed for Draft and
  Awaiting approval. There is no "return to draft" for approvers.
- The company matrix reference image is not stored (on-screen aid only per spec).
- Report dates are optional (no period = all records); score reductions use retained revisions up to the period end.
- QR labels encode the reference (`/scan?qr=risk:RA-…&workspace=<slug>`); the stable `labelId` is printed on the
  label and also resolves. A label of another workspace shows a message instead of a lookup.
- Programme progress counts every linked task including sub-tasks (spec wording); the prototype counted top-level only.
- Assessment Tasks tab lists only tasks the viewer may see (`risk.task.view` scope or own).
- Hazard lists per risk type are not in the spec (owner's request, 28 Oct 2026); see "Hazard lists per risk type".

## Open questions
- Hazard lists: allow "Other – type it" next to the list (now strict while a list is in use)? Manual ordering of the
  options (now alphabetical)? Should removing an option be blocked while assessments use its name (now allowed – they
  keep the name)? Should the hazard list also feed the consequence/controls (templates per hazard)?
- Smoke test of hazard lists (28 Oct 2026, local DB): H&S list now also has "Lone working" and "Hot work (welding,
  cutting)" (renamed from "Hot work"), "Vibration" is switched off and "Confined spaces" was removed.
- Confidentiality is only a flag for company-wide configurators – confirm no enforced hiding is wanted yet.
- Should a named approver without `risk.approve` be blocked from being chosen (picker filters by permission only)?
- Should Approved-assessment reminders use the form's advance-notice days (Home/Overview "reviews due" does) or only
  the scheduled job's own upcoming window (current behaviour of jobs)?
- Smoke tests left data in Northstar: RA-2026-0009…0013 (smoke/UI drafts, revised/cloned/archived-restored), RT-2026-0008…0011.
