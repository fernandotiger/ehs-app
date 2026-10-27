You are adding **Document surveys** ("interactive documents") to the Documents module of OleoQ, a multi-tenant EHS SaaS.
Work ONLY inside `C:\Users\User\Documents\claude_code\code\mvp1\docs-app` (Next.js 16 – read `node_modules/next/dist/docs/` before using
an API you're unsure of, React 19, Prisma 7 multi-file schema, TanStack Query, shadcn/ui, Tailwind 4). Bash tool = Git Bash.
Do not commit or touch the git index. **Never use the database in `.env` (it is the user's Neon database)** – run every DB and
dev-server command via `bash scripts/localdb.sh <cmd>` (local `prisma dev` on :51221, shadow :51222; start it with
`npx prisma dev -n oleoq -d` if it is down). Never run `prisma migrate reset`.

## The request (from the product owner, verbatim intent)
Whoever uploads/creates a document gets a new option to create a survey about the document. It is presented to the people the
document is for, who interact with it. The survey can be marked mandatory or not. The document creator sees a summary of the
results. Readers can choose to answer anonymously. Survey creation must be simple, with 3 field types: text, radio, checkbox.
Users are not IT people – make it obvious, easy and well visible.

## Read first (only these)
`docs/PLATFORM.md`, `docs/ARCHITECTURE.md`, `docs/modules/platform.md`, `docs/modules/jobs.md` (due-work providers),
`docs/modules/configuration.md` (settings registry), and `docs/DOCUMENTS_MODULE_MIGRATION.md` §1.2–1.11 + §2 (screens). Then the
documents code you touch: `prisma/schema/documents.prisma`, `src/server/modules/documents/*`, `src/features/documents/**`,
`src/app/api/documents/**`, `src/app/(app)/documents/**`, `src/lib/validation/` (documents schemas), `src/lib/offline/operations.ts`.

## Product decisions (already made – implement them, list them in the docs)
1. **One survey per document**, created with the document or added later. It goes live when the document is published.
2. Readers answer **after opening the current version** (same server check as acknowledging: a file-access audit row for that
   version). If the document also needs acknowledgement, the reader's checklist becomes: 1 Open · 2 Confirm · 3 Answer survey.
3. **Mandatory** = "Everyone must answer" + "Answer within N days" (default from settings, 14). Mandatory unanswered surveys count
   as "Action required" for the reader, appear in My work and can be targeted by scheduled-job reminders.
4. **Anonymous**: the creator has "Let people answer anonymously" (on by default). The reader ticks "Answer anonymously"
   (explained in one line: "Your name won't be saved with your answers. We only record that you took part.").
5. **Answers are final** once sent (append-only, like acknowledgements).
6. **Questions lock once the first answer arrives.** After that the creator can still change title/intro, mandatory, due days,
   anonymity off→on (never on→off once anonymous answers exist), close/reopen, or **Replace survey** (old survey + results are
   kept read-only under "Previous surveys"; everyone can answer the new one).
7. A new document version does **not** reset the survey; each response stores the document version number it was given on.
8. Field types in plain words: **Text answer** (text), **One choice** (radio), **Several choices** (checkbox). Each question:
   question text, optional help line, required switch (default on), options for choice types (2–20, unique, non-empty).
   Limits: 1–20 questions, text answers ≤ 2000 chars.

## Anonymity must be real (privacy by design)
- Anonymous responses store **no user id, no timestamp finer than the date**, and their ids must not be time-ordered
  (`crypto.randomUUID()`, not cuid). Participation ("who took part") is a separate row `(surveyId, userId, answeredAt)` with no
  link to the response and no anonymous flag. The audit entry for answering records participation only (never response id or answers).
- **k-anonymity threshold** (setting, default 3, range 1–10): anonymous answers are left out of every result, chart count and export
  until at least k anonymous answers exist ("2 anonymous answers will show once there are at least 3"). This stops identification by
  elimination in small teams. Anonymous text answers are listed in a stable non-chronological order (e.g. alphabetical).
- Participation lists show Answered / Not answered only – never who answered anonymously.

## Data (append to `prisma/schema/documents.prisma` or a new `prisma/schema/document-surveys.prisma`; every model has `organizationId`)
`DocumentSurvey` (documentId, title, intro?, isMandatory, dueDays?, allowAnonymous, status ACTIVE|CLOSED|REPLACED, version for
optimistic locking, createdById, timestamps, closedAt?, replacedAt?), `DocumentSurveyQuestion` (surveyId, position, type
TEXT|SINGLE|MULTIPLE, label, help?, required, options String[]), `DocumentSurveyResponse` (id = random uuid, surveyId,
documentVersionNumber, respondentId? (null when anonymous), isAnonymous, submittedOn @db.Date), `DocumentSurveyAnswer`
(responseId, questionId, text?, choices String[]) and `DocumentSurveyParticipation` (surveyId, userId, answeredAt;
`@@unique([surveyId, userId])` – makes double submits and offline replays idempotent). Make responses, answers and participation
append-only with a DB trigger in the migration (same approach as `document_acknowledgements`). Aggregate results in SQL
(groupBy / `unnest(choices)`), paginate text answers – audiences can be 15k people.
Migration: `bash scripts/localdb.sh npx prisma migrate dev --name document_surveys`.

## Server (`src/server/modules/documents/`)
- Pure rules + vitest: `survey-rules.ts` (definition validation, answer validation per type/required/options, lock rules, can-answer
  guard, k-anonymity filter, reader status ANSWERED|REQUIRED|OPTIONAL|OVERDUE|CLOSED) and shared zod in `src/lib/validation/`.
- `survey.service.ts` (create/update with version check, close/reopen/replace, answer, results, participation, remind, CSV export
  with formula-leading characters escaped – reuse `documents/csv.ts`). `recordAudit` in the same transaction for every change.
- Access: editing = document manage permission; results/participation/export = the document reports permissions (manage or
  acknowledgement reports – see `document-permissions.ts`); answering = the document is visible to the user through the existing
  audience policy and published. 404 outside scope, tenant-scoped `prisma` everywhere.
- Notifications via `notificationService`: publishing a document with a survey (or adding a survey to a published document) tells
  the audience ("New survey: <document>", type `document.survey_required` or `document.survey_available`); "Send reminder" button
  for non-responders of a mandatory survey (`document.survey_reminder`, dedupe per user per day).
- Due-work provider `document.survey` (mandatory, unanswered, due = publish/added date + dueDays → reader) registered in
  `src/server/modules/jobs/providers.ts` (add the kind where the job targets are declared so Configuration → Scheduled jobs can target it).
- Offline: answering works offline like acknowledging (new operation type in `src/lib/offline/operations.ts` + documents sync handler;
  participation unique key makes the replay idempotent).
- Settings registry: a documents survey setting (anonymity threshold, default "answer within" days), editable in Configuration → Settings.
- Endpoints (thin, `apiHandler({ module: "documents", ... })`), e.g. `GET/PUT /api/documents/[id]/survey`, `POST .../survey/{close,reopen,replace}`,
  `GET .../survey/results`, `GET .../survey/participation`, `POST .../survey/remind`, `GET .../survey/export`,
  `GET .../survey/mine`, `POST .../survey/answer`. Creating a document may include its survey in the same request/transaction.

## UI – obvious, simple, Documents look (PLATFORM.md §8)
**Creator**
- `/documents/manage/new`: new numbered FormSection **"5 Survey (optional)"** after Acknowledgement – brand-tinted card with a
  ClipboardList icon, one line "Ask readers a few questions about this document", and a big **"Add a survey"** button that expands
  the builder. Also "Start from an example": *Understanding check* (One choice: "Did you understand this document?" Yes / Partly / No
  + Text answer "What was unclear?") and *Feedback* (One choice "How clear is this document?" Very clear / Clear / Not clear +
  Several choices "Which parts were most useful?" + Text answer "Any suggestions?").
- Builder: survey title (prefilled "Questions about <document title>"), optional intro, switches "Everyone must answer" (+ "Answer
  within N days") and "Let people answer anonymously". Question cards numbered "Question 1…": question text, the 3 types as big
  segmented buttons with icons and plain labels, options editor ("+ Add option", remove, min 2), required switch, move up/down, delete
  with undo toast, big "+ Add question". **Preview** button shows exactly what readers will see. Inline validation in plain words.
- `/documents/manage/[id]`: header action **"Add survey"** when there is none; new tab **"Survey"** (count pill = answers) with
  sub-views **Results** (stat cards: Answers · Answer rate vs audience · Not answered (mandatory only); per question: bars with count and
  % for One choice / Several choices ("people could pick more than one"), text answers list with name or "Anonymous", "Show more";
  k-anonymity notice; Export CSV; Print), **Who has answered** (mandatory: Answered/Not answered tabs, search, department filter,
  "Send reminder"), **Edit survey** (locked-questions banner explaining why + Replace survey), **Previous surveys** (read-only results).
- Library table: small "Survey · 12 answers" indicator on documents with a survey.

**Reader**
- `/documents/[id]`: a **Survey card** in the right column directly under the acknowledgement panel (first card after the file
  preview on mobile): title, "Required · answer by 12 Mar 2026" or "Optional", "3 questions · about 1 minute", disabled until the
  document is opened (same hint as acknowledgement), big **"Answer survey"** button → Sheet (full height on mobile) with the questions,
  the "Answer anonymously" checkbox (only when allowed), Send. Afterwards a receipt: "Thanks – you answered on 12 Mar 2026
  (anonymously)". Closed survey: "This survey is closed."
- My Documents: badges "Survey to answer" (required, unanswered – counts in Action required and the To-do banner stat), "Survey"
  (optional, unanswered), none once answered. Dashboard/My work pick up the due-work provider.
- Every screen works at 375 px.

## Seed (Northstar, idempotent, `prisma/seed/documents.ts` or a new file hooked into the Northstar seed)
Two published documents with surveys: one mandatory with anonymity allowed (~15 answers, ≥3 anonymous, a mix of choice and text
answers; John Murphy has NOT answered), one optional feedback survey with a few named answers. Respect the participation/response split.

## Done means
- `npx tsc --noEmit` 0 errors; `npx vitest run` green (rules, anonymity threshold, answer validation, lock rules, CSV);
  `npx eslint src prisma scripts` clean; `bash scripts/localdb.sh npx next build` passes with no new warnings.
- Seed runs twice without duplicates.
- curl smoke test on a local dev server (`BETTER_AUTH_URL=http://localhost:3100 bash scripts/localdb.sh npx next dev -p 3100`, stop it
  afterwards): Helen creates a document with a mandatory survey and publishes; John answering before opening the file → 422; after
  opening → answers anonymously → second submit returns the existing participation (no duplicate); results hide anonymous answers below
  the threshold and show them above it; the results/participation APIs never expose who answered anonymously; editing questions after
  the first answer → 422; replace keeps old results; a user outside the audience gets 404; oleo-demo admin gets 404.
- Click through the creator and reader screens in the browser (desktop and 375 px).
- Write `docs/modules/document-surveys.md` (< 100 lines: what exists, decisions above, privacy design, endpoints, open questions) and add
  one line to `docs/modules/platform.md` pointing to it; add a Document surveys bullet to the README features.

## Report back (< 40 lines)
Main paths, verification results, deviations, open issues. No code.
