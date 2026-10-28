"use client";

import { BookOpen, Settings2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { LAW_CATEGORIES, LAW_LEVEL_HINTS, LAW_LEVELS, LAW_REGISTERS, type LawLevel } from "@/lib/law";
import { PERMISSIONS } from "@/lib/permissions";
import { useLawLegislation, useLawProfiles, type LawLegislationListItem } from "../../api";
import { LawDisclaimer, ProfileSelect, useProfileParam } from "../shared";

const PAGE_SIZE = 20;

/** "Primary – Act, the main law". */
export function levelLabel(level: LawLevel): string {
  const hint = LAW_LEVEL_HINTS[level];
  return hint ? `${level} – ${hint.replace(" – ", ", ")}` : level;
}

export function libraryItemHref(id: string, profileId: string | null): string {
  return `/law/library/${encodeURIComponent(id)}${profileId ? `?profile=${encodeURIComponent(profileId)}` : ""}`;
}

function usedByLabel(count: number): string {
  if (count === 0) return "Not used by this profile";
  return `Used by ${count} requirement${count === 1 ? "" : "s"}`;
}

type Filters = { register?: string; category?: string; level?: string };

/** Law library: the legislation and guidance in the content version a profile accepted (or the latest installed). */
export function LawLibrary() {
  const router = useRouter();
  const { can } = useCurrentUser();
  const [profileParam, setProfileParam] = useProfileParam();
  const profiles = useLawProfiles();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [exact, setExact] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);

  const profileList = profiles.data ?? [];
  // The select shows the first profile when nothing valid is chosen – query the same one.
  const profileId = profileParam && profileList.some((p) => p.id === profileParam) ? profileParam : (profileList[0]?.id ?? null);
  const list = useLawLegislation({ page, pageSize: PAGE_SIZE, profileId: profileId ?? undefined, q: q || undefined, exact: q && exact ? "true" : undefined, ...filters });
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const filtered = Boolean(q || filters.register || filters.category || filters.level);
  const data = list.data;
  const showsProfile = Boolean(data?.profile);

  return (
    <>
      <PageBanner title="Law library" description="The laws and guidance in your legal content. Each requirement you check refers to one or more of them." />

      <Card className="mb-4 gap-0 p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {profileList.length > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">Legal profile</span>
              <ProfileSelect
                value={profileId}
                onChange={(id) => {
                  setProfileParam(id);
                  setPage(1);
                }}
                profiles={profileList.map((p) => ({ id: p.id, name: p.name, siteName: p.site?.name }))}
              />
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Showing the latest installed legal content.</span>
          )}
          {data?.contentVersion && (
            <StatusBadge tone="brand" className="w-fit">
              Content version {data.contentVersion}
            </StatusBadge>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-1.5">
            <SearchBox
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search title, reference, summary or keywords"
            />
            <div className="flex items-center gap-2 px-1">
              <Switch id="law-library-exact" size="sm" checked={exact} onCheckedChange={(v) => { setExact(v); setPage(1); }} />
              <Label htmlFor="law-library-exact" className="text-xs font-normal text-muted-foreground">
                Exact phrase
              </Label>
            </div>
          </div>
          <FilterSelect value={filters.register} onChange={(v) => set({ register: v })} options={LAW_REGISTERS.map((r) => ({ id: r, name: r }))} allLabel="All registers" ariaLabel="Register" />
          <FilterSelect value={filters.category} onChange={(v) => set({ category: v })} options={LAW_CATEGORIES.map((c) => ({ id: c, name: c }))} allLabel="All categories" ariaLabel="Category" />
          <FilterSelect value={filters.level} onChange={(v) => set({ level: v })} options={LAW_LEVELS.map((l) => ({ id: l, name: levelLabel(l) }))} allLabel="All levels" ariaLabel="Level" />
        </div>
      </Card>

      {profiles.isPending || list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data.contentVersion ? (
        <EmptyState
          icon={BookOpen}
          title="No legal content installed yet"
          description="The library fills up when someone installs legal content in Configuration → Law content & settings."
          action={
            can(PERMISSIONS.LAW_REQUIREMENT_MANAGE) ? (
              <Button asChild>
                <Link href="/configuration/law">
                  <Settings2 /> Law content & settings
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtered ? "Nothing matches your search" : "This content version has no laws"}
          description={filtered ? (exact ? "Try turning off “Exact phrase”, fewer words or another filter." : "Try fewer words or another filter.") : undefined}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((l) => (
              <li key={l.id}>
                <Link href={libraryItemHref(l.id, profileId)} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <p className="font-medium leading-snug">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.reference} · {l.domain} · {l.category}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone="info">{l.level}</StatusBadge>
                    {!l.active && <InactiveBadge />}
                    {showsProfile && <span className="text-xs text-muted-foreground">{usedByLabel(l.requirementCount)}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Law or guidance</TableHead>
                  <TableHead>Register · category</TableHead>
                  <TableHead>Level</TableHead>
                  {showsProfile && <TableHead className="pr-4">Requirements</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((l) => (
                  <Row key={l.id} item={l} href={libraryItemHref(l.id, profileId)} showsProfile={showsProfile} onOpen={(href) => router.push(href)} />
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
    </>
  );
}

function Row({ item: l, href, showsProfile, onOpen }: { item: LawLegislationListItem; href: string; showsProfile: boolean; onOpen: (href: string) => void }) {
  return (
    <TableRow className="cursor-pointer" onClick={() => onOpen(href)}>
      <TableCell className="max-w-[28rem] pl-4">
        <Link href={href} onClick={(e) => e.stopPropagation()} className="block">
          <span className="block truncate font-medium">{l.title}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {l.reference}
            {!l.active && <InactiveBadge />}
          </span>
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {l.domain} · {l.category}
      </TableCell>
      <TableCell>
        <span className="text-sm">{l.level}</span>
        <span className="block text-xs text-muted-foreground">{LAW_LEVEL_HINTS[l.level]}</span>
      </TableCell>
      {showsProfile && <TableCell className="pr-4 text-muted-foreground">{usedByLabel(l.requirementCount)}</TableCell>}
    </TableRow>
  );
}

export function InactiveBadge() {
  return <StatusBadge tone="neutral">No longer active</StatusBadge>;
}
