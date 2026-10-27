# Document surveys – what exists

Whoever manages a document can add a short survey that the document's audience answers after opening it. Read with
`docs/PLATFORM.md`; the Documents module itself is described in `docs/DOCUMENTS_MODULE_MIGRATION.md`.

## Product decisions (implemented)
1. **One survey per document**, created **only on the Survey page** (Documents → Survey) together with its document; it goes
   live when the document is published. Owner's decision, 27 Oct 2026: no survey section on Upload document and no
   *Add survey* on existing documents (the API refuses it too). Documents that already had a survey keep it.
2. Readers answer **after opening the current version** (same evidence as acknowledging: a `DOCUMENT_FILE_ACCESSED` audit
   row for that version). With acknowledgement the checklist reads 1 Open · 2 Confirm · 3 Answer the survey.
   **The file is optional** (owner's decision, 27 Oct 2026): a survey without a file is a document with no version –
   readers answer straight away (`openedCurrentVersion` is true, the answer has no `versionId`, the response stores
   `documentVersionNumber = null`), the reader page shows "No file to read" and no acknowledgement card. Acknowledgement
   needs a file (`ACK_NEEDS_FILE`: refused on create and when switched on later; the switch is disabled with the reason).
   Such a survey can be published without a file; a file can be added later via Versions → Upload new version, after
   which new answers need the file opened first (online; offline answers queued before keep no version).
3. **Mandatory** = "Everyone must answer" + "Answer within N days" (default from settings, 14). Unanswered mandatory
   surveys count as *Action required* / *To do*, appear in My work and can be targeted by scheduled jobs.
4. **Anonymous**: "Let people answer anonymously" (on by default); the reader ticks "Answer anonymously".
5. **Answers are final** (append-only). A repeat submit or offline replay returns the existing participation.
6. **Questions lock after the first answer.** Still editable: title, intro, mandatory, due days, anonymity off → on
   (never on → off once anonymous answers exist), close/reopen, **Replace survey** (old survey + results kept read-only
   under *Previous surveys*; everyone can answer the new one).
7. A new document version does not reset the survey; each response stores the version number it was given on.
8. Types in plain words: **Text answer**, **One choice**, **Several choices**; 1–20 questions, 2–20 unique options,
   text answers ≤ 2000 characters, "Answer required" per question (default on).

## Privacy design
- `DocumentSurveyResponse` (answers) and `DocumentSurveyParticipation` ("who took part", `@@unique([surveyId, userId])`)
  are separate rows with no link. Anonymous responses have `respondentId = null`, only `submittedOn` (DATE, company-local
  day) and a `crypto.randomUUID()` id; answer ids are random uuids too. The `DOCUMENT_SURVEY_ANSWERED` audit entry holds
  `{ surveyId, source }` only. No notification is sent to the creator per answer.
- **k-anonymity** (`documentSurvey.anonymityThreshold`, default 3, 1–10): anonymous answers are left out of every count,
  chart, text list and the CSV until at least k exist ("2 anonymous answers will show once there are at least 3").
- Text answers are listed alphabetically (then by random id); anonymous ones never show date or version. The CSV writes
  "Anonymous" with empty email/department/date/version. Participation lists show Answered (with the day) / Not answered
  only. The reader's own receipt infers "(anonymously)" from *participation without a named response*.
- Responses, answers and participation are append-only (DB triggers in migration `document_surveys`).

## Data (`prisma/schema/document-surveys.prisma`, migrations `20261027083339_document_surveys`, `20261027115622_survey_optional_file`)
`DocumentSurvey` (status ACTIVE|CLOSED|REPLACED, `version`, `mandatorySince`, `closedAt`, `replacedAt`),
`DocumentSurveyQuestion` (position, type TEXT|SINGLE|MULTIPLE, label, help, required, options[]),
`DocumentSurveyResponse` (`documentVersionNumber` nullable – no file), `DocumentSurveyAnswer` (text | choices[]), `DocumentSurveyParticipation`. All carry `organizationId`.

## Server (`src/server/modules/documents/`)
- `survey-rules.ts` (pure, `survey-rules.test.ts`): normalisation, answer validation, lock rules, can-answer guard,
  k-anonymity, reader status ANSWERED|REQUIRED|OPTIONAL|OVERDUE|CLOSED, due dates, CSV rows. Zod: `src/lib/validation/document-surveys.ts`.
- `survey.service.ts` (create/update with version check, close/reopen/replace, answer, reminders, manage + reader views),
  `survey-results.ts` (SQL aggregation incl. `unnest(choices)`, paginated text answers, participation, streamed CSV),
  `survey-summary.ts` (library / My Documents indicators, surveys to answer), `survey-audit-actions.ts`.
- Access: edit = `documents.manage`; results/participation/export/remind = manage or acknowledgement reports; answer =
  document visible + published + in the audience (others: 404 when not visible, 422 when visible but not assigned).
- Notifications: `document.survey_required` / `document.survey_available` ("New survey: <document>") on publish and on
  replace; `document.survey_reminder` (dedupe per user per day).
- Due work: provider `document.survey` (`due-work.ts`, kind in `src/lib/jobs.ts`); due = max(published, became mandatory,
  person joined) + days. Offline: operation `document.survey_answer` (`src/lib/offline/operations.ts`, `sync-handlers.ts`).
- Settings: registry key `documentSurvey` (`src/lib/settings/document-survey.ts`), card in Configuration → System settings.

## Endpoints (`/api/documents/:id/survey…`, module `documents`)
`GET` (manage view) · `PUT` (edit, `expectedVersion` required; 422 when the document has no survey) · `POST close|reopen|replace` · `GET results[?surveyId]`
· `GET results/text?questionId&page` · `GET participation?status=answered|not_answered&q&departmentId&page` ·
`POST remind` · `GET export[?surveyId]` (CSV) · `GET mine` · `POST answer`. `POST /api/documents` accepts `survey` (only used internally now).
`POST /api/documents/surveys` (Survey page, `documents.manage`): `{ survey, audience, ack, uploadId, publish }` →
`documentService.createSurvey()` – the document takes the survey title as title and the introduction as description,
no reference code, uncategorised (all editable later on the manage page). `GET /api/documents?type=document|survey
[&createdBy=me]` (default `document`) serves the Document Library / Survey Library. `GET /api/documents/surveys/my?filter=
all|todo|answered&q` serves My Surveys (`documentQueryService.mySurveys`, summary `{ total, toAnswer, overdue, answered }`).

**Surveys are listed apart from documents** (owner's decision, 27 Oct 2026). A "survey" is a document with a current
survey (`surveyDocumentsWhere()` in `survey-summary.ts`; no extra column – surveys are only created on the Survey page).
My Documents, the Document Library and the compliance totals leave surveys out; My Surveys and the Survey Library list
only surveys. Documents that got a survey before this change (demo data) now count as surveys.

## UI
- Menu (Documents section): My Documents · Document Library · **My Surveys** (everyone) · **Survey Library** (manage or
  acknowledgement reports) · **Create survey** (`documents.manage`; the item was first called "Survey").
- **My Surveys** `/documents/surveys` (`components/survey/my-surveys.tsx`): like My Documents – banner To answer / Overdue /
  Answered, tabs All · To answer · Answered, search, rows with To answer / Overdue / Optional / Answered / Closed (+ any
  acknowledgement still to give), "With a file to read". Rows open the reader page.
- **Survey Library** `/documents/surveys/library` (`components/survey/survey-library.tsx`): like the Document Library –
  *Create survey* button, search, status, **Created by me / anyone**; columns Survey (with a file / no file) · Status ·
  Answers (+ "Everyone must answer", Closed) · Audience · Updated. Rows open the survey page.
- **Survey page** `/documents/surveys/library/[id]` (`components/survey/survey-manage.tsx`): header with status, survey
  state, "No file" / "File · version N", actions (View as employee, Publish, Archive/Restore). Tabs **Survey** (summary card
  with Close/Reopen, Results · Who has answered · Edit survey · Previous surveys) · **Settings** (who should answer +
  acknowledgement – no document details) · **File** (add / replace the optional file) · **Acknowledgements** (only when
  required) · **History**. `/documents/manage/[id]` redirects surveys here and this page redirects plain documents back
  (`documentQueryService.isSurvey`). The document page no longer has a Survey tab.
- A survey's document title and description follow the survey's title and introduction (edit and replace update both;
  titles stay unique among active documents and surveys).
- **Create survey** `/documents/surveys/new`: 1 Survey (builder with preview + "Start from an example" *Understanding check* / *Feedback*,
  which replaces the questions with undo) · 2 File (optional – what people read before answering) · 3 Who should have
  access? · 4 Acknowledgement (**off by default** – the survey has its own "Everyone must answer"; only available with a
  file, removing the file switches it off) · Save as draft /
  Publish now → survey page. *Existing surveys* opens the Survey Library.
  No document details are asked (`components/survey/new-survey-form.tsx`).
- `/documents/manage/new` (Upload document): file · details · access · acknowledgement – no survey section any more.
- Back links follow the list a survey belongs to: reader page → My Surveys (`DocumentViewerDto.isSurvey`, its *Manage*
  button opens the survey page), survey page → Survey Library.
- `/documents/manage/[id]` (documents only): Overview · Versions · Acknowledgements · History – no survey tab or *Add survey*
  button (`add-survey-card.tsx` was removed).
- `/documents/[id]`: Survey card under the acknowledgement panel (first card after the preview on phones when nothing
  is left to acknowledge), answer sheet with "Answer anonymously". Dashboard widget "My acknowledgements": "N surveys to
  answer" links to My Surveys.

## Deviations
- Added `DocumentSurvey.mandatorySince` (switching "Everyone must answer" on later does not make people overdue at once).
- Extra endpoint `results/text` for "Show more". `PUT` used to create a survey without `expectedVersion`; since the Survey
  page it only edits (`surveyService.update`).
- Survey due-work items use entity type `DocumentSurvey` (job dedupe keys must not collide with acknowledgements).
- Fixed a pre-existing bug: streamed CSV exports (acknowledgements too) lost the tenant context in production builds
  (`csvStreamResponse` now binds the page producer to the request's async context).
- Smoke test ran against `next start` on port 3101 (another `next dev` already held the project's dev lock).
- Survey page (27 Oct 2026): smoke-tested on `next start` :3101 against the local database (validation errors, example
  questions, publish → manage page, library `?type=survey`, Upload page without survey, 375 px). Launch config
  `ehs-localdb-start` in `.claude/launch.json` runs that server (never the Neon `.env`).

## Open questions
- A survey published from the Survey page sends two notifications (new document + new survey), as an upload with a
  survey did before; merge them into one?
- Someone with direct database access can still correlate rows by transaction id / physical order or by same-day
  participation; closing that needs delayed, batched inserts of anonymous responses.
- A creator polling results after the threshold is reached can diff counts against "Who has answered"; releasing
  anonymous results in daily batches would prevent that.
- Should managers outside the audience be able to answer (currently 422 "for the people this document is assigned to")?
- Reminders for mandatory surveys are manual ("Send reminder") or via scheduled jobs; no automatic cadence like acknowledgements.
