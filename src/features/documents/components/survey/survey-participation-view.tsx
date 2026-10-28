"use client";

import { BellRing, CheckCircle2, UserCheck } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { errorMessage } from "@/lib/api-client";
import type { SurveyParticipationStatus } from "@/lib/validation/document-surveys";
import { formatDate } from "../../format";
import { useSurveyParticipation, useSurveyReminder, type SurveyDto } from "../../survey-api";
import { FilterSelect, SearchBox } from "../filters";

const PAGE_SIZE = 20;

/**
 * Who has completed it: Completed / Not completed lists with search and department filter, and
 * "Send reminder" for mandatory surveys. Only participation is shown – never who answered anonymously.
 */
export function SurveyParticipationView({ documentId, survey, canRemind }: { documentId: string; survey: SurveyDto; canRemind: boolean }) {
  const lookups = useLookups();
  const structure = structureOptions(lookups.data);
  const [status, setStatus] = useState<SurveyParticipationStatus>("not_answered");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const query = useSurveyParticipation(documentId, { status, page, pageSize: PAGE_SIZE, q: q || undefined, departmentId });
  const remind = useSurveyReminder(documentId);
  const counts = query.data?.counts;

  async function sendReminder() {
    try {
      const res = await remind.mutateAsync();
      toast.success(
        res.notified
          ? `Reminder sent to ${res.notified.toLocaleString()} ${res.notified === 1 ? "person" : "people"}.`
          : "Everyone who has not completed it has already been reminded today.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={status}
          onValueChange={(v) => {
            setStatus(v as SurveyParticipationStatus);
            setPage(1);
          }}
        >
          <TabsList className="h-9 w-full sm:w-fit">
            <TabsTrigger value="not_answered" className="px-3">
              Not completed {counts ? `(${counts.notAnswered.toLocaleString()})` : ""}
            </TabsTrigger>
            <TabsTrigger value="answered" className="px-3">
              Completed {counts ? `(${counts.answered.toLocaleString()})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {canRemind && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={remind.isPending || !counts?.notAnswered}>
                <BellRing /> Send reminder
              </Button>
            }
            title="Send a reminder?"
            description={`Everyone who has not completed it yet${counts ? ` (${counts.notAnswered.toLocaleString()} ${counts.notAnswered === 1 ? "person" : "people"})` : ""} gets an in-app reminder. People are reminded at most once a day.`}
            confirmLabel="Send reminder"
            onConfirm={sendReminder}
          />
        )}
      </div>
      <div className="grid gap-2 border-b p-3 sm:grid-cols-[2fr_1fr]">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name, email or employee no."
        />
        <FilterSelect
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v);
            setPage(1);
          }}
          options={structure.departments}
          allLabel="All departments"
        />
      </div>
      <p className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        This list shows who took part, never which answers are theirs.{survey.allowAnonymous ? " People who answered anonymously appear as Completed like everyone else." : ""}
      </p>

      {query.isPending ? (
        <LoadingRows rows={6} className="p-3" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} className="m-3" />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={status === "answered" ? UserCheck : CheckCircle2}
          title={status === "answered" ? "Nobody has completed it yet" : "Everyone has completed it"}
          description={q || departmentId ? "Try different filters." : undefined}
          className="m-3 border-0"
        />
      ) : (
        <>
          <ul className="divide-y md:hidden">
            {query.data.items.map((row) => (
              <li key={row.userId} className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[row.department?.name, row.location?.name].filter(Boolean).join(" · ") || row.email}</p>
                </div>
                {row.answeredAt ? <StatusBadge tone="success">Completed {formatDate(row.answeredAt)}</StatusBadge> : <StatusBadge tone="warning">Not completed</StatusBadge>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Person</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="pl-4">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </TableCell>
                    <TableCell>{row.department?.name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{row.location?.name ?? "—"}</TableCell>
                    <TableCell className="pr-4">
                      {row.answeredAt ? <StatusBadge tone="success">Completed {formatDate(row.answeredAt)}</StatusBadge> : <StatusBadge tone="warning">Not completed</StatusBadge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {query.data && query.data.total > 0 && (
        <div className="border-t px-3">
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
        </div>
      )}
    </Card>
  );
}
