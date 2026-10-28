# Incidents (Phase 4) – what exists

Spec: `../skills/ehs-functional-rebuild/references/incident.md` (+ examples I-01…I-12), follow-up rows of
`references/cross-module.md`. Read with `docs/PLATFORM.md` and `docs/modules/{platform,forms,jobs}.md`.

## Data (`prisma/schema/incidents.prisma`, migration `20261026155624_incidents`)
- `IncidentType` (built-in catalogue per tenant = the Port of Cork types – see "Demo incident types" – `key` stable:
  `src/server/modules/incidents/catalogue.ts`, created by
  `provisionTenant` when incidents are enabled and lazily on first read; **plus types an administrator adds** – see
  "Incident types" below) + settings, `reportFormId` / `investigationFormId` (FormDefinition ids → latest published
  version), optimistic `version`. `IncidentSubtype`. Name and key unique per tenant; no migration was needed.
- `Incident`: reference (`incident` numbering), type/subtype + **label snapshots**, severity, placement (department →
  `resolvePlacement`), precise location, shift (label), occurredAt, investigation target date, confidential, draft /
  submittedAt, reporter, immediate action, first aid, nurse notified, `notifyUserIds` (intent only), captured
  `reportForm` snapshot + `answers`, `searchText` (title + searchable answers), closure fields, archivedAt, cached
  derived `status`, origin (`source*`), `clientId` (idempotent wizard/offline create), `version`.
- `IncidentPerson`, `IncidentInvestigator`, `Investigation` (1:1, own `version`, captured form, impacts, `causeIds` /
  `reporteeIds` = lookup value ids, losses, decision), `AbsencePeriod` (`restricted` stored at save time).
- `CorrectiveAction` (reference `corrective-action`, kind, state, reviewer + planned review date, `parentActionId`
  for follow-ups, origin, `trend` snapshot, `version`), `ActionIncident` (many-to-many), `ActionTask`.
- Placed models registered: `incident`, `correctiveAction`, `actionTask`.
- Lookups (`src/lib/lookups.ts`, group "Incidents"): causes per fixed group (`incident.cause.equipment|materials|
  methods|people|workplace`), reportees (`incident.reportee.internal|external`, notes = destination), CAPA
  categories, hazard groups, environmental aspects, shifts, injury types, body parts, absence kinds (code
  `RESTRICTED` = not counted). Setting `incident` = ordered `exportColumns` (`answer:<key>` for custom questions).

## Rules (pure, tested)
`src/server/modules/incidents/workflow.ts` (+ `workflow.test.ts`, I-01…I-11): `deriveIncidentStatus`,
`closureBlockers`, `draftBlockers` / `submitBlockers`, `investigationDataErrors` / `investigationCompletionBlockers`,
`daysLost` (inclusive calendar days, Restricted duties excluded, no de-duplication), `isActionResolved` (recursive
follow-up resolution: applicable follow-ups keep all parent incidents), `actionCompletionBlockers`,
`actionReviewBlockers` (on/after planned date, company-local today, no admin override), `followUpBlockers`,
`nextStep` (ONE primary button), `lifecycle` (stepper), `matchesTrend`. Every guard returns plain-words lines; the API
answers 422 `BUSINESS_RULE_VIOLATION` with `details.blockers`. The cached `status` column is refreshed by
`refreshIncidentStatus(tx, ids)` inside every mutating transaction (incident, investigation, action, link).

## Access (`incident-access.policy.ts`, tested)
Incidents: `scopeWhere(incident.view)` OR reporter (by id, or by `anonymousReporterKey` for anonymous reports) OR
assigned investigator (same `where` for lists, detail, export, evidence/comments). Confidential: people, narrative, answers, immediate action/first aid hidden unless
`incident.view_confidential` at the placement, reporter or investigator; searchable-answer search respects it.
Actions: `scopeWhere(incident.action.view)` OR owner / reviewer / task owner OR linked to a visible incident.
Rights: edit report = reporter while draft or `incident.triage` at placement (never when closed/archived); investigate
= assigned investigator or `incident.investigate`; close/reopen = `incident.close`; add/link action =
`incident.action.create` or investigator; work on action = owner (with `incident.action.complete`) or
`incident.action.assign` at placement (admin acts without changing the owner); review = named reviewer or
`incident.action.verify`. Outside scope → 404. Incident settings need `incident.configure` at company scope.

## Services and API (`src/server/modules/incidents/`, routes under `/api/incidents`)
- `incident.service.ts`: create (draft/submit, idempotent `clientId`, captures the bound or chosen Report form for
  the department's site, maps title/date/site/narrative into the mandatory questions, consumes wizard + file-answer
  uploads as evidence), update (re-filters the SAME form version when the site changes), submit, archive/restore,
  close (note + gates), reopen. `investigation.service.ts`: start / save / complete / reopen.
  `action.service.ts`: create, update plan, link/unlink, start, complete, review, follow-up, tasks.
  `trends.service.ts`, `reports.service.ts`, `incident-query.service.ts`, `action-query.service.ts`.
- Routes: `GET/POST /api/incidents`, `/export` (CSV, configured order), `/overview`, `/report-setup` (offline cache),
  `GET/PUT /:id`, `POST /:id/{submit,archive,restore,close,reopen}`, `GET /:id/history`,
  `POST|PUT /:id/investigation`, `POST /:id/investigation/reopen`, `GET|POST /types`, `PATCH /types/:id`,
  `POST /types/:id/subtypes`, `PATCH /types/:id/subtypes/:sid`, `POST /trends`, `POST /trends/actions`,
  `GET /reports/:key?from&to&siteId&format=csv` (`by-type|by-cause|days-lost|actions|incidents`),
  `GET/POST /actions`, `/actions/export`, `/actions/tasks`, `GET/PUT /actions/:id`,
  `POST /actions/:id/{start,complete,review,follow-ups,link,unlink,trend}`, `POST /actions/:id/tasks`,
  `PUT /actions/:id/tasks/:tid`, `POST /actions/:id/tasks/:tid/complete`.
- Lookup routes accept `incident.configure` for `incident.*` lists (`lookup-params.ts` `requireListManager`).
- Entity registry: `Incident`, `Investigation`, `CorrectiveAction`, `ActionTask` (evidence, comments, links).
- Due work (`due-work.ts`, registered): `incident.investigation` (one item per assigned investigator, due = target
  date, until completed) and `incident.action` (open/in-progress → owner + due date; awaiting effectiveness → owner +
  `reviewerId` + planned review date; open child tasks → task owner). The seeded "Daily overdue reminders" Test run
  now matches incident work.
- Offline: op `incident.report` (`sync-handlers.ts`), op id = clientId; queued reports listed on Overview/Register.

## Incident types (added 27 Oct 2026)
Configuration → Incident settings → Types & subtypes → **Add type** (dialog): name, first subtype (default
"General"), Report form and Investigation form (prefilled with the forms most existing types use). `POST
/api/incidents/types` (`incident.configure`, company scope) → `incidentTypeService.create`: audit
`INCIDENT_TYPE_CREATED` in the same transaction, key generated from the name (`type-rules.ts` `typeKeyFor`:
"chemical-exposure", "-2" on clashes, built-in, routing and retired catalogue keys always reserved so follow-up routing can never land on
an added type), sorted after the existing types. Defaults = the schema defaults (several investigators, investigator
required to submit, investigation enabled, attachments allowed, 7 target days); investigation required only when an
Investigation form is chosen; **active only when a Report form is chosen** (otherwise saved inactive – the toast says
so). The new type is selected in the list and configured in the same editor as every other type (settings, form
bindings, subtypes); once active it appears in the report wizard (`/report-setup`).
- **Rename**: the editor has a Name field (`PATCH /types/:id` optional `name`) for every type, built-in ones too. The
  key never changes; incidents keep their `typeLabel` snapshot (registers/exports show the old name for old reports).
- **Archive** = the existing "Active" switch (no delete, no `archivedAt`): switched-off types are not offered to
  reporters, existing incidents keep working.
- Names are compared ignoring case and spacing, inactive types included ("already exists but is switched off – open
  it and make it active instead"); the DB unique index is the race backstop (409).
- `ensureIncidentCatalogue` now skips a built-in type whose name the tenant already uses for its own type, so a future
  catalogue addition can never break provisioning or the seed.
- Pure rules + tests: `type-rules.ts` / `type-rules.test.ts` (`cleanTypeName`, `typeKeyFor`, `typeNameClash`,
  `typeSettingsProblem` – the active-needs-report-form / required-needs-investigation-form gates shared by create
  and update).

## Anonymous reporting (added 28 Oct 2026)
The spec does not cover it; the design follows the survey privacy approach (`docs/modules/document-surveys.md`):
store no link where possible, and keep only what the reporter needs to follow their own report.

**What the reporter sees.** "Report anonymously" is a tick box on the wizard's first step (Type of event) and again on
Review & submit, with the caveat "What you write, the people you name and your photos or files can still point to you.
Once the report is saved this cannot be changed." After the first save the choice is shown read-only. The reporter
still finds the report under Incidents (register, *Reported by me or assigned to me*, overview "Your draft"), can
finish and submit an anonymous draft, and reads "Reported by: Anonymous (you – nobody else can see that)".

**What everyone else sees.** "Reported by: Anonymous" and an *Anonymous* badge – for every role, administrators
included. The History tab and Configuration → Audit log show "Anonymous reporter"; files added with the report show no
uploader; the CSV export writes "Anonymous" in the *Reported by* column.

**How it is stored** (migration `anonymous_incident_reports`, additive: two new columns + one index, two columns made
nullable – existing rows unchanged):
- `Incident.reporterId` is **null**, `isAnonymous = true`, and `anonymousReporterKey` = HMAC-SHA256(server secret,
  user id) (`anonymous-reporter.ts`). Visibility "reported by me" = `reporterId = me OR anonymousReporterKey = key(me)`
  (`reportedByWhere`, `isReporter` in the policy), so the reporter keeps every reporter right (open, edit/submit/archive
  their draft, see confidential details and – open question 1 – the investigation and actions).
- What the reporter does on their own anonymous report (create, draft edits, submit, archive a draft) is audited with
  actor "Anonymous reporter", `actorId` null and **no IP address / browser** (`actsAsAnonymousReporter`). When someone
  who triages the incident acts, the audit names them as usual.
- Files attached in the wizard: `Attachment.uploadedById` null (column now nullable) and the upload session (which
  names the uploader) is deleted when used (`uploadService.consume(..., { forget: true })`).
- The wizard/outbox `clientId` is stored keyed (`anonymousClientId`) and the offline sync log keeps
  `{ anonymous: true, isDraft, created }` instead of the incident id, so "user X synced operation Y" does not point at
  the report.

**Trade-offs chosen**
1. **Hidden from everyone using OleoQ, not from someone who controls the server.** Whoever has database access AND the
   server secret (`AUDIT_SIGNING_SECRET`, else `BETTER_AUTH_SECRET`) can compute every user's key and find the reporter.
   Hosting request logs (Vercel/AWS) also hold IP addresses. Without the secret, the database only shows that two
   anonymous reports came from the same person (the key is per user, so "my reports" stays one indexed lookup).
2. **Changing the secret** cuts reporters off from their old anonymous reports (handlers unaffected) – one more reason
   to keep the secrets identical across environments (HANDOFF).
3. **Chosen once.** A draft saved under a name already has the name in its signed, append-only history, so the choice
   cannot be switched on later; switching off is not offered either (keep it simple). To change it: archive the draft
   and report again.
4. **No adding files after reporting.** The evidence list names who added each item, so the reporter of an anonymous
   report adds files only in the report itself (stored without a name) – unless they also triage or investigate it
   (`canAddReportEvidence`; the API refuses with 403). The Evidence tab explains why.
5. **Comments are allowed but warned about.** A comment shows the author; the reporter sees "You reported this
   anonymously. A comment shows your name …" above the comment box. Not blocked – a reporter may choose to reveal
   themselves to add detail.
6. **Content can identify.** Time of the report, the department/location chosen, the narrative, the people listed and
   the photos may narrow it down in a small team – the wizard says so; nothing tries to scrub it.
7. **No way to contact an anonymous reporter** (no two-way anonymous messaging) and no notifications to them about
   progress; they check the report themselves.
8. **Available for every type and every reporter**; no setting to switch it off yet (open question). Follow-up drafts
   raised from other modules are never anonymous. Anonymous does not imply Confidential (separate tick box).

## Follow-up contract (`follow-up.service.ts`) – for Audit / Inspection (later) and Law (used since 28 Oct 2026)
All run in the CALLER's transaction and are idempotent through `recordLinkService.ensure` (unique source key +
advisory lock): repeating a call for the same `source.type/id/key` returns the existing record (`created: false`).
```ts
raiseIncidentDraft(tx, user, { typeKey, subtypeLabel?, title, narrative?, placement, ownerId?, source:{ type, id, key?, label, href }, evidenceAttachmentIds? })
  → { incidentId, reference, created, isDraft }   // link kind "incident"; captures the type's published Report form;
                                                   // stays Draft while required answers/people are missing; ownerId = investigator
raiseAction(tx, user, { kind: "corrective-action" | "preventive-action", description, ownerId, dueDate, placement, reviewerId?, source })
  → { actionId, reference, created }               // no incident needed; origin kept on the action and its follow-ups
followUpStatus(targetType: "Incident" | "CorrectiveAction", targetId) → { resolved, label, href }
```
Type keys: `audit-non-conformance`, `inspection-finding`, `non-compliance` (`INCIDENT_TYPE_KEYS`) – since 27 Oct 2026
only `inspection-finding` is seeded; `non-compliance` is set up by the Law module (law.md), `audit-non-conformance` stays reserved for the Audit phase. Evidence ids
are copied (same stored object) onto the incident.

## UI (`src/features/incidents/`)
Nav "Incidents": Overview `/incidents`, Report incident `/incidents/new`, Incidents `/incidents/register`
(tabs Incidents · Investigations), Actions `/incidents/actions` (tabs Actions · Tasks), Reports `/incidents/reports`
(5 reports + Trends & prevention tab; CSV + print). Detail `/incidents/[id]` (one primary next step, More menu,
stepper, tabs Overview · People · Investigation · Actions · Evidence · Comments · History; exact blockers), edit
`/incidents/[id]/edit` (same wizard, opens on step 2), action detail `/incidents/actions/[id]` (tasks checklist, complete,
effectiveness review, follow-up tree, linked incidents, origin, trend snapshot + refresh). Configuration →
"Incident settings" `/configuration/incidents` (types & subtypes with Add type / rename, causes, reportees, export
columns, site question preview). Home: incident KPI cards + 4 charts; mobile bottom nav "Report"; Insights count.

Report wizard (`components/report/report-wizard.tsx`, product owner's request 27 Oct 2026) – 4 steps:
1. **Type of event** – only the type: large cards (icon per built-in type key, fallback icon for added types; name; the
   type's active subtypes as a 2-line preview so people can tell the types apart). Tapping a card goes straight to
   step 2; Next without a type shows "Choose the type of event to continue".
2. **What & where** – "Type of event: … · Change" row, subtype (when the type has several), title, date, severity,
   department, precise location, shift, target date, What happened?, the type's own Report questions.
3. **People & first aid**, 4. **Review & submit** (unchanged; Review's "Change" links jump to the right step).

Changing the type keeps everything not tied to it (`type-choice.ts` `applyTypeChoice`, tested): title, date, place,
people and every questionnaire answer – answers the new type's form does not ask stay in the wizard and come back on
switching back (the server drops answers to questions not in the captured form). The subtype last chosen for a type is
restored; confidential default, investigator count and an untouched target date follow the new type. Draft (type +
title) and offline queueing are unchanged. The wizard now renders the loading placeholder while the page hydrates – a
device-cached setup used to make React report a hydration mismatch (#418) on this page.

Action wording (product owner's request, 28 Oct 2026 – "remove the word preventive, leave just action"): the Actions
register button is **Add action** (was "Preventive action"), its sheet is titled **Add an action**, the register and the
incident's Actions tab descriptions say "Actions …" instead of "Corrective and preventive actions …", and the kind filter
reads "All kinds". The Corrective / Preventive **kind** is kept (data, filters, reports): the register's sheet no longer
asks for it (without incidents only Preventive is allowed, so it is set silently); the sheet opened from an incident still
offers Corrective / Preventive. Reports → Trends & prevention keeps "Create a preventive action" (that report creates
exactly that). Open question 18 in HANDOFF.

## Demo incident types (Port of Cork sheet, 27 Oct 2026)
Source: `Port of Cork Incident Module Templates 19022021.xlsx` (repo root, NOT committed), tabs "Incident Fields
As-Built" and "Investigation Fields As-Built" only. Each column is one type (its name is the red entry of the type
list). Types + subtypes → `INCIDENT_TYPE_CATALOGUE`; questions → `prisma/seed/incident-types.ts`
(`DEMO_INCIDENT_QUESTIONNAIRES`), published as one "‹Type› · Report" and one "‹Type› · Investigation" form per type
and bound to it. Applied by the seed (both demo tenants) and by `bash scripts/localdb.sh npm run
db:seed:incident-types` (existing database; refuses a non-local host unless `ALLOW_REMOTE_SEED=1`; idempotent).

| Type | Subtypes | Report questions | Investigation questions (after Findings + Root cause analysis) |
| --- | --- | --- | --- |
| Accident | 3 Days Accident (Reportable), AED Used, Damage, First Aid, Hypo, Minor Injury | Accident treated at · Was the employee detained? (yes/no) · Describe the work being done | heading "Investigation of Accident/Incident" · Cause details · Date & time of notification · Area owner (person) · Investigation of CAPAs communicated to area owner (yes/no) · Area comments (Risk/Law review) · 5 Why's · Root cause analysis required & attached (yes/no) |
| Complaint | Bad smell/odour, Dust, Light Pollution, Litter/visual, Marine, Noise nuisance, Traffic/pedestrian movement impact | Complainant name · Complainant address | Cause details · Date & time of notification · Area owner · CAPAs communicated · Area comments · Details of follow-up with complainant · Details of follow-up to close out source of complaint · 5 Why's · RCA attached |
| Dangerous Occurrence | Breathing Apparatus … Freight containers (10) | – | Cause details · Date & time of notification · Area owner · CAPAs communicated · Area comments · RCA attached · 5 Why's |
| Inspection Finding | Audit Finding, Issue raised at Safety Week, Safety Committee Meetings, WBV Monitoring | – | Cause details · Area owner · CAPAs communicated · Area comments · 5 Why's · RCA attached |
| Incident | Leaks, Litter, Not meeting internal monitoring limits, Spills, Release to air, Unplanned release to effluent/sewer, Wastage/inefficiency | – | as Inspection Finding |
| Near Miss | 3rd Parties, Behaviour, Equipment, Hazardous Goods, Manual Handling, Marine, PPE, RTA, Slips Trips Falls, Facilities | Plant / equipment in use | heading "Investigation" · Cause details · Area owner · CAPAs communicated · Area comments · RCA attached · 5 Why's |
| Occupational Health | Biological Hazard, Pandemic e.g. coronavirus, Hygiene, Noise / Vibration, Occupational Dust, Threatening or Abusive Behaviour, Vermin, Welfare, Fumes | – | heading "Occupational Health Issue" · as Near Miss |
| Safety Comment | Good Catch, Safety suggestion, Report a hazard | – | heading "Safety Comments Investigation" · Cause details · Area owner · CAPAs communicated · Area comments · RCA attached (no 5 Why's in the sheet) |
| Other (off – "Not turned on") | Incident involving a member of the public / an employee not work related | – | Accident witnessed by (name) · Cause of accident · Investigation outcome · Recommendation / suggested solution (if any) |

Sheet rows mapped to the standard incident controls (not repeated as questions – Form Builder duplicate rule):
Type, Sub Type, Description (= Incident title), Occurred Date & Time, Description free text (= What happened?),
Severity, Department, Location (from the department), Exact Location, Immediate Action, First Aid Outcome, Occupational
Health Notified, People Involved, Assigned to, Also Notify, Investigation Target Close Date; Environmental Impact,
H&S Impact, Basic Cause Types + Cause Types (= causes by group), Reportable, Reportable to, Number of Days Lost;
Other's "Choose location of incident" and "Persons Involved". "24 Hour Clock", "None" (empty subtype choice), the
"ACTUAL" stamps and the reviewer note "Add to templates…" are not fields. The duplicate rule now also knows
"Occupational health notified" and "Basic cause types".

Retired (old catalogue): Non Compliance, Environmental Incident, Audit Non Conformance and the old subtypes (General,
Lost time, Reportable injury, Vehicle movement, Slip / trip, Spill, Release, Waste, Major Non Conformance) – deleted
when nothing uses them, otherwise switched off (incidents keep their labels and captured forms). Types/subtypes an
administrator added are never touched; a type still bound to the old generic "Incident report / investigation" forms
(or to none) is re-bound to its own forms, other bindings are kept. The generic forms stay in Form Builder.

## Seed (`prisma/seed/incidents.ts`, idempotent)
Demo types + per-type forms every run (above); incidents only when a tenant has none. Northstar: 12 incidents covering
Draft, Open, Investigating, Action required, Action in progress, Awaiting effectiveness, Follow-up required (shared
action + ineffective + open follow-up), Ready to close, Closed, investigation-optional Open complaint, archived; 7
actions (tasks, preventive trend action). Oleo Demo: 2 incidents. Seeded incidents use the sheet's types/subtypes
(e.g. the oil spills are Incident → Spills).

## Deviations
- Investigations and Tasks are tabs of the Incidents / Actions registers; Trends & prevention is a Reports tab
  (spec lists them as separate areas). Settings live under Configuration.
- Export columns are ONE tenant-wide ordered list (setting `incident`), not per type; custom columns come from the
  bound report forms and are written only when the captured question is exportable.
- Causes and reportees are ordinary lookup lists (one list per fixed cause group / reportee kind), so they are also
  editable in Configuration → Lists. Injury type / body part are optional pick-lists next to free-text injury
  details (the brief asked for them; the spec excludes a structured injury taxonomy – nothing depends on them).
- Drafts are visible to people with `incident.view` in scope (needed for follow-up drafts raised from other modules).
- A follow-up incident draft is submitted immediately only if every gate passes (in practice it stays Draft: no
  people involved yet).
- Date/time of event is entered in the browser's time zone; "today" for review gates/overdue uses the company zone.
- Administrators can add and rename incident types (product owner's request, 27 Oct 2026). The spec says type names
  are fixed catalogue choices without a create/rename workflow.
- Port of Cork demo set: the standard report controls (severity, immediate action, first aid, nurse/OH notified,
  investigators, notify) show for EVERY type – the sheet lists some only for Accident; they cannot be hidden per type.
  "First Aid Outcome" is the standard free-text first aid field, so its choices (Return to Work / Sent Home / Sent to
  Doctor / Sent to Hospital) are not offered as a list. Every investigation form also has the mandatory Investigation
  findings + Root cause analysis questions (not in the sheet). Spelling slips in the sheet were corrected
  (Environmnetal, BioLogical, Occupatinal, imapct, monitoringLimits) and "Freight containers etc.. etc.. etc...."
  shortened to "Freight containers". Custom questions are optional (the sheet marks nothing as required).
- The mandatory "Site or location" answer is filled from the department; title/date/narrative come from the
  workflow's own controls (never typed twice). Repeated defaults in older snapshots are hidden, answers kept.

## Open questions / notes
- Anonymous reporting: should admins be able to switch it off (company-wide or per type)? Should an anonymous reporter
  get progress notifications (would store a notification row naming them)? Is "hidden in the app, not from someone
  with database access + server secret" strong enough, or is a whistleblowing-grade channel (no account link at all,
  receipt code instead) wanted? Should comments by the anonymous reporter be blocked rather than warned about?
- Anonymous smoke test (28 Oct 2026, **local DB only**): INC-2026-0016 "Anonymous smoke test - pallet stacked too high"
  (admin, wizard, 1 photo) and INC-2026-0017 "John anonymous test" (john, API); both Open.
- Port of Cork demo set: Law settled its side (28 Oct 2026 – Law sets up its own "Non Compliance" type, see law.md). Audit follow-ups still need a target type – re-add "Audit Non Conformance"
  or route audits to Inspection Finding → "Audit Finding" (as the sheet does)? Should First Aid Outcome become a choice
  list (needs a structured first-aid field)? The old Cork-only "Describe the marine area" site question is no longer
  seeded on a fresh database (Form Builder site questions still work).
- Incident types: may built-in types be renamed too (currently yes – key and history unaffected)? Should a new
  type start active straight away when a Report form is chosen (currently yes)? Should types be re-orderable
  (currently added types go last; the list is ordered by catalogue order)?
- Reporters without `incident.view` currently see the investigation and actions of their own report, and assigned
  investigators see confidential details. Confirm both with the product owner.
- Reopening an investigation does not reopen linked actions; is that enough for "closure unavailable until complete"?
- Action wording (28 Oct 2026): should the Corrective / Preventive kind be hidden everywhere (e.g. always Corrective when
  raised from an incident, Preventive otherwise) and dropped from filters/badges/CSV? Should "Trends & prevention" keep
  saying "preventive action"? The sidebar now also has a standalone **Actions** section (`docs/modules/actions.md`) –
  rename this module's "Actions" item to "Incident actions"?
- Smoke tests left data in Northstar: INC-2026-0013 (closed), INC-2026-0014 (draft from a smoke inspection source),
  INC-2026-0015 (browser draft), ACT-2026-0008…0010.
- Incident-type smoke test (27 Oct 2026, **local DB only**): types "Chemical exposure (COSHH)" (key
  `chemical-exposure`, active, subtypes General + Skin contact, 10 days, confidential by default) and "Smoke test
  inactive type" (inactive, no forms); incident INC-2026-0013 "Smoke test: solvent splash on forearm" (Investigating).
  Port of Cork smoke test: INC-2026-0014 "Smoke test: AED used at gate 3" (Accident → AED Used, Investigating with the
  Accident investigation form). Northstar also has a "Test" type (bound to a "My test" form) created in the app – not
  seed data, left alone. Wizard smoke test: INC-2026-0015 "Smoke test: wizard type step" (Accident → AED Used, draft).
