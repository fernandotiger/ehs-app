"use client";

import { FileSearch, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { SLAW_BASE, statusLabels } from "@/lib/simplified-law";
import { useLegislationList, useSlawCategories, useSlawSettings } from "../../api";
import { categoryPath, LegalStatusBadge } from "../shared";
import { CategoriesPanel } from "./categories-panel";
import { JurisdictionsPanel, SettingsPanel } from "./lists-panels";

const TABS = ["legislation", "categories", "jurisdictions", "settings"] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZE = 25;

/**
 * Simplified law → Configuration (inside the module on purpose – the platform Configuration hub is not touched):
 * the company's laws and their content, categories, jurisdictions and settings.
 */
export function SlawConfiguration() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(initial ?? "") ? (initial as Tab) : "legislation");
  const change = (next: string) => {
    setTab(next as Tab);
    router.replace(`${SLAW_BASE}/configuration${next === "legislation" ? "" : `?tab=${next}`}`, { scroll: false });
  };
  return (
    <>
      <PageHeader title="Simplified law – Configuration" description="Make the register your own: add laws and their questions and requirements, organise categories, and choose the wording." backHref={SLAW_BASE} backLabel="Simplified law" />
      <Tabs value={tab} onValueChange={change} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="legislation" className="px-3">
            Legislation
          </TabsTrigger>
          <TabsTrigger value="categories" className="px-3">
            Categories
          </TabsTrigger>
          <TabsTrigger value="jurisdictions" className="px-3">
            Jurisdictions
          </TabsTrigger>
          <TabsTrigger value="settings" className="px-3">
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="legislation">
          <LegislationPanel />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="jurisdictions">
          <JurisdictionsPanel />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

function LegislationPanel() {
  const router = useRouter();
  const settings = useSlawSettings();
  const categories = useSlawCategories();
  const labels = statusLabels(settings.data?.statusLabels);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const list = useLegislationList({ page, pageSize: PAGE_SIZE, q: q || undefined, categoryId, hideRepealed: "false", archived: archived ? "true" : "false" });
  const subOptions = (categories.data ?? []).flatMap((c) => [{ id: c.id, name: c.name }, ...c.children.map((s) => ({ id: s.id, name: `${c.name} › ${s.name}` }))]);
  const edit = (id: string) => router.push(`${SLAW_BASE}/configuration/legislation/${id}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Every law in the register. Open one to change its details, overview, questions and requirements.</p>
        <Button asChild>
          <Link href={`${SLAW_BASE}/configuration/legislation/new`}>
            <Plus /> Add a law
          </Link>
        </Button>
      </div>
      <Card className="gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search title, number or summary" />
          <FilterSelect value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1); }} options={subOptions} allLabel="All categories" ariaLabel="Category" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Switch id="law-archived" checked={archived} onCheckedChange={(v) => { setArchived(v); setPage(1); }} />
          <Label htmlFor="law-archived" className="text-sm font-normal text-muted-foreground">
            Show archived laws instead
          </Label>
        </div>
      </Card>
      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={FileSearch} title={archived ? "No archived laws" : "No laws found"} description={archived ? "Archived laws appear here and can be restored." : "Add a law, or try a different search."} />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((l) => (
              <li key={l.id}>
                <Link href={`${SLAW_BASE}/configuration/legislation/${l.id}`} className="block space-y-1 p-4 hover:bg-muted/50">
                  <p className="font-medium leading-snug">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.jurisdiction} · {categoryPath(l)}
                  </p>
                  <LegalStatusBadge status={l.status} labels={labels} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Law</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Requirements</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => edit(l.id)}>
                    <TableCell className="max-w-96 whitespace-normal pl-4">
                      <span className="block font-medium leading-snug">{l.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {l.reference}
                        {l.custom && <StatusBadge tone="brand">Added by us</StatusBadge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{categoryPath(l)}</TableCell>
                    <TableCell className="text-muted-foreground">{l.jurisdiction}</TableCell>
                    <TableCell>
                      <LegalStatusBadge status={l.status} labels={labels} />
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{l.counts.total}</TableCell>
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
    </div>
  );
}
