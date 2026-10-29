"use client";

import { ClipboardCheck, Info, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirementCounts } from "@/lib/simplified-law/rules";
import { cn } from "@/lib/utils";
import type { SlawLegislationDetailDto, SlawRequirementDto } from "../api";
import { formatDate } from "../format";
import { RequirementSheet } from "./requirement-sheet";
import { ComplianceBadge } from "./shared";

const ALL = "__all";

/** Sections in their first-seen order ("" = requirements without a section). */
function sectionsOf(rows: SlawRequirementDto[]): string[] {
  return [...new Set(rows.map((r) => r.section))];
}

/** Storyboard step 5 "Requirements": a checklist per section – compliant?, reason, and if not: action, owner, due date. */
export function RequirementsTab({ law, onCheckApplicability }: { law: SlawLegislationDetailDto; onCheckApplicability: () => void }) {
  const [section, setSection] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = law.requirements.find((r) => r.id === openId) ?? null;

  if (law.status === "REPEALED") return <EmptyState icon={Info} title="Nothing to check" description="This law is repealed – no requirements are generated." />;
  if (law.applicability === "NOT_CHECKED") {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="First check whether this law applies to us"
        description="Answer the applicability questions. When the law applies, its requirements checklist opens here."
        action={law.rights.assess ? <Button onClick={onCheckApplicability}>Check applicability</Button> : undefined}
      />
    );
  }
  if (law.applicability === "DOES_NOT_APPLY") {
    return (
      <EmptyState
        icon={Info}
        title="This law does not apply to us"
        description={law.applicabilityReason ? `Reason: ${law.applicabilityReason}` : "No requirements to check."}
        action={law.rights.assess ? <Button variant="outline" onClick={onCheckApplicability}>Change the decision</Button> : undefined}
      />
    );
  }
  if (!law.requirements.length) {
    return <EmptyState icon={ClipboardCheck} title="No requirements listed" description={law.rights.manage ? "Add the requirements to check in Configuration → Legislation." : "An administrator adds the requirements of this law."} />;
  }

  const sections = sectionsOf(law.requirements);
  const current = section !== ALL && sections.includes(section) ? section : ALL;
  const rows = current === ALL ? law.requirements : law.requirements.filter((r) => r.section === current);
  const c = law.counts;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-success">{c.compliant} compliant</span>
        <span className="font-medium text-destructive">{c.notCompliant} not compliant</span>
        <span className="text-muted-foreground">{c.notAssessed} not assessed</span>
        {c.notApplicable > 0 && <span className="text-muted-foreground">{c.notApplicable} N/A</span>}
        {c.recheck > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-brand">
            <RotateCcw className="size-3.5" /> {c.recheck} to check again
          </span>
        )}
      </div>

      <div className={cn("grid gap-4", sections.length > 1 && "lg:grid-cols-[16rem_minmax(0,1fr)]")}>
        {sections.length > 1 && (
          <>
            <div className="lg:hidden">
              <Select value={current} onValueChange={setSection}>
                <SelectTrigger className="w-full bg-card" aria-label="Section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sections ({law.requirements.length})</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s || "none"} value={s}>
                      {s || "Other"} ({law.requirements.filter((r) => r.section === s).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <nav className="hidden lg:block" aria-label="Requirement sections">
              <Card className="sticky top-20 gap-0 p-2">
                <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{law.shortTitle || "Requirement"} sections</p>
                <SectionButton label="All sections" active={current === ALL} onClick={() => setSection(ALL)} rows={law.requirements} />
                {sections.map((s, i) => (
                  <SectionButton key={s || "none"} label={`${i + 1}. ${s || "Other"}`} active={current === s} onClick={() => setSection(s)} rows={law.requirements.filter((r) => r.section === s)} />
                ))}
              </Card>
            </nav>
          </>
        )}

        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="block w-full space-y-2 p-4 text-left hover:bg-muted/50">
                  <p className="text-sm font-medium leading-snug">{r.text}</p>
                  {r.articles && <p className="text-xs text-muted-foreground">{r.articles}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <ComplianceBadge compliance={r.compliance} />
                    {r.recheck && <span className="text-xs font-medium text-brand">Action done – check again</span>}
                  </div>
                  {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                  {r.action.status === "OPEN" && <ActionLine r={r} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Requirement & linked articles</TableHead>
                  <TableHead>Compliant?</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>If not: action</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="w-10 pr-4">
                    <span className="sr-only">Edit</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer align-top" onClick={() => setOpenId(r.id)}>
                    <TableCell className="min-w-64 max-w-96 whitespace-normal pl-4">
                      <p className="font-medium leading-snug">{r.text}</p>
                      {r.articles && <p className="mt-1 text-xs text-muted-foreground">{r.articles}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <ComplianceBadge compliance={r.compliance} />
                        {r.recheck && <p className="text-xs font-medium text-brand">Check again</p>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal text-muted-foreground">{r.reason || "—"}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal">{r.compliance === "NOT_COMPLIANT" && r.action.text ? r.action.text : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.compliance === "NOT_COMPLIANT" ? (r.action.owner?.name ?? "—") : "—"}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", r.action.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {r.compliance === "NOT_COMPLIANT" && r.action.dueDate ? `${formatDate(r.action.dueDate)}${r.action.status === "DONE" ? " (done)" : ""}` : "—"}
                    </TableCell>
                    <TableCell className="pr-4">
                      {law.rights.assess && (
                        <Button variant="ghost" size="icon-sm" aria-label="Check this requirement" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                          <Pencil />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">{law.rights.assess ? "Click a row to check it. Actions with an owner and a due date go to Actions to do until they are done." : "Click a row to see its details and evidence."}</p>
        </Card>
      </div>
      <RequirementSheet requirement={open} editable={law.rights.assess} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function ActionLine({ r }: { r: SlawRequirementDto }) {
  return (
    <p className={cn("text-xs", r.action.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
      Action: {r.action.text} · {r.action.owner?.name ?? "no owner"} · due {formatDate(r.action.dueDate)}
      {r.action.overdue ? " (overdue)" : ""}
    </p>
  );
}

function SectionButton({ label, active, onClick, rows }: { label: string; active: boolean; onClick: () => void; rows: SlawRequirementDto[] }) {
  const c = requirementCounts(rows.map((r) => ({ compliance: r.compliance, actionStatus: r.action.status })));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm", active ? "bg-brand-soft font-medium text-brand" : "hover:bg-muted")}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs">
        {c.notCompliant > 0 ? <span className="text-destructive">{c.notCompliant}!</span> : c.notAssessed > 0 ? <span className="text-muted-foreground">{c.notAssessed} left</span> : <span className="text-success">✓</span>}
      </span>
    </button>
  );
}
