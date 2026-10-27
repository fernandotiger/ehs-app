"use client";

import { Paperclip } from "lucide-react";
import { useUsersByIds } from "@/features/shared/lookups";
import { fieldsForSite, formatAnswer, isEmptyValue, visibleFields, type FileAnswer, type FormValues } from "@/lib/forms";
import type { QuestionnaireSnapshot } from "@/lib/forms/questionnaire";

/**
 * Read view of a captured questionnaire: the questions as they were when the record was created
 * (the snapshot), with the saved answers. Person answers show names; file answers link to the
 * stored evidence once the module has attached them.
 */
export function QuestionnaireAnswers({
  snapshot,
  answers,
  hideKeys = [],
}: {
  snapshot: Pick<QuestionnaireSnapshot, "fields" | "siteId">;
  answers: FormValues;
  /** Questions the module shows elsewhere (e.g. repeated incident defaults). */
  hideKeys?: string[];
}) {
  const fields = visibleFields(fieldsForSite(snapshot.fields, snapshot.siteId), answers).filter((f) => !hideKeys.includes(f.key) && f.type !== "score");
  const personIds = fields.filter((f) => f.type === "person" && typeof answers[f.key] === "string").map((f) => answers[f.key] as string);
  const people = useUsersByIds([...new Set(personIds)]);
  const name = (id: string) => people.data?.find((u) => u.id === id)?.name ?? "…";

  return (
    <dl className="space-y-4">
      {fields.map((field) => {
        if (field.type === "heading") {
          return (
            <h3 key={field.key} className="border-b pb-1 pt-2 text-base font-semibold">
              {field.label}
            </h3>
          );
        }
        const value = answers[field.key];
        let shown: React.ReactNode;
        if (isEmptyValue(value)) shown = <span className="text-muted-foreground">Not answered</span>;
        else if (field.type === "person") shown = name(String(value));
        else if (field.type === "file") {
          shown = (
            <ul className="space-y-1">
              {(value as FileAnswer[]).map((f, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  {f.attachmentId ? (
                    <a className="text-brand underline-offset-2 hover:underline" href={`/api/evidence/${f.attachmentId}/file`} target="_blank" rel="noreferrer">
                      {f.fileName}
                    </a>
                  ) : (
                    f.fileName
                  )}
                </li>
              ))}
            </ul>
          );
        } else shown = <span className="whitespace-pre-wrap">{formatAnswer(field, value)}</span>;
        return (
          <div key={field.key} className="grid gap-1 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
            <dt className="text-sm text-muted-foreground">{field.label}</dt>
            <dd className="text-sm">{shown}</dd>
          </div>
        );
      })}
    </dl>
  );
}
