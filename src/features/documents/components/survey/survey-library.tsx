"use client";

import { ClipboardCheck, ClipboardList, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlSearchText, useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS } from "@/lib/permissions";
import { libraryQuerySchema, type LibraryStatusFilter } from "@/lib/validation/documents";
import { useDocumentLibrary, type LibraryItem } from "../../api";
import { audienceLabel, DOCUMENT_STATUS_META, formatDate } from "../../format";
import { surveyPageHref } from "../../survey-format";
import { FilterSelect, SearchBox } from "../filters";
import { answersLabel } from "./survey-indicator";

const PAGE_SIZE = 20;
/** URL state; `type` is fixed to "survey" (the tab itself is `tab=forms`, read by the Document Library). */
const urlSchema = libraryQuerySchema.pick({ page: true, q: true, status: true, createdBy: true });

const STATUS_OPTIONS: { id: LibraryStatusFilter; name: string }[] = [
  { id: "PUBLISHED", name: "Published" },
  { id: "DRAFT", name: "Drafts" },
  { id: "ARCHIVED", name: "Archived" },
  { id: "ALL", name: "All statuses" },
];

const CREATOR_OPTIONS = [{ id: "me", name: "Created by me" }];

function StatusPill({ status }: { status: LibraryItem["status"] }) {
  const meta = DOCUMENT_STATUS_META[status];
  return (
    <StatusBadge tone={meta.tone} dot>
      {meta.label}
    </StatusBadge>
  );
}

/** Answers, "Everyone must complete it" and closed state of the survey. */
function SurveyFacts({ item }: { item: LibraryItem }) {
  const survey = item.survey;
  if (!survey) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge tone="brand">{answersLabel(survey.participantCount)}</StatusBadge>
      {survey.isMandatory && <StatusBadge tone="warning">Everyone must complete it</StatusBadge>}
      {survey.status === "CLOSED" && <StatusBadge>Closed</StatusBadge>}
    </span>
  );
}

function subtitle(item: LibraryItem): string {
  return [item.currentVersion ? "With a file" : "No file", item.requiresAcknowledgement ? "Acknowledgement required" : null].filter(Boolean).join(" · ");
}

/**
 * Document Library → Response forms tab (the former Survey / Induction Library) for managers and reporters. Surveys
 * stay out of the Documents tab. Rows open the response form page; the create buttons are in the library's banner.
 */
export function SurveyLibraryTab() {
  const router = useRouter();
  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.DOCUMENTS_MANAGE);
  const [{ page, q, status, createdBy }, set] = useUrlState(urlSchema);
  const [search, setSearch] = useUrlSearchText();
  const library = useDocumentLibrary({ page, pageSize: PAGE_SIZE, q, status, type: "survey", createdBy });
  const filtered = Boolean(q || createdBy || status !== "ACTIVE");

  return (
    <>
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <SearchBox value={search} onChange={setSearch} placeholder="Search response forms" />
          <FilterSelect
            value={status === "ACTIVE" ? undefined : status}
            onChange={(v) => set({ status: (v as LibraryStatusFilter | undefined) ?? "ACTIVE" })}
            options={STATUS_OPTIONS}
            allLabel="Active (published & drafts)"
            ariaLabel="Status"
          />
          <FilterSelect
            value={createdBy}
            onChange={(v) => set({ createdBy: v === "me" ? "me" : undefined })}
            options={CREATOR_OPTIONS}
            allLabel="Created by anyone"
            ariaLabel="Created by"
          />
        </div>
      </Card>

      {library.isPending ? (
        <LoadingRows rows={6} className="[&>*]:h-16" />
      ) : library.isError ? (
        <ErrorState error={library.error} onRetry={() => library.refetch()} />
      ) : library.data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No response forms found"
          description={filtered ? "Try a different search or filter." : "Create your first response form to get started."}
          action={
            canManage && !filtered ? (
              <Button asChild>
                <Link href="/documents/surveys/new">
                  <ClipboardCheck /> Create response form
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {library.data.items.map((item) => (
              <li key={item.id}>
                <Link href={surveyPageHref(item.id)} className="block space-y-2.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <ClipboardList className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{subtitle(item)}</p>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                  <SurveyFacts item={item} />
                  <p className="text-xs text-muted-foreground">
                    <Users className="mr-1 inline size-3.5" />
                    {audienceLabel(item.audience)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Response form</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead className="pr-4 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {library.data.items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => router.push(surveyPageHref(item.id))}>
                    <TableCell className="max-w-96 pl-4">
                      <Link href={surveyPageHref(item.id)} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                          <ClipboardList className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{subtitle(item)}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={item.status} />
                    </TableCell>
                    <TableCell>
                      <SurveyFacts item={item} />
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{audienceLabel(item.audience)}</TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatDate(item.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={library.data.total} onPageChange={(p) => set({ page: p })} />
          </div>
        </Card>
      )}
    </>
  );
}
