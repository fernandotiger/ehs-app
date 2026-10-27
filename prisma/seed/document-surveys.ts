import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { addDays } from "../../src/server/modules/documents/acknowledgement-rules";
import { auditRow, type TenantSeed } from "./common";

/**
 * Demo document surveys (Northstar). Idempotent per document: a document that already has a
 * survey is skipped. Respects the privacy split: a participation row ("who took part") and a
 * response row (anonymous → no user id, date only, random uuid) are written independently.
 */

type QuestionSpec = { type: "TEXT" | "SINGLE" | "MULTIPLE"; label: string; help?: string; required: boolean; options?: string[] };

/** One respondent's answers, by question position (1-based): a choice list or a text. */
type AnswerSpec = Record<number, string[] | string>;

interface SurveySpec {
  referenceCode: string;
  title: string;
  intro?: string;
  isMandatory: boolean;
  dueDays?: number;
  allowAnonymous: boolean;
  /** Days after publication the survey was added (0 = created with the document). */
  addedDaysAfterPublish: number;
  questions: QuestionSpec[];
  /** Named respondents by email; the rest of `answers` is filled by people from the audience. */
  namedEmails?: string[];
  /** People who must NOT answer (story users). */
  exclude: string[];
  named: AnswerSpec[];
  anonymous: AnswerSpec[];
}

const UNDERSTANDING: QuestionSpec[] = [
  { type: "SINGLE", label: "Did you understand this document?", required: true, options: ["Yes", "Partly", "No"] },
  { type: "MULTIPLE", label: "Which parts would you like explained again?", help: "Pick as many as you like.", required: false, options: ["Entitlement", "Requesting leave", "Carry over"] },
  { type: "TEXT", label: "What was unclear?", required: false },
];

const FEEDBACK: QuestionSpec[] = [
  { type: "SINGLE", label: "How clear is this document?", required: true, options: ["Very clear", "Clear", "Not clear"] },
  { type: "MULTIPLE", label: "Which parts were most useful?", required: false, options: ["PPE rules", "Pedestrian walkways", "Racking checks", "Forklift rules"] },
  { type: "TEXT", label: "Any suggestions?", required: false },
];

const SURVEYS: SurveySpec[] = [
  {
    referenceCode: "HR-POL-001",
    title: "Questions about the Annual Leave Policy 2026",
    intro: "Three quick questions so we can check the new leave rules are clear. It takes about a minute.",
    isMandatory: true,
    dueDays: 14,
    allowAnonymous: true,
    addedDaysAfterPublish: 0,
    questions: UNDERSTANDING,
    namedEmails: ["sarah@northstar.example", "emma@northstar.example", "priya@northstar.example"],
    exclude: ["john@northstar.example", "helen@northstar.example"],
    named: [
      { 1: ["Yes"] },
      { 1: ["Yes"], 2: ["Carry over"] },
      { 1: ["Partly"], 2: ["Carry over"], 3: "Does the carry-over limit apply to part-time staff too?" },
      { 1: ["Yes"] },
      { 1: ["Yes"], 3: "Clear, thanks. A short summary table would help." },
      { 1: ["Partly"], 2: ["Requesting leave", "Carry over"], 3: "How far in advance do I need to request half days?" },
      { 1: ["Yes"] },
      { 1: ["No"], 2: ["Entitlement", "Carry over"], 3: "I am not sure whether public holidays are included in the 22 days." },
      { 1: ["Yes"], 2: ["Requesting leave"] },
      { 1: ["Yes"] },
      { 1: ["Partly"], 2: ["Entitlement"], 3: "Please explain how leave is calculated if I join mid-year." },
    ],
    anonymous: [
      { 1: ["Partly"], 2: ["Carry over"], 3: "What happens to days I cannot carry over?" },
      { 1: ["Yes"] },
      { 1: ["No"], 2: ["Requesting leave"], 3: "My manager takes longer than five days to reply – who do I contact?" },
      { 1: ["Yes"], 2: ["Entitlement"] },
    ],
  },
  {
    referenceCode: "EHS-POL-010",
    title: "Feedback on the Warehouse Safety Policy",
    intro: "Tell us what works and what we can improve. Optional – every answer helps.",
    isMandatory: false,
    allowAnonymous: true,
    addedDaysAfterPublish: 10,
    questions: FEEDBACK,
    namedEmails: ["liam@northstar.example", "sarah@northstar.example"],
    exclude: ["john@northstar.example"],
    named: [
      { 1: ["Very clear"], 2: ["PPE rules", "Forklift rules"], 3: "Add a site map of the pedestrian walkways." },
      { 1: ["Clear"], 2: ["Racking checks"] },
      { 1: ["Clear"], 2: ["Pedestrian walkways", "PPE rules"], 3: "Translate the key rules for our agency staff." },
      { 1: ["Not clear"], 2: ["Forklift rules"], 3: "Who signs off forklift certificates?" },
    ],
    anonymous: [],
  },
];

function localDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function seedDocumentSurveys(prisma: PrismaClient, tenant: TenantSeed, options: { author: string }): Promise<void> {
  const organizationId = tenant.organizationId;
  const authorId = tenant.users.get(options.author);
  if (!authorId) throw new Error(`${options.author} must be seeded before document surveys`);
  const author = { id: authorId, name: (await prisma.user.findUniqueOrThrow({ where: { id: authorId }, select: { name: true } })).name };
  const now = new Date();

  for (const spec of SURVEYS) {
    const doc = await prisma.document.findFirst({
      where: { organizationId, referenceCode: spec.referenceCode },
      select: { id: true, title: true, status: true, publishedAt: true, currentVersionId: true, currentVersion: { select: { versionNumber: true } }, audiences: true },
    });
    if (!doc || doc.status !== "PUBLISHED" || !doc.publishedAt || !doc.currentVersionId) {
      console.log(`    survey for ${spec.referenceCode}: document not found or not published – skipping`);
      continue;
    }
    if (await prisma.documentSurvey.count({ where: { organizationId, documentId: doc.id } })) {
      console.log(`    survey for ${doc.title}: already present – skipping`);
      continue;
    }

    // Respondents: the named story users first, then other people in the audience (stable order).
    const audienceOr: Prisma.UserWhereInput[] = doc.audiences.map((a) => {
      switch (a.type) {
        case "ROLE":
          return { roleAssignments: { some: { roleId: a.roleId! } } };
        case "BUSINESS_UNIT":
          return { businessUnitId: a.businessUnitId };
        case "SITE":
          return { siteId: a.siteId };
        case "LOCATION":
          return { locationId: a.locationId };
        case "DEPARTMENT":
          return { departmentId: a.departmentId };
        default:
          return { id: a.userId! };
      }
    });
    const everyone = doc.audiences.some((a) => a.type === "ALL_EMPLOYEES");
    const excluded = spec.exclude.map((e) => tenant.users.get(e)).filter((id): id is string => Boolean(id));
    const population = await prisma.user.findMany({
      where: { organizationId, isActive: true, ...(everyone ? {} : { OR: audienceOr }), id: { notIn: excluded } },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    });
    const first = (spec.namedEmails ?? []).map((e) => population.find((u) => u.email === e)).filter((u): u is (typeof population)[number] => Boolean(u));
    const ordered = [...first, ...population.filter((u) => !first.includes(u))];
    const total = spec.named.length + spec.anonymous.length;
    if (ordered.length < total) throw new Error(`Not enough people in the audience of ${doc.title} for the demo survey`);

    const createdAt = addDays(doc.publishedAt, spec.addedDaysAfterPublish);
    const currentVersionId = doc.currentVersionId;
    // Story users answer by name; answer times are spread so anonymous answers are not the last ones.
    const plan = [...spec.named.map((a) => ({ answers: a, anonymous: false })), ...spec.anonymous.map((a) => ({ answers: a, anonymous: true }))];
    await prisma.$transaction(
      async (tx) => {
        const survey = await tx.documentSurvey.create({
          data: {
            organizationId,
            documentId: doc.id,
            title: spec.title,
            intro: spec.intro ?? null,
            isMandatory: spec.isMandatory,
            dueDays: spec.isMandatory ? (spec.dueDays ?? 14) : null,
            mandatorySince: spec.isMandatory ? createdAt : null,
            allowAnonymous: spec.allowAnonymous,
            createdById: author.id,
            createdAt,
            questions: {
              createMany: {
                data: spec.questions.map((q, i) => ({
                  organizationId,
                  position: i + 1,
                  type: q.type,
                  label: q.label,
                  help: q.help ?? null,
                  required: q.required,
                  options: q.type === "TEXT" ? [] : (q.options ?? []),
                })),
              },
            },
          },
          include: { questions: { orderBy: { position: "asc" } } },
        });

        const versionNumber = doc.currentVersion?.versionNumber ?? 1;
        const participations: Prisma.DocumentSurveyParticipationCreateManyInput[] = [];
        const responses: Prisma.DocumentSurveyResponseCreateManyInput[] = [];
        const answers: Prisma.DocumentSurveyAnswerCreateManyInput[] = [];
        const audit: Prisma.AuditLogCreateManyInput[] = [
          auditRow(organizationId, {
            entityType: "Document",
            entityId: doc.id,
            action: "DOCUMENT_SURVEY_CREATED",
            actor: author,
            changes: { survey: { title: spec.title, isMandatory: spec.isMandatory, allowAnonymous: spec.allowAnonymous, questions: spec.questions.length, source: "seed" } },
            metadata: { surveyId: survey.id },
            createdAt,
          }),
        ];
        const elapsedDays = Math.max(1, (now.getTime() - createdAt.getTime()) / 86_400_000 - 0.2);

        for (const [i, item] of plan.entries()) {
          const person = ordered[i]!;
          const answeredAt = addDays(createdAt, 0.3 + ((i * 7) % 10) * (elapsedDays / 10));
          participations.push({ organizationId, surveyId: survey.id, userId: person.id, answeredAt });
          const responseId = randomUUID();
          responses.push({
            id: responseId,
            organizationId,
            surveyId: survey.id,
            documentVersionNumber: versionNumber,
            respondentId: item.anonymous ? null : person.id,
            isAnonymous: item.anonymous,
            submittedOn: localDay(answeredAt),
          });
          for (const [position, value] of Object.entries(item.answers)) {
            const question = survey.questions.find((q) => q.position === Number(position));
            if (!question) continue;
            answers.push({
              id: randomUUID(),
              organizationId,
              responseId,
              questionId: question.id,
              text: typeof value === "string" ? value : null,
              choices: typeof value === "string" ? [] : value,
            });
          }
          // Evidence that they opened the document first (as the API requires), then participation only.
          audit.push(
            auditRow(organizationId, {
              entityType: "DocumentVersion",
              entityId: currentVersionId,
              action: "DOCUMENT_FILE_ACCESSED",
              actor: person,
              metadata: { documentId: doc.id, versionNumber, disposition: "inline" },
              createdAt: new Date(answeredAt.getTime() - 5 * 60_000),
            }),
            auditRow(organizationId, {
              entityType: "Document",
              entityId: doc.id,
              action: "DOCUMENT_SURVEY_ANSWERED",
              actor: person,
              metadata: { surveyId: survey.id, source: "ONLINE" },
              createdAt: answeredAt,
            }),
          );
        }

        await tx.documentSurveyParticipation.createMany({ data: participations });
        // Responses go in sorted by their random id – not in the order people answered.
        responses.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        await tx.documentSurveyResponse.createMany({ data: responses });
        await tx.documentSurveyAnswer.createMany({ data: answers });
        await tx.auditLog.createMany({ data: audit });
      },
      { timeout: 60_000 },
    );
    console.log(`    ${doc.title}: survey with ${plan.length} answer(s) (${spec.anonymous.length} anonymous)`);
  }
}
