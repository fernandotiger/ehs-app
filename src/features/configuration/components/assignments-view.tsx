"use client";

import { Plus, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserSearch, type UserOption } from "@/features/shared/lookups";
import { errorMessage } from "@/lib/api-client";
import { SCOPE_LABELS, SCOPE_TYPES, type ScopeTypeKey } from "@/lib/scope";
import { ASSIGNMENT_PAGE_SIZE } from "@/lib/validation/configuration";
import { useAssignments, useCreateAssignment, useRemoveAssignment, type AssignmentRow, type RoleRow } from "../api";
import { ScopePicker } from "./scope-picker";
import { OptionFilter, SearchInput } from "./shared";

const SCOPE_FILTERS = SCOPE_TYPES.map((t) => ({ id: t, name: SCOPE_LABELS[t] }));

/** Person search that starts after two characters (scales to large directories). */
function PersonSearch({ value, onChange }: { value: UserOption | null; onChange: (user: UserOption | null) => void }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const results = useUserSearch(deferred, { enabled: deferred.length >= 2 });

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{value.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{value.email}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  const list = results.data ?? [];
  return (
    <div className="space-y-1.5">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput id="assign-person" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" autoComplete="off" />
        {query && (
          <InputGroupAddon align="inline-end">
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
              <X />
            </Button>
          </InputGroupAddon>
        )}
      </InputGroup>
      {deferred.length < 2 ? (
        <p className="text-xs text-muted-foreground">Type at least 2 characters. Only matching people are shown.</p>
      ) : results.isFetching && !results.data ? (
        <div className="flex justify-center p-3">
          <Spinner />
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border" role="listbox" aria-label="Matching people">
          {list.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No people found.</p>
          ) : (
            list.slice(0, 8).map((u) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={false}
                className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
                onClick={() => {
                  onChange(u);
                  setQuery("");
                }}
              >
                <span className="block truncate text-sm font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{[u.email, u.department?.name].filter(Boolean).join(" · ")}</span>
              </button>
            ))
          )}
          {list.length > 8 && <p className="border-t p-2 text-xs text-muted-foreground">Showing 8 of {list.length}. Type more to narrow the search.</p>}
        </div>
      )}
    </div>
  );
}

function AddAssignmentCard({ roles }: { roles: RoleRow[] }) {
  const create = useCreateAssignment();
  const [person, setPerson] = useState<UserOption | null>(null);
  const [roleId, setRoleId] = useState("");
  const [scope, setScope] = useState<{ scopeType: ScopeTypeKey; scopeId: string | null }>({ scopeType: "COMPANY", scopeId: null });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!person || !roleId || (scope.scopeType !== "COMPANY" && !scope.scopeId)) {
      setError("Choose a person, a role and exactly where it applies.");
      return;
    }
    try {
      const result = await create.mutateAsync({ userId: person.id, roleId, ...scope });
      toast.success(`${person.name}: ${roles.find((r) => r.id === roleId)?.name} for ${result.scopeLabel}`);
      // Keep the person selected so another role can be added straight away.
      setRoleId("");
      setScope({ scopeType: "COMPANY", scopeId: null });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a role assignment</CardTitle>
        <CardDescription>Find a person, choose a role and exactly where it applies. One person can hold several roles in different places.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1.6fr_auto] lg:items-start">
          <Field>
            <FieldLabel htmlFor="assign-person">Person *</FieldLabel>
            <PersonSearch
              value={person}
              onChange={(u) => {
                setPerson(u);
                setError(null);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="assign-role">Role *</FieldLabel>
            <Select
              value={roleId}
              onValueChange={(v) => {
                setRoleId(v);
                setError(null);
              }}
            >
              <SelectTrigger id="assign-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ScopePicker
            idPrefix="assign-scope"
            scopeType={scope.scopeType}
            scopeId={scope.scopeId}
            onChange={(v) => {
              setScope(v);
              setError(null);
            }}
          />
          <div className="lg:pt-6">
            <Button type="submit" disabled={create.isPending} className="w-full lg:w-auto">
              {create.isPending ? <Spinner /> : <Plus />} Assign role
            </Button>
          </div>
        </form>
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <FieldDescription className="mt-3">
          Configuration permissions (users, roles, structure, settings) only work when the role applies to the whole company.
        </FieldDescription>
      </CardContent>
    </Card>
  );
}

/** Roles & permissions → Assignments: add, filter (person, role, scope level) and remove. */
export function AssignmentsView({
  roles,
  roleFilter,
  onRoleFilterChange,
  initialQuery,
}: {
  roles: RoleRow[];
  roleFilter: string | undefined;
  onRoleFilterChange: (roleId: string | undefined) => void;
  initialQuery?: string;
}) {
  const [search, setSearch] = useState(initialQuery ?? "");
  const q = useDeferredValue(search.trim());
  const [scopeType, setScopeType] = useState<ScopeTypeKey | undefined>();
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<AssignmentRow | null>(null);
  const list = useAssignments({ page, pageSize: ASSIGNMENT_PAGE_SIZE, q: q || undefined, roleId: roleFilter, scopeType });
  const remove = useRemoveAssignment();
  const filtered = Boolean(q || roleFilter || scopeType);
  // A filter change always returns to a valid first page.
  const total = list.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / ASSIGNMENT_PAGE_SIZE));
  if (list.data && page > lastPage) setPage(lastPage);

  async function confirmRemove(row: AssignmentRow) {
    try {
      await remove.mutateAsync(row.id);
      toast.success(`Removed ${row.role.name} (${row.scopeLabel}) from ${row.user.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <AddAssignmentCard roles={roles} />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Current assignments</h2>
            <p className="text-sm text-muted-foreground">Search and filter without loading everyone at once.</p>
          </div>
          <StatusBadge tone="brand">{list.data ? `${total.toLocaleString()} ${total === 1 ? "assignment" : "assignments"}` : "…"}</StatusBadge>
        </div>
        <div className="grid gap-2 border-b p-3 sm:grid-cols-[2fr_1fr_1fr]">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search person name or email"
          />
          <OptionFilter
            value={roleFilter}
            onChange={(v) => {
              onRoleFilterChange(v);
              setPage(1);
            }}
            options={roles.map((r) => ({ id: r.id, name: r.name }))}
            allLabel="All roles"
            ariaLabel="Filter by role"
          />
          <OptionFilter
            value={scopeType}
            onChange={(v) => {
              setScopeType(v as ScopeTypeKey | undefined);
              setPage(1);
            }}
            options={SCOPE_FILTERS}
            allLabel="All scope levels"
            ariaLabel="Filter by scope level"
          />
        </div>
        {list.isPending ? (
          <LoadingRows rows={6} className="p-3" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-3" />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No assignments match these filters" : "No assignments yet"}
            description={filtered ? "Change or clear the filters." : "Use the form above to give someone a role."}
            className="m-3 border-0"
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setScopeType(undefined);
                    onRoleFilterChange(undefined);
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {list.data.items.map((row) => (
                <li key={row.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.user.email}</p>
                    <p className="mt-1 text-sm">
                      {row.role.name} · <span className="text-muted-foreground">{row.scopeLabel}</span>
                    </p>
                  </div>
                  <RemoveButton row={row} onRemove={() => setRemoving(row)} />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead className="w-12 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-72 pl-4">
                        <span className="block truncate font-medium">
                          {row.user.name}
                          {!row.user.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{row.user.email}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {row.role.name}
                          {row.isProtected && <ShieldCheck className="size-3.5 text-brand" aria-label="Protected owner assignment" />}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={row.scopeType === "COMPANY" ? "brand" : "info"}>{row.scopeLabel}</StatusBadge>
                      </TableCell>
                      <TableCell className="pr-4">
                        <RemoveButton row={row} onRemove={() => setRemoving(row)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-3">
              <PaginationBar page={page} pageSize={ASSIGNMENT_PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <Alert>
        <AlertDescription>Changes take effect on each person&apos;s next page load or request – they do not need to sign out.</AlertDescription>
      </Alert>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this assignment?"
        description={removing ? `${removing.user.name} loses ${removing.role.name} for ${removing.scopeLabel}. Their other roles and their directory entry stay.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (removing) void confirmRemove(removing);
          setRemoving(null);
        }}
      />
    </div>
  );
}

function RemoveButton({ row, onRemove }: { row: AssignmentRow; onRemove: () => void }) {
  if (row.isProtected) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button variant="ghost" size="icon" disabled aria-label="Protected owner assignment">
              <Trash2 />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>The company owner&apos;s administrator assignment is protected</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${row.role.name} for ${row.user.name}`}>
      <Trash2 />
    </Button>
  );
}
