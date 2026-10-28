"use client";

import { FileClock, MapPin, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { PERMISSIONS } from "@/lib/permissions";
import { useLawLibrary, useLawProfiles, type LawProfileListItem } from "../../api";
import { LawProfileSheet } from "./profile-sheet";

/** Legal profiles: one card per site profile with its progress. */
export function LawProfileList() {
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.LAW_REQUIREMENT_MANAGE);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(params.get("new") === "1" && canManage);
  const profiles = useLawProfiles(archived);
  const library = useLawLibrary(canManage);
  const noLibrary = library.data && !library.data.latest;

  return (
    <>
      <PageBanner
        title="Legal profiles"
        description="A profile describes a site – its country and what happens there – so the app can find the laws that apply."
        actions={
          canManage && !noLibrary ? (
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus /> New profile
            </Button>
          ) : undefined
        }
      />
      <div className="mb-3 flex justify-end">
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={archived} onCheckedChange={setArchived} /> Show archived profiles
        </Label>
      </div>
      {profiles.isPending ? (
        <LoadingRows rows={4} />
      ) : profiles.isError ? (
        <ErrorState error={profiles.error} onRetry={() => profiles.refetch()} />
      ) : profiles.data.length === 0 ? (
        <EmptyState
          icon={Scale}
          title={noLibrary ? "Install the legal content first" : "No legal profile yet"}
          description={noLibrary ? "Go to Configuration → Law content & settings to install the legal content. Then create a profile." : "Create a profile for each site to see the laws that apply."}
          action={
            canManage && !noLibrary ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Create a profile
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.data.map((p) => (
            <ProfileCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {creating && <LawProfileSheet open onOpenChange={(o) => !o && setCreating(false)} jurisdictions={library.data?.jurisdictions ?? []} />}
    </>
  );
}

function ProfileCard({ p }: { p: LawProfileListItem }) {
  const s = p.summary;
  const pct = s.total ? Math.round((s.complete / s.total) * 100) : 0;
  return (
    <Link href={`/law/profiles/${p.id}`} className="block">
      <Card className="h-full gap-0 py-0 transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" /> {p.site?.name ?? "No site"} · {p.jurisdiction} · owner {p.owner.name}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {p.archived && <StatusBadge tone="neutral">Archived</StatusBadge>}
              {!p.isShared && <StatusBadge tone="purple">Private</StatusBadge>}
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {s.complete} of {s.total} checked
              </span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} aria-label={`${pct}% checked`} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.review > 0 && <StatusBadge tone="warning">{s.review} to review</StatusBadge>}
            {p.overdueTasks > 0 && <StatusBadge tone="danger">{p.overdueTasks} overdue task{p.overdueTasks === 1 ? "" : "s"}</StatusBadge>}
            {p.showRating && <StatusBadge tone="neutral">{s.score === null ? "Rating: not assessed" : `Rating ${s.score}% (${s.rated} rated)`}</StatusBadge>}
            <StatusBadge tone="neutral">Content {p.contentVersion}</StatusBadge>
            {p.updateAvailable && (
              <StatusBadge tone="info">
                <FileClock className="size-3" /> Update {p.updateAvailable} available
              </StatusBadge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
