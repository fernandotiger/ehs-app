# Simplified law – what exists

Built 28–29 Oct 2026 from the boss's storyboard "Legislation Compliance System – Storyboard" (PDF, not in the repo) next to the
full Law module, so the owner and the boss can compare the two and keep one. Brief: `docs/briefs/08-simplified-law.md`.
Sidebar **Simplified law**: Overview · All legislation · Actions to do · Configuration (≤6 items). The platform Configuration
hub is not touched – everything a company customises lives in the module's own Configuration item.

## The storyboard in short
The storyboard replaces an Excel register (one sheet/column per step), with the EU Packaging and Packaging Waste Regulation
(PPWR) as its example:
1. **Select category** → sub-category (cards, "20 legislation items: 8 EU, 12 Irish"; categories are added over time).
2. **Legislation list** of the sub-category: jurisdiction, legal status, a summary; filters Jurisdiction / Status / Hide repealed;
   buttons Official document · Overview · Check applicability.
3. **Official text + overview**: link to the official document and an article-by-article overview (application date, who it
   applies to – Manufacturer / Importer / Distributor / Producer columns, grouped by chapter).
4. **Applicable to us?** Yes/No screening questions with a reason; any Yes = likely relevant. Decision: No → reason, "Not
   applicable", no requirements; Yes → the requirements checklist opens.
5. **Requirements** grouped in sections: requirement + linked articles, Compliant? (Compliant / Not compliant / Not assessed / N/A),
   reason, and if not: action, owner, due date. Actions feed an action tracker until marked complete.
Legal statuses: active, partially affected, superseded and repealed laws are all listed; repealed ones are greyed and can be
filtered out. Data model: Category → Sub-category → Legislation (jurisdiction, status, summary, links, overview) → Applicability
answers (question, yes/no, reason) → Requirements (linked articles, compliant, reason, action, owner, due date).

## Words on screen
"Overview" (step 1, Select category) · "All legislation" (step 2) · "Overview / Applicability / Requirements / History" tabs on a law
(steps 3–5) · "Actions to do" (the action tracker) · "Not checked yet / Applies to us / Does not apply" · "Compliant / Not
compliant / Not assessed / N/A" · "Action done – check again". A 4-step bar (Select category · Legislation · Applicability ·
Requirements) sits on every register screen, as in the storyboard.

## Data (`prisma/schema/simplified-law.prisma`, migration `20261028230200_simplified_law`)
Six new tables, all `slaw_*`, plus five enums – nothing existing is altered. The register is company-wide (the storyboard asks
"applicable to the company?"), so there are no placement columns.
- `slaw_settings` – one row per tenant (created on first save; defaults until then): register title, jurisdictions list,
  wording of the four legal statuses, hide-repealed default, suggested action due days, `version`.
- `slaw_categories` – category (`parentId` null) or sub-category; name, description, sort order, `archivedAt`.
- `slaw_legislation` – sub-category, title, short title, number/year, jurisdiction, status ACTIVE | AFFECTED | SUPERSEDED |
  REPEALED + status note ("new regulation") + related-laws note, summary, official URL, guidance URL, the applicability decision
  (NOT_CHECKED | APPLIES | DOES_NOT_APPLY + reason, who, when), `sourceKey` (demo library key), `version`, `archivedAt`.
- `slaw_articles` – overview rows: chapter, number, title, applies-from date, applies-to roles (`String[]`, they become the
  overview's columns), order.
- `slaw_questions` – screening question + answer YES | NO, reason, who, when; order; `archivedAt`.
- `slaw_requirements` – section, text, linked articles, order; compliance + reason, who, when; ONE action per row (text, owner,
  due date, status NONE | OPEN | DONE, set by/at, completed by/at, note); `version`, `archivedAt`.
**Data statements (idempotent, like `actions`):** switch `simplified-law` on for every tenant; append `slaw.view` to
administrator / manager / ehs-manager and `slaw.assess` + `slaw.manage` to administrator / ehs-manager. Applied to the local DB
only; the next Vercel deploy applies it to Neon.

## Rules (pure, tested – `src/lib/simplified-law/rules.ts`, 21 tests; policy 4 tests; demo library 4 tests)
- Suggestion: any Yes → "Likely applies"; every question No → "Probably does not apply"; else "Keep answering".
- Decision: "Does not apply" needs a reason; repealed laws cannot be checked. "Save answers only" keeps the decision.
- Requirement gates: Compliant → reason (evidence) required; Not compliant → action, owner, due date required (a new or changed
  action cannot be due in the past; an unchanged overdue one can be re-saved); N/A and Not assessed need nothing.
- Action lifecycle: Not compliant opens the action (owner notified); a done action stays done unless its text, owner or due date
  change; leaving Not compliant closes an open action automatically ("no longer needed", kept in History). Completing an action
  keeps the row Not compliant and flags **"Action done – check again"** (the person who set it is notified).
- Law progress badge: Nothing to check (repealed) · Not checked yet · Does not apply · Applies – N not compliant · Applies – N to
  check · Applies – compliant · Applies – no requirements listed. One primary next step: Check applicability / Check requirements.
- Closing open actions automatically also happens when a law is marked "does not apply", marked repealed, archived, or when a
  requirement is removed.

## Access (`slaw-access.policy.ts`)
- Register (read): any of `slaw.view`, `slaw.assess`, `slaw.manage` – counted wherever the permission is held (company-wide
  register). Without it the register APIs answer 404 and the pages show "access denied".
- Answer questions, assess requirements, set actions: `slaw.assess`. Configuration submenu: `slaw.manage`.
- Action owners need no register access: they see and complete their own actions in Actions to do / My work (a read-only view of
  the requirement and the gap). `slaw.assess` completes anyone's action without changing the owner.

## Server and API (`src/server/modules/simplified-law/`, 32 thin routes under `src/app/api/simplified-law/`)
`register.service.ts` (summary, category tree with counts, list, detail, history) · `assessment.service.ts` (applicability,
requirement check, action completion, `closeOpenActions`) · `action-query.service.ts` (tracker list / one / summary) ·
`config.service.ts` (categories, laws, articles, questions, requirements; move up/down; archive) · `settings.service.ts` (settings
and jurisdictions; renaming a jurisdiction renames it on every law; removing one in use is blocked) · `due-work.ts` · `slaw.entity.ts`.
Every change writes an audit record in the same transaction; concurrent edits of a law, a requirement or the settings return the
usual "changed by someone else" (draft kept).

## Platform plug-ins (shared services only – no Law code or tables)
Module key `simplified-law` (`src/lib/modules.ts`), permission group (`src/lib/permissions.ts` + `default-roles.ts`), due-work
kind `slaw.action` (`src/lib/jobs.ts`, `jobs/providers.ts` → My work and Scheduled jobs target "Simplified law actions"), entity
registry `SlawLegislation` / `SlawRequirement` (evidence files and links on requirements), sidebar section (`nav-config.ts`),
Home widget (register users), Northstar seed hook and `db:seed:simplified-law` script.
**To remove the module later:** delete the `simplified-law` folders listed in the brief, the schema file (+ a migration dropping the
`slaw_*` tables), and the one-line entries in those registries.

## Seed (`prisma/seed/simplified-law.ts` + `simplified-law-library.ts`, `npm run db:seed:simplified-law`; also in the full seed)
Real Irish and EU legislation collected on 28 Oct 2026 – official titles, numbers and URLs; summaries, overview titles,
questions and requirements written in our own plain words (not legal advice, not copies of the text). 3 categories, 7
sub-categories, 17 laws (15 in force + a repealed and a superseded one so greyed rows show). Idempotent: missing categories / laws
are added by name / `sourceKey`, company edits are never overwritten; demo answers only on the first run; the daily overdue job
gets the `slaw.action` target. Register title "Northstar Legislation & Compliance Register".

| Category › Sub-category | Law | Jurisdiction | Status | Official source (guidance) |
| --- | --- | --- | --- | --- |
| Health & Safety › General duties | SHWW Act 2005 (No. 10 of 2005) | Ireland | Affected | https://www.irishstatutebook.ie/eli/2005/act/10/enacted/en/html; guidance https://www.hsa.ie/eng/legislation/acts/safety_health_and_welfare_at_work/ |
| Health & Safety › General duties | General Application Regulations 2007 (S.I. No. 299 of 2007) | Ireland | Affected | https://www.irishstatutebook.ie/eli/2007/si/299/made/en/html; guidance https://www.hsa.ie/eng/publications_and_forms/publications/general_application_regulations/ |
| Health & Safety › General duties | SHWW Act 1989 (No. 7 of 1989) | Ireland | Repealed | https://www.irishstatutebook.ie/eli/1989/act/7/enacted/en/html |
| Health & Safety › Fire safety | Fire Services Acts 1981 and 2003 (No. 30 of 1981; Part 3 of No. 15 of 2003) | Ireland | Affected | https://www.irishstatutebook.ie/eli/1981/act/30/enacted/en/html; guidance https://www.hsa.ie/eng/topics/fire/ |
| Environment › Licensing & emissions | EPA Act 1992 (No. 7 of 1992) | Ireland | Affected | https://www.irishstatutebook.ie/eli/1992/act/7/enacted/en/html; guidance https://www.epa.ie/our-services/licensing/industrial/ |
| Environment › Waste | Waste Management Act 1996 (No. 10 of 1996) | Ireland | Affected | https://www.irishstatutebook.ie/eli/1996/act/10/enacted/en/html; guidance https://www.epa.ie/our-services/compliance--enforcement/waste/ |
| Environment › Waste | Waste Framework Directive (Directive 2008/98/EC) | EU | Affected | https://eur-lex.europa.eu/eli/dir/2008/98/oj |
| Environment › Packaging waste | PPWR (Regulation (EU) 2025/40) | EU | Active | https://eur-lex.europa.eu/eli/reg/2025/40/oj; guidance https://www.gov.ie/en/department-of-climate-energy-and-the-environment/publications/extended-producer-responsibility-epr/ |
| Environment › Packaging waste | Packaging Regulations 2014 (S.I. No. 282 of 2014) | Ireland | Affected | https://www.irishstatutebook.ie/eli/2014/si/282/made/en/html |
| Environment › Packaging waste | PPWR pallet wrap and straps exemption (Delegated Decision (EU) 2026/429) | EU | Active | https://eur-lex.europa.eu/eli/dec_del/2026/429/oj |
| Environment › Packaging waste | PPWR competent authorities (S.I. No. 541 of 2025) | Ireland | Active | https://www.irishstatutebook.ie/eli/2025/si/541/made/en/html |
| Environment › Packaging waste | Packaging Directive (Directive 94/62/EC) | EU | Repealed (from 12 Aug 2026) | https://eur-lex.europa.eu/eli/dir/1994/62/oj |
| Chemicals › REACH & CLP | REACH (Regulation (EC) No 1907/2006) | EU | Affected | https://eur-lex.europa.eu/eli/reg/2006/1907/oj; guidance https://www.hsa.ie/eng/your_industry/chemicals/legislation_enforcement/reach/ |
| Chemicals › REACH & CLP | CLP (Regulation (EC) No 1272/2008) | EU | Affected | https://eur-lex.europa.eu/eli/reg/2008/1272/oj (HSA CLP guidance) |
| Chemicals › Chemicals at work | Chemicals Acts 2008 and 2010 (No. 13 of 2008; No. 32 of 2010) | Ireland | Affected | https://www.irishstatutebook.ie/eli/2008/act/13/enacted/en/html; guidance https://www.hsa.ie/eng/legislation/acts/chemicals_acts_2008_and_2010_and_the_guide/ |
| Chemicals › Chemicals at work | Chemical Agents Regulations 2001 (S.I. No. 619 of 2001) | Ireland | Affected | https://www.irishstatutebook.ie/eli/2001/si/619/made/en/html (HSA chemical agents guidance) |
| Chemicals › Chemicals at work | Chemical Agents Regulations 1994 (S.I. No. 445 of 1994) | Ireland | Superseded | https://www.irishstatutebook.ie/eli/1994/si/445/made/en/html |

Irish Statute Book, hsa.ie, epa.ie and gov.ie pages were opened and checked; EUR-Lex blocks automated fetching, so the six EUR-Lex
addresses were confirmed through search results and the Publications Office copies of the same Official Journal texts. Both
storyboard examples (Delegated Decision 2026/429, S.I. 541/2025) exist and are included.
**Demo answers (Northstar):** SHWW Act 2005, General Application Regulations (one overdue action for Sam, one for John, one
"done – check again" for Liam), PPWR (the storyboard's own example: "Our EU markets: Ireland, Spain, France", "Use FIBCs", member of
Repak, gap "collect packaging volumes by material and country" for Emma), Fire Services Acts (all compliant) and Waste Management
Act (applies, nothing checked yet) apply; EPA Act 1992 does not apply (no licensable activity); the rest are not checked yet.

## Simplifications / deviations from the storyboard (decided, can change)
- **Status filter:** "Status: all / one status" plus the "Hide repealed" switch (on by default, a Settings choice) instead of a
  combined "Active + affected" option; repealed laws are listed last and greyed.
- **One action per requirement row**, tracked in the module's own "Actions to do" (as drawn) – not the standalone Actions module,
  not incident actions. A new gap after a done action reuses the row (the earlier action stays in History).
- **"Requirements generated"**: requirements belong to the law (from the library or typed in Configuration); they are shown and
  counted only when the law applies. Changing the decision back to "applies" brings the earlier answers back.
- Evidence = the "reason compliant" text plus optional files/links on the requirement (platform evidence panel).
- Overview columns are whatever roles the articles name (EHS laws use Employer / Employee …; PPWR uses Manufacturer / Importer /
  Distributor / Producer), so no fixed role list to configure.
- No reference numbers, no review dates, no placement per site, no offline mode, no CSV export, no follow-ups to Incident / Risk /
  Actions (the storyboard shows none).

## Simplified law vs Law (for the comparison)
Law: per-site legal profiles, versioned content packages with update review, ratings, tasks, links and incident/action follow-ups.
Simplified law: one company register, five obvious steps, everything editable in its own Configuration, actions inside the
checklist. Both can run side by side; they share no tables or code.

## Open questions for the owner (current behaviour in brackets)
1. Should site managers be able to keep a register per site, or is one company register enough? (one company register)
2. Should a site-level `slaw.assess` / `slaw.manage` grant count, or only company-wide grants? (counts wherever held)
3. Should employees see the register read-only (awareness), not just their own actions? (own actions only)
4. Several actions per requirement, or route gaps to the standalone Actions module instead of the built-in tracker? (one, built-in)
5. Should completing an action mark the requirement compliant automatically? (no – "Action done – check again")
6. Periodic re-check of compliance (e.g. yearly) with reminders? (not built; Scheduled jobs remind about open actions only)
7. Should the boss's "Active + affected" status filter replace "Status: all" + "Hide repealed"? (switch + single status)
8. Keep the demo library updated centrally for all tenants, or per company only? (per company, seeded once)
9. Which module stays – Law or Simplified law – and should the other then be switched off per tenant or removed? (both on)

## Local smoke data (29 Oct 2026)
Delegated Decision 2026/429 marked applies (admin); PPWR "Conformity" requirement marked not compliant with an action for John;
John completed "manual handling training" (now "check again" for Emma); jurisdiction "Northern Ireland" added; a company law
"Construction Regulations 2013" (S.I. No. 291 of 2013, General duties, shown as "Added by us") with one article,
question and requirement; test category "Energy" archived and the status wording set back to the defaults after testing.
