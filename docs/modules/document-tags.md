# Document tags – what exists

Built 28 Oct 2026. Whoever manages documents (`document.manage`) can put tags on a document so groups of documents can be
found again. Read with `docs/PLATFORM.md`; the Documents module itself: `docs/DOCUMENTS_MODULE_MIGRATION.md`.

## Behaviour
- **Where tags are edited:** Upload document (Details section) and the document's Overview tab (same `DocumentDetailsFields`).
  The *Tags* picker offers the company's existing tags (with how many documents use each) and *Create tag "…"* for a new
  one; chosen tags show as removable chips. New tags are created when the document is saved.
- **Unique per company, ignoring case and spacing:** "fire  SAFETY" reuses an existing "Fire safety", which keeps its first
  spelling. Names are trimmed with inner spaces collapsed; ≤ 40 characters, ≤ 20 tags per document; repeats are dropped.
- **Where tags are used:**
  - Document Library: *All tags* filter (4th filter, searchable), search matches tag names, chips under each title.
  - My Documents: *All tags* filter, search matches tag names ("Search documents or tags"), chips on each row.
  - Document reader page: chips in the header. Read-only Overview (reporters): a *Tags* row.
- **Audit:** tag changes are part of `DOCUMENT_UPDATED` (`changes.tags = { from: [...], to: [...] }`, names sorted) and of
  `DOCUMENT_CREATED` (`changes.tags`), in the same transaction as the document change.
- **Tags are kept** when no document uses them any more (still offered in the picker with 0; hidden from the filters).
  There is no rename/merge/delete screen yet – see open questions.

## Decision: surveys get no tags
Surveys (Survey Library, My Surveys) do **not** get tags. The Survey page asks no document details at all (owner's decision
of 27 Oct: the survey document takes its title/intro and stays uncategorised), the survey Settings tab hides the Details
section, and the Survey Library is small enough to scan. Tags hang off `Document`, so adding them to surveys later is a UI
change only (picker on Edit survey, filter on the two survey lists). Searching a survey list still matches tag names
(always empty today). The tag lists and counts leave surveys out.

## Implementation
- Schema (`prisma/schema/documents.prisma`, migration `document_tags`, additive – two new tables, no change to existing rows):
  `DocumentTag` (`organizationId`, `name`, `normalizedName` = lower-cased clean name, `@@unique([organizationId, normalizedName])`)
  and `DocumentTagLink` (`organizationId`, `documentId`, `tagId`, `@@id([documentId, tagId])`, cascade on document/tag delete –
  documents are never hard-deleted).
- Pure rules + tests: `cleanTagName`, `tagKey`, `uniqueTagNames`, `tagNamesSchema` in `src/lib/validation/documents.ts`
  (`documents.test.ts`). `tags: string[]` is part of `documentMetadataSchema` (so create and update both require it;
  the Survey page sends none – the service passes `[]`).
- Server: `src/server/modules/documents/document-tags.ts` – `setDocumentTags(tx, …)` (creates missing tags with
  `createMany({ skipDuplicates })`, so two people adding the same new tag at once is safe; returns before/after names for the
  audit), `tagSearchWhere`, `tagFilterWhere`, `documentTagsInclude` + `toTags` (sorted case-insensitively in code – the
  database collation puts "fire" after "Induction"), and `documentTagService.list`.
- API: `GET /api/documents/tags?scope=library|mine`.
  - `library` needs a Document Library permission (`document.manage | document.view_all | document.ack_reports`, else 403):
    every tag, with the number of documents (any status, surveys left out).
  - `mine` (default, everyone with the module): only tags on documents assigned to the user, counted on those documents –
    so tags of drafts or documents meant for others are not revealed.
  - `tagId` query parameter on `GET /api/documents` and `GET /api/documents/my`.
- Client: `useDocumentTags(scope)` (`features/documents/api.ts`), `TagPicker` (`components/manage/tag-picker.tsx`),
  `TagFilter` (`components/filters.tsx`), `TagChips` (`components/tag-chips.tsx`).

## Open questions for the owner
1. Should admins be able to rename, merge or delete tags (e.g. under Configuration → Lists, like categories)? (not built)
2. Filter by several tags at once (documents having all / any of them)? (one tag at a time + search)
3. Should surveys get tags too? (no – see decision above)
4. Should employees (not only managers) be allowed to tag documents? (managers only – same as other document details)
