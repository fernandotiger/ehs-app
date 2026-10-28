"use client";

import { ClipboardCheck, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { PERMISSIONS } from "@/lib/permissions";
import { ALL_REGISTERS, EVALUATION_STATUS_LABELS, EVALUATION_STATUSES, REQUIREMENT_VIEW_LABELS, REQUIREMENT_VIEWS, type EvaluationStatusKey, type RequirementView } from "@/lib/law";
import { useLawProfiles, useLawRequirements, type LawRequirementListItem } from "../../api";
import { dueLabel } from "../../format";
import { OtherRequirementSheet } from "../profiles/other-requirement-sheet";
import { EvaluationStatusBadge, LawDisclaimer, ProfileSelect, RatingBadge, useProfileParam } from "../shared";

const PAGE_SIZE = 20;

const isView = (v: string | null): v is RequirementView => (REQUIREMENT_VIEWS as readonly string[]).includes(v ?? "");
const isStatus = (v: string | null): v is EvaluationStatusKey => (EVALUATION_STATUSES as readonly string[]).includes(v ?? "");

/** "Laws that apply to us": one profile's requirements with their check status. */
export function RequirementRegister() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const [profileId, setProfileId] = useProfileParam();
  const profiles = useLawProfiles();
  const [view, setView] = useState<RequirementView>(isView(params.get("view")) ? (params.get("view") as RequirementView) : "applies");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<EvaluationStatusKey | undefined>(isStatus(params.get("status")) ? (params.get("status") as EvaluationStatusKey) : undefined);
  const [register, setRegister] = useState<string | undefined>(params.get("register") ?? undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [mine, setMine] = useState(params.get("mine") === "true");
  const [attention, setAttention] = useState(params.get("attention") === "true");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const list = useLawRequirements({ page, pageSize: PAGE_SIZE, profileId, view, status, register, category, q: q || undefined, mine: mine ? "true" : undefined, attention: attention ? "true" : undefined });
  const reset = () => setPage(1);
  const profile = list.data?.profile ?? null;
  const fullProfile = profiles.data?.find((p) => p.id === profile?.id);
  const filtered = Boolean(q || status || register || category || mine || attention);

  return (
    <>
      <PageBanner
        title="Laws that apply to us"
        description="Every legal requirement and company commitment in a profile. Open one to record why it applies, how you comply and who looks after it."
        actions={
          fullProfile && !fullProfile.archived ? (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus /> Add a company requirement
            </Button>
          ) : undefined
        }
      />

      {profiles.data && profiles.data.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ProfileSelect value={profile?.id ?? profileId} onChange={(id) => { setProfileId(id); reset(); }} profiles={profiles.data.map((p) => ({ id: p.id, name: p.name, siteName: p.site?.name }))} />
          {profile && <p className="text-xs text-muted-foreground">Legal content {profile.contentVersion}</p>}
        </div>
      )}

      <Tabs value={view} onValueChange={(v) => { setView(v as RequirementView); reset(); }} className="mb-3">
        <TabsList className="h-auto flex-wrap">
          {REQUIREMENT_VIEWS.map((v) => (
            <TabsTrigger key={v} value={v}>
              {REQUIREMENT_VIEW_LABELS[v]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {view === "outside" && (
        <p className="mb-3 text-sm text-muted-foreground">
          Requirements that no longer match the profile&apos;s activities or the accepted legal content. Their checks, evidence, tasks and links are kept – nothing was deleted.
        </p>
      )}
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Search title, reference or keyword" />
          <FilterSelect value={status} onChange={(v) => { setStatus(v as EvaluationStatusKey | undefined); reset(); }} options={EVALUATION_STATUSES.map((s) => ({ id: s, name: EVALUATION_STATUS_LABELS[s] }))} allLabel="Any status" ariaLabel="Status" />
          <FilterSelect value={register} onChange={(v) => { setRegister(v); reset(); }} options={ALL_REGISTERS.map((r) => ({ id: r, name: r }))} allLabel="Any register" ariaLabel="Register" />
          <FilterSelect value={category} onChange={(v) => { setCategory(v); reset(); }} options={(list.data?.categories ?? []).map((c) => ({ id: c, name: c }))} allLabel="Any category" ariaLabel="Category" />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 px-1">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={mine} onCheckedChange={(c) => { setMine(c === true); reset(); }} /> Only mine
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={attention} onCheckedChange={(c) => { setAttention(c === true); reset(); }} /> Needs attention
          </Label>
        </div>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data.profile ? (
        <EmptyState
          icon={Scale}
          title="No legal profile to show"
          description={
            can(PERMISSIONS.LAW_REQUIREMENT_MANAGE)
              ? "A profile describes a site and what happens there, so the app can find the laws that apply."
              : "You don't have access to a legal profile. Compliance tasks given to you are listed under Law → Tasks."
          }
          action={
            <Button asChild>
              {can(PERMISSIONS.LAW_REQUIREMENT_MANAGE) ? <Link href="/law/profiles">Go to profiles</Link> : <Link href="/law/tasks">My Law tasks</Link>}
            </Button>
          }
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={filtered ? "No requirements found" : view === "outside" ? "Nothing outside this profile" : view === "not-relevant" ? "Nothing marked as not applying" : "No requirements here"}
          description={filtered ? "Try a different search or filter." : view === "applies" ? "Add activities to the profile, or add a company requirement." : undefined}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((r) => (
              <li key={r.id}>
                <Link href={`/law/requirements/${r.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{r.title}</p>
                    <EvaluationStatusBadge status={r.status} reviewOverdue={r.reviewOverdue} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.reference} · {r.register} · {r.category}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.owner ? r.owner.name : "Nobody responsible yet"} · next review {dueLabel(r.nextReviewDate)}
                  </p>
                  <Extras r={r} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Requirement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead>Next review</TableHead>
                  {profile?.showRating && <TableHead>Rating</TableHead>}
                  <TableHead className="pr-4">Tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/law/requirements/${r.id}`)}>
                    <TableCell className="max-w-96 pl-4">
                      <Link href={`/law/requirements/${r.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.reference} · {r.register} · {r.category}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <EvaluationStatusBadge status={r.status} reviewOverdue={r.reviewOverdue} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.owner?.name ?? "—"}</TableCell>
                    <TableCell className={r.reviewOverdue ? "font-medium text-destructive" : "text-muted-foreground"}>{dueLabel(r.nextReviewDate)}</TableCell>
                    {profile?.showRating && (
                      <TableCell>
                        <RatingBadge rating={r.rating} />
                      </TableCell>
                    )}
                    <TableCell className="pr-4 text-muted-foreground">{r.openTasks ? `${r.openTasks} open` : "—"}</TableCell>
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
      <LawDisclaimer className="mt-4" />
      {adding && fullProfile && <OtherRequirementSheet open profileId={fullProfile.id} profileName={fullProfile.name} onOpenChange={(o) => !o && setAdding(false)} />}
    </>
  );
}

function Extras({ r }: { r: LawRequirementListItem }) {
  if (!r.openTasks && (r.rating === null || !r.profile.showRating) && r.kind !== "OTHER") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {r.kind === "OTHER" && <StatusBadge tone="purple">Company requirement</StatusBadge>}
      {r.profile.showRating && r.rating !== null && <RatingBadge rating={r.rating} />}
      {r.openTasks > 0 && <StatusBadge tone="info">{r.openTasks} open task{r.openTasks === 1 ? "" : "s"}</StatusBadge>}
    </div>
  );
}
