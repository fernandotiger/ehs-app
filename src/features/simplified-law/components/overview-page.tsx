"use client";

import { AlarmClock, ArrowRight, CircleHelp, FolderOpen, Library, ListTodo, Plus, Scale, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_REGISTER_TITLE, SLAW_BASE } from "@/lib/simplified-law";
import { jurisdictionBreakdown, registerSteps } from "@/lib/simplified-law/rules";
import { cn } from "@/lib/utils";
import { useSlawCategories, useSlawSettings, useSlawSummary, type SlawCategoryNode } from "../api";
import { legislationListHref, StepsBar } from "./shared";

/** Overview + storyboard step 1 "Select category": choose a category, then a sub-category. */
export function SlawOverview() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const settings = useSlawSettings();
  const summary = useSlawSummary();
  const categories = useSlawCategories();
  const [picked, setPicked] = useState<string | null>(params.get("category"));
  const list = categories.data ?? [];
  const selected = list.find((c) => c.id === picked) ?? list[0] ?? null;
  const s = summary.data;

  const pick = (id: string) => {
    setPicked(id);
    router.replace(`${SLAW_BASE}?category=${id}`, { scroll: false });
  };

  return (
    <>
      <PageBanner
        title={settings.data?.registerTitle ?? DEFAULT_REGISTER_TITLE}
        description="Find the laws that apply to us and check that we comply – one step at a time: pick a category, open a law, answer whether it applies, then tick off its requirements."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={legislationListHref()}>
                <Library /> All legislation
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-white/30 bg-transparent text-brand-foreground hover:bg-white/10 hover:text-brand-foreground">
              <Link href={`${SLAW_BASE}/actions`}>
                <ListTodo /> Actions to do
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Laws that apply to us" value={s?.applies ?? "–"} hint={s ? `of ${s.laws} laws in force` : undefined} icon={Scale} href={`${legislationListHref()}?check=APPLIES`} />
        <StatCard label="Not checked yet" value={s?.notChecked ?? "–"} hint="Does it apply to us?" icon={CircleHelp} tone="warning" href={`${legislationListHref()}?check=NOT_CHECKED`} />
        <StatCard label="Not compliant" value={s?.notCompliant ?? "–"} hint="Requirements with a gap" icon={ShieldAlert} tone={s?.notCompliant ? "danger" : "success"} href={`${legislationListHref()}?check=NOT_COMPLIANT`} />
        <StatCard label="Open actions" value={s?.openActions ?? "–"} hint={s?.overdueActions ? `${s.overdueActions} overdue` : "None overdue"} icon={AlarmClock} tone={s?.overdueActions ? "danger" : "info"} href={`${SLAW_BASE}/actions?view=all`} />
      </div>

      <StepsBar steps={registerSteps("category")} />

      {categories.isPending ? (
        <LoadingCards count={4} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No categories yet"
          description="Categories group the laws, e.g. Waste › Packaging waste. Add the first one in Configuration."
          action={
            can(PERMISSIONS.SLAW_MANAGE) ? (
              <Button asChild>
                <Link href={`${SLAW_BASE}/configuration`}>
                  <Plus /> Add a category
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>1. Category</CardTitle>
              <CardDescription>Choose the subject area.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 p-3">
              {list.map((c) => (
                <CategoryButton key={c.id} node={c} selected={selected?.id === c.id} onClick={() => pick(c.id)} />
              ))}
            </CardContent>
          </Card>
          {selected && <SubCategories category={selected} />}
        </div>
      )}
    </>
  );
}

function CategoryButton({ node, selected, onClick }: { node: SlawCategoryNode; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
        selected ? "border-brand bg-brand-soft" : "hover:bg-muted/60",
      )}
    >
      <span className="min-w-0">
        <span className={cn("block truncate font-medium", selected && "text-brand")}>{node.name}</span>
        <span className="block text-xs text-muted-foreground">
          {node.children.length} sub-categor{node.children.length === 1 ? "y" : "ies"} · {node.legislationCount} law{node.legislationCount === 1 ? "" : "s"}
        </span>
      </span>
      {selected && <span className="shrink-0 text-xs font-medium text-brand">Selected</span>}
    </button>
  );
}

function SubCategories({ category }: { category: SlawCategoryNode }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>2. Sub-category of {category.name}</CardTitle>
        <CardDescription>{category.description || "Open a sub-category to see its laws."}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 p-3">
        {category.children.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">No sub-categories yet.</p>
        ) : (
          category.children.map((sub) => (
            <Link key={sub.id} href={legislationListHref(sub.id)} className="group flex items-center justify-between gap-3 rounded-lg border px-3 py-3 hover:border-brand hover:bg-brand-soft/50">
              <span className="min-w-0">
                <span className="block font-medium">{sub.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {sub.legislationCount} legislation item{sub.legislationCount === 1 ? "" : "s"}
                  {sub.legislationCount ? `: ${jurisdictionBreakdown(sub.jurisdictions)}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand">
                <span className="hidden sm:inline">View legislation</span> <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))
        )}
        {category.children.length > 1 && (
          <Button asChild variant="ghost" className="justify-start text-muted-foreground">
            <Link href={legislationListHref(category.id)}>
              All {category.legislationCount} laws in {category.name} <ArrowRight />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
