"use client";

import { Archive, ArchiveRestore, ArrowRight, FileSearch, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api-client";
import { LEGAL_STATUSES, SLAW_BASE, slawLegislationHref, STATUS_HINTS, statusLabels, type LegalStatusKey } from "@/lib/simplified-law";
import type { LegislationInput } from "@/lib/validation/simplified-law";
import { useArchiveLegislation, useCreateLegislation, useLegislation, useSlawCategories, useSlawSettings, useUpdateLegislation, type SlawLegislationDetailDto } from "../../api";
import { blockersOf, STALE_MESSAGE } from "../../format";
import { Blockers } from "../shared";
import { ContentEditor } from "./content-editor";

const BACK = `${SLAW_BASE}/configuration`;

/** Add your own law (details first; questions, overview and requirements follow on the edit page). */
export function NewLegislation() {
  const params = useSearchParams();
  return (
    <>
      <PageHeader title="Add a law" description="Start with the details. Then add its overview, applicability questions and requirements." backHref={BACK} backLabel="Configuration" />
      <DetailsForm law={null} defaultCategoryId={params.get("category")} />
    </>
  );
}

/** Edit a law: details, overview articles, applicability questions and requirements. */
export function EditLegislation({ id }: { id: string }) {
  const query = useLegislation(id);
  if (query.isPending) return <LoadingRows rows={6} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Law not found" className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Editor law={query.data} />;
}

function Editor({ law }: { law: SlawLegislationDetailDto }) {
  const [confirm, setConfirm] = useState(false);
  const archive = useArchiveLegislation(law.id);

  async function toggleArchive() {
    try {
      await archive.mutateAsync(!law.archived);
      toast.success(law.archived ? "Law restored" : "Law archived");
    } catch (error) {
      const blockers = blockersOf(error);
      toast.error(blockers.length ? blockers.join(" ") : errorMessage(error));
    }
  }

  return (
    <>
      <PageHeader
        title={law.title}
        description="Change what people see in the register. Answers and checks already given are kept."
        backHref={BACK}
        backLabel="Configuration"
        meta={law.archived ? <StatusBadge tone="warning">Archived</StatusBadge> : undefined}
        actions={
          <>
            {!law.archived && (
              <Button asChild variant="outline">
                <Link href={slawLegislationHref(law.id)}>
                  Open in the register <ArrowRight />
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => (law.archived ? void toggleArchive() : setConfirm(true))} disabled={archive.isPending}>
              {law.archived ? <ArchiveRestore /> : <Archive />} {law.archived ? "Restore" : "Archive"}
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <DetailsForm key={law.version} law={law} defaultCategoryId={null} />
        <ContentEditor kind="articles" law={law} />
        <ContentEditor kind="questions" law={law} />
        <ContentEditor kind="requirements" law={law} />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Archive this law?"
        description={`It leaves the register${law.counts.openActions ? ` and its ${law.counts.openActions} open action(s) are closed` : ""}. You can restore it later with its answers.`}
        confirmLabel="Archive"
        destructive
        onConfirm={toggleArchive}
      />
    </>
  );
}

function DetailsForm({ law, defaultCategoryId }: { law: SlawLegislationDetailDto | null; defaultCategoryId: string | null }) {
  const router = useRouter();
  const settings = useSlawSettings();
  const categories = useSlawCategories();
  const labels = statusLabels(settings.data?.statusLabels);
  const [v, setV] = useState<LegislationInput>(() => ({
    categoryId: law?.category.id ?? defaultCategoryId ?? "",
    title: law?.title ?? "",
    shortTitle: law?.shortTitle ?? "",
    reference: law?.reference ?? "",
    jurisdiction: law?.jurisdiction ?? "",
    status: law?.status ?? "ACTIVE",
    kindLabel: law?.kindLabel ?? "",
    relationNote: law?.relationNote ?? "",
    summary: law?.summary ?? "",
    officialUrl: law?.officialUrl ?? "",
    guidanceUrl: law?.guidanceUrl ?? "",
  }));
  const [blockers, setBlockers] = useState<string[]>([]);
  const create = useCreateLegislation();
  const update = useUpdateLegislation(law?.id ?? "");
  const pending = create.isPending || update.isPending;
  const set = (patch: Partial<LegislationInput>) => setV((x) => ({ ...x, ...patch }));
  const jurisdictions = settings.data?.jurisdictions ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBlockers([]);
    const body = v;
    try {
      if (law) {
        const res = await update.mutateAsync({ ...body, expectedVersion: law.version });
        toast.success(res.closedActions ? `Saved – ${res.closedActions} open action(s) closed` : "Details saved");
      } else {
        const res = await create.mutateAsync(body);
        toast.success("Law added – now add its questions and requirements");
        router.push(`${SLAW_BASE}/configuration/legislation/${res.id}`);
      }
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE_MESSAGE : errorMessage(error));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Fields marked * are needed. Write the summary in plain words.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="law-title">Official title *</FieldLabel>
            <Input id="law-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Safety, Health and Welfare at Work Act 2005" />
          </Field>
          <Field>
            <FieldLabel htmlFor="law-short">Short name</FieldLabel>
            <Input id="law-short" value={v.shortTitle} onChange={(e) => set({ shortTitle: e.target.value })} placeholder="e.g. SHWW Act 2005" />
          </Field>
          <Field>
            <FieldLabel htmlFor="law-ref">Number / year</FieldLabel>
            <Input id="law-ref" value={v.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="e.g. No. 10 of 2005" />
          </Field>
          <Field>
            <FieldLabel htmlFor="law-cat">Sub-category *</FieldLabel>
            <Select value={v.categoryId} onValueChange={(id) => set({ categoryId: id })}>
              <SelectTrigger id="law-cat" className="w-full">
                <SelectValue placeholder="Choose a sub-category" />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? []).map((c) => (
                  <SelectGroup key={c.id}>
                    <SelectLabel>{c.name}</SelectLabel>
                    {c.children.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="law-jur">Jurisdiction *</FieldLabel>
            <Select value={v.jurisdiction} onValueChange={(j) => set({ jurisdiction: j })}>
              <SelectTrigger id="law-jur" className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {jurisdictions.map((j) => (
                  <SelectItem key={j} value={j}>
                    {j}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="law-status">Status *</FieldLabel>
            <Select value={v.status} onValueChange={(s) => set({ status: s as LegalStatusKey })}>
              <SelectTrigger id="law-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEGAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {labels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{STATUS_HINTS[v.status]}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="law-kind">Status note</FieldLabel>
            <Input id="law-kind" value={v.kindLabel} onChange={(e) => set({ kindLabel: e.target.value })} placeholder="e.g. new regulation, supplementary" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="law-rel">Related laws</FieldLabel>
            <Textarea id="law-rel" rows={2} value={v.relationNote} onChange={(e) => set({ relationNote: e.target.value })} placeholder="e.g. Supplements PPWR · Repealed from 12 August 2026" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="law-summary">Summary</FieldLabel>
            <Textarea id="law-summary" rows={4} value={v.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="What the law is about and who it affects, in two or three sentences." />
          </Field>
          <Field>
            <FieldLabel htmlFor="law-url">Official document (web address)</FieldLabel>
            <Input id="law-url" type="url" value={v.officialUrl ?? ""} onChange={(e) => set({ officialUrl: e.target.value })} placeholder="https://www.irishstatutebook.ie/…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="law-guide">Guidance (web address)</FieldLabel>
            <Input id="law-guide" type="url" value={v.guidanceUrl ?? ""} onChange={(e) => set({ guidanceUrl: e.target.value })} placeholder="https://www.hsa.ie/…" />
          </Field>
          <div className="space-y-3 md:col-span-2">
            <Blockers title="Not saved" blockers={blockers} />
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner /> : <Save />} {law ? "Save details" : "Add law"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
