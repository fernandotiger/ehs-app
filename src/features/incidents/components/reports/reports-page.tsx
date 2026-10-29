"use client";

import { Download, LineChart, Printer, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { UserPicker } from "@/components/common/user-picker";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useLookup } from "@/features/shared/lookups";
import { useUrlState, useUrlTab } from "@/hooks/use-url-state";
import { errorMessage } from "@/lib/api-client";
import { CAUSE_GROUP_LABELS, CAUSE_GROUPS, CAUSE_LISTS } from "@/lib/incidents";
import { PERMISSIONS } from "@/lib/permissions";
import { optionalId } from "@/lib/validation/common";
import { dateString, REPORT_KEYS, type ReportKey } from "@/lib/validation/incidents";
import { trendCriteriaErrors } from "@/server/modules/incidents/workflow";
import { toQueryString, useCreateTrendAction, useIncidentTypes, useReport, useTrendPreviewQuery, type TrendPreviewDto } from "../../api";
import { addDaysLocal, blockersOf, formatDate, todayLocal } from "../../format";
import { DepartmentSelect, SimpleSelect, SiteSelect } from "../fields";
import { BarList, BlockerList, SeverityBadge } from "../shared";

type TabKey = ReportKey | "trends";
const TAB_KEYS: readonly TabKey[] = [...REPORT_KEYS, "trends"];
/**
 * URL state: the period and site of the standard reports (left out = this year to today, all sites) and the Trends
 * criteria, written when "Preview matches" is pressed so an opened favourite runs the preview at once.
 */
const urlSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  siteId: optionalId,
  typeId: optionalId,
  subtypeId: optionalId,
  causeId: optionalId,
  departmentId: optionalId,
});
type UrlState = z.output<typeof urlSchema>;
type UrlPatch = Partial<z.input<typeof urlSchema>>;
const NO_PAGE: readonly string[] = [];

/** Standard incident reports (period/site, CSV, print) and Trends & prevention. */
export function IncidentReportsPage() {
  const tab = useUrlTab<TabKey>("tab", "by-type", TAB_KEYS);
  const current = tab.value;
  const [state, set] = useUrlState(urlSchema, { resetKeys: NO_PAGE });
  const from = state.from ?? `${todayLocal().slice(0, 4)}-01-01`;
  const to = state.to ?? todayLocal();
  const siteId = state.siteId;

  return (
    <>
      <PageHeader title="Incident reports" description="Standard reports for a period and site – download as CSV or print. Trends & prevention finds repeating events." />
      <Tabs {...tab} className="mb-4" data-print-hide>
        <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <TabsList>
            {REPORT_KEYS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {SHORT[k]}
              </TabsTrigger>
            ))}
            <TabsTrigger value="trends">
              <Sparkles className="size-3.5" /> Trends & prevention
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {current === "trends" ? (
        <TrendsTab state={state} set={set} />
      ) : (
        <>
          <Card className="mb-4 gap-0 p-3" data-print-hide>
            <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(12rem,16rem)_1fr] sm:items-end">
              <Field>
                <FieldLabel htmlFor="rep-from">From</FieldLabel>
                <UrlDateInput id="rep-from" value={from} onChange={(v) => set({ from: v })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rep-to">To</FieldLabel>
                <UrlDateInput id="rep-to" value={to} onChange={(v) => set({ to: v })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rep-site">Site</FieldLabel>
                <SiteSelect id="rep-site" value={siteId} onChange={(v) => set({ siteId: v })} allowNone noneLabel="All sites" />
              </Field>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button asChild variant="outline">
                  <a href={`/api/incidents/reports/${current}?${toQueryString({ from, to, siteId, format: "csv" })}`}>
                    <Download /> CSV
                  </a>
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer /> Print
                </Button>
              </div>
            </div>
          </Card>
          <ReportView reportKey={current} from={from} to={to} siteId={siteId} />
        </>
      )}
    </>
  );
}

/** Date box bound to the URL: a cleared or half-typed date stays in the box (not written) until it is complete. */
function UrlDateInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      id={id}
      type="date"
      value={draft ?? value}
      onChange={(e) => {
        if (e.target.value) {
          setDraft(null);
          onChange(e.target.value);
        } else setDraft("");
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

const SHORT: Record<ReportKey, string> = { "by-type": "By type", "by-cause": "By cause", "days-lost": "Days lost", actions: "Actions & tasks", incidents: "Incident tracking" };

function ReportView({ reportKey, from, to, siteId }: { reportKey: ReportKey; from: string; to: string; siteId: string | null }) {
  const valid = Boolean(from && to && from <= to);
  const report = useReport(reportKey, { from, to, siteId: siteId ?? undefined }, valid);
  if (!valid) return <BlockerList title="Choose a valid reporting period" blockers={["The period end must be on or after its start."]} />;
  if (report.isPending) return <LoadingRows rows={5} />;
  if (report.isError) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;
  const r = report.data;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{r.title}</h2>
        <p className="text-sm text-muted-foreground">
          {formatDate(r.period.from)} – {formatDate(r.period.to)} · {r.period.siteName ?? "All sites"}
        </p>
      </div>
      {r.chart.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <BarList items={r.chart} />
          </CardContent>
        </Card>
      )}
      {r.rows.length === 0 ? (
        <EmptyState icon={LineChart} title="Nothing in this period" description="Try a longer period or another site." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {r.columns.map((c) => (
                    <TableHead key={c} className="first:pl-4 last:pr-4">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.rows.map((row, i) => (
                  <TableRow key={i} className={row[0] === "Total" ? "font-semibold" : undefined}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="max-w-72 whitespace-normal first:pl-4 last:pr-4">
                        {cell ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      {r.notes.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  );
}

function TrendsTab({ state, set }: { state: UrlState; set: (patch: UrlPatch) => void }) {
  const { can } = useCurrentUser();
  const types = useIncidentTypes(true);
  const causeLists = {
    EQUIPMENT: useLookup(CAUSE_LISTS.EQUIPMENT, { includeInactive: false }),
    MATERIALS: useLookup(CAUSE_LISTS.MATERIALS),
    METHODS: useLookup(CAUSE_LISTS.METHODS),
    PEOPLE: useLookup(CAUSE_LISTS.PEOPLE),
    WORKPLACE: useLookup(CAUSE_LISTS.WORKPLACE),
  };
  const causes = CAUSE_GROUPS.flatMap((g) => (causeLists[g].data ?? []).map((c) => ({ value: c.id, label: `${CAUSE_GROUP_LABELS[g]} → ${c.label}` })));
  // Criteria of the last preview, kept in the URL (dates left out = the last 30 days).
  const saved = { from: state.from ?? addDaysLocal(todayLocal(), -30), to: state.to ?? todayLocal(), typeId: state.typeId, subtypeId: state.subtypeId, causeId: state.causeId, departmentId: state.departmentId };
  const savedKey = JSON.stringify(saved);
  // Half-entered criteria stay local until "Preview matches"; a URL change from outside (a link, Back) replaces them.
  const [criteria, setCriteria] = useState(saved);
  const [seen, setSeen] = useState(savedKey);
  const [checkBlockers, setCheckBlockers] = useState<string[]>([]);
  if (savedKey !== seen) {
    setSeen(savedKey);
    setCriteria(saved);
    setCheckBlockers([]);
  }
  const ready = Boolean(saved.typeId || saved.subtypeId || saved.causeId);
  const preview = useTrendPreviewQuery(saved, ready);
  const serverBlockers = preview.isError ? blockersOf(preview.error) : [];
  const blockers = checkBlockers.length ? checkBlockers : serverBlockers;
  const type = types.data?.find((t) => t.id === criteria.typeId);

  function run() {
    const errors = trendCriteriaErrors(criteria);
    setCheckBlockers(errors);
    if (errors.length) return;
    if (JSON.stringify(criteria) === savedKey) void preview.refetch();
    else set(criteria);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Find repeating events</CardTitle>
          <CardDescription>Active, submitted incidents in a period. Choose at least a type, subtype or cause.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="t-from">From</FieldLabel>
            <Input id="t-from" type="date" value={criteria.from} onChange={(e) => setCriteria({ ...criteria, from: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-to">To</FieldLabel>
            <Input id="t-to" type="date" value={criteria.to} onChange={(e) => setCriteria({ ...criteria, to: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-type">Type</FieldLabel>
            <SimpleSelect id="t-type" value={criteria.typeId} onChange={(v) => setCriteria({ ...criteria, typeId: v, subtypeId: null })} options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))} allowNone noneLabel="Any type" />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-subtype">Subtype</FieldLabel>
            <SimpleSelect id="t-subtype" value={criteria.subtypeId} onChange={(v) => setCriteria({ ...criteria, subtypeId: v })} options={(type?.subtypes ?? []).map((s) => ({ value: s.id, label: s.name }))} allowNone noneLabel="Any subtype" disabled={!type} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-cause">Cause</FieldLabel>
            <SimpleSelect id="t-cause" value={criteria.causeId} onChange={(v) => setCriteria({ ...criteria, causeId: v })} options={causes} allowNone noneLabel="Any cause" />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-dept">Department</FieldLabel>
            <DepartmentSelect id="t-dept" value={criteria.departmentId} onChange={(v) => setCriteria({ ...criteria, departmentId: v })} allowNone noneLabel="Any department" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button onClick={run} disabled={preview.isFetching}>
              {preview.isFetching ? <Spinner /> : <Search />} Preview matches
            </Button>
          </div>
        </CardContent>
      </Card>
      <BlockerList title="Check the criteria" blockers={blockers} />
      {ready &&
        !checkBlockers.length &&
        !serverBlockers.length &&
        (preview.isPending ? (
          <LoadingRows rows={4} />
        ) : preview.isError ? (
          <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
        ) : (
          <TrendResult key={preview.dataUpdatedAt} result={preview.data} canCreate={can(PERMISSIONS.INCIDENT_ACTION_CREATE)} />
        ))}
    </div>
  );
}

/** Preview result; every match starts selected (remounted for each new preview). */
function TrendResult({ result, canCreate }: { result: TrendPreviewDto; canCreate: boolean }) {
  const [selected, setSelected] = useState<string[]>(() => result.matches.map((m) => m.id));
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            ["By type / subtype", result.summary.byType],
            ["By severity", result.summary.bySeverity],
            ["By department", result.summary.byDepartment],
            ["By cause", result.summary.byCause],
          ] as const
        ).map(([title, items]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList items={[...items]} empty="Nothing to show." />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {result.matches.length} matching incident{result.matches.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>Select the incidents the preventive action should address.</CardDescription>
        </CardHeader>
        <CardContent>
          {result.matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents match.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {result.matches.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-2.5 text-sm">
                  <Checkbox checked={selected.includes(m.id)} onCheckedChange={(c) => setSelected(c ? [...selected, m.id] : selected.filter((x) => x !== m.id))} aria-label={`Select ${m.reference}`} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{m.reference}</span> · {m.title}
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(m.occurredAt)} · {[m.typeLabel, m.subtypeLabel].filter(Boolean).join(" · ")} · {m.departmentName ?? "No department"}
                    </span>
                  </span>
                  <SeverityBadge severity={m.severity} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {canCreate && result.matches.length > 0 && <PreventiveActionForm preview={result} selected={selected} />}
    </>
  );
}

function PreventiveActionForm({ preview, selected }: { preview: TrendPreviewDto; selected: string[] }) {
  const router = useRouter();
  const create = useCreateTrendAction();
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(addDaysLocal(todayLocal(), 30));
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [reviewDate, setReviewDate] = useState(addDaysLocal(todayLocal(), 60));
  const [blockers, setBlockers] = useState<string[]>([]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a preventive action</CardTitle>
        <CardDescription>
          The action keeps these criteria, the {preview.matches.length} matching references and the time as a snapshot. It only changes when you refresh it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="p-desc">What should be done? *</FieldLabel>
          <Textarea id="p-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Improve pre-use checks" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="p-owner">Owner *</FieldLabel>
            <UserPicker id="p-owner" value={ownerId} onChange={setOwnerId} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-due">Due date *</FieldLabel>
            <Input id="p-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-reviewer">Reviewer</FieldLabel>
            <UserPicker id="p-reviewer" value={reviewerId} onChange={setReviewerId} permission={PERMISSIONS.INCIDENT_ACTION_VERIFY} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-review">Planned review date</FieldLabel>
            <Input id="p-review" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          </Field>
        </div>
        <BlockerList title="Not created" blockers={blockers} tone="destructive" />
        <Button
          disabled={create.isPending || !description.trim() || !ownerId || !selected.length}
          onClick={async () => {
            setBlockers([]);
            try {
              const res = await create.mutateAsync({
                criteria: preview.criteria as Parameters<typeof create.mutateAsync>[0]["criteria"],
                incidentIds: selected,
                description,
                ownerId: ownerId!,
                departmentId: preview.criteria.departmentId ?? null,
                dueDate,
                priority: "NORMAL",
                capaCategory: null,
                reviewerId,
                plannedReviewDate: reviewDate || null,
              });
              toast.success(`Preventive action ${res.reference} created`);
              router.push(`/incidents/actions/${res.id}`);
            } catch (error) {
              setBlockers(blockersOf(error));
              toast.error(errorMessage(error));
            }
          }}
        >
          {create.isPending ? <Spinner /> : <Sparkles />} Create preventive action ({selected.length} incident{selected.length === 1 ? "" : "s"})
        </Button>
      </CardContent>
    </Card>
  );
}

