"use client";

import { FormInput } from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { moduleLabel, purposeLabel } from "@/lib/forms/catalog";
import { PERMISSIONS } from "@/lib/permissions";
import { usePublishedForms, type PublishedFormDto } from "../api";

/**
 * Chooses a compatible PUBLISHED form (module + purpose, optionally available at a site). Value is
 * the version id. When none exists it explains why and links to Form Builder.
 */
export function PublishedFormSelect({
  module,
  purpose,
  siteId,
  value,
  onChange,
  id,
  disabled,
  placeholder = "Choose a form…",
}: {
  module: string;
  purpose?: string;
  siteId?: string;
  value: string | null | undefined;
  onChange: (form: PublishedFormDto | null) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { can } = useCurrentUser();
  const forms = usePublishedForms(module, purpose, siteId);
  if (forms.isPending) return <Skeleton className="h-9 w-full" />;
  const list = forms.data ?? [];
  if (!list.length) {
    const what = `${moduleLabel(module)}${purpose ? ` ${purposeLabel(module, purpose).toLowerCase()}` : ""}`;
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-sm">
        <FormInput className="mt-0.5 size-4 shrink-0 text-brand" />
        <div>
          <p className="font-medium">No published {what} form yet</p>
          <p className="text-muted-foreground">
            A form must be published before it can be used here.{" "}
            {can(PERMISSIONS.FORMS_VIEW) ? (
              <Link href="/configuration/forms" className="text-brand underline-offset-2 hover:underline">
                Open Form Builder
              </Link>
            ) : (
              "Ask your administrator to publish one in Form Builder."
            )}
          </p>
        </div>
      </div>
    );
  }
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(list.find((f) => f.versionId === v) ?? null)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.map((f) => (
          <SelectItem key={f.versionId} value={f.versionId}>
            {f.name} · v{f.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
