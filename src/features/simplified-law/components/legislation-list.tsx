"use client";

import { ArrowRight, BookOpen, FileSearch, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { useUrlSearchText, useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS } from "@/lib/permissions";
import { CHECK_FILTER_LABELS, CHECK_FILTERS, LEGAL_STATUSES, SLAW_BASE, slawLegislationHref, statusLabels, type CheckFilterKey, type LegalStatusKey, type StatusLabels } from "@/lib/simplified-law";
import { registerSteps } from "@/lib/simplified-law/rules";
import { cn } from "@/lib/utils";
import { legislationListQuerySchema } from "@/lib/validation/simplified-law";
import { useLegislationList, useSlawCategories, useSlawSettings, type LegislationListParams, type SlawCategoryNode, type SlawLegislationListItem } from "../api";
import { OverviewSheet } from "./article-overview";
import { categoryPath, LegalStatusBadge, OfficialLink, ProgressBadge, StepsBar } from "./shared";

const PAGE_SIZE = 20;

/**
 * URL state. `category` is set by the step bar and sidebar links; `hideRepealed` is left out until the user flips
 * the switch (then the company setting no longer decides).
 */
const urlSchema = legislationListQuerySchema.pick({ page: true, q: true, jurisdiction: true, status: true, check: true }).extend({
  category: legislationListQuerySchema.shape.categoryId,
  hideRepealed: z.enum(["true", "false"]).optional(),
});

function findCategory(tree: SlawCategoryNode[], id: string | null): { node: SlawCategoryNode; parent: SlawCategoryNode | null } | null {
  if (!id) return null;
  for (const top of tree) {
    if (top.id === id) return { node: top, parent: null };
    const child = top.children.find((c) => c.id === id);
    if (child) return { node: child, parent: top };
  }
  return null;
}

/** Storyboard step 2: all legislation of a (sub-)category with jurisdiction, status and a summary of each. */
export function LegislationList() {
  const router = useRouter();
  const { can } = useCurrentUser();
  // A link to another category is a new URL without `page`, so the page starts again at 1.
  const [{ category, page, q, jurisdiction, status, check, hideRepealed }, set] = useUrlState(urlSchema);
  const categoryId = category ?? null;
  const filters: Pick<LegislationListParams, "jurisdiction" | "status" | "check"> = { jurisdiction, status, check };
  const settings = useSlawSettings();
  const categories = useSlawCategories();
  const labels = statusLabels(settings.data?.statusLabels);
  const [search, setSearch] = useUrlSearchText();
  const [overviewId, setOverviewId] = useState<string | null>(null);
  const hide = filters.status === "REPEALED" ? false : hideRepealed ? hideRepealed === "true" : (settings.data?.hideRepealed ?? true);

  const list = useLegislationList({ page, pageSize: PAGE_SIZE, categoryId: categoryId ?? undefined, q, ...filters, hideRepealed: hide ? "true" : "false" });
  const found = findCategory(categories.data ?? [], categoryId);
  const title = found ? (found.parent ? `${found.parent.name} › ${found.node.name}` : found.node.name) : "All legislation";
  const setPage = (next: number) => set({ page: next });
  const filtered = Boolean(q || filters.jurisdiction || filters.status || filters.check);
  const backHref = found ? `${SLAW_BASE}?category=${found.parent?.id ?? found.node.id}` : SLAW_BASE;

  return (
    <>
      <PageHeader
        title={title}
        backHref={backHref}
        backLabel="Select category"
        description={found?.node.description || "Every law with its jurisdiction, status and a short summary. Open one to check whether it applies to us."}
        actions={
          can(PERMISSIONS.SLAW_MANAGE) ? (
            <Button asChild variant="outline">
              <Link href={`${SLAW_BASE}/configuration/legislation/new${found?.parent ? `?category=${found.node.id}` : ""}`}>
                <Plus /> Add a law
              </Link>
            </Button>
          ) : undefined
        }
      />
      <StepsBar steps={registerSteps("legislation")} links={{ category: backHref }} />

      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={setSearch} placeholder="Search title, number or summary" />
          <FilterSelect value={filters.jurisdiction} onChange={(v) => set({ jurisdiction: v })} options={(settings.data?.jurisdictions ?? []).map((j) => ({ id: j, name: j }))} allLabel="Jurisdiction: all" ariaLabel="Jurisdiction" />
          <FilterSelect value={filters.status} onChange={(v) => set({ status: v as LegalStatusKey | undefined })} options={LEGAL_STATUSES.map((st) => ({ id: st, name: labels[st] }))} allLabel="Status: all" ariaLabel="Status" />
          <FilterSelect value={filters.check} onChange={(v) => set({ check: v as CheckFilterKey | undefined })} options={CHECK_FILTERS.map((c) => ({ id: c, name: CHECK_FILTER_LABELS[c] }))} allLabel="Our check: all" ariaLabel="Our check" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Switch id="hide-repealed" checked={hide} disabled={filters.status === "REPEALED"} onCheckedChange={(v) => set({ hideRepealed: v ? "true" : "false" })} />
          <Label htmlFor="hide-repealed" className="text-sm font-normal text-muted-foreground">
            Hide {labels.REPEALED.toLowerCase()} laws
          </Label>
        </div>
      </Card>

      {list.isPending ? (
        <LoadingCards count={4} className="sm:grid-cols-1 lg:grid-cols-1" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title={filtered ? "No laws found" : "No legislation here yet"}
          description={filtered ? "Try a different search or filter." : can(PERMISSIONS.SLAW_MANAGE) ? "Add the laws that belong to this sub-category." : "An administrator adds the laws for this sub-category."}
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {list.data.total} law{list.data.total === 1 ? "" : "s"}
            {hide ? ` · ${labels.REPEALED.toLowerCase()} hidden` : ""}
          </p>
          <ul className="space-y-3">
            {list.data.items.map((item) => (
              <LegislationCard key={item.id} item={item} labels={labels} showCategory={!found?.parent} onOverview={() => setOverviewId(item.id)} onOpen={(href) => router.push(href)} />
            ))}
          </ul>
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
        </>
      )}
      <OverviewSheet legislationId={overviewId} onOpenChange={(o) => !o && setOverviewId(null)} />
    </>
  );
}

function primaryFor(item: SlawLegislationListItem): { label: string; href: string } {
  switch (item.progress.key) {
    case "NOT_CHECKED":
      return { label: "Check applicability", href: slawLegislationHref(item.id, "applicability") };
    case "NOT_COMPLIANT":
    case "TO_ASSESS":
    case "COMPLIANT":
    case "NO_REQUIREMENTS":
      return { label: "Requirements", href: slawLegislationHref(item.id, "requirements") };
    default:
      return { label: "Open", href: slawLegislationHref(item.id) };
  }
}

function LegislationCard({ item, labels, showCategory, onOverview, onOpen }: { item: SlawLegislationListItem; labels: StatusLabels; showCategory: boolean; onOverview: () => void; onOpen: (href: string) => void }) {
  const repealed = item.status === "REPEALED";
  const primary = primaryFor(item);
  return (
    <li>
      <Card className={cn("gap-3 p-4", repealed && "bg-muted/40 opacity-70")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link href={slawLegislationHref(item.id)} className="line-clamp-3 font-semibold leading-snug hover:underline sm:line-clamp-none" title={item.title}>
              {item.title}
              {item.shortTitle && !item.title.includes(item.shortTitle) ? ` (${item.shortTitle})` : ""}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[item.jurisdiction, item.reference].filter(Boolean).join(" · ")}
              {showCategory ? ` · ${categoryPath(item)}` : ""}
            </p>
          </div>
          <div className="shrink-0">
            <LegalStatusBadge status={item.status} labels={labels} note={item.kindLabel} />
          </div>
        </div>
        {item.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{item.summary}</p>}
        {item.relationNote && (item.status === "REPEALED" || item.status === "SUPERSEDED") && <p className="line-clamp-2 text-xs text-muted-foreground">{item.relationNote}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>{repealed ? <span className="text-xs text-muted-foreground">Listed for reference – no requirements to check.</span> : <ProgressBadge progress={item.progress} />}</div>
          <div className="flex flex-wrap items-center gap-2">
            <OfficialLink href={item.officialUrl} className="mr-1" />
            <Button variant="outline" size="sm" onClick={onOverview}>
              <BookOpen /> Overview
            </Button>
            {!repealed && (
              <Button size="sm" variant={item.progress.key === "NOT_CHECKED" || item.progress.key === "TO_ASSESS" ? "default" : "secondary"} onClick={() => onOpen(primary.href)}>
                {primary.label} <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
