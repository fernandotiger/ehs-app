import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isActionOverdue, needsRecheck } from "@/lib/simplified-law/rules";
import type { Paginated } from "@/lib/validation/common";
import type { SlawActionListQuery } from "@/lib/validation/simplified-law";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { localDate } from "@/server/modules/jobs/engine";
import { actionVisibleWhere, canCompleteAction, canViewRegister } from "./slaw-access.policy";
import type { SlawActionItem, SlawActionSummaryDto } from "./slaw.dto";
import { dateOnly, named, toDate, todayFor, userNames } from "./support";

/** "Actions to do" – the storyboard's action tracker: every action set on a requirement gap. */

const select = {
  id: true,
  legislationId: true,
  section: true,
  text: true,
  articles: true,
  compliance: true,
  reason: true,
  actionText: true,
  actionOwnerId: true,
  actionDueDate: true,
  actionStatus: true,
  actionSetById: true,
  actionCompletedAt: true,
  actionCompletedById: true,
  actionNote: true,
  version: true,
  legislation: { select: { title: true, shortTitle: true } },
} satisfies Prisma.SlawRequirementSelect;

type Row = Prisma.SlawRequirementGetPayload<{ select: typeof select }>;

function addDays(date: string, days: number): string {
  return localDate(new Date(toDate(date).getTime() + days * 86_400_000), "UTC");
}

async function toItems(rows: Row[], user: CurrentUser): Promise<SlawActionItem[]> {
  const today = todayFor(user.timeZone);
  const names = await userNames(prisma, rows.flatMap((r) => [r.actionOwnerId, r.actionSetById, r.actionCompletedById]));
  const register = canViewRegister(user);
  return rows.map((r) => ({
    requirementId: r.id,
    legislationId: r.legislationId,
    lawTitle: r.legislation.shortTitle || r.legislation.title,
    requirementText: r.text,
    section: r.section,
    articles: r.articles,
    compliance: r.compliance,
    gap: r.compliance === "NOT_COMPLIANT" ? r.reason : "",
    action: {
      text: r.actionText,
      owner: named(names, r.actionOwnerId),
      dueDate: dateOnly(r.actionDueDate),
      status: r.actionStatus,
      overdue: isActionOverdue(r.actionStatus, dateOnly(r.actionDueDate), today),
      setBy: named(names, r.actionSetById),
      completedAt: r.actionCompletedAt?.toISOString() ?? null,
      completedBy: named(names, r.actionCompletedById),
      note: r.actionNote,
    },
    mine: r.actionOwnerId === user.id,
    canComplete: canCompleteAction(user, r),
    canOpenLaw: register,
    recheck: needsRecheck(r.compliance, r.actionStatus),
    version: r.version,
  }));
}

export const slawActionQueryService = {
  async list(user: CurrentUser, q: SlawActionListQuery): Promise<Paginated<SlawActionItem>> {
    const today = toDate(todayFor(user.timeZone));
    const and: Prisma.SlawRequirementWhereInput[] = [actionVisibleWhere(user)];
    if (q.view === "mine" || !canViewRegister(user)) and.push({ actionOwnerId: user.id });
    if (q.status !== "ALL") and.push({ actionStatus: q.status });
    if (q.overdue === "true") and.push({ actionStatus: "OPEN", actionDueDate: { lt: today } });
    if (q.q) {
      and.push({
        OR: [
          { actionText: { contains: q.q, mode: "insensitive" } },
          { text: { contains: q.q, mode: "insensitive" } },
          { legislation: { title: { contains: q.q, mode: "insensitive" } } },
          { legislation: { shortTitle: { contains: q.q, mode: "insensitive" } } },
        ],
      });
    }
    const where: Prisma.SlawRequirementWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      prisma.slawRequirement.findMany({
        where,
        select,
        orderBy: q.status === "DONE" ? [{ actionCompletedAt: "desc" }] : [{ actionStatus: "asc" }, { actionDueDate: "asc" }, { id: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.slawRequirement.count({ where }),
    ]);
    return { items: await toItems(rows, user), total, page: q.page, pageSize: q.pageSize };
  },

  /** One action (deep link from My work / notifications). */
  async one(user: CurrentUser, requirementId: string): Promise<SlawActionItem> {
    const row = await prisma.slawRequirement.findFirst({ where: { AND: [{ id: requirementId }, actionVisibleWhere(user)] }, select });
    if (!row) throw new NotFoundError();
    return (await toItems([row], user))[0]!;
  },

  async summary(user: CurrentUser): Promise<SlawActionSummaryDto> {
    const todayStr = todayFor(user.timeZone);
    const today = toDate(todayStr);
    const weekEnd = toDate(addDays(todayStr, 6));
    const visible = actionVisibleWhere(user);
    const open: Prisma.SlawRequirementWhereInput = { AND: [visible, { actionStatus: "OPEN" }] };
    const [mine, overdue, dueSoon, all] = await Promise.all([
      prisma.slawRequirement.count({ where: { AND: [open, { actionOwnerId: user.id }] } }),
      prisma.slawRequirement.count({ where: { AND: [open, { actionDueDate: { lt: today } }] } }),
      prisma.slawRequirement.count({ where: { AND: [open, { actionDueDate: { gte: today, lte: weekEnd } }] } }),
      prisma.slawRequirement.count({ where: open }),
    ]);
    return { mine, overdue, dueSoon, open: all };
  },
};
