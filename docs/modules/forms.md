# Form Builder (Phase 3) – contracts for modules

Spec: `../skills/ehs-functional-rebuild/references/form-builder.md` (+ examples F-01…F-10). Built for **Risk and
Incident**; Audit, Inspection and Law are declared in the catalogue but not creatable yet (later).

## Data
`prisma/schema/forms.prisma` (migration `20261026142028_forms_jobs`):
- `FormDefinition` – name (unique per tenant), `module`, `purpose`, `status` (`DRAFT` = draft differs from the last
  published version or never published; `PUBLISHED` = draft equals it), `currentVersion` / `currentVersionId`, draft
  `fields` + `settings` (JSON), optimistic `version`.
- `FormVersion` – immutable copy (`fields`, `settings`, name, module, purpose, publisher). A DB trigger blocks
  UPDATE/DELETE/TRUNCATE. Publish = new row with `version + 1`.

## Module-facing contract (server, `src/server/modules/forms/`)
```ts
formService.listPublished(module, purpose?, { siteId? })  // latest published version per form → PublishedFormDto[]
formService.getVersion(versionId)                         // FormVersionDto (404 outside the tenant)
captureQuestionnaire(versionId, { siteId })               // QuestionnaireSnapshot – store it on the record
validateAnswers(snapshot, answers, { mode: "draft" | "submit" }) // { valid, errors: {key: message}, data }
formAvailableAtSite(settings, siteId)                     // Risk: form-level site availability
pendingUploads(snapshot, answers)  (src/lib/forms)        // upload ids in file answers → consume as evidence
repeatedDefaultKeys(fields, "REPORT" | "INVESTIGATION")   // Incident: hide repeated defaults of old snapshots
```
- Snapshot = `{ formId, versionId, version, name, module, purpose, siteId, fields (filtered for the site), settings,
  capturedAt }`. Republishing never changes it. Required only on submit; headings/scores never required; questions
  restricted to other sites are not in the snapshot.
- Module/purpose keys: risk → `5x5 | 3x3 | FMEA | CHECKLIST`; incidents → `REPORT | INVESTIGATION`; audits →
  `STANDARD | SCORABLE | EXPRESS`, inspections → `INSPECTION`, law → `LAW` (later, `available: false`).
- Mandatory questions have fixed keys (`systemQuestions()` in `src/lib/forms/catalog.ts`): Incident Report
  `incidentTitle, occurredAt, site, whatHappened`; Investigation `investigationFindings, rootCauseAnalysis`; Risk
  `riskTitle, hazard, site, likelihood, severity, riskScore (type score), owner, reviewDate`. Map them to workflow
  controls by key.
- Risk rules = Risk form settings (`RiskFormSettings` in `src/lib/forms/settings.ts`): method, domain, thresholds
  (null for Checklist), `reviewMonths` (6/12/24/36/48/60), `advanceNoticeDays` 0–365, `siteIds`, `footnote`.
  Scoring maths: `src/lib/risk/scoring.ts` (`hazardScore`, `fmeaScore`, `overallScore`, `riskBand`,
  `validateThresholds`, `FMEA_FACTORS`) – tested.

## Client (`src/features/forms/`)
- `<QuestionnaireForm snapshot value onChange errors readOnly />` – person → `UserPicker`, file → `uploadFile(f,
  "evidence")` storing `{ uploadId, fileName, sizeBytes }`, score → "Calculated automatically".
- `<QuestionnaireAnswers snapshot answers hideKeys? />` – read view (names for people, evidence links once stored).
- `<PublishedFormSelect module purpose? siteId? value onChange />` – value = version id; empty state links to Form Builder.
- Hooks (`api.ts`): `usePublishedForms`, `useFormVersion`, `useQuestionnaireSnapshot(versionId, siteId)`.

## API
`GET/POST /api/forms` (library; create draft) · `GET/PUT /api/forms/:id` (draft, `expectedVersion` → 409
`STALE_VERSION`) · `POST /api/forms/:id/publish` (optional unsaved design in the body; 422 lists every issue with
`fieldKey`) · `PUT /api/forms/:id/risk-rules` · `GET /api/forms/questions?q&excludeFormId` (≤10 de-duplicated
custom questions) · `GET /api/forms/published?module&purpose&siteId` · `GET /api/forms/versions/:id[/snapshot?siteId]`.
Permissions: library `forms.view`; drafts `forms.design`; publish `forms.publish` (both at **company** scope, like all
configuration); Risk rules on a published form `forms.publish` or `risk.configure`. Published lists/versions/snapshots:
any signed-in user of the tenant.

## Behaviour (as built)
- Screens: `/configuration/forms` (search by name/module, module filter, disabled preview with "as seen at site"),
  `/configuration/forms/[id]` (palette | canvas | inspector; inspector in a Sheet below 1280 px; native HTML5
  drag-and-drop + move up/down; add after the selected question or at the end; reuse search; banner "Draft – not used
  until published"; Save draft, Publish; unsaved-changes guard; stale-version alert). Risk forms have a "Scoring &
  review rules" tab.
- Server re-applies the canonical mandatory questions on every save (label/type/required/options; help text and order
  are kept) and runs all publication rules again on publish.
- Incident duplicate rule: `src/lib/forms/incident-rules.ts` – normalised labels (case, spacing, punctuation, & → and)
  against an explicit alias table (report defaults; investigation defaults; mandatory questions; "Description" →
  Incident title when short text, What happened? otherwise). Blocks reuse with a message naming the conflict; typed
  conflicts are shown inline and block Publish; publish re-validates server-side. No fuzzy matching.
- Incident per-question settings: searchable, exportable (default on), sites (none = all).
- Seed: Health & Safety 5×5, Environment FMEA, Workplace checklist (Northstar) and, per incident type, "‹Type› · Report"
  + "‹Type› · Investigation" from the Port of Cork sheet (`prisma/seed/incident-types.ts`, both demo tenants) – all
  published v1. Older databases keep the earlier generic "Incident report" (with the Cork-only "Describe the marine
  area") and "Incident investigation" forms, no longer bound to the demo types.

## Deviations / later
- A pending draft does NOT take the last published version out of use (F-06 says the form is unavailable while only
  Draft): modules keep getting the latest published version, so editing a form never stops reporting.
- Saving Risk rules on a published form publishes at once with the *published* questions; pending question changes
  stay in the draft. The method is fixed at creation (= purpose); domain can change (hazard label follows).
- Form names are unique per tenant. Unnamed "Untitled question"s block publication.
- Later: Audit settings + Scorable min/max/increment validation, Inspection and Law forms, conditional logic in the
  designer (the engine supports `showWhen`, the designer does not expose it), form archive.
