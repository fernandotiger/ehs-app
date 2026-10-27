"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { visibleGroups, type HubCard } from "../hub-cards";

function HubCardView({ card }: { card: HubCard }) {
  const available = Boolean(card.href);
  const body = (
    <Card
      className={cn(
        "h-full gap-0 py-4 transition-colors",
        available ? "hover:border-brand-light hover:bg-brand-soft/40" : "cursor-not-allowed opacity-60",
      )}
      aria-disabled={!available}
    >
      <CardHeader className="gap-1.5 px-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <card.icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {card.title}
              {available ? <ArrowRight className="ml-auto size-4 text-muted-foreground" /> : <Badge variant="secondary" className="ml-auto">Coming soon</Badge>}
            </CardTitle>
            <CardDescription className="mt-1">{card.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
  return available ? (
    <Link href={card.href!} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

/** /configuration – every setup screen the user may open, grouped. */
export function ConfigurationHub() {
  const { user } = useCurrentUser();
  const groups = visibleGroups(user.permissions, user.enabledModules);

  return (
    <>
      <PageBanner title="Configuration" description={`Set up ${user.organizationName}: structure, people, access, lists and settings.`} />
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`cfg-${group.key}`}>
            <h2 id={`cfg-${group.key}`} className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => (
                <HubCardView key={card.key} card={card} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
