import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { localDate } from "@/server/modules/jobs/engine";
import type { DueWorkItem, DueWorkProvider } from "@/server/modules/jobs/types";
import { settingsService } from "@/server/modules/settings/settings.service";
import { requireTenantId } from "@/server/tenancy/context";
import { dueDateFor } from "./acknowledgement-rules";
import { audiencePopulationWhere, audienceRowSelect } from "./document-access.policy";
import { DOCUMENT_ENTITY } from "./document-audit-actions";
import { documentQueryService } from "./document-query.service";
import { buildRequirement, documentLink, requirementSelect } from "./document-requirement";
import { surveyDueDate, surveyRequiredSince } from "./survey-rules";
import { effectiveDueDays, surveySettings, surveysToAnswer } from "./survey-summary";

/**
 * Due work: documents a person still has to read and acknowledge (My work, and optionally a
 * scheduled-job target). The owner is the person who must acknowledge.
 */

/** Upper bound for a tenant-wide listing (jobs); My work uses the per-user fast path. */
const MAX_ITEMS = 5000;
const USER_BATCH = 500;

async function tenantTimeZone(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: requireTenantId() }, select: { timeZone: true } });
  return org?.timeZone ?? "Europe/Dublin";
}

export const documentAcknowledgementProvider: DueWorkProvider = {
  kind: "document.acknowledgement",
  module: "documents",
  label: "Document acknowledgements",
  jobTarget: true,

  async listForUser(user: CurrentUser): Promise<DueWorkItem[]> {
    const page = await documentQueryService.myDocuments(user, { page: 1, pageSize: 100, filter: "action" });
    const today = localDate(new Date(), user.timeZone);
    // "Action required" also holds documents whose only open item is a survey (see documentSurveyProvider).
    const toAcknowledge = page.items.filter((doc) => doc.ackStatus === "outstanding" || doc.ackStatus === "overdue");
    return toAcknowledge.map((doc) => ({
      provider: "document.acknowledgement",
      entityType: DOCUMENT_ENTITY,
      entityId: doc.id,
      reference: doc.referenceCode ?? undefined,
      title: `Read and acknowledge: ${doc.title}`,
      href: documentLink(doc.id),
      dueDate: doc.dueAt ? localDate(new Date(doc.dueAt), user.timeZone) : today,
      ownerId: user.id,
      placement: { businessUnitId: user.businessUnitId, siteId: user.siteId, locationId: user.locationId, departmentId: user.departmentId },
    }));
  },

  async listOpen(): Promise<DueWorkItem[]> {
    const [defaults, timeZone] = await Promise.all([settingsService.get("system"), tenantTimeZone()]);
    const now = new Date();
    const docs = await prisma.document.findMany({
      where: { status: "PUBLISHED", requiresAcknowledgement: true, publishedAt: { lte: now } },
      select: { ...requirementSelect, referenceCode: true },
      orderBy: { id: "asc" },
    });
    const items: DueWorkItem[] = [];
    for (const doc of docs) {
      const req = buildRequirement(doc, defaults);
      if (!req.since) continue;
      let cursor: string | undefined;
      for (;;) {
        const users = await prisma.user.findMany({
          where: { AND: [req.population, req.outstanding, { isActive: true }] },
          select: { id: true, createdAt: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
          orderBy: { id: "asc" },
          take: USER_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const u of users) {
          items.push({
            provider: "document.acknowledgement",
            entityType: DOCUMENT_ENTITY,
            entityId: doc.id,
            reference: doc.referenceCode ?? undefined,
            title: `Read and acknowledge: ${doc.title}`,
            href: documentLink(doc.id),
            dueDate: localDate(dueDateFor(req.since, u.createdAt, req.settings.ackDueDays), timeZone),
            ownerId: u.id,
            placement: { businessUnitId: u.businessUnitId, siteId: u.siteId, locationId: u.locationId, departmentId: u.departmentId },
          });
          if (items.length >= MAX_ITEMS) return items;
        }
        if (users.length < USER_BATCH) break;
        cursor = users[users.length - 1]!.id;
      }
    }
    return items;
  },
};

/** Survey due-work items use their own entity so job dedupe keys never collide with acknowledgements. */
const SURVEY_ENTITY = "DocumentSurvey";

/**
 * Due work: mandatory document surveys a person still has to answer (My work, and a scheduled-job
 * target). Due = max(publication, survey became mandatory, person joined) + "answer within" days.
 */
export const documentSurveyProvider: DueWorkProvider = {
  kind: "document.survey",
  module: "documents",
  label: "Response forms",
  jobTarget: true,

  async listForUser(user: CurrentUser): Promise<DueWorkItem[]> {
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true } });
    if (!me) return [];
    const now = new Date();
    const todo = await surveysToAnswer(user, { userCreatedAt: me.createdAt, now });
    if (!todo.length) return [];
    const docs = await prisma.document.findMany({ where: { id: { in: todo.map((t) => t.documentId) } }, select: { id: true, title: true, referenceCode: true } });
    const today = localDate(now, user.timeZone);
    return todo.flatMap((t): DueWorkItem[] => {
      const doc = docs.find((d) => d.id === t.documentId);
      if (!doc) return [];
      return [
        {
          provider: "document.survey",
          entityType: SURVEY_ENTITY,
          entityId: t.id,
          reference: doc.referenceCode ?? undefined,
          title: `Complete response form: ${doc.title}`,
          href: documentLink(doc.id),
          dueDate: t.dueAt ? localDate(new Date(t.dueAt), user.timeZone) : today,
          ownerId: user.id,
          placement: { businessUnitId: user.businessUnitId, siteId: user.siteId, locationId: user.locationId, departmentId: user.departmentId },
        },
      ];
    });
  },

  async listOpen(): Promise<DueWorkItem[]> {
    const [settings, timeZone] = await Promise.all([surveySettings(), tenantTimeZone()]);
    const now = new Date();
    const surveys = await prisma.documentSurvey.findMany({
      where: { status: "ACTIVE", isMandatory: true, document: { status: "PUBLISHED", publishedAt: { lte: now } } },
      select: {
        id: true,
        dueDays: true,
        mandatorySince: true,
        createdAt: true,
        document: { select: { id: true, title: true, referenceCode: true, publishedAt: true, audiences: { select: audienceRowSelect } } },
      },
      orderBy: { id: "asc" },
    });
    const items: DueWorkItem[] = [];
    for (const survey of surveys) {
      const doc = survey.document;
      let cursor: string | undefined;
      for (;;) {
        const users = await prisma.user.findMany({
          where: { AND: [audiencePopulationWhere(doc.audiences), { documentSurveyParticipations: { none: { surveyId: survey.id } } }] },
          select: { id: true, createdAt: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
          orderBy: { id: "asc" },
          take: USER_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const u of users) {
          const since = surveyRequiredSince({ publishedAt: doc.publishedAt, mandatorySince: survey.mandatorySince, surveyCreatedAt: survey.createdAt, userCreatedAt: u.createdAt });
          const dueAt = surveyDueDate(since, effectiveDueDays(survey, settings));
          if (!dueAt) continue;
          items.push({
            provider: "document.survey",
            entityType: SURVEY_ENTITY,
            entityId: survey.id,
            reference: doc.referenceCode ?? undefined,
            title: `Complete response form: ${doc.title}`,
            href: documentLink(doc.id),
            dueDate: localDate(dueAt, timeZone),
            ownerId: u.id,
            placement: { businessUnitId: u.businessUnitId, siteId: u.siteId, locationId: u.locationId, departmentId: u.departmentId },
          });
          if (items.length >= MAX_ITEMS) return items;
        }
        if (users.length < USER_BATCH) break;
        cursor = users[users.length - 1]!.id;
      }
    }
    return items;
  },
};
