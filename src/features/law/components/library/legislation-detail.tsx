"use client";

import { ArrowDownRight, ArrowUpLeft, ExternalLink, FileSearch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useLawLegislationItem, type LawLegislationDetailDto, type LawLegislationRef } from "../../api";
import { formatDate } from "../../format";
import { LawDisclaimer, useProfileParam } from "../shared";
import { InactiveBadge, levelLabel, libraryItemHref } from "./law-library";

/** One law / guidance item of the library, in the content version the chosen profile accepted. */
export function LegislationDetail({ id }: { id: string }) {
  const [profileId] = useProfileParam();
  const query = useLawLegislationItem(id, profileId);
  const backHref = profileId ? `/law/library?profile=${encodeURIComponent(profileId)}` : "/law/library";

  if (query.isPending) return <LoadingRows rows={6} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          icon={FileSearch}
          title="Not in this content version"
          description="This law is not part of the legal content this profile uses, or it does not exist."
          className="mt-6"
          action={
            <Button asChild variant="outline">
              <Link href={backHref}>Back to the law library</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail item={query.data} profileId={profileId} backHref={backHref} />;
}

function Detail({ item: l, profileId, backHref }: { item: LawLegislationDetailDto; profileId: string | null; backHref: string }) {
  const source = sourceLink(l.sourceUrl);
  return (
    <>
      <PageHeader
        title={l.title}
        backHref={backHref}
        backLabel="Law library"
        description={`Content version ${l.contentVersion}${l.profile ? ` · as used by ${l.profile.name}` : " · latest installed"}`}
        meta={
          <>
            <StatusBadge tone="neutral">{l.reference}</StatusBadge>
            <StatusBadge tone="info">{levelLabel(l.level)}</StatusBadge>
            <StatusBadge tone="brand">{l.domain}</StatusBadge>
            {l.category && <StatusBadge tone="neutral">{l.category}</StatusBadge>}
            {!l.active && <InactiveBadge />}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>
                {l.jurisdiction} · {l.domain}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm">{l.synopsis || <span className="text-muted-foreground">No summary in the legal content.</span>}</p>
              {l.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {l.keywords.map((k) => (
                    <StatusBadge key={k} tone="neutral">
                      {k}
                    </StatusBadge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Requirements that refer to it</CardTitle>
              <CardDescription>
                {l.profile ? `What ${l.profile.name} has to check because of this law.` : "Choose a legal profile in the library to see which of these apply to you."}
              </CardDescription>
            </CardHeader>
            {l.checklists.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No requirement in the legal content refers to it.</p>
            ) : (
              <ul className="divide-y">
                {l.checklists.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {c.requirementReference && <span className="text-xs text-muted-foreground">{c.requirementReference}</span>}
                        {l.profile ? (
                          c.applies ? (
                            <StatusBadge tone="success" dot>
                              Applies to {l.profile.name}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">Not in this profile</StatusBadge>
                          )
                        ) : (
                          !c.applies && <StatusBadge tone="neutral">No longer active</StatusBadge>
                        )}
                      </div>
                    </div>
                    {c.requirementId && (
                      <Button asChild variant="outline" size="sm" className="w-fit shrink-0">
                        <Link href={`/law/requirements/${c.requirementId}`}>Open requirement</Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Linked risk assessments</CardTitle>
              <CardDescription>Risk assessments someone linked to a requirement based on this law.</CardDescription>
            </CardHeader>
            {l.riskAssessments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{l.profile ? "None linked yet." : "Choose a legal profile to see linked risk assessments."}</p>
            ) : (
              <ul className="divide-y">
                {l.riskAssessments.map((r) => (
                  <li key={`${r.href}-${r.context}`} className="px-4 py-3">
                    <Link href={r.href} className="text-sm font-medium text-brand hover:underline">
                      {r.label}
                    </Link>
                    {r.context && <p className="text-xs text-muted-foreground">{r.context}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Official source</CardTitle>
              <CardDescription>Read the full text where it is published.</CardDescription>
            </CardHeader>
            <CardContent>
              {source ? (
                <a href={source.href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 break-all text-sm font-medium text-brand hover:underline">
                  <ExternalLink className="size-4 shrink-0" />
                  Open on {source.host}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">No official link in the legal content.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where it sits</CardTitle>
              <CardDescription>The law it is made under, and what is made under it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Made under</p>
                {l.parent ? <RefLink item={l.parent} profileId={profileId} icon="up" /> : <p className="text-sm text-muted-foreground">Nothing – this is a main law.</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Made under this law</p>
                {l.children.length ? (
                  <ul className="space-y-1.5">
                    {l.children.map((c) => (
                      <li key={c.id}>
                        <RefLink item={c} profileId={profileId} icon="down" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing in the library.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change history</CardTitle>
              <CardDescription>Content updates that added or changed it.</CardDescription>
            </CardHeader>
            <CardContent>
              {l.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {l.history.map((h) => (
                    <li key={`${h.version}-${h.change}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{h.version}</span>
                      <StatusBadge tone={h.change === "NEW" ? "success" : "warning"}>{h.change === "NEW" ? "New" : "Amended"}</StatusBadge>
                      <span className="text-xs text-muted-foreground">released {formatDate(h.releasedOn)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl border bg-card p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">The demo legal content is fictional and only shows how the library works.</p>
          <LawDisclaimer />
        </div>
      </div>
    </>
  );
}

function RefLink({ item, profileId, icon }: { item: LawLegislationRef; profileId: string | null; icon: "up" | "down" }) {
  const Icon = icon === "up" ? ArrowUpLeft : ArrowDownRight;
  return (
    <Link href={libraryItemHref(item.id, profileId)} className="group flex items-start gap-1.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="font-medium text-brand group-hover:underline">{item.title}</span>
        <span className="block text-xs text-muted-foreground">
          {item.reference} · {item.level}
          {!item.active ? " · no longer active" : ""}
        </span>
      </span>
    </Link>
  );
}

function sourceLink(url: string): { href: string; host: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { href: parsed.href, host: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}
