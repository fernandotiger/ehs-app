"use client";

import { BookOpen, Check, Minus } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { appliesToRole } from "@/lib/simplified-law/rules";
import { useLegislation, type SlawArticleDto } from "../api";
import { formatDate } from "../format";
import { OfficialLink } from "./shared";

/** Group articles by chapter, keeping their order. */
function byChapter(articles: SlawArticleDto[]): { chapter: string; items: SlawArticleDto[] }[] {
  const groups: { chapter: string; items: SlawArticleDto[] }[] = [];
  for (const a of articles) {
    const last = groups[groups.length - 1];
    if (last && last.chapter === a.chapter) last.items.push(a);
    else groups.push({ chapter: a.chapter, items: [a] });
  }
  return groups;
}

/**
 * Storyboard step 3 "Official text + overview": article by article, with the date it applies from and
 * who it applies to (one column per role), grouped by chapter. Cards on phones, a table on wider screens.
 */
export function ArticleOverview({ articles, roles }: { articles: SlawArticleDto[]; roles: string[] }) {
  if (!articles.length) return <EmptyState icon={BookOpen} title="No overview yet" description="Open the official document for the full text. An administrator can add the key articles in Configuration." />;
  const groups = byChapter(articles);
  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <section key={`${g.chapter}-${gi}`} className="overflow-hidden rounded-lg border">
          {g.chapter && <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{g.chapter}</h3>}
          <ul className="divide-y md:hidden">
            {g.items.map((a) => (
              <li key={a.id} className="space-y-1 p-3 text-sm">
                <p className="font-medium">
                  {a.number} · {a.title}
                </p>
                <p className="text-xs text-muted-foreground">Applies from {a.appliesFrom ? formatDate(a.appliesFrom) : "—"}</p>
                {a.appliesTo.length > 0 && <p className="text-xs text-muted-foreground">Who: {a.appliesTo.join(", ")}</p>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 pl-3">Article</TableHead>
                  <TableHead>What it is about</TableHead>
                  <TableHead className="whitespace-nowrap">Applies from</TableHead>
                  {roles.map((r) => (
                    <TableHead key={r} className="text-center">
                      {r}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-3 font-medium">{a.number}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal">{a.title}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{a.appliesFrom ? formatDate(a.appliesFrom) : "—"}</TableCell>
                    {roles.map((r) => (
                      <TableCell key={r} className="text-center">
                        {appliesToRole(a, r) ? <Check className="mx-auto size-4 text-success" aria-label="Yes" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="No" />}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}

/** The overview opened from the legislation list (the storyboard shows it as a side panel). */
export function OverviewSheet({ legislationId, onOpenChange }: { legislationId: string | null; onOpenChange: (open: boolean) => void }) {
  const query = useLegislation(legislationId);
  const law = query.data;
  return (
    <Sheet open={Boolean(legislationId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Overview{law ? `: ${law.shortTitle || law.title}` : ""}</SheetTitle>
          <SheetDescription>Article by article, with the date it applies from and who it applies to.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {query.isPending ? (
            <LoadingRows rows={4} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : law ? (
            <>
              {law.summary && <p className="text-sm leading-relaxed">{law.summary}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <OfficialLink href={law.officialUrl} />
                <OfficialLink href={law.guidanceUrl} label="Plain-language guidance" />
              </div>
              <ArticleOverview articles={law.articles} roles={law.roles} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
