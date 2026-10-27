"use client";

import { ChevronDown, Lock, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { isModuleKey } from "@/lib/modules";
import { ALL_PERMISSIONS, normalisePermissions, PERMISSION_GROUPS, PERMISSION_REQUIRES, permissionLabel, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole, type RoleRow } from "../api";
import { AssignmentsView } from "./assignments-view";
import { ConfigHeader, plural, SearchInput } from "./shared";

interface RoleDraft {
  roleId: string;
  version: number;
  name: string;
  description: string;
  permissions: string[];
}

function draftOf(role: RoleRow): RoleDraft {
  return { roleId: role.id, version: role.version, name: role.name, description: role.description ?? "", permissions: role.permissions };
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function isDirty(draft: RoleDraft | null, role: RoleRow | undefined): boolean {
  if (!draft || !role || draft.roleId !== role.id) return false;
  return draft.name.trim() !== role.name || draft.description.trim() !== (role.description ?? "") || !sameSet(draft.permissions, role.permissions);
}

/** /configuration/roles – Roles (permission matrix) and Assignments (who holds which role where). */
export function RolesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "assignments" ? "assignments" : "roles";
  const roleParam = params.get("role") ?? undefined;
  const roles = useRoles();

  function setParams(next: { view?: string; role?: string | undefined }) {
    const sp = new URLSearchParams(params.toString());
    if (next.view) sp.set("view", next.view);
    if ("role" in next) {
      if (next.role) sp.set("role", next.role);
      else sp.delete("role");
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <>
      <ConfigHeader
        title="Roles & permissions"
        description="Roles say what someone can do; assignments say where. Changes take effect on each person's next page load."
      />
      <Tabs value={view} onValueChange={(v) => setParams({ view: v })} className="mb-4">
        <TabsList className="h-9">
          <TabsTrigger value="roles" className="px-3">
            <ShieldCheck /> Roles
          </TabsTrigger>
          <TabsTrigger value="assignments" className="px-3">
            <Users /> Assignments
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {roles.isPending ? (
        <LoadingRows rows={8} />
      ) : roles.isError ? (
        <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
      ) : view === "roles" ? (
        <RolesView
          roles={roles.data}
          selectedId={roleParam}
          onSelect={(id) => setParams({ role: id })}
          onViewPeople={(id) => setParams({ view: "assignments", role: id })}
          onReload={() => roles.refetch()}
        />
      ) : (
        <AssignmentsView
          roles={roles.data}
          roleFilter={roleParam && roles.data.some((r) => r.id === roleParam) ? roleParam : undefined}
          onRoleFilterChange={(id) => setParams({ role: id })}
          initialQuery={params.get("q") ?? undefined}
        />
      )}
    </>
  );
}

function RolesView({
  roles,
  selectedId,
  onSelect,
  onViewPeople,
  onReload,
}: {
  roles: RoleRow[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onViewPeople: (id: string) => void;
  onReload: () => Promise<unknown>;
}) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const role = roles.find((r) => r.id === selectedId) ?? roles[0];
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const update = useUpdateRole();
  const remove = useDeleteRole();
  const current = draft && role && draft.roleId === role.id ? draft : role ? draftOf(role) : null;
  const dirty = isDirty(draft, role);
  const guard = useUnsavedChangesGuard(dirty, "Your permission changes have not been saved. Leave and discard them?");
  const visible = roles.filter((r) => !q || r.name.toLowerCase().includes(q));

  /** Run `action` now, or after Save / Discard when the current role has unsaved changes. */
  function whenSaved(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }

  function discard() {
    setDraft(null);
    setStale(false);
  }

  async function save(): Promise<boolean> {
    if (!role || !current) return false;
    if (!current.name.trim()) {
      toast.error("Enter a role name");
      return false;
    }
    try {
      await update.mutateAsync({
        id: role.id,
        name: current.name.trim(),
        description: current.description.trim() || null,
        ...(role.isAdministrator ? {} : { permissions: current.permissions }),
        expectedVersion: current.version,
      });
      setDraft(null);
      setStale(false);
      toast.success(`${current.name.trim()} saved – applies on each holder's next page load`);
      return true;
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
      return false;
    }
  }

  function change(next: Partial<RoleDraft>) {
    if (!current) return;
    setDraft({ ...current, ...next });
  }

  async function confirmDelete() {
    if (!role) return;
    try {
      await remove.mutateAsync(role.id);
      toast.success(`${role.name} deleted`);
      setDraft(null);
      const next = roles.find((r) => r.id !== role.id);
      if (next) onSelect(next.id);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit gap-0 py-0 lg:sticky lg:top-20">
          <div className="space-y-2 border-b p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search roles" />
            <Button className="w-full" variant="outline" onClick={() => whenSaved(() => setCreating(true))}>
              <Plus /> New role
            </Button>
          </div>
          <ul className="max-h-72 overflow-y-auto p-1.5 lg:max-h-[calc(100dvh-16rem)]" aria-label="Roles">
            {visible.length === 0 && <li className="p-3 text-sm text-muted-foreground">No roles match.</li>}
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => r.id !== role?.id && whenSaved(() => onSelect(r.id))}
                  aria-current={r.id === role?.id}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted",
                    r.id === role?.id && "bg-brand-soft text-brand hover:bg-brand-soft",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {r.name}
                      {r.id === role?.id && dirty ? " •" : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {plural(r.assignmentCount, "assignment")} · {r.permissions.length} permissions
                    </span>
                  </span>
                  {r.isSystem && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Built-in role" />}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {!role || !current ? (
          <EmptyState icon={ShieldCheck} title="No roles yet" description="Create a role to choose its permissions." />
        ) : (
          <div className="min-w-0 space-y-4">
            {stale && <StaleVersionAlert draft={current} draftName={`role-${role.key}`} onReload={() => void onReload().then(discard)} />}
            <Card className="gap-0 py-0">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {role.isSystem && <StatusBadge tone="neutral">Built-in</StatusBadge>}
                    <StatusBadge tone="brand">{plural(role.assignmentCount, "assignment")}</StatusBadge>
                    {role.directoryUserCount > 0 && <StatusBadge tone="neutral">{plural(role.directoryUserCount, "directory reference")}</StatusBadge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => onViewPeople(role.id)}>
                      <Users /> View people
                    </Button>
                    {!role.isSystem && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={role.assignmentCount > 0}
                        title={role.assignmentCount > 0 ? "Remove its assignments first" : undefined}
                        onClick={() => setDeleting(true)}
                      >
                        <Trash2 /> Delete
                      </Button>
                    )}
                  </div>
                </div>
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="role-name">Role name *</FieldLabel>
                    <Input id="role-name" value={current.name} onChange={(e) => change({ name: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="role-description">Description</FieldLabel>
                    <Textarea id="role-description" rows={1} className="min-h-9" value={current.description} onChange={(e) => change({ description: e.target.value })} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <PermissionMatrix
              key={role.id}
              selected={current.permissions}
              locked={role.isAdministrator}
              onChange={(permissions) => change({ permissions })}
            />

            {dirty && (
              <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-lg md:bottom-4">
                <span className="text-sm font-medium">Unsaved changes to {role.name}</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={discard} disabled={update.isPending}>
                    Discard
                  </Button>
                  <Button onClick={() => void save()} disabled={update.isPending}>
                    {update.isPending && <Spinner />} Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes to {role?.name}?</AlertDialogTitle>
            <AlertDialogDescription>You changed this role&apos;s permissions. Save them first, or discard them to restore the saved selections.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const action = pending;
                setPending(null);
                discard();
                action?.();
              }}
            >
              Discard
            </Button>
            <Button
              disabled={update.isPending}
              onClick={async () => {
                const action = pending;
                if (await save()) {
                  setPending(null);
                  action?.();
                } else {
                  setPending(null);
                }
              }}
            >
              {update.isPending && <Spinner />} Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateRoleDialog open={creating} onOpenChange={setCreating} onCreated={(r) => onSelect(r.id)} />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${role?.name}?`}
        description="The role is removed permanently. Directory references to it (from imports) are cleared."
        confirmLabel="Delete role"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}

function PermissionMatrix({ selected, locked, onChange }: { selected: string[]; locked: boolean; onChange: (next: string[]) => void }) {
  const { hasModule } = useCurrentUser();
  const set = useMemo(() => new Set(selected), [selected]);
  const total = locked ? ALL_PERMISSIONS.length : selected.filter((p) => (ALL_PERMISSIONS as string[]).includes(p)).length;

  function toggle(key: Permission, checked: boolean) {
    onChange(checked ? normalisePermissions([...selected, key]) : normalisePermissions(selected.filter((k) => k !== key), key));
  }

  function toggleGroup(keys: Permission[], checked: boolean) {
    onChange(checked ? normalisePermissions([...selected, ...keys]) : normalisePermissions(selected.filter((k) => !keys.includes(k as Permission))));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Permissions</h2>
        <StatusBadge tone="brand">
          {total} of {ALL_PERMISSIONS.length} selected
        </StatusBadge>
      </div>
      {locked && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Lock className="mr-1 inline size-3.5" /> The Administrator role always has every permission. Create another role for limited access.
        </p>
      )}
      {PERMISSION_GROUPS.map((group) => {
        const keys = group.permissions.map((p) => p.key);
        const count = locked ? keys.length : keys.filter((k) => set.has(k)).length;
        const all = count === keys.length;
        const moduleOff = isModuleKey(group.key) && !hasModule(group.key);
        return (
          <Collapsible key={group.key} defaultOpen={count > 0 && !locked} asChild>
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 p-3">
                <Checkbox
                  checked={all ? true : count > 0 ? "indeterminate" : false}
                  disabled={locked}
                  onCheckedChange={(v) => toggleGroup(keys, v === true)}
                  aria-label={`Select all ${group.title} permissions`}
                />
                <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {group.title}
                      {moduleOff && (
                        <Badge variant="outline" className="font-normal">
                          Module not enabled
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{group.description}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {count}/{keys.length}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <ul className="grid gap-x-6 border-t p-3 sm:grid-cols-2">
                  {group.permissions.map((p) => {
                    const requires = PERMISSION_REQUIRES[p.key];
                    const id = `perm-${p.key}`;
                    return (
                      <li key={p.key} className="flex items-start gap-3 py-2">
                        <Checkbox id={id} checked={locked || set.has(p.key)} disabled={locked} onCheckedChange={(v) => toggle(p.key, v === true)} className="mt-0.5" />
                        <label htmlFor={id} className="min-w-0 text-sm">
                          <span className="font-medium">{p.label}</span>
                          <span className="block text-xs text-muted-foreground">{p.description}</span>
                          {requires && <span className="block text-xs text-muted-foreground">Also selects: {requires.map((r) => permissionLabel(r).split(" · ")[1]).join(", ")}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

function CreateRoleDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (role: RoleRow) => void }) {
  const create = useCreateRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      setName("");
      setDescription("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a role name");
      return;
    }
    try {
      const role = await create.mutateAsync({ name: name.trim(), description: description.trim() || null });
      toast.success(`${role.name} created – choose its permissions`);
      close(false);
      onCreated(role);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>The role starts with no permissions. Choose them after creating it.</DialogDescription>
        </DialogHeader>
        <form id="create-role-form" onSubmit={submit} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="new-role-name">Role name *</FieldLabel>
              <Input
                id="new-role-name"
                value={name}
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error)}
              />
              <FieldError errors={error ? [{ message: error }] : []} />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-role-description">Description</FieldLabel>
              <Textarea id="new-role-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-role-form" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
