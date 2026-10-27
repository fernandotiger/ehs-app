"use client";

import { ClipboardCheck, ClipboardList, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import type { LibraryStatusFilter } from "@/lib/validation/documents";
import { useDocumentLibrary, type LibraryItem } from "../../api";
import { audienceLabel, DOCUMENT_STATUS_META, formatDate } from "../../format";
import { surveyPageHref } from "../../survey-format";
import { FilterSelect, SearchBox } from "../filters";
import { answersLabel } from "./survey-indicator";

const PAGE_SIZE = 20;

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

/** Answers, "Everyone must answer" and closed state of the survey. */
function SurveyFacts({ item }: { item: LibraryItem }) {
  const survey = item.survey;
  if (!survey) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge tone="brand">{answersLabel(survey.participantCount)}</StatusBadge>
      {survey.isMandatory && <StatusBadge tone="warning">Everyone must answer</StatusBadge>}
      {survey.status === "CLOSED" && <StatusBadge>Closed</StatusBadge>}
    </span>
  );
}

function subtitle(item: LibraryItem): string {
  return [item.currentVersion ? "With a file" : "No file", item.requiresAcknowledgement ? "Acknowledgement required" : null].filter(Boolean).join(" · ");
}

/** Survey Library for managers and reporters – surveys are kept out of the Document Library. Rows open the survey page. */
export function SurveyLibrary() {
  const router = useRouter();
  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.DOCUMENTS_MANAGE);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<LibraryStatusFilter>("ACTIVE");
  const [createdBy, setCreatedBy] = useState<"me" | undefined>();
  const [page, setPage] = useState(1);
  const library = useDocumentLibrary({ page, pageSize: PAGE_SIZE, q: q || undefined, status, type: "survey", createdBy });
  const filtered = Boolean(q || createdBy || status !== "ACTIVE");

  return (
    <>
      <PageBanner
        title="Survey Library"
        description="Create surveys, choose who should answer them and follow the answers."
        actions={
          canManage ? (
            <Button asChild size="lg" className="bg-white text-brand-dark hover:bg-white/90">
              <Link href="/documents/surveys/new">
                <ClipboardCheck /> Create survey
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search surveys"
          />
          <FilterSelect
            value={status === "ACTIVE" ? undefined : status}
            onChange={(v) => {
              setStatus((v as LibraryStatusFilter | undefined) ?? "ACTIVE");
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            allLabel="Active (published & drafts)"
            ariaLabel="Status"
          />
          <FilterSelect
            value={createdBy}
            onChange={(v) => {
              setCreatedBy(v === "me" ? "me" : undefined);
              setPage(1);
            }}
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
          title="No surveys found"
          description={filtered ? "Try a different search or filter." : "Create your first survey to get started."}
          action={
            canManage && !filtered ? (
              <Button asChild>
                <Link href="/documents/surveys/new">
                  <ClipboardCheck /> Create survey
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
                  <TableHead className="pl-4">Survey</TableHead>
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
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={library.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}
    </>
  );
}
