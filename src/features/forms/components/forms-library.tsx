"use client";

import { ChevronRight, FileText, FormInput, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigHeader, OptionFilter, SearchInput } from "@/features/configuration/components/shared";
import { FORM_MODULES } from "@/lib/forms/catalog";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useFormDetail, useFormLibrary, type FormSummaryDto } from "../api";
import { CreateFormDialog } from "./create-form-dialog";
import { FormPreview } from "./form-preview";

const MODULE_OPTIONS = Object.values(FORM_MODULES)
  .filter((m) => m.available)
  .map((m) => ({ id: m.key, name: m.label }));

export function FormStatusBadge({ form }: { form: Pick<FormSummaryDto, "status" | "currentVersion"> }) {
  if (form.status === "PUBLISHED") return <StatusBadge tone="success" dot>Published · v{form.currentVersion}</StatusBadge>;
  if (form.currentVersion > 0) return <StatusBadge tone="warning" dot>Draft changes · v{form.currentVersion} in use</StatusBadge>;
  return <StatusBadge tone="neutral" dot>Draft – not published</StatusBadge>;
}

/** /configuration/forms – the form library: search, module filter and a disabled preview. */
export function FormsLibrary() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [module, setModule] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const q = useDeferredValue(search.trim());
  const library = useFormLibrary({ q: q || undefined, module });
  const selectedId = params.get("form") ?? library.data?.[0]?.id;
  const selected = library.data?.find((f) => f.id === selectedId) ?? library.data?.[0];
  const canDesign = can(PERMISSIONS.FORMS_DESIGN);

  function select(id: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("form", id);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <>
      <ConfigHeader
        title="Form Builder"
        description="Questionnaires for Incident and Risk. Only published versions are used, and every record keeps the version it started with."
        actions={
          canDesign && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New form
            </Button>
          )
        }
      />
      {library.isError ? (
        <ErrorState error={library.error} onRetry={() => library.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Card className="h-fit gap-0 py-0 lg:sticky lg:top-20">
            <div className="grid gap-2 border-b p-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search forms or modules" />
              <OptionFilter value={module} onChange={setModule} options={MODULE_OPTIONS} allLabel="All modules" ariaLabel="Module" />
            </div>
            {library.isPending ? (
              <LoadingRows rows={5} className="p-3" />
            ) : library.data.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{q || module ? "No forms match." : "No forms yet."}</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto p-1.5 lg:max-h-[calc(100dvh-16rem)]" aria-label="Forms">
                {library.data.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => select(f.id)}
                      aria-current={f.id === selected?.id}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted", f.id === selected?.id && "bg-brand-soft hover:bg-brand-soft")}
                    >
                      <FileText className="size-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{f.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {f.moduleLabel} · {f.purposeLabel} · {f.questionCount} questions · {f.currentVersion ? `v${f.currentVersion}` : "Not published"}
                        </span>
                      </span>
                      {f.status === "DRAFT" && <span className="size-2 shrink-0 rounded-full bg-warning" aria-label="Draft" />}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {library.isPending ? (
            <LoadingRows rows={8} />
          ) : !selected ? (
            <EmptyState
              icon={FormInput}
              title="No forms yet"
              description="Create a form for incident reports, investigations or risk assessments. It stays a draft until you publish it."
              action={
                canDesign && (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> New form
                  </Button>
                )
              }
            />
          ) : (
            <FormPreviewCard id={selected.id} summary={selected} canDesign={canDesign} />
          )}
        </div>
      )}
      <CreateFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function FormPreviewCard({ id, summary, canDesign }: { id: string; summary: FormSummaryDto; canDesign: boolean }) {
  const detail = useFormDetail(id);
  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="gap-3 border-b p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg">{summary.name}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="brand">
                {summary.moduleLabel} · {summary.purposeLabel}
              </StatusBadge>
              <FormStatusBadge form={summary} />
              <StatusBadge tone="neutral">{summary.questionCount} questions</StatusBadge>
            </div>
          </div>
          <Button asChild variant={canDesign ? "default" : "outline"}>
            <Link href={`/configuration/forms/${id}`}>
              <Pencil /> {canDesign ? (summary.status === "PUBLISHED" ? "Edit design" : "Continue draft") : "Open design"}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {detail.isPending ? <LoadingRows rows={6} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : <FormPreview fields={detail.data.fields} idPrefix={`lib-${id}`} />}
      </CardContent>
    </Card>
  );
}
