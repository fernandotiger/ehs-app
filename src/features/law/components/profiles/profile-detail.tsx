"use client";

import { Archive, ArchiveRestore, ClipboardCheck, FileClock, FileSearch, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, errorMessage } from "@/lib/api-client";
import { useAcceptLawUpdate, useArchiveLawProfile, useLawProfile, useLawProfileUpdate, type LawProfileDetailDto } from "../../api";
import { formatDate } from "../../format";
import { LawDisclaimer, LawHistory } from "../shared";
import { OtherRequirementSheet } from "./other-requirement-sheet";
import { LawProfileSheet } from "./profile-sheet";

export function LawProfileDetail({ id }: { id: string }) {
  const query = useLawProfile(id);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Profile not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail p={query.data} />;
}

function Detail({ p }: { p: LawProfileDetailDto }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archive = useArchiveLawProfile(p.id);
  const s = p.summary;
  const canAccept = p.permissions.edit && !p.archived && Boolean(p.updateAvailable);

  async function setArchived(archived: boolean) {
    try {
      await archive.mutateAsync({ archived, expectedVersion: p.version });
      toast.success(archived ? "Profile archived" : "Profile restored");
    } catch (error) {
      toast.error(isStaleVersion(error) ? "Someone else changed this profile – reload to see their changes." : errorMessage(error));
    }
  }

  const more = [
    p.permissions.edit && !p.archived ? { key: "edit", icon: Pencil, label: "Edit profile", onSelect: () => setEditing(true) } : null,
    p.permissions.addRequirement ? { key: "add", icon: Plus, label: "Add a company requirement", onSelect: () => setAdding(true) } : null,
    p.permissions.manage && !p.archived ? { key: "archive", icon: Archive, label: "Archive profile", onSelect: () => setArchiving(true) } : null,
    p.permissions.manage && p.archived ? { key: "restore", icon: ArchiveRestore, label: "Restore profile", onSelect: () => void setArchived(false) } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <PageHeader
        title={p.name}
        backHref="/law/profiles"
        backLabel="Legal profiles"
        description={`${p.site?.name ?? "No site"} · ${p.jurisdiction} · owner ${p.owner.name}`}
        meta={
          <>
            <StatusBadge tone="neutral">Legal content {p.contentVersion}</StatusBadge>
            {p.updateAvailable && <StatusBadge tone="info">Update {p.updateAvailable} available</StatusBadge>}
            {!p.isShared && <StatusBadge tone="purple">Private</StatusBadge>}
            {p.archived && <StatusBadge tone="neutral">Archived</StatusBadge>}
          </>
        }
        actions={
          <>
            {canAccept ? (
              <Button onClick={() => setAccepting(true)}>
                <FileClock /> Review update {p.updateAvailable}
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/law/requirements?profile=${p.id}`}>
                  <ClipboardCheck /> Check compliance
                </Link>
              </Button>
            )}
            {more.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="More actions">
                    <MoreHorizontal /> <span className="sm:hidden">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {more.map((m) => (
                    <DropdownMenuItem key={m.key} onSelect={m.onSelect}>
                      <m.icon /> {m.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {p.updateAvailable && !p.archived && (
        <Alert className="mb-4">
          <FileClock />
          <AlertTitle>Legal content {p.updateAvailable} is installed</AlertTitle>
          <AlertDescription>
            This profile still uses {p.contentVersion}. {canAccept ? "Review what changed and accept it when you are ready – your checks, evidence and tasks are kept." : "The profile owner or a manager can accept it."}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
          <TabsTrigger value="history" className="px-3">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Apply to us" value={s.total} hint={s.excluded ? `${s.excluded} marked as not applying` : "Requirements"} href={`/law/requirements?profile=${p.id}`} />
            <StatCard label="Checked" value={`${s.complete} of ${s.total}`} tone={s.total && s.complete === s.total ? "success" : "info"} href={`/law/requirements?profile=${p.id}&status=COMPLETE`} />
            <StatCard label="Need attention" value={s.review + p.overdueTasks} hint={`${s.review} to review · ${p.overdueTasks} overdue tasks`} tone={s.review + p.overdueTasks ? "warning" : "success"} href={`/law/requirements?profile=${p.id}&attention=true`} />
            <StatCard label="Outside this profile" value={s.outside} hint="Kept with their work" href={`/law/requirements?profile=${p.id}&view=outside`} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>About this profile</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <Item label="Site">{p.site?.name}</Item>
                  <Item label="Country / jurisdiction">{p.jurisdiction}</Item>
                  <Item label="Owner">{p.owner.name}</Item>
                  <Item label="Activities">
                    <span className="flex flex-wrap gap-1.5">
                      {p.activities.map((a) => (
                        <StatusBadge key={a} tone="brand">
                          {a}
                        </StatusBadge>
                      ))}
                    </span>
                  </Item>
                  <Item label="Description">{p.description ? <span className="whitespace-pre-wrap">{p.description}</span> : null}</Item>
                  <Item label="Visible to">{p.isShared ? "Everyone who can see Law at this site" : "The owner and people who manage legal requirements"}</Item>
                  {p.showRating && <Item label="Self-assessed compliance">{s.score === null ? "Not assessed" : `${s.score}% (rated ${s.rated} of ${s.total})`}</Item>}
                  <Item label="Created">{formatDate(p.createdAt)}</Item>
                </dl>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Next step</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    {canAccept
                      ? "A newer version of the legal content is installed. Review the changes and accept them into this profile."
                      : s.total > s.complete
                        ? `${s.total - s.complete} requirement${s.total - s.complete === 1 ? "" : "s"} still need${s.total - s.complete === 1 ? "s" : ""} a complete check.`
                        : "Every requirement that applies is checked. Keep an eye on review dates and tasks."}
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/law/requirements?profile=${p.id}`}>Open the requirements</Link>
                  </Button>
                </CardContent>
              </Card>
              <LawDisclaimer />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="history">
          <LawHistory kind="profiles" id={p.id} />
        </TabsContent>
      </Tabs>

      {editing && <LawProfileSheet open profile={p} jurisdictions={p.jurisdictions} onOpenChange={(o) => !o && setEditing(false)} />}
      {adding && <OtherRequirementSheet open profileId={p.id} profileName={p.name} onOpenChange={(o) => !o && setAdding(false)} />}
      {accepting && <AcceptUpdateDialog profile={p} onOpenChange={(o) => !o && setAccepting(false)} />}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this profile?"
        description="It disappears from the Law pages and reminders stop. Its requirements, checks, evidence and tasks are kept and you can restore it."
        confirmLabel="Archive"
        onConfirm={() => setArchived(true)}
      />
    </>
  );
}

/** Review the change list, then accept the latest installed content into THIS profile only. */
function AcceptUpdateDialog({ profile: p, onOpenChange }: { profile: LawProfileDetailDto; onOpenChange: (o: boolean) => void }) {
  const preview = useLawProfileUpdate(p.id);
  const accept = useAcceptLawUpdate(p.id);
  const d = preview.data;

  async function confirm() {
    if (!d?.latest) return;
    try {
      const res = await accept.mutateAsync({ version: d.latest, expectedVersion: p.version });
      toast.success(res.changed ? `${p.name} now uses ${d.latest}: ${res.flagged} to review, ${res.added} new` : "This profile already uses that version");
      onOpenChange(false);
    } catch (error) {
      toast.error(isStaleVersion(error) ? "Someone else changed this profile – reload to see their changes." : errorMessage(error));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Accept legal content {p.updateAvailable}?</DialogTitle>
          <DialogDescription>Only {p.name} changes. Checks, evidence, tasks and links are kept. Requirements that changed are marked “Law changed – review”.</DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <LoadingRows rows={4} />
        ) : preview.isError ? (
          <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
        ) : !d!.available ? (
          <p className="text-sm text-muted-foreground">This profile already uses the latest installed content.</p>
        ) : (
          <div className="space-y-4 text-sm">
            {d!.summary && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3">{d!.summary}</p>}
            <section>
              <h3 className="mb-1 font-semibold">What changed in the legal content</h3>
              <ul className="divide-y rounded-lg border">
                {d!.changes.map((c) => (
                  <li key={`${c.kind}-${c.id}`} className="flex items-start justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.kind === "checklist" ? "Requirement" : "Legislation"} · {c.id} · {c.domain}
                      </span>
                    </span>
                    <StatusBadge tone={c.change === "NEW" ? "info" : "warning"}>{c.change === "NEW" ? "New" : "Amended"}</StatusBadge>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">In this profile</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  {d!.flagged.length
                    ? `${d!.flagged.length} saved check${d!.flagged.length === 1 ? "" : "s"} will need a review: ${d!.flagged.map((f) => f.title).join(", ")}.`
                    : "No saved check is affected."}
                </li>
                <li>{d!.added.length ? `${d!.added.length} new requirement${d!.added.length === 1 ? "" : "s"} will start to apply: ${d!.added.map((a) => a.title).join(", ")}.` : "No new requirement applies to this profile's activities."}</li>
              </ul>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={() => void confirm()} disabled={!d?.available || accept.isPending}>
            {accept.isPending ? <Spinner /> : <FileClock />} Accept {d?.latest ?? ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
