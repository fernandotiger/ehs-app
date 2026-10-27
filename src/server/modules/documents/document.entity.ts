import "server-only";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/server/db/client";
import type { EntityDescriptor } from "@/server/modules/entities/types";
import { documentQueryService } from "./document-query.service";

/** Documents in the entity registry (evidence, comments and record links on documents). */
export const documentEntity: EntityDescriptor = {
  module: "documents",
  async label(id) {
    const doc = await prisma.document.findUnique({ where: { id }, select: { title: true, referenceCode: true } });
    if (!doc) return null;
    return doc.referenceCode ? `${doc.referenceCode} · ${doc.title}` : doc.title;
  },
  href: (id) => `/documents/${id}`,
  canView: (user, id) => documentQueryService.canView(user, id),
  async canEdit(user, id) {
    return user.permissions.includes(PERMISSIONS.DOCUMENTS_MANAGE) && (await documentQueryService.exists(id));
  },
};
