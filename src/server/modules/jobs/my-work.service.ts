import "server-only";
import { DUE_WORK_KIND_INFO, type DueWorkKind } from "@/lib/jobs";
import type { CurrentUser } from "@/server/auth/current-user";
import { dayDiff, localDate, myWorkGroup, type MyWorkGroup } from "./engine";
import { activeProviders } from "./providers";
import type { DueWorkItem } from "./types";

/**
 * My work – everything assigned to the signed-in person (owner or reviewer) from every due-work
 * provider of the enabled modules, grouped by the person's company-local date.
 */

export type { MyWorkGroup } from "./engine";

export interface MyWorkItemDto {
  provider: DueWorkKind;
  kindLabel: string;
  module: string;
  entityType: string;
  entityId: string;
  reference: string | null;
  title: string;
  href: string;
  dueDate: string;
  /** > 0 overdue by N days; ≤ 0 due in -N days. */
  daysOverdue: number;
  group: MyWorkGroup;
  /** "reviewer" when the person is asked to review the current step. */
  role: "owner" | "reviewer";
}

export interface MyWorkDto {
  today: string;
  items: MyWorkItemDto[];
  counts: Record<MyWorkGroup, number>;
  /** Providers that could not be read (the rest still show). */
  unavailable: string[];
}

export const myWorkService = {
  async list(user: CurrentUser, now = new Date()): Promise<MyWorkDto> {
    const today = localDate(now, user.timeZone);
    const items: MyWorkItemDto[] = [];
    const unavailable: string[] = [];
    for (const provider of activeProviders(user.enabledModules)) {
      let list: DueWorkItem[];
      try {
        list = provider.listForUser ? await provider.listForUser(user) : (await provider.listOpen()).filter((i) => i.ownerId === user.id || i.reviewerId === user.id);
      } catch (error) {
        console.error(`[my-work] provider ${provider.kind} failed`, error);
        unavailable.push(provider.label);
        continue;
      }
      for (const item of list) {
        items.push({
          provider: item.provider,
          kindLabel: DUE_WORK_KIND_INFO[item.provider]?.label ?? provider.label,
          module: provider.module,
          entityType: item.entityType,
          entityId: item.entityId,
          reference: item.reference ?? null,
          title: item.title,
          href: item.href,
          dueDate: item.dueDate,
          daysOverdue: dayDiff(item.dueDate, today),
          group: myWorkGroup(item.dueDate, today),
          role: item.reviewerId === user.id && item.ownerId !== user.id ? "reviewer" : "owner",
        });
      }
    }
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
    const counts = { overdue: 0, week: 0, later: 0 };
    for (const item of items) counts[item.group]++;
    return { today, items, counts, unavailable };
  },
};
