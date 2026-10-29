"use client";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, FolderPlus, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useArchiveCategory, useCreateCategory, useMoveCategory, useSlawCategories, useUpdateCategory, type SlawCategoryNode } from "../../api";
import { blockersOf } from "../../format";
import { NameDialog } from "./name-dialog";

type Dialog = { kind: "add"; parent: SlawCategoryNode | null } | { kind: "edit"; node: SlawCategoryNode } | null;

/** Categories and sub-categories ("added over time" in the storyboard): add, rename, re-order, archive. */
export function CategoriesPanel() {
  const [showArchived, setShowArchived] = useState(false);
  const tree = useSlawCategories(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const move = useMoveCategory();
  const archive = useArchiveCategory();

  async function run(promise: Promise<unknown>, done: string) {
    try {
      await promise;
      toast.success(done);
    } catch (error) {
      const blockers = blockersOf(error);
      toast.error(blockers.length ? blockers.join(" ") : errorMessage(error));
    }
  }

  const visible = (nodes: SlawCategoryNode[]) => nodes.filter((n) => showArchived || !n.archived);

  const actionsFor = (node: SlawCategoryNode, siblings: SlawCategoryNode[], parent: SlawCategoryNode | null) => {
    const live = siblings.filter((s) => !s.archived);
    const i = live.findIndex((s) => s.id === node.id);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${node.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!node.archived && (
            <>
              <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", node })}>
                <Pencil /> Rename
              </DropdownMenuItem>
              {!parent && (
                <DropdownMenuItem onSelect={() => setDialog({ kind: "add", parent: node })}>
                  <FolderPlus /> Add a sub-category
                </DropdownMenuItem>
              )}
              {i > 0 && (
                <DropdownMenuItem onSelect={() => void run(move.mutateAsync({ id: node.id, direction: "up" }), "Moved up")}>
                  <ArrowUp /> Move up
                </DropdownMenuItem>
              )}
              {i >= 0 && i < live.length - 1 && (
                <DropdownMenuItem onSelect={() => void run(move.mutateAsync({ id: node.id, direction: "down" }), "Moved down")}>
                  <ArrowDown /> Move down
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void run(archive.mutateAsync({ id: node.id, archived: true }), `${node.name} archived`)}>
                <Archive /> Archive
              </DropdownMenuItem>
            </>
          )}
          {node.archived && (
            <DropdownMenuItem onSelect={() => void run(archive.mutateAsync({ id: node.id, archived: false }), `${node.name} restored`)}>
              <ArchiveRestore /> Restore
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Group the laws in two levels, e.g. Waste › Packaging waste. Only empty categories can be archived.</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="cat-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="cat-archived" className="text-sm font-normal">
              Show archived
            </Label>
          </div>
          <Button onClick={() => setDialog({ kind: "add", parent: null })}>
            <Plus /> Add category
          </Button>
        </div>
      </div>

      {tree.isPending ? (
        <LoadingRows rows={4} />
      ) : tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
      ) : visible(tree.data).length === 0 ? (
        <EmptyState icon={FolderPlus} title="No categories yet" description="Add a category such as Health & Safety, then its sub-categories." />
      ) : (
        visible(tree.data).map((top) => (
          <Card key={top.id} className={cn("gap-0 py-0", top.archived && "opacity-60")}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {top.name} {top.archived && <StatusBadge tone="warning">Archived</StatusBadge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {top.legislationCount} law{top.legislationCount === 1 ? "" : "s"}
                  {top.description ? ` · ${top.description}` : ""}
                </p>
              </div>
              {actionsFor(top, tree.data, null)}
            </div>
            <ul className="divide-y">
              {visible(top.children).map((sub) => (
                <li key={sub.id} className={cn("flex items-center justify-between gap-2 py-2 pl-8 pr-4", sub.archived && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {sub.name} {sub.archived && <StatusBadge tone="warning">Archived</StatusBadge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sub.legislationCount} law{sub.legislationCount === 1 ? "" : "s"}
                      {sub.description ? ` · ${sub.description}` : ""}
                    </p>
                  </div>
                  {actionsFor(sub, top.children, top)}
                </li>
              ))}
              {!top.archived && (
                <li className="py-1.5 pl-6 pr-4">
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDialog({ kind: "add", parent: top })}>
                    <Plus /> Add a sub-category
                  </Button>
                </li>
              )}
            </ul>
          </Card>
        ))
      )}

      <NameDialog
        open={dialog?.kind === "add"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "add" && dialog.parent ? `New sub-category of ${dialog.parent.name}` : "New category"}
        placeholder={dialog?.kind === "add" && dialog.parent ? "e.g. Packaging waste" : "e.g. Waste"}
        initialDescription=""
        submitLabel="Add"
        onSubmit={(v) => create.mutateAsync({ ...v, parentId: dialog?.kind === "add" ? (dialog.parent?.id ?? null) : null })}
      />
      <NameDialog
        open={dialog?.kind === "edit"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename"
        initialName={dialog?.kind === "edit" ? dialog.node.name : ""}
        initialDescription={dialog?.kind === "edit" ? dialog.node.description : ""}
        onSubmit={(v) => update.mutateAsync({ id: dialog?.kind === "edit" ? dialog.node.id : "", ...v })}
      />
    </div>
  );
}
