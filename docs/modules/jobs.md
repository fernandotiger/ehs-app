# Scheduled jobs + My work (Phase 3) – contracts for modules

Spec: `../skills/ehs-functional-rebuild/references/scheduled-jobs.md` (+ examples J-01…J-10).

## Plug in due work (the only thing a module does)
```ts
// src/server/modules/<module>/due-work.ts
export const incidentActionProvider: DueWorkProvider = {
  kind: "incident.action", module: "incidents", label: "Incident actions", jobTarget: true,
  async listOpen() { /* every OPEN item in the current tenant */ return items; },
  async listForUser(user) { /* optional fast path for My work */ },
};
// then add it to PROVIDERS in src/server/modules/jobs/providers.ts
```
`DueWorkItem = { provider, entityType, entityId, reference?, title, href, dueDate: "yyyy-mm-dd" (company-local),
ownerId, placement: { businessUnitId, siteId, locationId, departmentId }, reviewerId? }`.
- `reviewerId` = person responsible for the current step (e.g. effectiveness reviewer): reminders go to them, and
  `dueDate` must be that step's date (J-06). My work shows the item to owner and reviewer.
- Providers run inside the tenant context; return only eligible open work (e.g. Approved assessments with a review
  date, non-Completed tasks, non-Closed incidents with an unfinished investigation …, per the spec).
- Kinds (`src/lib/jobs.ts`): `risk.review | risk.task | incident.investigation | incident.action` (registered by
  the Incident and Risk modules) · `law.evaluation` + `law.task` (Law module, 28 Oct 2026) · `audit | inspection` (declared, **later**) · `document.acknowledgement`
  (registered now: My work and an optional job target) · `action` (standalone actions, 28 Oct 2026 – see `actions.md`;
  the daily `/api/cron/reminders` also sends a one-off overdue notice per action and due date).

## Data
`prisma/schema/jobs.prisma`: `ScheduledJob` (kind OVERDUE|UPCOMING|DIGEST, targets, scope type+id, frequency
DAILY|WEEKDAYS|WEEKLY|MONTHLY + weekday (0 = Sunday)/dayOfMonth, runTime "HH:mm", timeZone, overdueDays (≥1),
upcomingDays, recipients `{owners, roleIds}`, delivery INDIVIDUAL|DIGEST, channels `IN_APP` (+`EMAIL` = not
connected), escalation `{afterDays, roleIds}` (overdue only, ≥ overdueDays), enabled, version) and `JobRun` (trigger
TEST|MANUAL|SCHEDULED, startedAt, timeZone, localDate, outcome, matched/delivered/escalated counts, explanation, items
≤200; latest 500 per tenant kept).

## Engine (`src/server/modules/jobs/engine.ts`, pure, `engine.test.ts`)
`localParts/localDate` (job time zone) · `dateMatch` (today not overdue; upcoming window inclusive; digest = all open)
· `matchJob(job, items, roleHolders, today)` (targets, scope through placement, owner/reviewer + role holders whose
assignment covers the item, escalation recipients, de-duplicated) · `planIndividual` / `planDigests` /
`mergeDigestItems` · dedupe keys `job:<id>:<entityType>:<entityId>:<user>:<localDate>` and
`job:<id>:digest:<user>:<localDate>` · `scheduleDue(job, now, scheduledSuccessDates)` · `myWorkGroup`.

## Service & API (`job.service.ts`, `/api/configuration/jobs…`)
`GET/POST /jobs` (`?q&status=active|paused|all`) · `GET/PATCH /jobs/:id` (`expectedVersion`) · `PUT /jobs/:id/enabled`
· `POST /jobs/:id/test` (TEST run, delivers nothing) · `POST /jobs/:id/run` (MANUAL run, works while paused) ·
`GET /jobs/targets` · `GET /jobs/runs?jobId&outcome&trigger&page` · `GET /jobs/runs/:runId`.
Permissions (company scope): `config.jobs.view` / `.manage` / `.test` (Test and Run now).
Notifications: `jobs.reminder`, `jobs.escalation` (individual, via `notificationService.notify({ dedupeKeyFor })`) and
`jobs.digest` (`notificationService.upsertDigest` – re-runs add only new items and mark it unread; unchanged digests
are not re-delivered). The bell shows digest item links.

**Cron:** `GET /api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` → `forEachTenant(jobService.runDue)`.
Idempotent per job and local day, so trigger it as often as you like. Vercel Hobby: daily (`vercel.json`, 09:00 UTC –
jobs whose local run time is later than the trigger run the next time it fires after that time). AWS: EventBridge
Scheduler every 15 minutes (HTTP GET with the bearer header).

## My work
`myWorkService.list(user)` → `GET /api/my-work` → `{ today, items, counts, unavailable }`; groups Overdue / Due this
week (today … +6) / Later. `/my-work` page, `<MyWorkWidget />` (top 5) on Home.

## Seed (Northstar)
"Daily overdue reminders" (Risk + Incident targets, daily 08:00 Europe/Dublin, owners, escalate after 7 days to EHS
Manager, active) and "Weekly EHS digest" (Monday 09:00, EHS Manager role, digest, paused). Incident providers are registered (Phase 4, see `incidents.md`); Risk providers
`risk.review` / `risk.task` are registered too (Phase 5, see `risk.md`).

## Deviations / open points
- `document.acknowledgement` is also selectable as a job target (not in the spec's list; the Documents module keeps
  its own acknowledgement reminder cron – avoid targeting both).
- Email is never sent; selecting it only adds "Email is not connected" to run explanations.
- The bell's "live owner preview" for Risk reviews / Inspections (spec) is not built – it needs those providers.
- A provider error marks the run FAILED but other targets are still delivered.
