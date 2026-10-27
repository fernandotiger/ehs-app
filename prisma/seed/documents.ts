import type { EscalationTarget, Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { ACKNOWLEDGEMENT_STATEMENT } from "../../src/lib/validation/documents";
import { acknowledgementSigningPayload, addDays } from "../../src/server/modules/documents/acknowledgement-rules";
import { auditRow, sign, storeFile, type TenantSeed } from "./common";

/**
 * Demo documents with real (tiny, valid) PDF files, audiences, versions and signed
 * acknowledgements – per tenant. Idempotent: skipped when the tenant already has documents.
 * Runs under tsx, so server-only modules (storage, signing) are mirrored in ./common.ts.
 */

// ── Minimal one-page PDF ────────────────────────────────────────────────────

function pdfText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, width = 88): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if ((line + " " + word).trim().length > width) {
        lines.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Hand-built PDF 1.4 with correct xref offsets (Helvetica, A4). */
export function buildPdf(title: string, subtitle: string, body: string, footer: string): Uint8Array {
  const bodyOps = wrap(body)
    .map((l) => `(${pdfText(l)}) Tj T*`)
    .join("\n");
  const content = [
    "0.23 0.33 0.51 rg 0 782 595 60 re f",
    "BT /F1 20 Tf 1 1 1 rg 50 804 Td (" + pdfText(title) + ") Tj ET",
    "BT /F2 10 Tf 0.35 0.35 0.35 rg 50 758 Td (" + pdfText(subtitle) + ") Tj ET",
    "BT /F2 11 Tf 0 0 0 rg 16 TL 50 726 Td",
    bodyOps,
    "ET",
    "BT /F2 8 Tf 0.5 0.5 0.5 rg 50 40 Td (" + pdfText(footer) + ") Tj ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// ── Specs ───────────────────────────────────────────────────────────────────

export type AudienceSpec =
  | { type: "ALL_EMPLOYEES" }
  | { type: "ROLE"; roleKey: string }
  | { type: "BUSINESS_UNIT"; businessUnit: string }
  | { type: "SITE"; site: string }
  | { type: "LOCATION"; location: string }
  | { type: "DEPARTMENT"; department: string }
  | { type: "USER"; email: string };

export interface VersionSpec {
  daysAgo: number;
  changeNote: string;
  requiresReacknowledgement?: boolean;
  body: string;
}

export interface DocumentSpec {
  title: string;
  referenceCode: string;
  category: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** Days ago the document was published (ignored for drafts). */
  publishedDaysAgo?: number;
  archivedDaysAgo?: number;
  audiences: AudienceSpec[];
  requiresAcknowledgement: boolean;
  ackDueDays?: number;
  escalationTarget?: EscalationTarget;
  versions: VersionSpec[];
  /** Share of the population that acknowledged, per version number. */
  ackShare?: Record<number, number>;
}

export interface DocumentSeedOptions {
  author: string;
  categories: string[];
  documents: DocumentSpec[];
  /** People who stay outstanding everywhere (story users). */
  outstanding?: string[];
  /** reference code → emails that have acknowledged (story receipts). */
  acknowledged?: Record<string, string[]>;
}

/** Deterministic pseudo-random selection so re-seeding a fresh database gives the same picture. */
function pickShare<T extends { id: string }>(items: T[], share: number, salt: string): T[] {
  const score = (id: string) => {
    let h = 2166136261;
    for (const ch of id + salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967295;
  };
  return items.filter((i) => score(i.id) < share);
}

type AudienceRowData = {
  type: AudienceSpec["type"];
  roleId?: string;
  businessUnitId?: string;
  siteId?: string;
  locationId?: string;
  departmentId?: string;
  userId?: string;
};

function populationWhere(organizationId: string, audiences: AudienceRowData[]): Prisma.UserWhereInput {
  if (audiences.some((a) => a.type === "ALL_EMPLOYEES")) return { organizationId, isActive: true };
  return {
    organizationId,
    isActive: true,
    OR: audiences.map((a): Prisma.UserWhereInput => {
      switch (a.type) {
        case "ROLE":
          return { roleAssignments: { some: { roleId: a.roleId } } };
        case "BUSINESS_UNIT":
          return { businessUnitId: a.businessUnitId };
        case "SITE":
          return { siteId: a.siteId };
        case "LOCATION":
          return { locationId: a.locationId };
        case "DEPARTMENT":
          return { departmentId: a.departmentId };
        default:
          return { id: a.userId };
      }
    }),
  };
}

function resolveAudience(tenant: TenantSeed, a: AudienceSpec): AudienceRowData {
  const need = (map: Map<string, string>, key: string, what: string) => {
    const id = map.get(key);
    if (!id) throw new Error(`Seed audience refers to unknown ${what} "${key}"`);
    return id;
  };
  switch (a.type) {
    case "ALL_EMPLOYEES":
      return { type: a.type };
    case "ROLE":
      return { type: a.type, roleId: need(tenant.roles, a.roleKey, "role") };
    case "BUSINESS_UNIT":
      return { type: a.type, businessUnitId: need(tenant.businessUnits, a.businessUnit, "business unit") };
    case "SITE":
      return { type: a.type, siteId: need(tenant.sites, a.site, "site") };
    case "LOCATION":
      return { type: a.type, locationId: need(tenant.locations, a.location, "location") };
    case "DEPARTMENT":
      return { type: a.type, departmentId: need(tenant.departments, a.department, "department") };
    case "USER":
      return { type: a.type, userId: need(tenant.users, a.email, "user") };
  }
}

export async function seedDocuments(prisma: PrismaClient, tenant: TenantSeed, options: DocumentSeedOptions): Promise<void> {
  const organizationId = tenant.organizationId;
  if ((await prisma.document.count({ where: { organizationId } })) > 0) {
    console.log(`  • ${tenant.name}: documents already present – skipping`);
    return;
  }

  const now = new Date();
  const authorId = tenant.users.get(options.author);
  if (!authorId) throw new Error(`${options.author} must be seeded before documents`);
  const author = { id: authorId, name: (await prisma.user.findUniqueOrThrow({ where: { id: authorId }, select: { name: true } })).name };

  // Demo employees have been with the company for a while, so due dates follow document dates.
  await prisma.user.updateMany({ where: { organizationId, createdAt: { gt: addDays(now, -30) } }, data: { createdAt: addDays(now, -400) } });

  const categories = new Map<string, string>();
  for (const name of options.categories) {
    const row = await prisma.documentCategory.upsert({
      where: { organizationId_name: { organizationId, name } },
      create: { organizationId, name },
      update: {},
    });
    categories.set(name, row.id);
  }

  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const outstanding = new Set((options.outstanding ?? []).map((email) => tenant.users.get(email)));

  for (const spec of options.documents) {
    const publishedAt = spec.status !== "DRAFT" && spec.publishedDaysAgo !== undefined ? addDays(now, -spec.publishedDaysAgo) : null;
    const reackVersion = [...spec.versions.keys()]
      .filter((i) => spec.versions[i]!.requiresReacknowledgement)
      .map((i) => i + 1)
      .pop();
    const audiences = spec.audiences.map((a) => resolveAudience(tenant, a));

    const document = await prisma.document.create({
      data: {
        organizationId,
        title: spec.title,
        description: spec.description,
        referenceCode: spec.referenceCode,
        categoryId: categories.get(spec.category),
        status: spec.status,
        requiresAcknowledgement: spec.requiresAcknowledgement,
        ackRequiredFromVersion: spec.requiresAcknowledgement ? (reackVersion ?? 1) : null,
        ackDueDays: spec.ackDueDays ?? 14,
        reminderIntervalDays: 3,
        escalationDays: 7,
        escalationTarget: spec.escalationTarget ?? "MANAGER",
        publishedAt,
        archivedAt: spec.archivedDaysAgo !== undefined ? addDays(now, -spec.archivedDaysAgo) : null,
        createdById: author.id,
        createdAt: addDays(now, -(spec.versions[0]!.daysAgo + 1)),
        audiences: { createMany: { data: audiences.map((a) => ({ ...a, organizationId })) } },
      },
    });

    audit.push(
      auditRow(organizationId, {
        entityType: "Document",
        entityId: document.id,
        action: "DOCUMENT_CREATED",
        actor: author,
        changes: { title: spec.title, referenceCode: spec.referenceCode, category: spec.category, source: "seed" },
        createdAt: document.createdAt,
      }),
    );
    if (publishedAt) audit.push(auditRow(organizationId, { entityType: "Document", entityId: document.id, action: "DOCUMENT_PUBLISHED", actor: author, createdAt: publishedAt }));

    const versionIds: { id: string; versionNumber: number; createdAt: Date }[] = [];
    for (const [index, v] of spec.versions.entries()) {
      const versionNumber = index + 1;
      const fileName = `${spec.title.replace(/[^\w]+/g, "-")}-v${versionNumber}.pdf`;
      const key = `org/${organizationId}/documents/seed/${document.id}/v${versionNumber}/${fileName}`;
      const bytes = buildPdf(spec.title, `${spec.referenceCode} - Version ${versionNumber} - ${spec.category}`, v.body, `${tenant.name} - demo document generated by the seed script`);
      const storageDriver = await storeFile(key, bytes, "application/pdf");
      const createdAt = addDays(now, -v.daysAgo);
      const version = await prisma.documentVersion.create({
        data: {
          organizationId,
          documentId: document.id,
          versionNumber,
          fileName,
          mimeType: "application/pdf",
          sizeBytes: bytes.byteLength,
          storageDriver,
          storageKey: key,
          changeNote: v.changeNote,
          requiresReacknowledgement: Boolean(v.requiresReacknowledgement),
          uploadedById: author.id,
          createdAt,
        },
      });
      versionIds.push({ id: version.id, versionNumber, createdAt });
      if (versionNumber > 1) {
        audit.push(
          auditRow(organizationId, {
            entityType: "Document",
            entityId: document.id,
            action: "DOCUMENT_VERSION_ADDED",
            actor: author,
            changes: { versionNumber: { from: versionNumber - 1, to: versionNumber }, fileName, requiresReacknowledgement: Boolean(v.requiresReacknowledgement) },
            createdAt,
          }),
        );
      }
    }
    const current = versionIds[versionIds.length - 1]!;
    await prisma.document.update({ where: { id: document.id }, data: { currentVersionId: current.id } });

    if (spec.status !== "PUBLISHED" || !spec.ackShare) continue;

    // Signed acknowledgements (and the file-access evidence that precedes each one).
    const population = await prisma.user.findMany({ where: populationWhere(organizationId, audiences), select: { id: true, name: true, email: true }, orderBy: { id: "asc" } });
    const acks: Prisma.DocumentAcknowledgementCreateManyInput[] = [];
    for (const version of versionIds) {
      const share = spec.ackShare[version.versionNumber];
      if (!share) continue;
      const since = publishedAt && publishedAt > version.createdAt ? publishedAt : version.createdAt;
      const chosen = pickShare(population, share, `${spec.referenceCode}-v${version.versionNumber}`).filter((u) => !outstanding.has(u.id));
      for (const email of options.acknowledged?.[spec.referenceCode] ?? []) {
        const person = population.find((u) => u.email === email);
        if (person && !chosen.includes(person)) chosen.push(person);
      }
      chosen.forEach((u, i) => {
        const openedAt = addDays(since, 0.5 + (i % 9));
        const acknowledgedAt = new Date(Math.min(addDays(openedAt, 0.02).getTime(), now.getTime() - 60_000));
        const fields = {
          organizationId,
          documentId: document.id,
          documentTitle: spec.title,
          versionId: version.id,
          versionNumber: version.versionNumber,
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          statement: ACKNOWLEDGEMENT_STATEMENT,
          acknowledgedAt,
          clientAcknowledgedAt: null,
          source: "ONLINE",
          ipAddress: "10.0.0.10",
          userAgent: "seed",
        };
        acks.push({ ...fields, signature: sign(acknowledgementSigningPayload(fields)) });
        audit.push(
          auditRow(organizationId, {
            entityType: "DocumentVersion",
            entityId: version.id,
            action: "DOCUMENT_FILE_ACCESSED",
            actor: u,
            metadata: { documentId: document.id, versionNumber: version.versionNumber, disposition: "inline" },
            createdAt: new Date(Math.min(openedAt.getTime(), acknowledgedAt.getTime() - 1000)),
          }),
          auditRow(organizationId, {
            entityType: "Document",
            entityId: document.id,
            action: "DOCUMENT_ACKNOWLEDGED",
            actor: u,
            metadata: { versionId: version.id, versionNumber: version.versionNumber, source: "ONLINE", clientAcknowledgedAt: null },
            createdAt: acknowledgedAt,
          }),
        );
      });
    }
    await prisma.documentAcknowledgement.createMany({ data: acks });
    console.log(`    ${spec.title}: ${versionIds.length} version(s), ${acks.length} acknowledgement(s)`);
  }

  for (let i = 0; i < audit.length; i += 500) {
    await prisma.auditLog.createMany({ data: audit.slice(i, i + 500) });
  }
}
