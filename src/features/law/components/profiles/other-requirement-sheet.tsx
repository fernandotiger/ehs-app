"use client";

import { Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BlockerList } from "@/features/incidents/components/shared";
import { SimpleSelect } from "@/features/incidents/components/fields";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { LAW_CATEGORIES } from "@/lib/law";
import { errorMessage } from "@/lib/api-client";
import { otherRequirementBlockers } from "@/server/modules/law/workflow";
import { useCreateOtherRequirement, useUpdateOtherRequirement, type LawRequirementDetailDto } from "../../api";
import { blockersOf } from "../../format";

/** Categories offered for company requirements (the legal ones plus commitment types). */
export const OTHER_CATEGORIES = ["Company commitment", "Customer requirement", "Industry standard", "Permit or licence condition", ...LAW_CATEGORIES];

interface Values {
  title: string;
  requirementText: string;
  category: string;
  keywords: string;
}

/**
 * Add / edit a company-specific requirement ("other requirement"): a commitment to a customer,
 * an industry code or an internal rule. It is checked like a legal requirement but is never shown
 * as legislation from a provider.
 */
export function OtherRequirementSheet({
  open,
  onOpenChange,
  profileId,
  profileName,
  requirement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  profileName: string;
  requirement?: LawRequirementDetailDto;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <OtherRequirementForm profileId={profileId} profileName={profileName} requirement={requirement} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function OtherRequirementForm({ profileId, profileName, requirement, onDone }: { profileId: string; profileName: string; requirement?: LawRequirementDetailDto; onDone: () => void }) {
  const router = useRouter();
  const [start] = useState<Values>(() => ({
    title: requirement?.title ?? "",
    requirementText: requirement?.requirementText ?? "",
    category: requirement?.category ?? "Company commitment",
    keywords: requirement?.keywords.join(", ") ?? "",
  }));
  const [v, setV] = useState<Values>(start);
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const create = useCreateOtherRequirement();
  const update = useUpdateOtherRequirement(requirement?.id ?? "");
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const errors = otherRequirementBlockers(v);
  const pending = create.isPending || update.isPending;
  const categories = OTHER_CATEGORIES.includes(v.category) ? OTHER_CATEGORIES : [v.category, ...OTHER_CATEGORIES];

  async function save() {
    setBlockers([]);
    if (errors.length) {
      setShowErrors(true);
      toast.error(errors[0]!);
      return;
    }
    const keywords = v.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const body = { title: v.title.trim(), requirementText: v.requirementText.trim(), category: v.category, keywords };
    try {
      if (requirement) {
        await update.mutateAsync({ ...body, expectedVersion: requirement.version });
        toast.success("Requirement saved");
        onDone();
      } else {
        const res = await create.mutateAsync({ ...body, profileId });
        toast.success(`${res.reference} added – record why it applies and how you comply next`);
        onDone();
        router.push(`/law/requirements/${res.id}`);
      }
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? "Someone else changed this requirement – reload to see their changes." : errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>{requirement ? `Edit ${requirement.reference}` : "Add a company requirement"}</SheetTitle>
        <SheetDescription>
          A commitment to a customer, an industry standard or an internal rule in {profileName}. It is checked like a law, but it is your own requirement – not legislation.
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        <Field data-invalid={(showErrors && !v.title.trim()) || undefined}>
          <FieldLabel htmlFor="or-title">Name *</FieldLabel>
          <Input id="or-title" value={v.title} maxLength={200} autoFocus onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Customer safety briefing commitment" />
          {showErrors && !v.title.trim() && <FieldError>Give the requirement a name.</FieldError>}
        </Field>
        <Field data-invalid={(showErrors && !v.requirementText.trim()) || undefined}>
          <FieldLabel htmlFor="or-text">What does it ask for? *</FieldLabel>
          <Textarea id="or-text" rows={4} value={v.requirementText} onChange={(e) => set({ requirementText: e.target.value })} placeholder="e.g. Brief every visiting contractor before entry" />
          {showErrors && !v.requirementText.trim() && <FieldError>Write what the requirement asks for.</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="or-category">Category *</FieldLabel>
          <SimpleSelect id="or-category" value={v.category} onChange={(x) => set({ category: x ?? "Company commitment" })} options={categories.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="or-keywords">Keywords</FieldLabel>
          <Input id="or-keywords" value={v.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="contractors, induction" />
          <FieldDescription>Optional – separate with commas. They help people find it in search.</FieldDescription>
        </Field>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => guard.confirm(onDone)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? <Spinner /> : requirement ? <Save /> : <Plus />} {requirement ? "Save" : "Add requirement"}
          </Button>
        </div>
      </div>
    </>
  );
}
