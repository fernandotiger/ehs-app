"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLookups } from "@/features/shared/lookups";
import type { FormFieldDefinition } from "@/lib/forms";
import { QuestionnaireForm } from "./questionnaire-form";

const ALL = "__all";

/** Disabled preview of a design. "All sites" shows site-limited questions too. */
export function FormPreview({ fields, idPrefix = "preview" }: { fields: FormFieldDefinition[]; idPrefix?: string }) {
  const lookups = useLookups();
  const [site, setSite] = useState(ALL);
  const hasSiteQuestions = fields.some((f) => f.siteIds?.length);
  const shown = site === ALL ? fields.map((f) => ({ ...f, siteIds: undefined })) : fields;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Eye className="size-4" /> Preview – answers are not accepted. * = required.
        </span>
        {hasSiteQuestions && (
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="h-8 w-48 bg-card" aria-label="Preview for site">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Every question</SelectItem>
              {(lookups.data?.sites ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  As seen at {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <QuestionnaireForm snapshot={{ fields: shown, siteId: site === ALL ? null : site }} value={{}} readOnly idPrefix={idPrefix} />
    </div>
  );
}
