# Actions (standalone) – what exists

Product owner's request (28 Oct 2026): "On the left side-bar menu, before the menu Configuration, add a new option called
Action and the submenus 'My Actions' and 'Create Action' where users can create Actions that are not related to anything
else like risk or incident. Its form can be built in form builder, but create in its table the mandatory fields that an
action should have; also some cron job can run later and check things like overdue and so on."

Read with `docs/PLATFORM.md` and `docs/modules/{platform,forms,jobs}.md`. There is no functional spec for this module –
the decisions below are defaults chosen during the build (see "Decisions" and "Open questions").

## Module and permissions
- Module key **`actions`** (`src/lib/modules.ts`) – switchable per tenant like the others. Northstar is provisioned with
  every module; the migration switches it on for **every existing tenant** (data statement, idempotent).
- Permissions (`src/lib/permissions.ts`, group "Actions"):
  - `action.view` – see every standalone action in scope (everyone always sees actions they own or created);
  - `action.create` – create actions and assign them to anyone;
  - `action.manage` – edit / reassign / cancel / reopen / complete anyone's action in scope (the owner stays the owner).
- Default roles (`src/lib/default-roles.ts`): every role that includes the Employee set gets `action.create`; Manager (and
  so EHS Manager) also gets `action.view` + `action.manage`; Administrator has everything. The migration adds the same keys
  to existing **system roles by key** (custom roles are not touched).

## Data (`prisma/schema/actions.prisma`, migration `20261028115349_actions`)
`Action` (`actions` table): `organizationId`, `reference` (`action` numbering → `AC-2026-0001`, editable in Configuration →
Numbering), `clientId` (idempotent create, unique per tenant), `title`, `description`, `priority` (re-uses the Incident
enum `ActionPriority`: LOW | NORMAL | HIGH | URGENT), `status` (`ActionStatus`: OPEN | IN_PROGRESS | COMPLETED | CANCELLED),
`ownerId` (assignee), `createdById`, `dueDate` (DATE), `startedAt`, completion (`completedOn` DATE, `completedAt`,
`completedById`, `completionNotes`), cancellation (`cancelledAt`, `cancelledById`, `cancelReason`), the four placement
columns, the captured Form Builder form (`formId`, `formVersionId`, `form` = QuestionnaireSnapshot, `answers`), `version`
(optimistic concurrency), `archivedAt` (soft delete – no screen yet), timestamps. Indexes per tenant on site, status + due,
owner + status, creator. Registered in `PLACED_MODELS` (`action`). No relation to incidents or risks.

The migration is additive (new enum + table + indexes) plus two idempotent data statements: append `actions` to
`organizations.enabledModules` and append the new keys to system roles. Both are safe to run on Neon with the next deploy.

## Rules (pure, tested)
- `src/server/modules/actions/workflow.ts` (+ `workflow.test.ts`): To do → In progress → Completed; To do can be completed
  directly; To do / In progress → Cancelled (reason required); Completed / Cancelled → reopen → To do (completion and
  cancellation details are cleared, the history keeps them). Save gates: title (≤200), owner, due date (not in the past on
  create; on edit an unchanged past date stays valid, a new one may not be before the creation day). Completion: notes +
  a date between creation and today (company-local). `nextStep()` = the ONE primary button; `lifecycle()` = stepper.
  Overdue is derived (`isActionOverdue` in `src/lib/actions.ts`): open work with a due date before today.
- `action-access.policy.ts` (+ test): visible = `action.view` scope OR owner OR creator (same `where` for list, detail,
  history, evidence/comments → 404 otherwise); create = `action.create` covering the chosen department (anywhere without
  one); start/complete = owner or `action.manage` at the placement; edit/cancel/reopen = creator or `action.manage`.

## Server (`src/server/modules/actions/`)
`action.service.ts` (create / update / start / complete / cancel / reopen – each in a transaction with `recordAudit`;
`version` checked with guarded `updateMany` → 409 `STALE_VERSION`; gates → 422 `details.blockers`; file answers consumed
as evidence on the action), `action-query.service.ts` (list with views, summary, detail with rights + next step, history),
`action.entity.ts` (entity registry `Action` → evidence, comments, links), `due-work.ts`, `overdue.ts`, `support.ts`.

Notifications: `action.assigned` (to a new owner other than the actor, dedupe per action + owner), `action.completed` (to
the creator), `action.cancelled` / `action.reopened` (to the owner), `action.overdue` (see below).

## Form Builder (extra questions)
Module `actions`, purpose **`ACTION`** ("Extra action questions", `src/lib/forms/catalog.ts`, creatable now). There are no
mandatory Form Builder questions – the mandatory action fields are table columns on the fixed part of the form. Create
Action shows the latest published Actions form for the chosen department's site under "More details" (with several
published forms a "Type of action" select picks one; with none the section is hidden). The version is captured on the
action (`form` snapshot + `answers`) and never changes when the form is republished; required questions are enforced on
create and on edit (server and client). Demo form: **"Action details"** (category, estimated cost, work permit).

## Due work, scheduled jobs and the overdue check
- Due-work provider `action` (`src/lib/jobs.ts`, registered in `src/server/modules/jobs/providers.ts`): open actions → owner,
  due = due date. They show in **My work** and are selectable as a **Scheduled jobs** target ("Actions") for overdue /
  upcoming reminders, escalation and digests. The seeded "Daily overdue reminders" job now includes it.
- **Overdue notice** (`overdue.ts`, run by the daily cron `GET /api/cron/reminders` for tenants with the module): each owner
  gets ONE "AC-… is overdue" notification per action and due date (`dedupeKey action.overdue:<id>:<due date>` – moving the
  due date and missing it again notifies once more). Repeated reminders/escalation come from Scheduled jobs.

## API (`/api/actions…`, module `actions`)
`GET /api/actions?view=mine|assigned|created|all&status=ACTIVE|ALL|<status>&priority&overdue&q&page&pageSize&sort&dir`
(default: mine = assigned to me or created by me, open work) · `POST /api/actions` · `GET /api/actions/summary` ·
`GET/PUT /api/actions/:id` · `POST /api/actions/:id/{start,complete,cancel,reopen}` · `GET /api/actions/:id/history`.

## UI (`src/features/actions/`, pages `src/app/(app)/actions/**`)
- Sidebar section **Actions** just before Configuration: **My Actions** `/actions` (everyone with the module) and
  **Create Action** `/actions/new` (`action.create`). Works with the fold-to-icons sidebar like the other sections.
- **My Actions**: banner + Create action, stat cards (Assigned to me · Overdue · Due this week · Created for others), tabs
  All mine · Assigned to me · Created by me (+ Everyone's with `action.view`), search, status / priority / overdue filters,
  table on desktop and cards on phones, red "Overdue" badge, server pagination.
- **Create Action**: one page – What needs to be done? *, Details, Who will do it? * (defaults to me), Due date * (+14 days),
  Priority, Where (department, defaults to mine, "Whole company" allowed), then "More details" (Form Builder questions).
  Inline validation, unsaved-changes guard, retry toast, idempotent submit.
- **Action detail** `/actions/[id]`: header with reference, status (Overdue in red), priority; ONE primary button (Start
  work → Complete action → Reopen, per the viewer's rights); More menu (Mark as done, Edit action, Cancel action); stepper;
  tabs Overview (details, captured answers, completion / cancellation card, next step) · Evidence · Comments · History.
- **Home**: "Actions" widget (same four counts, linking to filtered My Actions).

## Seed
`prisma/seed/actions.ts` (`applyDemoActions`, part of the Northstar seed; existing databases:
`bash scripts/localdb.sh npm run db:seed:actions`, local unless `ALLOW_REMOTE_SEED=1`): publishes "Action details", adds
the `action` target to "Daily overdue reminders", and creates 7 actions (2 overdue – John's ladder step and Sam's fire exit,
one due this week, one with answers, one completed, one cancelled) with audit rows; counter `action:<year>` set.
Applied to the LOCAL DB on 28 Oct 2026 (not Neon).

## Decisions (defaults chosen – easy to change)
- Section title "Actions" (plural like the other sections); items "My Actions" / "Create Action" as the owner wrote them.
- Statuses To do / In progress / Completed / Cancelled; no effectiveness review (that stays an Incident concept).
- Employees can create actions and assign them to anyone; the owner cannot edit the action (only work on it), the creator
  can edit, cancel and reopen; managers in scope can do everything without becoming the owner.
- One-off overdue notice from the daily cron + configurable repeats via Scheduled jobs (no hard-coded reminder cadence).
- No offline queueing for actions yet (Create needs a connection); no archive screen; no CSV export.

## Smoke test (28 Oct 2026, local DB, `next start` :3101)
Admin: sidebar section + fold to icons, My Actions, validation, AC-2026-0008 created with "Action details" answers →
started → completed → history; Test run of "Daily overdue reminders" matched AC-2026-0001 (John) and AC-2026-0003 (Sam);
cron reminders: 2 overdue notices, 0 on the repeat. John (API): sees only his own + created actions, 404 on Emma's
action/history/evidence, 403 editing Sarah's action, 409 stale start, started AC-2026-0001. 375 px: no horizontal scroll.

## Open questions
1. Section name: "Actions" or "Action" (owner's words)? The Incidents menu also has an "Actions" item (incident actions) –
   rename that one to "Incident actions" to avoid confusion?
2. Should employees be allowed to assign actions to anyone (now yes), or only to themselves / their team?
3. Should the owner be able to edit the due date (e.g. ask for more time) or decline an action?
4. Should completing an action need a check by the creator (verification step), like incident effectiveness reviews?
5. Repeating actions (e.g. monthly checks)? Archive/delete screen? CSV export? Offline create?
6. Should the overdue notice also go to the creator or the owner's line manager (now only the owner; escalation is
   available through Scheduled jobs)?
