You are implementing Phase 8 ("Simplified law") of OleoQ, a multi-tenant EHS SaaS. Work ONLY inside `C:\Users\User\Documents\claude_code\code\mvp1\docs-app` (Next.js 16, React 19, Prisma 7 multi-file schema, TanStack Query, shadcn/ui, Tailwind 4). Bash tool = Git Bash. Do not commit or push. Never use the database in `.env` (Neon); run DB/dev-server commands via `bash scripts/localdb.sh <cmd>` (local `prisma dev` on :51221, shadow :51222; start with `npx prisma dev -n oleoq -d` if down). Never run `prisma migrate reset`.

Owner's words: "My boss just sent me a pdf with a more simplified law module workflow. My idea is to create a new module called 'Simplified law' based on this information in the pdf, so we can choose which one we will leave in this app. For this one do not do anything in the Configuration module; if you need to create pages for some user customization then create a configuration submenu in 'Simplified law'. Remember make it customizable by the user, and you can get any real law public content from the internet as demo data. It should be simple as in the pdf."

## Read first (only these)
1. `docs/HANDOFF.md`, `docs/PLATFORM.md`, `docs/ARCHITECTURE.md`; this brief.
2. The boss's storyboard "Legislation Compliance System – Storyboard" (PDF outside the repo – do not copy it in; its workflow is summarised in `docs/modules/simplified-law.md`).
3. Patterns: the Actions module (`src/server/modules/actions`, `src/features/actions`) and Documents filters. `docs/modules/law.md` only to avoid duplicating its open questions.

## Separation from Law (hard rule)
Either module must be removable without touching the other: own module key `simplified-law`, own permission keys
(`slaw.view`, `slaw.assess`, `slaw.manage`), own tables (`slaw_*`, `prisma/schema/simplified-law.prisma`), own folders
(`src/lib/simplified-law`, `src/server/modules/simplified-law`, `src/features/simplified-law`, `src/app/(app)/simplified-law`,
`src/app/api/simplified-law`). No imports from `src/server/modules/law` or `src/lib/law`, no Law tables. Shared platform services
are fine (audit, notifications, evidence, due-work providers / scheduled jobs, My work, entity registry).

## The storyboard's workflow (5 steps replacing an Excel register)
1. Select category → sub-category (cards; "20 legislation items: 8 EU, 12 Irish"; categories "added over time").
2. Legislation list of the sub-category: jurisdiction, legal status, summary; filters Jurisdiction / Status / Hide repealed;
   buttons Official document · Overview · Check applicability. Repealed items greyed, no requirements.
3. Official text + overview: link to the official document and an article-by-article overview (application date, who it
   applies to – e.g. Manufacturer / Importer / Distributor / Producer columns, grouped by chapter).
4. Applicable to us? Screening questions answered Yes/No with a reason; any Yes = likely relevant. Decision: No → reason,
   "Not applicable", no requirements; Yes → requirements checklist opens.
5. Requirements checklist grouped in sections: requirement + linked articles, Compliant? (Compliant / Not compliant /
   Not assessed / N/A), reason compliant, if not: action, owner, due date. Actions feed an action tracker until complete.

## Data (`prisma/schema/simplified-law.prisma`; additive migration `simplified_law`)
- `SlawSettings` (one row per tenant, created on first use): register title (the storyboard's "[Product name] Legislation &
  Compliance Register"), jurisdictions list, wording of the four legal statuses, hide-repealed default, default action due days.
- `SlawCategory` – two levels (category → sub-category via `parentId`), name unique per parent, sort order, description, `archivedAt`.
- `SlawLegislation` – sub-category, title, short title, reference, jurisdiction, legal status ACTIVE | AFFECTED | SUPERSEDED |
  REPEALED (+ short kind label and relation note), summary, official URL, guidance URL, the applicability decision
  (NOT_CHECKED | APPLIES | DOES_NOT_APPLY + reason, who, when), `sourceKey` (seed idempotency), `version`, `archivedAt`.
- `SlawArticle` – overview rows: chapter, number, title, applies-from date, applies-to roles (string[]), order.
- `SlawQuestion` – screening question + its answer (YES | NO), reason, who, when; order; `archivedAt`.
- `SlawRequirement` – section, text, linked articles, order; compliance (NOT_ASSESSED | COMPLIANT | NOT_COMPLIANT | NOT_APPLICABLE)
  + reason, who, when; ONE action per row (text, owner, due date, status NONE | OPEN | DONE, who set it, completion note/date/by);
  `version`, `archivedAt`.
Company-wide register (the storyboard asks "applicable to the company?"): no placement columns.

## Behaviour (pure logic + vitest: `src/lib/simplified-law/rules.ts`, `slaw-access.policy.ts`)
- Applicability suggestion: any Yes → "Likely applies"; every question answered No → "Probably does not apply"; else "Keep answering".
  Decision gates: a reason is required for "Does not apply"; repealed laws cannot be checked. Changing to "Does not apply" closes
  open actions of that law (note "Law marked not applicable"); answers and assessments are kept for a later change of mind.
- Requirement save gates: Compliant → reason (evidence) required; Not compliant → action, owner and due date required (due date
  not in the past when it changes); N/A / Not assessed → nothing. Leaving Not compliant closes an open action automatically.
  Completing an action keeps the row Not compliant and flags it "Action done – check again" (the setter is notified).
- Law status shown to people: Not checked · Does not apply · Applies – N to check · Applies – N not compliant · Applies – compliant.
- Access: register (read) = any of `slaw.view` / `slaw.assess` / `slaw.manage`; answer questions + assess requirements + set
  actions = `slaw.assess`; Configuration submenu = `slaw.manage`; an action owner sees and completes their own actions (no
  register access needed). Permissions count wherever they are held (the register is company-wide). 404 when not allowed.
- Due work: kind `slaw.action` (open actions → owner, due date) feeds My work and Scheduled jobs; the seed adds it to the daily
  overdue job. Notifications: action assigned (owner), action done (who set it).

## UI (PLATFORM.md §8, Documents look, plain words, 375 px)
Sidebar "Simplified law" (4 items): Overview `/simplified-law` (banner + 4 stat cards + step 1 category picker), All legislation
`/simplified-law/legislation` (step 2; `?category=` for a sub-category), Actions to do `/simplified-law/actions` (tracker; everyone
sees their own), Configuration `/simplified-law/configuration` (`slaw.manage`). A 4-step bar (Category · Legislation ·
Applicability · Requirements) on every register screen. Legislation detail `/simplified-law/legislation/[id]`: one primary next
step (Check applicability / Check requirements), tabs Overview · Applicability · Requirements · History. Requirement rows edit in a
Sheet with evidence (files/links). Configuration tabs: Categories · Legislation (add your own laws; edit overview articles,
questions, requirements) · Jurisdictions · Settings (title, status wording, defaults). No change to the Configuration hub.

## Module switch-on
`MODULE_KEYS` + `MODULES` entry; migration data statements (idempotent, like `actions`): enable `simplified-law` for every tenant;
append `slaw.view` to administrator / manager / ehs-manager, `slaw.assess` + `slaw.manage` to administrator / ehs-manager
(matching `src/lib/default-roles.ts`).

## Seed (`prisma/seed/simplified-law.ts`, `npm run db:seed:simplified-law`, idempotent, Northstar)
Real Irish and EU EHS legislation (official title, number/year, official URL on irishstatutebook.ie / eur-lex.europa.eu, guidance on
hsa.ie / epa.ie; summaries and requirements in our own words): categories Health & Safety, Environment, Chemicals with
sub-categories incl. the storyboard's Waste → Packaging waste (PPWR, repealed Directive 94/62/EC). Northstar states: some laws not
checked, one not applicable, several applicable with compliant / not compliant (one overdue action, one for John) / not assessed rows.
Adds `slaw.action` to the daily overdue job when missing. Also part of the full seed.

## Done means
tsc 0, vitest green, `npx eslint src prisma scripts test` clean, `bash scripts/localdb.sh npx next build` clean; migration applied
locally; seed applied locally; browser smoke test (launch config `ehs-localdb-start`, :3101) as admin and employee incl. the
Configuration submenu and 375 px; `docs/modules/simplified-law.md` + HANDOFF updated; `git add -A`. No commit, push or Neon access.
