# Document surveys ("Response forms") – what exists

Whoever manages a document can add a short survey that the document's audience answers after opening it. Read with
`docs/PLATFORM.md`; the Documents module itself is described in `docs/DOCUMENTS_MODULE_MIGRATION.md`.

## Name: Response forms (30 Oct 2026; "Employee Induction" 28–30 Oct)
Owner's decision, 30 Oct 2026: "Now Induction should be renamed to 'Response Forms'." Every string a person can read now
says *response form*; a response form is **completed** (the status words stay as they were for inductions: To complete ·
Overdue · Completed) and its questions **answered**. Menu items and page titles are title case ("My Response Forms",
"Create Response Form"); buttons and sentences use lower case ("Create response form").

| Where | Survey (to 28 Oct) | Induction (28–30 Oct) | Now |
| --- | --- | --- | --- |
| Sidebar (Documents) | My Documents · Document Library · My Surveys · Survey Library · Create survey | My Documents · Document Library · My Inductions · Induction Library · Create induction | **My Documents · My Response Forms · Document Library** (library and create moved into the Document Library – see Layout) |
| Page titles (banner/header + browser tab) | My Surveys · Survey Library · Create survey · Survey | My Employee Inductions · Employee Induction Library · Create Employee Induction · Employee Induction | My Response Forms · Document Library (Response forms tab) · Create Response Form · Response Form |
| Library / create buttons | Create survey · Existing surveys · Search surveys | Create induction · Existing inductions · Search inductions | Create response form · Existing response forms · Search response forms |
| Response form page | tab Survey · Who has answered · Edit survey · Previous surveys · Close / Reopen / Replace survey | tab Induction · Who has completed it · Edit induction · Previous inductions · Close / Reopen / Replace induction | tab Response form · Who has completed it · Edit response form · Previous response forms · Close / Reopen / Replace response form; back link **Document Library** (Response forms tab) |
| Builder | step 1 "Survey" · Survey title · Everyone must answer · Answer within | step 1 "Induction questions" · Induction title · Everyone must complete it · Complete within | step 1 "Response form questions" · Response form title (placeholder "e.g. Manual handling – understanding check") · Everyone must complete it · Complete within |
| Reader page | card "Survey" · **Answer survey** · "3 Answer the survey" · back link My Surveys | card "Employee Induction" · **Complete the induction** · "3 Complete the induction" · back link My Inductions | card "Response form" · **Complete the response form** · "3 Complete the response form" · "Thanks – you completed this response form on …" · back link My Response Forms |
| Reader status (My Response Forms tabs, banner, rows) | To answer · Answered | To complete · Completed | unchanged: To complete · Completed (Overdue · Optional · Closed) |
| Document-list pill | Survey to answer · Survey answered · Survey · Survey closed | Induction to complete · Induction completed · Induction · Induction closed | Response form to complete · Response form completed · Response form · Response form closed |
| Participation / results | Answered · Not answered · Answers · Answer rate | Completed · Not completed · Completed · Completion rate | unchanged |
| Notifications | New survey: <document> · Reminder: please answer the survey on <document> | New induction: <document> · Reminder: induction to complete – <document> | New response form: <document> · Reminder: response form to complete – <document> |
| Dashboard widget "My acknowledgements" | N surveys to answer | N inductions to complete | N response forms to complete |
| My work / scheduled jobs | Answer survey: <document> · target "Document surveys" | Complete induction: <document> · target "Employee inductions" | Complete response form: <document> · target "Response forms" |
| Configuration → System settings | card "Document surveys" · Answer within | card "Employee inductions" · Complete within | card "Response forms" ("created under Documents → Document Library → Create response form") · Complete within |
| History (audit labels) | Survey added / changed / … · Answered the survey | Induction added / changed / … · Completed the induction | Response form added / changed / closed / reopened / replaced · Completed the response form · Response form reminder sent · Response form answers exported |
| Server messages (toasts) | "This survey is closed." etc. | "This induction is closed." etc. | "This response form is closed." etc. |
| CSV file name | `<title>-survey-answers-<date>.csv` | `<title>-induction-answers-<date>.csv` | `<title>-response-form-answers-<date>.csv` |
| Offline outbox label | Survey answers for <document> | Induction answers for <document> | Response form answers for <document> |
| Favourites default titles | – | My Inductions · Induction Library · Create induction | My Response Forms · Document Library – Response forms · Create response form · Manage response form |

**Unchanged on purpose:** routes (`/documents/surveys…`), API paths (`/api/documents/…/survey…`, `?type=survey`), code
identifiers and file names, Prisma models/tables, audit action keys (`DOCUMENT_SURVEY_*`), notification types
(`document.survey_*`), due-work kind `document.survey`, settings key `documentSurvey`, offline operation
`document.survey_answer`, the Favourites seed key `survey.new`, and demo seed data. Notifications, audit rows and favourite
titles saved before keep their words. Wording kept because it is about answering questions: "Answer anonymously", "Send
answers", "Please answer this question", "N answers" counts, the CSV column "Answered on". The "Induction" example tag on
Upload document and the Law / Simplified law texts about site inductions are domain words, not this feature. The generic
"New document: <title>" notification sent on publish is unchanged (see Open questions). The rest of this file still says
"survey" for the feature.

## Layout: response forms in the Document Library (30 Oct 2026)
Owner's request (same day): the Documents menu has only *My Documents*, *My Response Forms* and *Document Library*; the
Document Library shows the response form library too, with **Upload document** and **Create response form** on top.
The first version also put the response form numbers and both buttons on My Documents; the owner corrected that the same
day: "The grids 'To complete', 'Overdue' and 'Completed' from the former 'My Response Forms' should be in the 'Document
Library' and not in 'My Documents' as 'Document Library' now shows both. The same logic for the buttons … both should be
in 'Document Library' too. Also add the button 'Create Response Forms' to 'My Response Forms' page." And then: "my
documents should have only the 'Upload document' button, not both buttons". Last, for the library banner: "remove the link
'Your response forms' … it should show the grids 'To do', 'Overdue', 'Documents' for Documents like in 'My Documents' and
'To complete', 'Overdue' and 'Completed' like in 'My Response Forms' but the numbers should be the real values according to
the tables showing in this page … These grids have no dependence of the tabs, they should always be shown at the blue
banner. I liked a small vertical line idea separating the grids". Decisions:
1. **Document Library = two tabs**: **Documents** (default) and **Response forms** (`?tab=forms`: the former Survey /
   Induction Library table with search, status and **Created by me / anyone**). The tab is in the URL (`useUrlTab`), so
   Back/Forward and Favourites keep it ("Document Library – Response forms"). Switching tab starts the other tab clean
   (search, filters and page are cleared, as each tab has its own filters – `useUrlTab` gained a `resetKeys` option). The
   acknowledgement totals stay on the Documents tab (they count documents only). Access unchanged: library = manage,
   view-all or acknowledgement reports; create = manage.
2. **Banner buttons** (`components/create-buttons.tsx`), only for `documents.manage`: the Document Library has *Upload
   document* and *Create response form* – one solid white (the open tab's job: Response forms tab → Create response form),
   the other outlined; **My Response Forms** has *Create response form*; **My Documents** has only *Upload document*
   (owner's words). On phones the buttons take the full width under the title.
3. **Library-wide numbers in the Document Library banner**, always shown (whatever the tab), in two labelled groups
   separated by a thin vertical line (stacked with a horizontal line when the banner is narrower than 48rem, e.g. phones).
   Each number counts **documents or response forms, not people**, over the library's default view (Active = published +
   drafts, the same scope as the tables – `libraryScopeWhere`), with the same per-row rules as the tables; the table's
   search and filters don't change them. Rules: `library-summary-rules.ts` (tested); SQL: `documentQueryService.librarySummary`
   (existence checks per row, sequential like the list); endpoint `GET /api/documents/library-summary` (library access).
   - **Documents** (heading opens the Documents tab): **To do** = published documents that still have people who must
     acknowledge them (the row's "outstanding" > 0) · **Overdue** = published documents where someone is past the
     acknowledgement deadline (the row's "overdue" > 0) · **Documents** = active documents in the library (published +
     drafts) – the Documents tab's total with its default filter.
   - **Response forms** (heading opens the Response forms tab): **To complete** = published, open response forms that
     someone in their audience still has to complete – or whose file someone still has to acknowledge, as My Response
     Forms counts it · **Overdue** = open response forms where someone is past the deadline to complete it (forms everyone
     must complete; due = max(published, became mandatory, person joined) + "complete within" days) or to acknowledge its
     file · **Completed** = published response forms (open or closed) that everyone in their audience has completed (and
     acknowledged, when that is asked). Closed forms are never "to complete" or "overdue".
   - An ⓘ next to each group heading explains its three numbers (opens on tap); each number also has a hover title.
   - The numbers themselves don't link (the tables have no "still to do" filter to open); the headings open the tabs.
   This replaces the signed-in user's own response form numbers ("Your response forms") shown for a short while.
   **My Documents is back to documents only**: To do · Overdue · Documents (each opens its tab), no response form numbers,
   and only the *Upload document* button.
4. **Old addresses keep working**: `/documents/surveys/library?…` redirects to `/documents/manage?tab=forms&…` keeping
   its search, status, "Created by me" and page (`responseFormsLibraryHref`, tested). Its route-registry entry stays a
   "search" page so favourites saved before still open; new favourites are saved on the tab address.
   `/documents/surveys/new` (Create Response Form) and `/documents/surveys/library/[id]` (the response form page) are
   unchanged and highlight **Document Library** in the sidebar (`NavItem.activeFor`); without library access the
   create page still answers "access denied".
5. **Shared banner (`PageBanner`)**: title and actions now sit side by side once the banner itself is at least 42rem wide
   (container query `@2xl/banner`) instead of from the 768 px window width – on tablets the open sidebar left the title a
   narrow column next to two buttons – and the actions keep one row while they fit in 55% of the banner. Other pages with a
   banner button get the same behaviour (button under the title on tablets with the sidebar open).

## Product decisions (implemented)
1. **One survey per document**, created **only on the Survey page** (Documents → Survey) together with its document; it goes
   live when the document is published. Owner's decision, 27 Oct 2026: no survey section on Upload document and no
   *Add survey* on existing documents (the API refuses it too). Documents that already had a survey keep it.
2. Readers answer **after opening the current version** (same evidence as acknowledging: a `DOCUMENT_FILE_ACCESSED` audit
   row for that version). With acknowledgement the checklist reads 1 Open · 2 Confirm · 3 Complete the response form.
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
- Notifications: `document.survey_required` / `document.survey_available` ("New response form: <document>") on publish and on
  replace; `document.survey_reminder` ("Reminder: response form to complete – <document>", dedupe per user per day).
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
`GET /api/documents/library-summary` (library access) serves the Document Library banner: `{ documents: { toDo, overdue,
total }, forms: { toComplete, overdue, completed } }` (see "Layout" 3).

**Surveys are listed apart from documents** (owner's decision, 27 Oct 2026). A "survey" is a document with a current
survey (`surveyDocumentsWhere()` in `survey-summary.ts`; no extra column – surveys are only created on the Survey page).
My Documents, the Document Library and the compliance totals leave surveys out; My Surveys and the Survey Library list
only surveys. Documents that got a survey before this change (demo data) now count as surveys.

## UI
- Menu (Documents section): **My Documents** (everyone) · **My Response Forms** (everyone) · **Document Library** (manage or
  acknowledgement reports). Before 30 Oct 2026: My Documents · Document Library · My Inductions · Induction Library ·
  Create induction; before 28 Oct: My Surveys · Survey Library · Create survey (the last one was first called "Survey").
- **My Documents** `/documents` (`components/my-documents.tsx`): documents only – banner To do · Overdue · Documents (each
  opens its tab), *Upload document* for `documents.manage`. Response forms are counted in the Document Library banner and
  listed in My Response Forms.
- **My Response Forms** `/documents/surveys` (`components/survey/my-surveys.tsx`): like My Documents – banner To complete /
  Overdue / Completed (+ *Create response form* for `documents.manage`), tabs All · To complete · Completed, search, rows with To complete / Overdue / Optional / Completed /
  Closed (+ any acknowledgement still to give), "With a file to read". Rows open the reader page.
- **Document Library → Response forms tab** `/documents/manage?tab=forms` (`components/manage/document-library.tsx` renders
  the tabs and the banner's library-wide numbers, `components/survey/survey-library.tsx` the tab): search, status, **Created by me / anyone**; columns
  Response form (with a file / no file) · Status · Answers (+ "Everyone must complete it", Closed) · Audience · Updated.
  Rows open the response form page. The old `/documents/surveys/library` redirects here.
- **Response form page** `/documents/surveys/library/[id]` (`components/survey/survey-manage.tsx`): header with status,
  response form state, "No file" / "File · version N", actions (View as employee, Publish, Archive/Restore). Tabs
  **Response form** (summary card with Close/Reopen, Results · Who has completed it · Edit response form · Previous
  response forms) · **Settings** (who should complete it + acknowledgement – no document details) · **File** (add / replace
  the optional file) · **Acknowledgements** (only when required) · **History**. `/documents/manage/[id]` redirects surveys
  here and this page redirects plain documents back (`documentQueryService.isSurvey`). The document page has no Survey tab.
- A survey's document title and description follow the survey's title and introduction (edit and replace update both;
  titles stay unique among active documents and surveys).
- **Create Response Form** `/documents/surveys/new` (from the *Create response form* banner button on the Document Library
  and My Response Forms): 1 Response form questions (builder with preview + "Start from an example" *Understanding check* /
  *Feedback*, which replaces the questions with undo) · 2 File (optional – what people read before answering) · 3 Who
  should have access? · 4 Acknowledgement (**off by default** – the response form has its own "Everyone must complete it";
  only available with a file, removing the file switches it off) · Save as draft / Publish now → response form page.
  *Existing response forms* opens the Document Library's Response forms tab. No document details are asked
  (`components/survey/new-survey-form.tsx`).
- `/documents/manage/new` (Upload document): file · details · access · acknowledgement – no survey section any more.
- Back links follow the list a survey belongs to: reader page → My Response Forms (`DocumentViewerDto.isSurvey`, its
  *Manage* button opens the response form page), response form page → Document Library (Response forms tab).
- `/documents/manage/[id]` (documents only): Overview · Versions · Acknowledgements · History – no survey tab or *Add survey*
  button (`add-survey-card.tsx` was removed).
- `/documents/[id]`: "Response form" card under the acknowledgement panel (first card after the preview on phones when
  nothing is left to acknowledge) with **Complete the response form**, answer sheet with "Answer anonymously". Dashboard
  widget "My acknowledgements": "N response forms to complete" links to My Response Forms.

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
- Response forms (30 Oct 2026): smoke-tested on `next start` :3101 against the local database – admin@northstar and
  john@northstar, at 1366 px, 768 px and 375 px (no sideways scroll): the three-item menu (Document Library highlighted on a
  response form page and on Create Response Form), both banner buttons (solid one follows the tab), Documents ⇄ Response forms
  tabs (filters cleared), `/documents/surveys/library?createdBy=me&status=ALL&q=check` → Response forms tab with the filters,
  My Documents numbers → filtered lists, reader page wording, john gets "Access restricted" on the library (also via the
  old address), and a favourite "Document Library – Response forms" (Response forms tab · 1 filter) that reopens the tab with
  "Created by me" (saved locally for admin@northstar).
- Owner's correction (30 Oct 2026): smoke-tested again on :3101 as admin@northstar and john@northstar at 1366 px and
  375 px – Document Library banner with both buttons and "Your response forms" (2 · 0 · 2 for admin, matching My Response
  Forms), My Documents with To do · Overdue · Documents and (after the owner's follow-up) only Upload document for admin –
  none for john –, My Response Forms with Create response form for admin only, no sideways scroll, and the Document Library number cards no longer cut their labels at 375 px (`StatCard`
  on phones: smaller icon and padding, labels wrap to two lines – shared component, so every page's number cards get it).
- Library-wide banner numbers (30 Oct 2026): checked against the tables on the local database as admin@northstar –
  Documents 5 · 4 · 8 equal the Documents tab rows (published rows with outstanding > 0 / overdue > 0, active total 8);
  Response forms 8 · 1 · 0: all 8 published forms have people not completed (participation "Not completed" > 0), none is
  past its completion deadline yet (earliest 31 Oct), "Warehouse Safety Policy" has 7 people past its acknowledgement
  deadline (→ Overdue 1, matching john's own Overdue 1 on My Response Forms), and no form is completed by everyone. The
  numbers stay the same with a search on either tab. Vertical line at 1366 px, stacked groups at 375 px (no sideways
  scroll), ⓘ explanations open on tap. john: library "Access restricted", `/api/documents/library-summary` → 403.

## Open questions
- Response forms layout (30 Oct 2026, current behaviour in brackets): the library banner counts response forms with an
  acknowledgement still to give / overdue as "To complete" / "Overdue" (like My Response Forms) – count completion only?
  (acknowledgements count); should the banner follow the table's search and filters? (no – always the whole library);
  should the numbers open a filtered list (e.g. a new "Still to do" filter on the tables)? (no link, the headings open the
  tabs); keep search and filters when switching Document Library tabs? (cleared).
- A response form published from Create response form sends two notifications ("New document: …" + "New response form:
  …"), as an upload with a survey did before; merge them into one (and drop "New document" for response forms)?
- "Let people answer anonymously" is on by default. As inductions (28–30 Oct) it looked wrong – inductions prove that
  *each person* understood; with the generic name "Response forms" it fits feedback forms again. Keep it on by default?
  (Still on; anonymous completions count as Completed, but nobody can see whose answers they are.)
- With the generic name both examples (*Understanding check*, *Feedback*) fit again – add more examples (e.g. "Site rules
  check")? (two examples)
- Results still count "answers" ("12 answers", CSV column "Answered on") while people see Completed / Not completed – change
  those to "completed" too?
- Someone with direct database access can still correlate rows by transaction id / physical order or by same-day
  participation; closing that needs delayed, batched inserts of anonymous responses.
- A creator polling results after the threshold is reached can diff counts against "Who has answered"; releasing
  anonymous results in daily batches would prevent that.
- Should managers outside the audience be able to answer (currently 422 "for the people this document is assigned to")?
- Reminders for mandatory surveys are manual ("Send reminder") or via scheduled jobs; no automatic cadence like acknowledgements.
