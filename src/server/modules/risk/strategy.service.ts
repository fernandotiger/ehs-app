import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Paginated } from "@/lib/validation/common";
import type { ObjectiveInput, ProgrammeInput, StrategyListQuery, TargetInput } from "@/lib/validation/risk";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { listLabel } from "@/server/modules/incidents/incident-lookups";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { requireTenantId } from "@/server/tenancy/context";
import type { ObjectiveDetailDto, ObjectiveDto, PlacementDto, ProgrammeDetailDto, ProgrammeDto, TargetDetailDto, TargetDto } from "./risk.dto";
import { canCreateStrategyAt, canCreateTaskAt, canEditStrategy, objectiveVisibleWhere, programmeVisibleWhere, targetVisibleWhere, taskVisibleWhere } from "./risk-access.policy";
import { goalReached, isPastDeadline, objectiveBlockers, programmeBlockers, programmeProgress, targetBlockers, targetProgress } from "./strategy";
import { assertActiveUsers, blocked, dateOnly, loadNames, OBJECTIVE_ENTITY, placementOf, PROGRAMME_ENTITY, TARGET_ENTITY, todayFor, toDate, type NameMaps } from "./support";
import { namesForTasks, taskListSelect, toTaskListItem } from "./task-query.service";

/**
 * Objectives → targets → management programmes (spec "Objectives, targets and programmes").
 * Validation/progress maths live in strategy.ts (pure). Visibility: risk.view in scope OR owner.
 */

const objectiveSelect = {
  id: true,
  title: true,
  domain: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  ownerId: true,
  deadline: true,
  description: true,
  status: true,
  version: true,
  targets: { select: { direction: true, baseline: true, current: true, goal: true } },
  _count: { select: { programmes: true } },
} satisfies Prisma.RiskObjectiveSelect;

const targetSelect = {
  id: true,
  title: true,
  ownerId: true,
  deadline: true,
  direction: true,
  unit: true,
  baseline: true,
  current: true,
  goal: true,
  status: true,
  version: true,
  objective: { select: { id: true, title: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } },
  _count: { select: { programmes: true } },
} satisfies Prisma.RiskTargetSelect;

const programmeSelect = {
  id: true,
  title: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  ownerId: true,
  startDate: true,
  deadline: true,
  means: true,
  budget: true,
  status: true,
  version: true,
  objective: { select: { id: true, title: true } },
  targets: { select: { target: { select: { id: true, title: true, direction: true, baseline: true, current: true, goal: true } } } },
  tasks: { select: { status: true } },
} satisfies Prisma.RiskProgrammeSelect;

type ObjectiveRow = Prisma.RiskObjectiveGetPayload<{ select: typeof objectiveSelect }>;
type TargetRow = Prisma.RiskTargetGetPayload<{ select: typeof targetSelect }>;
type ProgrammeRow = Prisma.RiskProgrammeGetPayload<{ select: typeof programmeSelect }>;

function placementDto(r: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null }, names: NameMaps): PlacementDto {
  return {
    ...placementOf(r),
    siteName: r.siteId ? (names.sites.get(r.siteId) ?? null) : null,
    locationName: r.locationId ? (names.locations.get(r.locationId) ?? null) : null,
    departmentName: r.departmentId ? (names.departments.get(r.departmentId) ?? null) : null,
  };
}

async function namesFor(db: DbClient, rows: { ownerId: string; siteId?: string | null; locationId?: string | null; departmentId?: string | null }[]): Promise<NameMaps> {
  return loadNames(db, { users: rows.map((r) => r.ownerId), sites: rows.map((r) => r.siteId), locations: rows.map((r) => r.locationId), departments: rows.map((r) => r.departmentId) });
}

function toObjective(user: CurrentUser, r: ObjectiveRow, names: NameMaps, today: string): ObjectiveDto {
  const progresses = r.targets.map((t) => targetProgress(t));
  return {
    id: r.id,
    title: r.title,
    domain: r.domain,
    placement: placementDto(r, names),
    owner: { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" },
    deadline: dateOnly(r.deadline)!,
    description: r.description,
    status: r.status,
    version: r.version,
    overdue: isPastDeadline(dateOnly(r.deadline)!, r.status, today),
    targetCount: r.targets.length,
    programmeCount: r._count.programmes,
    progress: progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : 0,
    permissions: { edit: canEditStrategy(user, r) },
  };
}

function toTarget(user: CurrentUser, r: TargetRow, names: NameMaps, today: string): TargetDto {
  return {
    id: r.id,
    objective: { id: r.objective.id, title: r.objective.title },
    title: r.title,
    owner: { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" },
    deadline: dateOnly(r.deadline)!,
    direction: r.direction,
    unit: r.unit,
    baseline: r.baseline,
    current: r.current,
    goal: r.goal,
    progress: targetProgress(r),
    goalReached: goalReached(r),
    status: r.status,
    version: r.version,
    overdue: isPastDeadline(dateOnly(r.deadline)!, r.status, today),
    programmeCount: r._count.programmes,
    siteName: r.objective.siteId ? (names.sites.get(r.objective.siteId) ?? null) : null,
    permissions: { edit: canEditStrategy(user, { ...placementOf(r.objective), ownerId: r.ownerId }) },
  };
}

function toProgramme(user: CurrentUser, r: ProgrammeRow, names: NameMaps, today: string): ProgrammeDto {
  const statuses = r.tasks.map((t) => t.status);
  return {
    id: r.id,
    objective: r.objective,
    title: r.title,
    targets: r.targets.map((t) => ({ id: t.target.id, title: t.target.title, progress: targetProgress(t.target) })),
    placement: placementDto(r, names),
    owner: { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" },
    startDate: dateOnly(r.startDate)!,
    deadline: dateOnly(r.deadline)!,
    means: r.means,
    budget: r.budget,
    status: r.status,
    version: r.version,
    progress: programmeProgress(statuses),
    taskCount: statuses.length,
    openTasks: statuses.filter((s) => s !== "COMPLETED").length,
    overdue: isPastDeadline(dateOnly(r.deadline)!, r.status, today),
    permissions: { edit: canEditStrategy(user, r), createTask: r.status !== "COMPLETED" && canCreateTaskAt(user, r) },
  };
}

function statusFilter(status: StrategyListQuery["status"]) {
  if (!status) return {};
  if (status === "OPEN") return { status: { not: "COMPLETED" as const } };
  return { status } as Record<string, unknown>;
}

async function departmentPlacement(db: DbClient, departmentId: string | null) {
  if (!departmentId) return null;
  const placement = await resolvePlacement({ departmentId }, db);
  return placement;
}

export const strategyService = {
  // ── Objectives ────────────────────────────────────────────────────────────

  async listObjectives(user: CurrentUser, q: StrategyListQuery): Promise<Paginated<ObjectiveDto>> {
    const where: Prisma.RiskObjectiveWhereInput = {
      AND: [
        objectiveVisibleWhere(user),
        q.status && q.status !== "PLANNED" ? (statusFilter(q.status) as Prisma.RiskObjectiveWhereInput) : {},
        q.siteId ? { siteId: q.siteId } : {},
        q.ownerId ? { ownerId: q.ownerId } : {},
        q.q ? { title: { contains: q.q, mode: "insensitive" } } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.riskObjective.findMany({ where, select: objectiveSelect, orderBy: [{ status: "asc" }, { deadline: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.riskObjective.count({ where }),
    ]);
    const names = await namesFor(prisma, rows);
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toObjective(user, r, names, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async objective(user: CurrentUser, id: string): Promise<ObjectiveDetailDto> {
    const row = await prisma.riskObjective.findFirst({ where: { AND: [{ id }, objectiveVisibleWhere(user)] }, select: objectiveSelect });
    if (!row) throw new NotFoundError();
    const [targets, programmes] = await Promise.all([
      prisma.riskTarget.findMany({ where: { objectiveId: id }, select: targetSelect, orderBy: { deadline: "asc" } }),
      prisma.riskProgramme.findMany({ where: { AND: [{ objectiveId: id }, programmeVisibleWhere(user)] }, select: programmeSelect, orderBy: { deadline: "asc" } }),
    ]);
    const names = await namesFor(prisma, [row, ...targets.map((t) => ({ ownerId: t.ownerId, siteId: t.objective.siteId })), ...programmes]);
    const today = todayFor(user.timeZone);
    return { ...toObjective(user, row, names, today), targets: targets.map((t) => toTarget(user, t, names, today)), programmes: programmes.map((p) => toProgramme(user, p, names, today)) };
  },

  async createObjective(input: ObjectiveInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    const gates = objectiveBlockers(input);
    if (gates.length) blocked("The objective cannot be saved", gates);
    const placement = (await departmentPlacement(prisma, input.departmentId))!;
    if (!canCreateStrategyAt(user, placement)) throw new ForbiddenError("You cannot create objectives for this department.");
    await assertActiveUsers(prisma, [input.ownerId], "the owner");
    const domain = await listLabel(prisma, "risk.objective-domain", input.domain, null, "domain");
    return prisma.$transaction(async (tx) => {
      const row = await tx.riskObjective.create({
        data: { organizationId: requireTenantId(), title: input.title.trim(), domain, ...placement, ownerId: input.ownerId!, deadline: toDate(input.deadline!), description: input.description, status: input.status, createdById: user.id },
        select: { id: true },
      });
      await recordAudit({ entityType: OBJECTIVE_ENTITY, entityId: row.id, action: "RISK_OBJECTIVE_CREATED", actor: user, changes: { title: input.title.trim() }, meta }, tx);
      return row;
    });
  },

  async updateObjective(id: string, input: ObjectiveInput & { expectedVersion: number }, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await prisma.riskObjective.findFirst({ where: { AND: [{ id }, objectiveVisibleWhere(user)] } });
    if (!row) throw new NotFoundError();
    if (!canEditStrategy(user, row)) throw new ForbiddenError();
    const gates = objectiveBlockers(input);
    if (gates.length) blocked("The objective cannot be saved", gates);
    const placement = (await departmentPlacement(prisma, input.departmentId))!;
    if (placement.departmentId !== row.departmentId && !canEditStrategy(user, { ...placement, ownerId: input.ownerId! })) throw new ForbiddenError();
    await assertActiveUsers(prisma, input.ownerId !== row.ownerId ? [input.ownerId] : [], "the owner");
    const domain = await listLabel(prisma, "risk.objective-domain", input.domain, row.domain, "domain");
    await prisma.$transaction(async (tx) => {
      const data = { title: input.title.trim(), domain, ...placement, ownerId: input.ownerId!, deadline: toDate(input.deadline!), description: input.description, status: input.status };
      const updated = await tx.riskObjective.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: OBJECTIVE_ENTITY, entityId: id, action: "RISK_OBJECTIVE_UPDATED", actor: user, changes: diff(row as unknown as Record<string, unknown>, data as Record<string, unknown>), meta }, tx);
    });
  },

  // ── Targets ───────────────────────────────────────────────────────────────

  async listTargets(user: CurrentUser, q: StrategyListQuery): Promise<Paginated<TargetDto>> {
    const where: Prisma.RiskTargetWhereInput = {
      AND: [
        targetVisibleWhere(user),
        q.status === "ACTIVE" || q.status === "COMPLETED" ? { status: q.status } : q.status === "OPEN" ? { status: "ACTIVE" } : {},
        q.siteId ? { objective: { siteId: q.siteId } } : {},
        q.objectiveId ? { objectiveId: q.objectiveId } : {},
        q.ownerId ? { ownerId: q.ownerId } : {},
        q.q ? { title: { contains: q.q, mode: "insensitive" } } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.riskTarget.findMany({ where, select: targetSelect, orderBy: [{ status: "asc" }, { deadline: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.riskTarget.count({ where }),
    ]);
    const names = await namesFor(prisma, rows.map((t) => ({ ownerId: t.ownerId, siteId: t.objective.siteId })));
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toTarget(user, r, names, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async target(user: CurrentUser, id: string): Promise<TargetDetailDto> {
    const row = await prisma.riskTarget.findFirst({ where: { AND: [{ id }, targetVisibleWhere(user)] }, select: targetSelect });
    if (!row) throw new NotFoundError();
    const programmes = await prisma.riskProgramme.findMany({ where: { AND: [{ targets: { some: { targetId: id } } }, programmeVisibleWhere(user)] }, select: programmeSelect, orderBy: { deadline: "asc" } });
    const names = await namesFor(prisma, [{ ownerId: row.ownerId, siteId: row.objective.siteId }, ...programmes]);
    const today = todayFor(user.timeZone);
    return { ...toTarget(user, row, names, today), programmes: programmes.map((p) => toProgramme(user, p, names, today)) };
  },

  async createTarget(input: TargetInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    const gates = targetBlockers({ ...input, unit: input.unit });
    if (gates.length) blocked("The target cannot be saved", gates);
    const objective = await prisma.riskObjective.findFirst({ where: { AND: [{ id: input.objectiveId! }, objectiveVisibleWhere(user)] } });
    if (!objective) throw new ValidationError("Choose an objective you can see.");
    if (!canCreateStrategyAt(user, objective)) throw new ForbiddenError("You cannot add targets to this objective.");
    await assertActiveUsers(prisma, [input.ownerId], "the owner");
    const unit = await listLabel(prisma, "risk.target-unit", input.unit, null, "unit");
    return prisma.$transaction(async (tx) => {
      const row = await tx.riskTarget.create({
        data: {
          organizationId: requireTenantId(),
          objectiveId: objective.id,
          title: input.title.trim(),
          ownerId: input.ownerId!,
          deadline: toDate(input.deadline!),
          direction: input.direction,
          unit: unit!,
          baseline: input.baseline,
          current: input.current,
          goal: input.goal,
          status: input.status,
          createdById: user.id,
        },
        select: { id: true },
      });
      await recordAudit({ entityType: TARGET_ENTITY, entityId: row.id, action: "RISK_TARGET_CREATED", actor: user, changes: { title: input.title.trim(), objective: objective.title }, meta }, tx);
      return row;
    });
  },

  async updateTarget(id: string, input: TargetInput & { expectedVersion: number }, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await prisma.riskTarget.findFirst({ where: { AND: [{ id }, targetVisibleWhere(user)] }, include: { objective: true } });
    if (!row) throw new NotFoundError();
    if (!canEditStrategy(user, { ...placementOf(row.objective), ownerId: row.ownerId })) throw new ForbiddenError();
    const gates = targetBlockers({ ...input, unit: input.unit });
    if (gates.length) blocked("The target cannot be saved", gates);
    let objectiveId = row.objectiveId;
    if (input.objectiveId !== row.objectiveId) {
      const objective = await prisma.riskObjective.findFirst({ where: { AND: [{ id: input.objectiveId! }, objectiveVisibleWhere(user)] } });
      if (!objective) throw new ValidationError("Choose an objective you can see.");
      const linked = await prisma.riskProgrammeTarget.count({ where: { targetId: id } });
      if (linked) blocked("The target cannot move", ["This target is linked to programmes of its objective – unlink it first."]);
      objectiveId = objective.id;
    }
    await assertActiveUsers(prisma, input.ownerId !== row.ownerId ? [input.ownerId] : [], "the owner");
    const unit = await listLabel(prisma, "risk.target-unit", input.unit, row.unit, "unit");
    await prisma.$transaction(async (tx) => {
      const data = { objectiveId, title: input.title.trim(), ownerId: input.ownerId!, deadline: toDate(input.deadline!), direction: input.direction, unit: unit!, baseline: input.baseline, current: input.current, goal: input.goal, status: input.status };
      const updated = await tx.riskTarget.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: TARGET_ENTITY, entityId: id, action: "RISK_TARGET_UPDATED", actor: user, changes: diff(row as unknown as Record<string, unknown>, data as Record<string, unknown>), meta }, tx);
    });
  },

  // ── Programmes ────────────────────────────────────────────────────────────

  async listProgrammes(user: CurrentUser, q: StrategyListQuery): Promise<Paginated<ProgrammeDto>> {
    const where: Prisma.RiskProgrammeWhereInput = {
      AND: [
        programmeVisibleWhere(user),
        statusFilter(q.status) as Prisma.RiskProgrammeWhereInput,
        q.siteId ? { siteId: q.siteId } : {},
        q.objectiveId ? { objectiveId: q.objectiveId } : {},
        q.ownerId ? { ownerId: q.ownerId } : {},
        q.q ? { title: { contains: q.q, mode: "insensitive" } } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.riskProgramme.findMany({ where, select: programmeSelect, orderBy: [{ status: "asc" }, { deadline: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.riskProgramme.count({ where }),
    ]);
    const names = await namesFor(prisma, rows);
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toProgramme(user, r, names, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async programme(user: CurrentUser, id: string): Promise<ProgrammeDetailDto> {
    const row = await prisma.riskProgramme.findFirst({ where: { AND: [{ id }, programmeVisibleWhere(user)] }, select: programmeSelect });
    if (!row) throw new NotFoundError();
    const tasks = await prisma.riskTask.findMany({ where: { AND: [{ programmeId: id }, taskVisibleWhere(user)] }, select: taskListSelect, orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }] });
    const [names, taskNames] = await Promise.all([namesFor(prisma, [row]), namesForTasks(prisma, tasks)]);
    const today = todayFor(user.timeZone);
    return { ...toProgramme(user, row, names, today), tasks: tasks.map((t) => toTaskListItem(t, taskNames, today)) };
  },

  async createProgramme(input: ProgrammeInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    const objective = input.objectiveId ? await prisma.riskObjective.findFirst({ where: { AND: [{ id: input.objectiveId }, objectiveVisibleWhere(user)] }, select: { id: true, targets: { select: { id: true } } } }) : null;
    if (input.objectiveId && !objective) throw new ValidationError("Choose an objective you can see.");
    const gates = programmeBlockers({ ...input, objectiveTargetIds: objective?.targets.map((t) => t.id) ?? [], taskStatuses: [] });
    if (gates.length) blocked("The programme cannot be saved", gates);
    const placement = (await departmentPlacement(prisma, input.departmentId))!;
    if (!canCreateStrategyAt(user, placement)) throw new ForbiddenError("You cannot create programmes for this department.");
    await assertActiveUsers(prisma, [input.ownerId], "the owner");
    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const row = await tx.riskProgramme.create({
        data: {
          organizationId,
          objectiveId: objective!.id,
          title: input.title.trim(),
          ...placement,
          ownerId: input.ownerId!,
          startDate: toDate(input.startDate!),
          deadline: toDate(input.deadline!),
          means: input.means,
          budget: input.budget,
          status: input.status,
          createdById: user.id,
          targets: { create: [...new Set(input.targetIds)].map((targetId) => ({ organizationId, targetId })) },
        },
        select: { id: true },
      });
      await recordAudit({ entityType: PROGRAMME_ENTITY, entityId: row.id, action: "RISK_PROGRAMME_CREATED", actor: user, changes: { title: input.title.trim(), targets: input.targetIds.length }, meta }, tx);
      return row;
    });
  },

  async updateProgramme(id: string, input: ProgrammeInput & { expectedVersion: number }, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await prisma.riskProgramme.findFirst({ where: { AND: [{ id }, programmeVisibleWhere(user)] }, include: { targets: true, tasks: { select: { status: true } } } });
    if (!row) throw new NotFoundError();
    if (!canEditStrategy(user, row)) throw new ForbiddenError();
    const objective = input.objectiveId ? await prisma.riskObjective.findFirst({ where: { AND: [{ id: input.objectiveId }, input.objectiveId === row.objectiveId ? {} : objectiveVisibleWhere(user)] }, select: { id: true, targets: { select: { id: true } } } }) : null;
    if (input.objectiveId && !objective) throw new ValidationError("Choose an objective you can see.");
    const gates = programmeBlockers({ ...input, objectiveTargetIds: objective?.targets.map((t) => t.id) ?? [], taskStatuses: row.tasks.map((t) => t.status) });
    if (gates.length) blocked("The programme cannot be saved", gates);
    const placement = (await departmentPlacement(prisma, input.departmentId))!;
    if (placement.departmentId !== row.departmentId && !canEditStrategy(user, { ...placement, ownerId: input.ownerId! })) throw new ForbiddenError();
    await assertActiveUsers(prisma, input.ownerId !== row.ownerId ? [input.ownerId] : [], "the owner");
    const organizationId = requireTenantId();
    await prisma.$transaction(async (tx) => {
      const data = { objectiveId: objective!.id, title: input.title.trim(), ...placement, ownerId: input.ownerId!, startDate: toDate(input.startDate!), deadline: toDate(input.deadline!), means: input.means, budget: input.budget, status: input.status };
      const updated = await tx.riskProgramme.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      const wanted = [...new Set(input.targetIds)];
      const before = row.targets.map((t) => t.targetId);
      await tx.riskProgrammeTarget.deleteMany({ where: { programmeId: id, targetId: { notIn: wanted } } });
      const added = wanted.filter((t) => !before.includes(t));
      if (added.length) await tx.riskProgrammeTarget.createMany({ data: added.map((targetId) => ({ organizationId, programmeId: id, targetId })), skipDuplicates: true });
      const changes = diff(row as unknown as Record<string, unknown>, data as Record<string, unknown>) ?? {};
      if (added.length || before.length !== wanted.length) Object.assign(changes, { targets: { from: before.length, to: wanted.length } });
      await recordAudit({ entityType: PROGRAMME_ENTITY, entityId: id, action: "RISK_PROGRAMME_UPDATED", actor: user, changes, meta }, tx);
    });
  },
};
