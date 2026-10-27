"use client";

import { ArrowDown, ArrowUp, ListTree, MoreHorizontal, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCreateLookupValue, useLookup, useReorderLookup, useUpdateLookupValue } from "@/features/shared/lookups";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { isLookupListKey, LOOKUP_LISTS, type LookupListKey, type LookupValueDto, type LookupValueInput, type LookupValueUpdateInput } from "@/lib/lookups";
import { cn } from "@/lib/utils";
import { useCategoryList, useCreateCategory, useReorderCategories, useUpdateCategory } from "../api";
import { ConfigHeader } from "./shared";

const CATEGORY_LIST = "documents.category";

interface ListEntry {
  key: string;
  group: string;
  name: string;
  description: string;
}

function useListCatalogue(): ListEntry[] {
  const { hasModule } = useCurrentUser();
  const lists: ListEntry[] = Object.values(LOOKUP_LISTS)
    .filter((l) => !("module" in l) || !l.module || hasModule(l.module as never))
    .map((l) => ({ key: l.key, group: l.group, name: l.name, description: l.description }));
  if (hasModule("documents")) {
    lists.push({ key: CATEGORY_LIST, group: "Documents", name: "Document categories", description: "Categories offered when uploading and filtering documents." });
  }
  return lists;
}

/** /configuration/lists – pick-lists grouped by module, values edited on the right. */
export function ListsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lists = useListCatalogue();
  const selectedKey = lists.some((l) => l.key === params.get("list")) ? params.get("list")! : lists[0]?.key;
  const selected = lists.find((l) => l.key === selectedKey);
  const groups = [...new Set(lists.map((l) => l.group))];

  return (
    <>
      <ConfigHeader title="Lists & categories" description="Pick-lists used across the modules. Rename, reorder or deactivate values – built-in values are never deleted." />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit gap-0 py-2">
          <nav aria-label="Lists">
            {groups.map((group) => (
              <div key={group} className="px-2 py-1">
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                {lists
                  .filter((l) => l.group === group)
                  .map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => router.replace(`${pathname}?list=${encodeURIComponent(l.key)}`, { scroll: false })}
                      aria-current={l.key === selectedKey}
                      className={cn(
                        "block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted",
                        l.key === selectedKey && "bg-brand-soft font-medium text-brand hover:bg-brand-soft",
                      )}
                    >
                      {l.name}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
        </Card>
        {!selected ? (
          <EmptyState icon={ListTree} title="No lists" />
        ) : selected.key === CATEGORY_LIST ? (
          <CategoryListEditor key={selected.key} list={selected} />
        ) : isLookupListKey(selected.key) ? (
          <LookupListEditor key={selected.key} list={selected} listKey={selected.key} />
        ) : null}
      </div>
    </>
  );
}

interface EditorProps {
  list: ListEntry;
  values: (LookupValueDto & { documentCount?: number })[] | undefined;
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  onCreate: (input: LookupValueInput) => Promise<unknown>;
  onUpdate: (id: string, input: LookupValueUpdateInput) => Promise<unknown>;
  onReorder: (ids: string[]) => Promise<unknown>;
  creating: boolean;
}

function LookupListEditor({ list, listKey }: { list: ListEntry; listKey: LookupListKey }) {
  const query = useLookup(listKey, { includeInactive: true });
  const create = useCreateLookupValue(listKey);
  const update = useUpdateLookupValue(listKey);
  const reorder = useReorderLookup(listKey);
  return (
    <ValuesEditor
      list={list}
      values={query.data}
      query={query}
      creating={create.isPending}
      onCreate={(input) => create.mutateAsync(input)}
      onUpdate={(id, input) => update.mutateAsync({ id, ...input })}
      onReorder={(ids) => reorder.mutateAsync(ids)}
    />
  );
}

function CategoryListEditor({ list }: { list: ListEntry }) {
  const query = useCategoryList();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const reorder = useReorderCategories();
  return (
    <ValuesEditor
      list={list}
      values={query.data}
      query={query}
      creating={create.isPending}
      onCreate={(input) => create.mutateAsync(input)}
      onUpdate={(id, input) => update.mutateAsync({ id, ...input })}
      onReorder={(ids) => reorder.mutateAsync(ids)}
    />
  );
}

function ColourSwatch({ color }: { color: string | null }) {
  if (!color) return <span className="inline-block size-3.5 shrink-0 rounded-full border border-dashed" aria-hidden />;
  return <span className="inline-block size-3.5 shrink-0 rounded-full border" style={{ backgroundColor: color }} aria-hidden />;
}

function ValuesEditor({ list, values, query, onCreate, onUpdate, onReorder, creating }: EditorProps) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<(LookupValueDto & { documentCount?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const active = values?.filter((v) => v.isActive).length ?? 0;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      setError("Enter a name");
      return;
    }
    try {
      await onCreate({ label: label.trim() });
      toast.success(`"${label.trim()}" added`);
      setLabel("");
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!values) return;
    const ids = values.map((v) => v.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    try {
      await onReorder(ids);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(value: LookupValueDto) {
    try {
      await onUpdate(value.id, { isActive: !value.isActive });
      toast.success(`"${value.label}" ${value.isActive ? "deactivated" : "reactivated"}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">{list.name}</CardTitle>
        <CardDescription>
          {list.description} {values ? `${active} active of ${values.length}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <form onSubmit={add} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Field data-invalid={Boolean(error)} className="flex-1">
            <FieldLabel htmlFor="new-value" className="sr-only">
              New value
            </FieldLabel>
            <Input
              id="new-value"
              placeholder={`Add to ${list.name.toLowerCase()}…`}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
            />
            <FieldError errors={error ? [{ message: error }] : []} />
          </Field>
          <Button type="submit" disabled={creating}>
            {creating ? <Spinner /> : <Plus />} Add
          </Button>
        </form>

        {query.isPending ? (
          <LoadingRows rows={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !values || values.length === 0 ? (
          <EmptyState icon={ListTree} title="No values yet" description="Add the first value above." className="border-0" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {values.map((value, index) => (
              <li key={value.id} className={cn("flex items-center gap-3 px-3 py-2.5", !value.isActive && "bg-muted/40")}>
                <ColourSwatch color={value.color} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", !value.isActive && "text-muted-foreground line-through")}>{value.label}</p>
                  {(value.notes || value.documentCount !== undefined) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[value.documentCount !== undefined ? `${value.documentCount} document${value.documentCount === 1 ? "" : "s"}` : null, value.notes].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                {value.isSystem && <StatusBadge tone="neutral">Built-in</StatusBadge>}
                {!value.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                <div className="flex items-center">
                  <Button variant="ghost" size="icon-sm" disabled={busy || index === 0} onClick={() => void move(index, -1)} aria-label={`Move ${value.label} up`}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={busy || index === values.length - 1} onClick={() => void move(index, 1)} aria-label={`Move ${value.label} down`}>
                    <ArrowDown />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${value.label}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(value)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void toggle(value)}>
                        {value.isActive ? <PowerOff /> : <Power />} {value.isActive ? "Deactivate" : "Reactivate"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Values are never deleted, so existing records keep their label. Deactivated values are no longer offered in forms.</p>
      </CardContent>
      {editing && <EditValueDialog key={editing.id} value={editing} onClose={() => setEditing(null)} onSave={(input) => onUpdate(editing.id, input)} />}
    </Card>
  );
}

function EditValueDialog({ value, onClose, onSave }: { value: LookupValueDto; onClose: () => void; onSave: (input: LookupValueUpdateInput) => Promise<unknown> }) {
  const [label, setLabel] = useState(value.label);
  const [notes, setNotes] = useState(value.notes ?? "");
  const [useColour, setUseColour] = useState(Boolean(value.color));
  const [color, setColor] = useState(value.color ?? "#3b5382");
  const [isActive, setIsActive] = useState(value.isActive);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = label !== value.label || notes !== (value.notes ?? "") || (useColour ? color : null) !== value.color || isActive !== value.isActive;
  const guard = useUnsavedChangesGuard(dirty);
  const validColour = /^#[0-9a-fA-F]{6}$/.test(color);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return setError("Enter a name");
    if (useColour && !validColour) return setError("Use a colour like #3B5382");
    setSaving(true);
    try {
      await onSave({ label: label.trim(), notes: notes.trim() || null, color: useColour ? color : null, isActive });
      toast.success(`"${label.trim()}" saved`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {guard.dialog}
      <Dialog open onOpenChange={(open) => !open && guard.confirm(onClose)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit value</DialogTitle>
            <DialogDescription>{value.isSystem ? "A built-in value: it can be renamed or deactivated, but not deleted." : "Rename, add notes or a colour."}</DialogDescription>
          </DialogHeader>
          <form id="edit-value-form" onSubmit={submit} noValidate>
            <FieldGroup className="gap-4">
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="value-label">Name *</FieldLabel>
                <Input
                  id="value-label"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    setError(null);
                  }}
                />
                <FieldError errors={error ? [{ message: error }] : []} />
              </Field>
              <Field>
                <FieldLabel htmlFor="value-notes">Notes</FieldLabel>
                <Textarea id="value-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Field orientation="horizontal">
                <Switch id="value-colour-on" checked={useColour} onCheckedChange={setUseColour} />
                <FieldLabel htmlFor="value-colour-on">Colour</FieldLabel>
                {useColour && (
                  <span className="ml-auto flex items-center gap-2">
                    <input type="color" aria-label="Pick a colour" value={validColour ? color : "#000000"} onChange={(e) => setColor(e.target.value)} className="size-8 cursor-pointer rounded border bg-transparent" />
                    <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-28 font-mono" aria-label="Colour hex code" />
                  </span>
                )}
              </Field>
              <Field orientation="horizontal">
                <Switch id="value-active" checked={isActive} onCheckedChange={setIsActive} />
                <FieldLabel htmlFor="value-active">Active</FieldLabel>
                <FieldDescription className="ml-auto">{isActive ? "Offered in forms" : "Hidden from forms"}</FieldDescription>
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => guard.confirm(onClose)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-value-form" disabled={saving || !dirty}>
              {saving && <Spinner />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

