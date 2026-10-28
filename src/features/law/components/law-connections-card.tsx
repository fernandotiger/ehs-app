"use client";

import { ChevronRight, Scale } from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LawLinkTarget } from "@/lib/law";
import { PERMISSIONS } from "@/lib/permissions";
import { useLawConnections } from "../api";

/**
 * "Legal requirements" on a Risk assessment, Incident or Incident action: the Law requirements this
 * record is linked to (with the context) or was raised from. Shown only when the Law module is on;
 * hidden when there is nothing to show and the viewer cannot see Law at all.
 */
export function LawConnectionsCard({ entityType, entityId }: { entityType: LawLinkTarget; entityId: string }) {
  const { hasModule, can } = useCurrentUser();
  const enabled = hasModule("law");
  const query = useLawConnections(entityType, entityId, enabled);
  if (!enabled || query.isError || query.isPending) return null;
  const items = query.data;
  if (!items.length && !can(PERMISSIONS.LAW_VIEW)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4 text-brand" /> Legal requirements
        </CardTitle>
        <CardDescription>Laws and company requirements this record relates to.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not linked to a legal requirement. Link it from the requirement in Law → Laws that apply to us (tab “Risk &amp; incidents”).</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {items.map((c) => (
              <li key={`${c.requirementId}-${c.how}-${c.context}`}>
                <Link href={c.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.reference} · {c.profileName} · {c.how === "raised" ? "raised from this requirement" : c.context || "linked"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
