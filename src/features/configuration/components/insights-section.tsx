"use client";

import { Building2, FolderOpen, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingCards } from "@/components/common/states";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { INSIGHTS_PERMISSIONS } from "@/lib/insights";
import { PERMISSIONS } from "@/lib/permissions";
import { useInsights } from "../api";

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="font-heading text-2xl font-semibold leading-tight tabular-nums">{value.toLocaleString()}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg hover:ring-2 hover:ring-brand-light">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Home → Insights: four small groups (directory, users by role, structure, records per module). */
export function InsightsSection() {
  const { canAny, can } = useCurrentUser();
  const allowed = canAny(INSIGHTS_PERMISSIONS);
  const query = useInsights(allowed);
  if (!allowed) return null;

  return (
    <section aria-labelledby="insights-heading" className="mt-8">
      <h2 id="insights-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Insights
      </h2>
      {query.isPending ? (
        <LoadingCards count={4} className="lg:grid-cols-4" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-brand" /> People
              </CardTitle>
              <CardDescription>Directory members – not signed-in sessions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Active people" value={query.data.directory.active} href={can(PERMISSIONS.ADMIN_USERS) ? "/configuration/users" : undefined} />
                <Stat label="Can sign in" value={query.data.directory.canSignIn} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>With a role</span>
                  <span className="tabular-nums">
                    {query.data.directory.withRole.toLocaleString()} / {query.data.directory.active.toLocaleString()}
                  </span>
                </div>
                <Progress value={query.data.directory.active ? (query.data.directory.withRole / query.data.directory.active) * 100 : 0} className="h-2" />
                {query.data.directory.withoutRole > 0 && (
                  <p className="mt-1 text-xs text-warning-foreground dark:text-warning">{query.data.directory.withoutRole.toLocaleString()} without any role</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-brand" /> People by role
              </CardTitle>
              <CardDescription>Someone with several roles counts in each.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {query.data.usersByRole.slice(0, 6).map((r) => {
                  const max = Math.max(1, ...query.data.usersByRole.map((x) => x.users));
                  return (
                    <li key={r.roleId}>
                      <div className="flex justify-between gap-2 text-sm">
                        {can(PERMISSIONS.ADMIN_ROLES) ? (
                          <Link href={`/configuration/roles?view=assignments&role=${r.roleId}`} className="truncate hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span className="truncate">{r.name}</span>
                        )}
                        <span className="tabular-nums text-muted-foreground">{r.users}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(r.users / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
                {query.data.usersByRole.length > 6 && <li className="text-xs text-muted-foreground">+{query.data.usersByRole.length - 6} more roles</li>}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-brand" /> Company structure
              </CardTitle>
              <CardDescription>Active items at each level.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["Business units", query.data.structure.businessUnits, "business-units"],
                    ["Sites", query.data.structure.sites, "sites"],
                    ["Locations", query.data.structure.locations, "locations"],
                    ["Departments", query.data.structure.departments, "departments"],
                  ] as const
                ).map(([label, value, tab]) => (
                  <Stat key={tab} label={label} value={value} href={can(PERMISSIONS.ADMIN_ORGANISATION) ? `/configuration/structure?tab=${tab}` : undefined} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="size-4 text-brand" /> Records
              </CardTitle>
              <CardDescription>Current records in each module.</CardDescription>
            </CardHeader>
            <CardContent>
              {query.data.modules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No module records yet.</p>
              ) : (
                <ul className="divide-y">
                  {query.data.modules.map((m) => (
                    <li key={m.module} className="flex items-center justify-between gap-2 py-2">
                      <Link href={m.href} className="min-w-0 hover:underline">
                        <span className="block truncate text-sm font-medium">{m.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{m.hint}</span>
                      </Link>
                      <span className="font-heading text-xl font-semibold tabular-nums">{m.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
