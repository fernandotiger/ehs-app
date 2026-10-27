"use client";

import { ArrowDownLeft, ArrowUpRight, Link2 } from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLinkedRecords } from "@/features/shared/records";
import type { LinkedRecordDto } from "@/lib/validation/evidence";

/** Human label for a link kind ("corrective-action" → "Corrective action"). */
function kindLabel(kind: string): string {
  const text = kind.replace(/[-_.]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function LinkList({ items, direction }: { items: LinkedRecordDto[]; direction: "out" | "in" }) {
  const Icon = direction === "out" ? ArrowUpRight : ArrowDownLeft;
  return (
    <ul className="-mx-2 divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{kindLabel(item.kind)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Follow-ups raised from this record and the records it came from (only ones the user may open). */
export function LinkedRecords({ entityType, entityId, title = "Linked records" }: { entityType: string; entityId: string; title?: string }) {
  const query = useLinkedRecords(entityType, entityId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-brand" /> {title}
        </CardTitle>
        <CardDescription>Where this record came from and the follow-up raised from it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <LoadingRows rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />
        ) : query.data.incoming.length + query.data.outgoing.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">No linked records.</p>
        ) : (
          <>
            {query.data.incoming.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Raised from</h3>
                <LinkList items={query.data.incoming} direction="in" />
              </section>
            )}
            {query.data.outgoing.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-up</h3>
                <LinkList items={query.data.outgoing} direction="out" />
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
