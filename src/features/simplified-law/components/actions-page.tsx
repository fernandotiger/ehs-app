"use client";

import { AlarmClock, ArrowRight, CalendarClock, CheckCircle2, ListChecks, RotateCcw, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { PaginationBar } from "@/components/common/pagination-bar";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { errorMessage } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { SLAW_BASE, slawLegislationHref } from "@/lib/simplified-law";
import type { SlawActionListQuery } from "@/lib/validation/simplified-law";
import { cn } from "@/lib/utils";
import { useCompleteSlawAction, useSlawAction, useSlawActions, useSlawActionSummary, type SlawActionItem } from "../api";
import { blockersOf, formatDate, STALE_MESSAGE } from "../format";
import { Blockers } from "./shared";

const PAGE_SIZE = 20;
type View = SlawActionListQuery["view"];
type Status = SlawActionListQuery["status"];

function ActionBadge({ a }: { a: SlawActionItem }) {
  if (a.action.status === "DONE") return <StatusBadge tone="success">Done</StatusBadge>;
  return a.action.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : <StatusBadge tone="info">Open</StatusBadge>;
}

/** "Actions to do": the storyboard's action tracker – every gap's action, with its owner and due date, until it is done. */
export function SlawActions() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const seesAll = can(PERMISSIONS.SLAW_VIEW) || can(PERMISSIONS.SLAW_ASSESS) || can(PERMISSIONS.SLAW_MANAGE);
  const [view, setView] = useState<View>(params.get("view") === "all" && seesAll ? "all" : "mine");
  const [status, setStatus] = useState<Status>("OPEN");
  const [overdue, setOverdue] = useState<"true" | undefined>(params.get("overdue") === "true" ? "true" : undefined);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const summary = useSlawActionSummary();
  const list = useSlawActions({ page, pageSize: PAGE_SIZE, view, status, overdue, q: q || undefined });
  const s = summary.data;

  const changeView = (next: string) => {
    setView(next as View);
    setPage(1);
    router.replace(next === "all" ? `${SLAW_BASE}/actions?view=all` : `${SLAW_BASE}/actions`, { scroll: false });
  };
  const close = () => {
    setOpenId(null);
    if (params.get("open")) router.replace(`${SLAW_BASE}/actions${view === "all" ? "?view=all" : ""}`, { scroll: false });
  };
  const filtered = Boolean(q || overdue || status !== "OPEN");

  return (
    <>
      <PageBanner title="Actions to do" description="Gaps found in the compliance checks – who fixes what, by when. Mark an action done when it is finished; the person who set it checks the requirement again." />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mine to do" value={s?.mine ?? "–"} hint="Open actions I own" icon={UserCheck} />
        <StatCard label="Overdue" value={s?.overdue ?? "–"} hint="Past the due date" icon={AlarmClock} tone={s?.overdue ? "danger" : "success"} />
        <StatCard label="Due this week" value={s?.dueSoon ?? "–"} hint="Today and the next 6 days" icon={CalendarClock} tone="warning" />
        <StatCard label={seesAll ? "Open in total" : "Open"} value={s?.open ?? "–"} hint={seesAll ? "Everyone's open actions" : "Your open actions"} icon={ListChecks} tone="info" />
      </div>

      {seesAll && (
        <Tabs value={view} onValueChange={changeView} className="mb-3">
          <TabsList>
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="all">Everyone&apos;s</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search action, requirement or law" />
          <FilterSelect
            value={status === "ALL" ? undefined : status}
            onChange={(v) => { setStatus((v as Status | undefined) ?? "ALL"); setPage(1); }}
            options={[{ id: "OPEN", name: "Open" }, { id: "DONE", name: "Done" }]}
            allLabel="Open and done"
            ariaLabel="Status"
          />
          <FilterSelect value={overdue} onChange={(v) => { setOverdue(v as "true" | undefined); setPage(1); }} options={[{ id: "true", name: "Overdue only" }]} allLabel="Any due date" ariaLabel="Due date" />
        </div>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filtered ? "No actions found" : view === "mine" ? "Nothing to do right now" : "No open actions"}
          description={filtered ? "Try a different search or filter." : "When a requirement is not compliant, its action appears here with an owner and a due date."}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((a) => (
              <li key={a.requirementId}>
                <button type="button" onClick={() => setOpenId(a.requirementId)} className="block w-full space-y-1.5 p-4 text-left hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{a.action.text}</p>
                    <ActionBadge a={a} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.lawTitle} · {a.mine ? "me" : (a.action.owner?.name ?? "no owner")} · due {formatDate(a.action.dueDate)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Action</TableHead>
                  <TableHead>Law</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="pr-4">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((a) => (
                  <TableRow key={a.requirementId} className="cursor-pointer" onClick={() => setOpenId(a.requirementId)}>
                    <TableCell className="max-w-96 whitespace-normal pl-4">
                      <span className="block font-medium leading-snug">{a.action.text}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{a.requirementText}</span>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{a.lawTitle}</TableCell>
                    <TableCell>
                      <ActionBadge a={a} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.mine ? "Me" : (a.action.owner?.name ?? "—")}</TableCell>
                    <TableCell className={cn("pr-4", a.action.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{formatDate(a.action.dueDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}
      <ActionSheet requirementId={openId} onClose={close} />
    </>
  );
}

/** One action with its requirement; the owner (or an assessor) marks it done with a short note. */
function ActionSheet({ requirementId, onClose }: { requirementId: string | null; onClose: () => void }) {
  const query = useSlawAction(requirementId);
  return (
    <Sheet open={Boolean(requirementId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {query.isPending ? (
          <div className="p-4">
            <LoadingRows rows={3} />
          </div>
        ) : query.isError ? (
          <>
            <SheetHeader>
              <SheetTitle>Action not found</SheetTitle>
              <SheetDescription>It does not exist any more or you do not have access to it.</SheetDescription>
            </SheetHeader>
          </>
        ) : (
          <ActionDetail key={query.data.requirementId} a={query.data} onDone={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActionDetail({ a, onDone }: { a: SlawActionItem; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const complete = useCompleteSlawAction();

  async function submit() {
    setBlockers([]);
    try {
      await complete.mutateAsync({ id: a.requirementId, expectedVersion: a.version, note });
      toast.success("Action marked as done");
      onDone();
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE_MESSAGE : errorMessage(error));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{a.action.text}</SheetTitle>
        <SheetDescription>{a.lawTitle}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <ActionBadge a={a} />
          {a.recheck && (
            <StatusBadge tone="brand">
              <RotateCcw className="size-3" /> Requirement to check again
            </StatusBadge>
          )}
        </div>
        <dl className="space-y-3 text-sm">
          <Item label="Owner">{a.mine ? `${a.action.owner?.name ?? "Me"} (me)` : (a.action.owner?.name ?? "—")}</Item>
          <Item label="Due">
            <span className={a.action.overdue ? "font-medium text-destructive" : undefined}>
              {formatDate(a.action.dueDate)}
              {a.action.overdue ? " · overdue" : ""}
            </span>
          </Item>
          {a.action.setBy && <Item label="Set by">{a.action.setBy.name}</Item>}
          <Item label="Requirement">
            <span className="block">{a.requirementText}</span>
            {(a.section || a.articles) && <span className="block text-xs text-muted-foreground">{[a.section, a.articles].filter(Boolean).join(" · ")}</span>}
          </Item>
          {a.gap && <Item label="The gap">{a.gap}</Item>}
          {a.action.status === "DONE" && (
            <Item label="Done">
              {formatDate(a.action.completedAt)}
              {a.action.completedBy ? ` by ${a.action.completedBy.name}` : ""}
              {a.action.note ? <span className="block text-muted-foreground">{a.action.note}</span> : null}
            </Item>
          )}
        </dl>
        {a.canOpenLaw && (
          <Button asChild variant="outline" size="sm">
            <Link href={slawLegislationHref(a.legislationId, "requirements")}>
              Open the law&apos;s requirements <ArrowRight />
            </Link>
          </Button>
        )}
        {a.canComplete && (
          <div className="space-y-3 rounded-lg border p-3">
            <Field>
              <FieldLabel htmlFor="slaw-done-note">What was done? *</FieldLabel>
              <Textarea id="slaw-done-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Repak EPR form completed and data collection set up" />
            </Field>
            {!a.mine && <p className="text-xs text-muted-foreground">You are completing this for {a.action.owner?.name ?? "the owner"}; they stay the owner.</p>}
            <Blockers title="Not done yet" blockers={blockers} />
          </div>
        )}
      </div>
      {a.canComplete && (
        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button disabled={complete.isPending || !note.trim()} onClick={() => void submit()}>
            {complete.isPending ? <Spinner /> : <CheckCircle2 />} Mark as done
          </Button>
        </SheetFooter>
      )}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
