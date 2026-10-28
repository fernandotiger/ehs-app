"use client";

import { Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { UserPicker } from "@/components/common/user-picker";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BlockerList } from "@/features/incidents/components/shared";
import { SimpleSelect, SiteSelect } from "@/features/incidents/components/fields";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { LAW_ACTIVITIES } from "@/lib/law";
import { errorMessage } from "@/lib/api-client";
import { profileBlockers } from "@/server/modules/law/workflow";
import { useCreateLawProfile, useUpdateLawProfile, type LawProfileDetailDto } from "../../api";
import { blockersOf } from "../../format";

/** Plain explanations of the activities (they decide which requirements apply). */
const ACTIVITY_HINTS: Record<string, string> = {
  "Workplace operations": "People working on site, responsibilities, emergencies",
  "Workplace transport": "Forklifts, vehicles, loading bays, pedestrian routes",
  Machinery: "Fixed machines and equipment that need guarding and checks",
  Chemicals: "Storing or using chemicals, oils or other hazardous substances",
  Waste: "Waste streams, segregation and waste contractors",
  "Air emissions": "Chimneys, vents or processes that release emissions",
};

interface Values {
  name: string;
  description: string;
  ownerId: string | null;
  siteId: string | null;
  jurisdiction: string;
  activities: string[];
  isShared: boolean;
  showRating: boolean;
}

/** Create a profile (site, jurisdiction, activities) or edit one. The site cannot change later. */
export function LawProfileSheet({ open, onOpenChange, profile, jurisdictions }: { open: boolean; onOpenChange: (open: boolean) => void; profile?: LawProfileDetailDto; jurisdictions: string[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{open && <ProfileForm profile={profile} jurisdictions={jurisdictions} onDone={() => onOpenChange(false)} />}</SheetContent>
    </Sheet>
  );
}

function ProfileForm({ profile, jurisdictions, onDone }: { profile?: LawProfileDetailDto; jurisdictions: string[]; onDone: () => void }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [start] = useState<Values>(() => ({
    name: profile?.name ?? "",
    description: profile?.description ?? "",
    ownerId: profile?.owner.id ?? user?.id ?? null,
    siteId: profile?.siteId ?? null,
    jurisdiction: profile?.jurisdiction ?? (jurisdictions.length === 1 ? jurisdictions[0]! : ""),
    activities: profile?.activities ?? [],
    isShared: profile?.isShared ?? true,
    showRating: profile?.showRating ?? true,
  }));
  const [v, setV] = useState<Values>(start);
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const create = useCreateLawProfile();
  const update = useUpdateLawProfile(profile?.id ?? "");
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const errors = profileBlockers(v);
  const err = (word: string) => (showErrors ? errors.find((e) => e.includes(word)) : undefined);
  const pending = create.isPending || update.isPending;
  const removed = profile ? profile.activities.filter((a) => !v.activities.includes(a)) : [];

  async function save() {
    setBlockers([]);
    if (errors.length) {
      setShowErrors(true);
      toast.error(errors[0]!);
      return;
    }
    const body = { name: v.name.trim(), description: v.description.trim(), ownerId: v.ownerId, jurisdiction: v.jurisdiction, activities: v.activities as (typeof LAW_ACTIVITIES)[number][], isShared: v.isShared, showRating: v.showRating };
    try {
      if (profile) {
        await update.mutateAsync({ ...body, expectedVersion: profile.version });
        toast.success("Profile saved");
        onDone();
      } else {
        const res = await create.mutateAsync({ ...body, siteId: v.siteId });
        toast.success("Profile created – the requirements that apply are ready to check");
        onDone();
        router.push(`/law/profiles/${res.id}`);
      }
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error), { action: { label: "Retry", onClick: () => void save() } });
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>{profile ? `Edit ${profile.name}` : "New legal profile"}</SheetTitle>
        <SheetDescription>A profile describes a site and what happens there. The app uses it to find the laws that apply.</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="profile" onReload={() => window.location.reload()} />}
        <Field data-invalid={err("name") ? true : undefined}>
          <FieldLabel htmlFor="lp-name">Name *</FieldLabel>
          <Input id="lp-name" value={v.name} maxLength={120} autoFocus onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Cork Distribution – warehouse" />
          {err("name") && <FieldError>{err("name")}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={err("site") ? true : undefined}>
            <FieldLabel htmlFor="lp-site">Site *</FieldLabel>
            {profile ? <Input id="lp-site" value={profile.site?.name ?? "—"} disabled /> : <SiteSelect id="lp-site" value={v.siteId} onChange={(id) => set({ siteId: id })} placeholder="Choose a site" />}
            {profile ? <FieldDescription>The site cannot change – create a new profile for another site.</FieldDescription> : err("site") && <FieldError>{err("site")}</FieldError>}
          </Field>
          <Field data-invalid={err("jurisdiction") ? true : undefined}>
            <FieldLabel htmlFor="lp-jur">Country / jurisdiction *</FieldLabel>
            <SimpleSelect id="lp-jur" value={v.jurisdiction || null} onChange={(x) => set({ jurisdiction: x ?? "" })} options={jurisdictions.map((j) => ({ value: j, label: j }))} placeholder="Whose laws apply?" />
            {err("jurisdiction") && <FieldError>{err("jurisdiction")}</FieldError>}
          </Field>
        </div>
        <Field data-invalid={err("owner") ? true : undefined}>
          <FieldLabel htmlFor="lp-owner">Profile owner *</FieldLabel>
          <UserPicker id="lp-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} allowClear={false} placeholder="Choose a person" />
          <FieldDescription>Looks after the profile and accepts legal content updates.</FieldDescription>
        </Field>
        <fieldset className="space-y-2" data-invalid={err("activity") ? true : undefined}>
          <legend className="text-sm font-medium">What happens at this site? *</legend>
          <p className="text-xs text-muted-foreground">Tick every activity that applies. Requirements for these activities are added to the profile.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {LAW_ACTIVITIES.map((a) => (
              <Label key={a} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm font-normal">
                <Checkbox className="mt-0.5" checked={v.activities.includes(a)} onCheckedChange={(c) => set({ activities: c === true ? [...v.activities, a] : v.activities.filter((x) => x !== a) })} />
                <span>
                  <span className="block font-medium">{a}</span>
                  <span className="block text-xs text-muted-foreground">{ACTIVITY_HINTS[a]}</span>
                </span>
              </Label>
            ))}
          </div>
          {err("activity") && <p className="text-sm text-destructive">{err("activity")}</p>}
          {removed.length > 0 && <p className="text-xs text-muted-foreground">Requirements for {removed.join(", ")} move to “Outside this profile”. Their checks, evidence and tasks are kept.</p>}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="lp-desc">Description</FieldLabel>
          <Textarea id="lp-desc" rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder="Optional – e.g. the main equipment and processes" />
        </Field>
        <div className="space-y-3 rounded-xl border p-3">
          <Label className="flex items-center justify-between gap-3 text-sm font-normal">
            <span>
              <span className="block font-medium">Share with everyone who can see Law</span>
              <span className="block text-xs text-muted-foreground">Off = only the owner and people who manage legal requirements see it.</span>
            </span>
            <Switch checked={v.isShared} onCheckedChange={(c) => set({ isShared: c })} />
          </Label>
          <Label className="flex items-center justify-between gap-3 text-sm font-normal">
            <span>
              <span className="block font-medium">Show the self-assessed compliance rating</span>
              <span className="block text-xs text-muted-foreground">Only hides it on screens – saved ratings are kept.</span>
            </span>
            <Switch checked={v.showRating} onCheckedChange={(c) => set({ showRating: c })} />
          </Label>
        </div>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => guard.confirm(onDone)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? <Spinner /> : profile ? <Save /> : <Plus />} {profile ? "Save" : "Create profile"}
          </Button>
        </div>
      </div>
    </>
  );
}
