"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, MoreHorizontal, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import {
  isStructureLevel,
  STRUCTURE_LEVEL_META,
  STRUCTURE_LEVELS,
  structureNodeSchema,
  type StructureLevel,
  type StructureNodeInput,
  type StructureNodeValues,
} from "@/lib/validation/configuration";
import { useSaveStructureNode, useSetStructureActive, useStructureCounts, useStructureList, type StructureRow } from "../api";
import { ActiveBadge, ConfigHeader, OptionFilter, plural, SearchInput, STATUS_OPTIONS } from "./shared";

const PAGE_SIZE = 25;

const DERIVED: Record<StructureLevel, string> = {
  "business-units": "",
  sites: "Moving it to another business unit also moves its locations, departments and people.",
  locations: "Its business unit follows from the site.",
  departments: "Its site and business unit follow from the location.",
};

function useParentOptions(level: StructureLevel) {
  const lookups = useLookups();
  const options = structureOptions(lookups.data);
  const parent = STRUCTURE_LEVEL_META[level].parent;
  const list =
    parent === "business-units" ? options.businessUnits : parent === "sites" ? options.sites : parent === "locations" ? options.locations : [];
  return { options: list, isLoading: lookups.isPending };
}

/** /configuration/structure – Business units, Sites, Locations and Departments. */
export function StructurePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const level: StructureLevel = isStructureLevel(tabParam) ? tabParam : "business-units";
  const meta = STRUCTURE_LEVEL_META[level];
  const counts = useStructureCounts();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [parentId, setParentId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StructureRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<StructureRow | null>(null);
  const list = useStructureList(level, { page, pageSize: PAGE_SIZE, q: q || undefined, status, parentId });
  const parents = useParentOptions(level);
  const setActive = useSetStructureActive(level);

  function changeLevel(next: string) {
    setSearch("");
    setParentId(undefined);
    setPage(1);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  async function toggleActive(row: StructureRow) {
    try {
      await setActive.mutateAsync({ id: row.id, isActive: !row.isActive });
      toast.success(`${row.name} ${row.isActive ? "deactivated" : "reactivated"}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const childLabel = meta.child ? STRUCTURE_LEVEL_META[meta.child].plural : null;
  const parentLabel = meta.parent ? STRUCTURE_LEVEL_META[meta.parent].label : null;

  return (
    <>
      <ConfigHeader
        title="Company structure"
        description="Business unit → Site → Location → Department. Every site, location and department sits under an existing parent."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Add {meta.label.toLowerCase()}
          </Button>
        }
      />

      <Tabs value={level} onValueChange={changeLevel} className="mb-4">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:h-9 sm:w-fit">
          {STRUCTURE_LEVELS.map((l) => (
            <TabsTrigger key={l} value={l} className="gap-1.5 px-3">
              {STRUCTURE_LEVEL_META[l].plural}
              {counts.data && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular-nums">
                  {counts.data[l]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="mb-4 gap-0 p-3">
        <div className={meta.parent ? "grid gap-2 sm:grid-cols-[2fr_1fr_1fr]" : "grid gap-2 sm:grid-cols-[2fr_1fr]"}>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={`Search ${meta.plural.toLowerCase()} by name or code`}
          />
          {meta.parent && (
            <OptionFilter
              value={parentId}
              onChange={(v) => {
                setParentId(v);
                setPage(1);
              }}
              options={parents.options}
              allLabel={`All ${STRUCTURE_LEVEL_META[meta.parent].plural.toLowerCase()}`}
              ariaLabel={`Filter by ${parentLabel?.toLowerCase()}`}
            />
          )}
          <OptionFilter
            value={status}
            onChange={(v) => {
              setStatus((v as typeof status | undefined) ?? "active");
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            ariaLabel="Status"
          />
        </div>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q || parentId || status !== "active" ? `No ${meta.plural.toLowerCase()} match` : `No ${meta.plural.toLowerCase()} yet`}
          description={q || parentId ? "Try a different search or filter." : meta.parent ? `Add a ${meta.label.toLowerCase()} under an existing ${parentLabel?.toLowerCase()}.` : "Add your first business unit to start building the structure."}
          action={
            !q && !parentId ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Add {meta.label.toLowerCase()}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((row) => (
              <li key={row.id} className="flex items-start gap-3 p-4">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(row)}>
                  <p className="font-medium">
                    {row.name} {row.code && <span className="text-xs text-muted-foreground">({row.code})</span>}
                  </p>
                  {row.path && <p className="truncate text-xs text-muted-foreground">{row.path}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[childLabel ? plural(row.childCount, STRUCTURE_LEVEL_META[meta.child!].label.toLowerCase()) : null, plural(row.userCount, "person", "people")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
                <ActiveBadge active={row.isActive} />
                <RowMenu row={row} onEdit={() => setEditing(row)} onToggle={() => setToggling(row)} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">{meta.label}</TableHead>
                  {meta.parent && <TableHead>Belongs to</TableHead>}
                  {childLabel && <TableHead className="text-right">{childLabel}</TableHead>}
                  <TableHead className="text-right">People</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setEditing(row)}>
                    <TableCell className="max-w-72 pl-4">
                      <span className="block truncate font-medium">{row.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[row.code, row.notes].filter(Boolean).join(" · ") || "—"}</span>
                    </TableCell>
                    {meta.parent && <TableCell className="max-w-72 truncate text-muted-foreground">{row.path}</TableCell>}
                    {childLabel && <TableCell className="text-right tabular-nums">{row.childCount}</TableCell>}
                    <TableCell className="text-right tabular-nums">{row.userCount}</TableCell>
                    <TableCell>
                      <ActiveBadge active={row.isActive} />
                    </TableCell>
                    <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                      <RowMenu row={row} onEdit={() => setEditing(row)} onToggle={() => setToggling(row)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}

      <NodeSheet
        key={`${level}:${editing?.id ?? (creating ? "new" : "none")}`}
        level={level}
        node={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        parentOptions={parents.options}
      />

      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && setToggling(null)}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        description={
          toggling?.isActive
            ? "It will no longer be offered in pickers. People and records placed here keep their placement, and you can reactivate it later."
            : "It will be offered in pickers again."
        }
        confirmLabel={toggling?.isActive ? "Deactivate" : "Reactivate"}
        destructive={toggling?.isActive}
        onConfirm={() => {
          if (toggling) void toggleActive(toggling);
          setToggling(null);
        }}
      />
    </>
  );
}

function RowMenu({ row, onEdit, onToggle }: { row: StructureRow; onEdit: () => void; onToggle: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`More actions for ${row.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          {row.isActive ? (
            <>
              <PowerOff /> Deactivate
            </>
          ) : (
            <>
              <Power /> Reactivate
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NodeSheet({
  level,
  node,
  open,
  onClose,
  parentOptions,
}: {
  level: StructureLevel;
  node: StructureRow | null;
  open: boolean;
  onClose: () => void;
  parentOptions: { id: string; name: string }[];
}) {
  const meta = STRUCTURE_LEVEL_META[level];
  const save = useSaveStructureNode(level);
  const form = useForm<StructureNodeInput, unknown, StructureNodeValues>({
    resolver: zodResolver(structureNodeSchema),
    defaultValues: { name: node?.name ?? "", code: node?.code ?? "", notes: node?.notes ?? "", parentId: node?.parentId ?? "" },
  });
  const dirty = open && form.formState.isDirty;
  const guard = useUnsavedChangesGuard(dirty);
  const parentId = useWatch({ control: form.control, name: "parentId" });
  const moving = Boolean(node && meta.parent && parentId && parentId !== node.parentId);
  const parentLabel = meta.parent ? STRUCTURE_LEVEL_META[meta.parent].label : null;
  // A parent that is no longer active is still shown for existing nodes.
  const options = node?.parentId && !parentOptions.some((o) => o.id === node.parentId) ? [{ id: node.parentId, name: `${node.parentName} (inactive)` }, ...parentOptions] : parentOptions;

  const onSubmit = form.handleSubmit(async (values) => {
    if (meta.parent && !values.parentId) {
      form.setError("parentId", { message: `Choose a ${parentLabel?.toLowerCase()}` });
      return;
    }
    try {
      const result = await save.mutateAsync({ ...values, id: node?.id });
      const moved = result.repositioned;
      toast.success(
        node
          ? moved
            ? `${values.name} moved – ${plural(moved.user ?? 0, "person", "people")} updated`
            : `${values.name} saved`
          : `${meta.label} ${values.name} added`,
      );
      form.reset(values);
      onClose();
    } catch (error) {
      const details = (error as { details?: { path?: string; message?: string }[] }).details;
      const parentIssue = Array.isArray(details) ? details.find((d) => d.path === "parentId") : undefined;
      if (parentIssue) form.setError("parentId", { message: parentIssue.message });
      toast.error(errorMessage(error));
    }
  });

  return (
    <>
      {guard.dialog}
      <Sheet open={open} onOpenChange={(next) => (!next ? guard.confirm(onClose) : undefined)}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{node ? `Edit ${meta.label.toLowerCase()}` : `Add ${meta.label.toLowerCase()}`}</SheetTitle>
            <SheetDescription>
              {meta.parent
                ? `A ${meta.label.toLowerCase()} always belongs to one ${parentLabel?.toLowerCase()}. ${DERIVED[level]}`
                : "A top-level grouping of your company, e.g. a division or region."}
            </SheetDescription>
          </SheetHeader>
          <form id="structure-form" onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup className="gap-4">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="node-name">Name *</FieldLabel>
                    <Input id="node-name" autoComplete="off" {...field} aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {meta.parent && (
                <Controller
                  name="parentId"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="node-parent">{parentLabel} *</FieldLabel>
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger id="node-parent" className="w-full" aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder={`Choose a ${parentLabel?.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {moving && (
                        <FieldDescription className="text-warning-foreground dark:text-warning">
                          Moving updates everything below it: {node!.childCount ? `${plural(node!.childCount, "child item")}, ` : ""}
                          {plural(node!.userCount, "person", "people")} and records placed here.
                        </FieldDescription>
                      )}
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
              <Controller
                name="code"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="node-code">Code</FieldLabel>
                    <Input id="node-code" className="max-w-40" autoComplete="off" {...field} value={field.value ?? ""} />
                    <FieldDescription>Optional short code, e.g. DUB.</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="notes"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="node-notes">Notes</FieldLabel>
                    <Textarea id="node-notes" rows={3} {...field} value={field.value ?? ""} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {node && (
                <p className="text-xs text-muted-foreground">
                  {[meta.child ? plural(node.childCount, STRUCTURE_LEVEL_META[meta.child].label.toLowerCase()) : null, plural(node.userCount, "person", "people")]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {node.isActive ? "Active" : "Inactive"}
                </p>
              )}
            </FieldGroup>
          </form>
          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => guard.confirm(onClose)}>
              Cancel
            </Button>
            <Button type="submit" form="structure-form" disabled={save.isPending}>
              {save.isPending && <Spinner />} {node ? "Save changes" : `Add ${meta.label.toLowerCase()}`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
