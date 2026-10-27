"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, MailX, Plus, ShieldCheck, UserCheck, UserRound, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { UserPicker } from "@/components/common/user-picker";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ApiError, errorMessage } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import {
  userCreateSchema,
  userUpdateSchema,
  type UserCreateInput,
  type UserCreateValues,
  type UserUpdateInput,
  type UserUpdateValues,
} from "@/lib/validation/configuration";
import {
  useCreateUser,
  useSetUserActive,
  useSetUserPassword,
  useUpdateUser,
  useUserDetail,
  useUserDirectory,
  type UserDetail,
  type UserRow,
} from "../api";
import { ScopePicker } from "./scope-picker";
import { ActiveBadge, ConfigHeader, OptionFilter, SearchInput, STATUS_OPTIONS } from "./shared";

const PAGE_SIZE = 25;

/** Applies server field errors ({ path, message }) to a react-hook-form form. */
function applyFieldErrors(error: unknown, setError: (name: never, e: { message: string }) => void) {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    for (const d of error.details as { path?: string; message?: string }[]) {
      if (d.path && d.message) setError(d.path as never, { message: d.message });
    }
  }
}

function SignInBadge({ user }: { user: Pick<UserRow, "canSignIn"> }) {
  return user.canSignIn ? <StatusBadge tone="info">Can sign in</StatusBadge> : <StatusBadge tone="neutral">Directory only</StatusBadge>;
}

function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return <span className="text-xs text-muted-foreground">No role</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.slice(0, 2).map((r) => (
        <Badge key={r} variant="secondary" className="font-normal">
          {r}
        </Badge>
      ))}
      {roles.length > 2 && <Badge variant="outline">+{roles.length - 2}</Badge>}
    </span>
  );
}

/** /configuration/users – the company directory. */
export function UsersPage() {
  const lookups = useLookups();
  const departments = structureOptions(lookups.data).departments;
  const roles = (lookups.data?.roles ?? []).map((r) => ({ id: r.id, name: r.name }));
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [roleId, setRoleId] = useState<string | undefined>();
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const directory = useUserDirectory({ page, pageSize: PAGE_SIZE, q: q || undefined, departmentId, roleId, status });
  const filtered = Boolean(q || departmentId || roleId || status !== "active");
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <ConfigHeader
        title="Users"
        description="Everyone in your company directory. People can be assigned work and roles; only people with a password can sign in."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Add person
          </Button>
        }
      />

      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search name or email" />
          <OptionFilter value={departmentId} onChange={reset(setDepartmentId)} options={departments} allLabel="All departments" ariaLabel="Department" />
          <OptionFilter value={roleId} onChange={reset(setRoleId)} options={roles} allLabel="All roles" ariaLabel="Role" />
          <OptionFilter value={status} onChange={(v) => reset(setStatus)((v as typeof status | undefined) ?? "active")} options={STATUS_OPTIONS} ariaLabel="Status" />
        </div>
      </Card>

      {directory.isPending ? (
        <LoadingRows rows={8} />
      ) : directory.isError ? (
        <ErrorState error={directory.error} onRetry={() => directory.refetch()} />
      ) : directory.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No people match" : "No people yet"}
          description={filtered ? "Try a different search or filter." : "Add the first person to your directory."}
          action={
            !filtered ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Add person
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {directory.data.items.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => setEditingId(u.id)} className="block w-full space-y-1.5 p-4 text-left hover:bg-muted/50">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <ActiveBadge active={u.isActive} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{[u.jobTitle, u.placementLabel].filter(Boolean).join(" · ") || "No department"}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleBadges roles={u.roles} />
                    <SignInBadge user={u} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Person</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Sign-in</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.data.items.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => setEditingId(u.id)}>
                    <TableCell className="max-w-72 pl-4">
                      <span className="flex items-center gap-1.5 truncate font-medium">
                        {u.name}
                        {u.isOwner && <ShieldCheck className="size-3.5 text-brand" aria-label="Company owner" />}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="block truncate">{u.department?.name ?? "—"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.jobTitle ?? ""}</span>
                    </TableCell>
                    <TableCell>
                      <RoleBadges roles={u.roles} />
                    </TableCell>
                    <TableCell>
                      <SignInBadge user={u} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <ActiveBadge active={u.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={directory.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}

      {creating && <CreateUserSheet onClose={() => setCreating(false)} onCreated={(id) => setEditingId(id)} />}
      {editingId && <EditUserSheet key={editingId} userId={editingId} onClose={() => setEditingId(null)} />}
    </>
  );
}

function DepartmentSelect({ id, value, onChange, invalid }: { id: string; value: string | null | undefined; onChange: (v: string | null) => void; invalid?: boolean }) {
  const lookups = useLookups();
  const departments = structureOptions(lookups.data).departments;
  return (
    <div className="flex gap-1">
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
          <SelectValue placeholder="Choose a department" />
        </SelectTrigger>
        <SelectContent>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Button type="button" variant="ghost" onClick={() => onChange(null)}>
          Clear
        </Button>
      )}
    </div>
  );
}

function NoInvitationNote() {
  return (
    <Alert>
      <MailX />
      <AlertDescription>
        Invitation e-mails are not connected yet – nothing is sent. Give the person their sign-in details yourself.
      </AlertDescription>
    </Alert>
  );
}

function CreateUserSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const lookups = useLookups();
  const create = useCreateUser();
  const form = useForm<UserCreateInput, unknown, UserCreateValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: "", email: "", jobTitle: "", departmentId: null, managerId: null, roleId: "", scopeType: "COMPANY", scopeId: null, access: "directory", password: "" },
  });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const [access, scopeType, scopeId] = useWatch({ control: form.control, name: ["access", "scopeType", "scopeId"] });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await create.mutateAsync(values);
      toast.success(`${values.name} added${result.canSignIn ? " – they can sign in with the temporary password" : " to the directory"}. No invitation was sent.`);
      form.reset(values);
      onClose();
      onCreated(result.id);
    } catch (error) {
      applyFieldErrors(error, form.setError as never);
      toast.error(errorMessage(error));
    }
  });

  return (
    <>
      {guard.dialog}
      <Sheet open onOpenChange={(open) => !open && guard.confirm(onClose)}>
        <SheetContent className="w-full gap-0 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add a person</SheetTitle>
            <SheetDescription>Adds them to the directory with one role. Add more roles later in Roles &amp; permissions.</SheetDescription>
          </SheetHeader>
          <form id="create-user-form" onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup className="gap-4">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-name">Full name *</FieldLabel>
                    <Input id="user-name" autoComplete="off" {...field} aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-email">Work email *</FieldLabel>
                    <Input id="user-email" type="email" autoComplete="off" {...field} aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="jobTitle"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="user-title">Job title</FieldLabel>
                    <Input id="user-title" autoComplete="off" {...field} value={field.value ?? ""} />
                  </Field>
                )}
              />
              <Controller
                name="departmentId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-department">Department</FieldLabel>
                    <DepartmentSelect id="user-department" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                    <FieldDescription>Sets where they work (location, site and business unit follow).</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="managerId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-manager">Manager</FieldLabel>
                    <UserPicker id="user-manager" value={field.value} onChange={(id) => field.onChange(id)} placeholder="Choose their manager" />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <FieldSeparator />
              <Controller
                name="roleId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-role">Initial role *</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="user-role" className="w-full" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Choose a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {(lookups.data?.roles ?? []).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <ScopePicker
                idPrefix="user-scope"
                scopeType={scopeType}
                scopeId={scopeId}
                error={form.formState.errors.scopeId?.message}
                onChange={(v) => {
                  form.setValue("scopeType", v.scopeType, { shouldDirty: true });
                  form.setValue("scopeId", v.scopeId, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
                }}
              />

              <FieldSeparator />
              <Controller
                name="access"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Sign-in</FieldLabel>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                      <FieldLabel className="flex items-start gap-3 rounded-lg border p-3 font-normal">
                        <RadioGroupItem value="directory" className="mt-0.5" />
                        <FieldContent>
                          <span className="font-medium">Directory only</span>
                          <FieldDescription>Listed and can be given work, but cannot sign in.</FieldDescription>
                        </FieldContent>
                      </FieldLabel>
                      <FieldLabel className="flex items-start gap-3 rounded-lg border p-3 font-normal">
                        <RadioGroupItem value="password" className="mt-0.5" />
                        <FieldContent>
                          <span className="font-medium">Can sign in</span>
                          <FieldDescription>Set a temporary password and share it with them.</FieldDescription>
                        </FieldContent>
                      </FieldLabel>
                    </RadioGroup>
                  </Field>
                )}
              />
              {access === "password" && (
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="user-password">Temporary password *</FieldLabel>
                      <Input id="user-password" type="text" autoComplete="new-password" {...field} value={field.value ?? ""} aria-invalid={fieldState.invalid} />
                      <FieldDescription>At least 8 characters.</FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
              <NoInvitationNote />
            </FieldGroup>
          </form>
          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => guard.confirm(onClose)}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" disabled={create.isPending}>
              {create.isPending && <Spinner />} Add person
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function EditUserSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const detail = useUserDetail(userId);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        {detail.isPending ? (
          <div className="space-y-3 p-4">
            <SheetHeader className="px-0">
              <SheetTitle>Loading…</SheetTitle>
            </SheetHeader>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : detail.isError ? (
          <div className="p-4">
            <SheetHeader className="px-0">
              <SheetTitle>Person</SheetTitle>
            </SheetHeader>
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          </div>
        ) : (
          <EditUserForm user={detail.data} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditUserForm({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const { user: me } = useCurrentUser();
  const { can } = useCurrentUser();
  const update = useUpdateUser();
  const setActive = useSetUserActive();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  const form = useForm<UserUpdateInput, unknown, UserUpdateValues>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: { name: user.name, email: user.email, jobTitle: user.jobTitle ?? "", departmentId: user.departmentId, managerId: user.managerId },
  });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const isSelf = user.id === me.id;
  const cannotDeactivate = user.isActive && (isSelf || user.isOwner);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ id: user.id, ...values });
      toast.success(`${values.name} saved`);
      form.reset(values);
    } catch (error) {
      applyFieldErrors(error, form.setError as never);
      toast.error(errorMessage(error));
    }
  });

  async function toggleActive() {
    try {
      const result = await setActive.mutateAsync({ id: user.id, isActive: !user.isActive });
      toast.success(
        result.isActive ? `${user.name} reactivated` : `${user.name} deactivated${result.sessionsRevoked ? ` – signed out of ${result.sessionsRevoked} session${result.sessionsRevoked === 1 ? "" : "s"}` : ""}`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-brand" /> {user.name}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <ActiveBadge active={user.isActive} />
          <SignInBadge user={user} />
          {user.isOwner && <StatusBadge tone="brand">Company owner</StatusBadge>}
        </SheetDescription>
      </SheetHeader>
      <form id="edit-user-form" onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup className="gap-4">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="edit-name">Full name *</FieldLabel>
                <Input id="edit-name" {...field} aria-invalid={fieldState.invalid} />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="edit-email">Work email *</FieldLabel>
                <Input id="edit-email" type="email" {...field} aria-invalid={fieldState.invalid} />
                {user.canSignIn && <FieldDescription>They sign in with this email.</FieldDescription>}
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="jobTitle"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="edit-title">Job title</FieldLabel>
                <Input id="edit-title" {...field} value={field.value ?? ""} />
              </Field>
            )}
          />
          <Controller
            name="departmentId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="edit-department">Department</FieldLabel>
                <DepartmentSelect id="edit-department" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                {user.placementLabel && <FieldDescription>Currently: {user.placementLabel}</FieldDescription>}
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="managerId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="edit-manager">Manager</FieldLabel>
                <UserPicker id="edit-manager" value={field.value} onChange={(id) => field.onChange(id)} placeholder="Choose their manager" />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FieldSeparator />
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Roles</p>
              {can(PERMISSIONS.ADMIN_ROLES) && (
                <Button asChild variant="link" size="sm" className="h-auto p-0">
                  <Link href={`/configuration/roles?view=assignments&q=${encodeURIComponent(user.email)}`}>Manage in Roles &amp; permissions</Link>
                </Button>
              )}
            </div>
            {user.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {user.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-medium">{a.role}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.scopeLabel}
                      {a.isProtected ? " · protected" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {user.directoryRole && <p className="mt-2 text-xs text-muted-foreground">Directory role (from import): {user.directoryRole.name} – not an access grant.</p>}
          </div>

          <FieldSeparator />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)} disabled={!user.isActive}>
              <KeyRound /> {user.canSignIn ? "Reset password" : "Allow sign-in"}
            </Button>
            <Button
              type="button"
              variant={user.isActive ? "destructive" : "outline"}
              disabled={cannotDeactivate || setActive.isPending}
              onClick={() => setConfirmActive(true)}
            >
              {user.isActive ? <UserX /> : <UserCheck />} {user.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
          {cannotDeactivate && (
            <p className="text-xs text-muted-foreground">{isSelf ? "You cannot deactivate your own account." : "The company owner cannot be deactivated."}</p>
          )}
        </FieldGroup>
      </form>
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={() => guard.confirm(onClose)}>
          Close
        </Button>
        <Button type="submit" form="edit-user-form" disabled={update.isPending || !form.formState.isDirty}>
          {update.isPending && <Spinner />} Save changes
        </Button>
      </SheetFooter>

      <PasswordDialog user={user} open={passwordOpen} onOpenChange={setPasswordOpen} />
      <ConfirmDialog
        open={confirmActive}
        onOpenChange={setConfirmActive}
        title={user.isActive ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
        description={
          user.isActive
            ? "They are signed out everywhere and can no longer sign in. Their records, roles and history are kept."
            : "They can be assigned work again and – if they have a password – sign in."
        }
        confirmLabel={user.isActive ? "Deactivate" : "Reactivate"}
        destructive={user.isActive}
        onConfirm={toggleActive}
      />
    </>
  );
}

function PasswordDialog({ user, open, onOpenChange }: { user: UserDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const setPassword = useSetUserPassword();
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters");
      return;
    }
    try {
      await setPassword.mutateAsync({ id: user.id, password });
      toast.success(user.canSignIn ? `Password reset for ${user.name}` : `${user.name} can now sign in`);
      setPasswordValue("");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPasswordValue("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user.canSignIn ? "Reset password" : "Allow sign-in"}</DialogTitle>
          <DialogDescription>
            Set a temporary password for {user.name}. {user.canSignIn ? "Their other sessions are signed out." : ""} Nothing is e-mailed – share it with them yourself.
          </DialogDescription>
        </DialogHeader>
        <form id="password-form" onSubmit={submit} noValidate>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="new-password">Temporary password</FieldLabel>
            <Input
              id="new-password"
              type="text"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
            />
            <FieldError errors={error ? [{ message: error }] : []} />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="password-form" disabled={setPassword.isPending}>
            {setPassword.isPending && <Spinner />} Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
