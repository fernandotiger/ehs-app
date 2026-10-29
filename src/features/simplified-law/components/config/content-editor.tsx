"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { parseRoles } from "@/lib/simplified-law/rules";
import { useAddContent, useMoveContent, useRemoveContent, useUpdateContent, type ContentInput, type ContentKind, type SlawLegislationDetailDto } from "../../api";
import { blockersOf, formatDate } from "../../format";
import { Blockers } from "../shared";

interface Row {
  id: string;
  primary: string;
  secondary?: string;
}

const COPY: Record<ContentKind, { title: string; description: string; add: string; empty: string; removeNote: string }> = {
  articles: {
    title: "Overview articles",
    description: "Key articles with the date they apply from and who they apply to (each role becomes a column).",
    add: "Add article",
    empty: "No overview yet.",
    removeNote: "The row disappears from the overview.",
  },
  questions: {
    title: "Applicability questions",
    description: "Yes/No questions that help decide whether the law applies. Any Yes means it is likely relevant.",
    add: "Add question",
    empty: "No questions yet – people then decide directly.",
    removeNote: "Answers already given stay in the history.",
  },
  requirements: {
    title: "Requirements",
    description: "What we must do to comply, grouped in sections, with the linked articles.",
    add: "Add requirement",
    empty: "No requirements yet.",
    removeNote: "Its answer stays in the history and an open action is closed.",
  },
};

function rowsFor(kind: ContentKind, law: SlawLegislationDetailDto): Row[] {
  if (kind === "articles") return law.articles.map((a) => ({ id: a.id, primary: `${a.number} · ${a.title}`, secondary: [a.chapter, a.appliesFrom ? `from ${formatDate(a.appliesFrom)}` : null, a.appliesTo.join(", ")].filter(Boolean).join(" · ") }));
  if (kind === "questions") return law.questions.map((q) => ({ id: q.id, primary: q.text }));
  return law.requirements.map((r) => ({ id: r.id, primary: r.text, secondary: [r.section, r.articles].filter(Boolean).join(" · ") }));
}

/** List editor for one kind of law content: add, change, re-order, remove. */
export function ContentEditor({ kind, law }: { kind: ContentKind; law: SlawLegislationDetailDto }) {
  const copy = COPY[kind];
  const rows = rowsFor(kind, law);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const move = useMoveContent(kind);
  const remove = useRemoveContent(kind);

  async function run(promise: Promise<unknown>, done: string) {
    try {
      await promise;
      toast.success(done);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-col gap-2 border-b py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>
            {copy.title} ({rows.length})
          </CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus /> {copy.add}
        </Button>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent className="py-6 text-sm text-muted-foreground">{copy.empty}</CardContent>
      ) : (
        <ol className="divide-y">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm leading-snug">
                  <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                  {r.primary}
                </p>
                {r.secondary && <p className="mt-0.5 text-xs text-muted-foreground">{r.secondary}</p>}
              </div>
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => void run(move.mutateAsync({ id: r.id, direction: "up" }), "Moved up")}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => void run(move.mutateAsync({ id: r.id, direction: "down" }), "Moved down")}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Change" onClick={() => setEditing(r.id)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRemoving(r)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ContentDialog kind={kind} law={law} itemId={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove it?"
        description={`${removing?.primary ?? ""} – ${copy.removeNote}`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => run(remove.mutateAsync(removing?.id ?? ""), "Removed")}
      />
    </Card>
  );
}

function ContentDialog({ kind, law, itemId, onOpenChange }: { kind: ContentKind; law: SlawLegislationDetailDto; itemId: string | "new" | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={itemId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">{itemId !== null && <ContentForm kind={kind} law={law} itemId={itemId} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function initialValues(kind: ContentKind, law: SlawLegislationDetailDto, itemId: string) {
  const a = law.articles.find((x) => x.id === itemId);
  const q = law.questions.find((x) => x.id === itemId);
  const r = law.requirements.find((x) => x.id === itemId);
  return {
    chapter: a?.chapter ?? law.articles[law.articles.length - 1]?.chapter ?? "",
    number: a?.number ?? "",
    title: a?.title ?? "",
    appliesFrom: a?.appliesFrom ?? "",
    appliesTo: a ? a.appliesTo.join(", ") : law.roles.join(", "),
    text: kind === "questions" ? (q?.text ?? "") : (r?.text ?? ""),
    section: r?.section ?? law.requirements[law.requirements.length - 1]?.section ?? "",
    articles: r?.articles ?? "",
  };
}

function ContentForm({ kind, law, itemId, onClose }: { kind: ContentKind; law: SlawLegislationDetailDto; itemId: string; onClose: () => void }) {
  const isNew = itemId === "new";
  const [v, setV] = useState(() => initialValues(kind, law, itemId));
  const [blockers, setBlockers] = useState<string[]>([]);
  const add = useAddContent(law.id, kind);
  const update = useUpdateContent(kind);
  const pending = add.isPending || update.isPending;
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const sections = [...new Set(law.requirements.map((r) => r.section).filter(Boolean))];

  function input(): ContentInput[typeof kind] {
    if (kind === "articles") return { chapter: v.chapter, number: v.number, title: v.title, appliesFrom: v.appliesFrom || null, appliesTo: parseRoles(v.appliesTo) } as ContentInput[typeof kind];
    if (kind === "questions") return { text: v.text } as ContentInput[typeof kind];
    return { section: v.section, text: v.text, articles: v.articles } as ContentInput[typeof kind];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBlockers([]);
    try {
      if (isNew) await add.mutateAsync(input());
      else await update.mutateAsync({ id: itemId, input: input() });
      toast.success(isNew ? "Added" : "Saved");
      onClose();
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    }
  }

  const noun = kind === "articles" ? "article" : kind === "questions" ? "question" : "requirement";
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{isNew ? `New ${noun}` : `Change ${noun}`}</DialogTitle>
        <DialogDescription>{law.shortTitle || law.title}</DialogDescription>
      </DialogHeader>
      {kind === "articles" && (
        <>
          <Field>
            <FieldLabel htmlFor="art-chapter">Chapter or part</FieldLabel>
            <Input id="art-chapter" value={v.chapter} onChange={(e) => set({ chapter: e.target.value })} placeholder="e.g. Chapter II – Sustainability requirements" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field>
              <FieldLabel htmlFor="art-number">Article *</FieldLabel>
              <Input id="art-number" value={v.number} onChange={(e) => set({ number: e.target.value })} placeholder="e.g. 5" />
            </Field>
            <Field>
              <FieldLabel htmlFor="art-title">What it is about *</FieldLabel>
              <Input id="art-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Substances in packaging" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="art-from">Applies from</FieldLabel>
            <Input id="art-from" type="date" value={v.appliesFrom} onChange={(e) => set({ appliesFrom: e.target.value })} className="w-full sm:w-48" />
          </Field>
          <Field>
            <FieldLabel htmlFor="art-who">Who it applies to</FieldLabel>
            <Input id="art-who" value={v.appliesTo} onChange={(e) => set({ appliesTo: e.target.value })} placeholder="e.g. Manufacturer, Importer, Distributor" />
            <FieldDescription>Separate roles with commas – each role becomes a column of the overview.</FieldDescription>
          </Field>
        </>
      )}
      {kind === "questions" && (
        <Field>
          <FieldLabel htmlFor="q-text">Question *</FieldLabel>
          <Textarea id="q-text" rows={3} value={v.text} onChange={(e) => set({ text: e.target.value })} placeholder="e.g. Do we use plastic packaging?" />
          <FieldDescription>Ask it so that Yes means the law is likely to apply.</FieldDescription>
        </Field>
      )}
      {kind === "requirements" && (
        <>
          <Field>
            <FieldLabel htmlFor="req-section">Section</FieldLabel>
            <Input id="req-section" list="slaw-sections" value={v.section} onChange={(e) => set({ section: e.target.value })} placeholder="e.g. EPR and reporting" />
            <datalist id="slaw-sections">
              {sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field>
            <FieldLabel htmlFor="req-text">Requirement *</FieldLabel>
            <Textarea id="req-text" rows={4} value={v.text} onChange={(e) => set({ text: e.target.value })} placeholder="e.g. Register as a producer in each Member State, or appoint an authorised representative." />
          </Field>
          <Field>
            <FieldLabel htmlFor="req-articles">Linked articles</FieldLabel>
            <Input id="req-articles" value={v.articles} onChange={(e) => set({ articles: e.target.value })} placeholder="e.g. Articles 44, 17" />
          </Field>
        </>
      )}
      <Blockers title="Not saved" blockers={blockers} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} {isNew ? "Add" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
