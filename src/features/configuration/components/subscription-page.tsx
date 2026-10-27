"use client";

import { CheckCircle2, CircleOff, CreditCard, Info } from "lucide-react";
import { useState } from "react";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "../api";
import { ConfigHeader } from "./shared";

const PLAN_NAMES: Record<string, string> = { trial: "Trial", starter: "Starter", professional: "Professional", enterprise: "Enterprise" };

/** /configuration/subscription – read-only plan and module overview (billing is not connected). */
export function SubscriptionPage() {
  const query = useSubscription();
  const [explain, setExplain] = useState(false);

  return (
    <>
      <ConfigHeader
        title="Subscription"
        description="Your plan and the modules switched on for your company."
        actions={
          <Button variant="outline" onClick={() => setExplain(true)}>
            <CreditCard /> Manage subscription
          </Button>
        }
      />
      {explain && (
        <Alert className="mb-4">
          <Info />
          <AlertTitle>Billing is not connected</AlertTitle>
          <AlertDescription>
            Plan changes are not made here and nothing is charged. To add or remove a module, contact your OleoQ account manager – the platform team switches modules on for
            your company.
          </AlertDescription>
        </Alert>
      )}
      {query.isPending ? (
        <LoadingRows rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardDescription>Current plan</CardDescription>
              <CardTitle className="text-2xl">{PLAN_NAMES[query.data.plan] ?? query.data.plan}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Status: <StatusBadge tone={query.data.status === "ACTIVE" ? "success" : "warning"}>{query.data.status === "ACTIVE" ? "Active" : "Suspended"}</StatusBadge>
              </p>
              <p>
                {query.data.modules.filter((m) => m.enabled).length} of {query.data.modules.length} modules enabled. Home, My work, Form Builder, Scheduled jobs and Configuration
                are always included.
              </p>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {query.data.modules.map((m) => (
                <li key={m.key} className="flex items-start gap-3 p-4">
                  {m.enabled ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <CircleOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-muted-foreground">{m.description}</p>
                  </div>
                  <StatusBadge tone={m.enabled ? "success" : "neutral"}>{m.enabled ? "Included" : "Not included"}</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
