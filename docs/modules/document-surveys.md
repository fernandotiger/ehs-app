# Document surveys ("Employee Induction") – what exists

Whoever manages a document can add a short survey that the document's audience answers after opening it. Read with
`docs/PLATFORM.md`; the Documents module itself is described in `docs/DOCUMENTS_MODULE_MIGRATION.md`.

## Name: Employee Induction (28 Oct 2026)
Owner's decision: "The survey under the document module will be called 'Employee Induction'." Every string a person can
read now says *induction*; an induction is **completed** and its questions **answered**. Sidebar items are short
("My Inductions"), page titles name the thing ("My Employee Inductions").

| Where | Before | Now |
| --- | --- | --- |
| Sidebar (Documents) | My Surveys · Survey Library · Create survey | My Inductions · Induction Library · Create induction |
| Page titles (banner/header + browser tab) | My Surveys · Survey Library · Create survey · Survey | My Employee Inductions · Employee Induction Library · Create Employee Induction · Employee Induction |
| Library / create buttons | Create survey · Existing surveys · Search surveys | Create induction · Existing inductions · Search inductions |
| Induction page | tab Survey · Who has answered · Edit survey · Previous surveys · Close / Reopen / Replace survey | tab Induction · Who has completed it · Edit induction · Previous inductions · Close / Reopen / Replace induction |
| Builder | step 1 "Survey" · Survey title · Everyone must answer · Answer within | step 1 "Induction questions" · Induction title · Everyone must complete it · Complete within |
| Reader page | card "Survey" · **Answer survey** · checklist "3 Answer the survey" · "Thanks – you answered on …" · back link My Surveys | card "Employee Induction" · **Complete the induction** · "3 Complete the induction" · "Thanks – you completed this induction on …" · back link My Inductions |
| Reader status (My Inductions tabs, banner, rows) | To answer · Answered (Overdue · Optional · Closed) | To complete · Completed (Overdue · Optional · Closed unchanged) |
| Document-list pill | Survey to answer · Survey answered · Survey · Survey closed | Induction to complete · Induction completed · Induction · Induction closed |
| Participation / results | Answered · Not answered · Answers · Answer rate | Completed · Not completed · Completed · Completion rate |
| Notifications | New survey: <document> · Reminder: please answer the survey on <document> | New induction: <document> · Reminder: induction to complete – <document> |
| Dashboard widget "My acknowledgements" | N surveys to answer | N inductions to complete |
| My work / scheduled jobs | Answer survey: <document> · target "Document surveys" | Complete induction: <document> · target "Employee inductions" |
| Configuration → System settings | card "Document surveys" · Answer within | card "Employee inductions" · Complete within |
| History (audit labels) | Survey added / changed / closed / reopened / replaced · Answered the survey · Survey reminder sent · Survey answers exported | Induction … · Completed the induction · Induction reminder sent · Induction answers exported |
| Server messages (toasts) | "This survey is closed." etc. | "This induction is closed." etc. |
| CSV file name | `<title>-survey-answers-<date>.csv` | `<title>-induction-answers-<date>.csv` |

**Unchanged on purpose:** routes (`/documents/surveys…`), API paths (`/api/documents/…/survey…`, `?type=survey`), code
identifiers and file names, Prisma models/tables, audit action keys (`DOCUMENT_SURVEY_*`), notification types
(`document.survey_*`), due-work kind `document.survey`, settings key `documentSurvey`, offline operation
`document.survey_answer`, and demo seed data. Wording kept because it is about answering questions: "Answer anonymously",
"Send answers", "Please answer this question", "N answers" counts, the CSV column "Answered on". The generic
"New document: <title>" notification sent on publish is unchanged (see Open questions). The rest of this file still says
"survey" for the feature.

## Product decisions (implemented)
1. **One survey per document**, created **only on the Survey page** (Documents → Survey) together with its document; it goes
   live when the document is published. Owner's decision, 27 Oct 2026: no survey section on Upload document and no
   *Add survey* on existing documents (the API refuses it too). Documents that already had a survey keep it.
2. Readers answer **after opening the current version** (same evidence as acknowledging: a `DOCUMENT_FILE_ACCESSED` audit
   row for that version). With acknowledgement the checklist reads 1 Open · 2 Confirm · 3 Complete the induction.
   **The file is optional** (owner's decision, 27 Oct 2026): a survey without a file is a document with no version –
   readers answer straight away (`openedCurrentVersion` is true, the answer has no `versionId`, the response stores
   `documentVersionNumber = null`), the reader page shows "No file to read" and no acknowledgement card. Acknowledgement
   needs a file (`ACK_NEEDS_FILE`: refused on create and when switched on later; the switch is disabled with the reason).
   Such a survey can be published without a file; a file can be added later via Versions → Upload new version, after
   which new answers need the file opened first (online; offline answers queued before keep no version).
3. **Mandatory** = "Everyone must complete it" + "Complete within N days" (default from settings, 14). Unanswered mandatory
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
- Notifications: `document.survey_required` / `document.survey_available` ("New induction: <document>") on publish and on
  replace; `document.survey_reminder` ("Reminder: induction to complete – <document>", dedupe per user per day).
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
- Menu (Documents section): My Documents · Document Library · **My Inductions** (everyone) · **Induction Library** (manage or
  acknowledgement reports) · **Create induction** (`documents.manage`). Before 28 Oct 2026: My Surveys · Survey Library ·
  Create survey (the last one was first called "Survey").
- **My Employee Inductions** `/documents/surveys` (`components/survey/my-surveys.tsx`): like My Documents – banner To complete /
  Overdue / Completed, tabs All · To complete · Completed, search, rows with To complete / Overdue / Optional / Completed /
  Closed (+ any acknowledgement still to give), "With a file to read". Rows open the reader page.
- **Employee Induction Library** `/documents/surveys/library` (`components/survey/survey-library.tsx`): like the Document
  Library – *Create induction* button, search, status, **Created by me / anyone**; columns Induction (with a file / no file) ·
  Status · Answers (+ "Everyone must complete it", Closed) · Audience · Updated. Rows open the induction page.
- **Induction page** `/documents/surveys/library/[id]` (`components/survey/survey-manage.tsx`): header with status, induction
  state, "No file" / "File · version N", actions (View as employee, Publish, Archive/Restore). Tabs **Induction** (summary card
  with Close/Reopen, Results · Who has completed it · Edit induction · Previous inductions) · **Settings** (who should complete it +
  acknowledgement – no document details) · **File** (add / replace the optional file) · **Acknowledgements** (only when
  required) · **History**. `/documents/manage/[id]` redirects surveys here and this page redirects plain documents back
  (`documentQueryService.isSurvey`). The document page no longer has a Survey tab.
- A survey's document title and description follow the survey's title and introduction (edit and replace update both;
  titles stay unique among active documents and surveys).
- **Create Employee Induction** `/documents/surveys/new`: 1 Induction questions (builder with preview + "Start from an example" *Understanding check* / *Feedback*,
  which replaces the questions with undo) · 2 File (optional – what people read before answering) · 3 Who should have
  access? · 4 Acknowledgement (**off by default** – the induction has its own "Everyone must complete it"; only available with a
  file, removing the file switches it off) · Save as draft /
  Publish now → induction page. *Existing inductions* opens the Induction Library.
  No document details are asked (`components/survey/new-survey-form.tsx`).
- `/documents/manage/new` (Upload document): file · details · access · acknowledgement – no survey section any more.
- Back links follow the list a survey belongs to: reader page → My Inductions (`DocumentViewerDto.isSurvey`, its *Manage*
  button opens the induction page), induction page → Induction Library.
- `/documents/manage/[id]` (documents only): Overview · Versions · Acknowledgements · History – no survey tab or *Add survey*
  button (`add-survey-card.tsx` was removed).
- `/documents/[id]`: "Employee Induction" card under the acknowledgement panel (first card after the preview on phones when
  nothing is left to acknowledge) with **Complete the induction**, answer sheet with "Answer anonymously". Dashboard widget
  "My acknowledgements": "N inductions to complete" links to My Inductions.

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
- An induction published from Create induction sends two notifications ("New document: …" + "New induction: …"), as an
  upload with a survey did before; merge them into one (and drop "New document" for inductions)?
- Employee Induction (28 Oct 2026): inductions usually prove that *each person* understood – should "Let people answer
  anonymously" default to **off** for inductions, or be removed? (Still on by default; anonymous completions count as
  Completed, but nobody can see whose answers they are.)
- Should the *Feedback* example ("How clear and useful is it, and any suggestions?") stay, or be replaced by an
  induction-style example (e.g. "Site rules check")? *Understanding check* fits inductions as is.
- Results still count "answers" ("12 answers", CSV column "Answered on") while people see Completed / Not completed – change
  those to "completed" too?
- Someone with direct database access can still correlate rows by transaction id / physical order or by same-day
  participation; closing that needs delayed, batched inserts of anonymous responses.
- A creator polling results after the threshold is reached can diff counts against "Who has answered"; releasing
  anonymous results in daily batches would prevent that.
- Should managers outside the audience be able to answer (currently 422 "for the people this document is assigned to")?
- Reminders for mandatory surveys are manual ("Send reminder") or via scheduled jobs; no automatic cadence like acknowledgements.
