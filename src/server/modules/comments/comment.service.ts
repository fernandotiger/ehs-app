import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CommentDto, CreateCommentInput } from "@/lib/validation/evidence";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError } from "@/server/http/errors";
import { requireEntityAccess } from "@/server/modules/entities/registry";

const select = {
  id: true,
  body: true,
  clientId: true,
  createdAt: true,
  authorId: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.CommentSelect;

type Row = Prisma.CommentGetPayload<{ select: typeof select }>;

function toDto(row: Row): CommentDto {
  return { id: row.id, body: row.body, author: row.author, createdAt: row.createdAt.toISOString(), clientId: row.clientId };
}

const PAGE = 200;

/**
 * Discussion on any registered record. Anyone who can view the record can read and add
 * comments; comments are append-only. `clientId` makes offline replays idempotent.
 */
export const commentService = {
  async list(user: CurrentUser, entityType: string, entityId: string): Promise<CommentDto[]> {
    await requireEntityAccess(user, entityType, entityId, "view");
    const rows = await prisma.comment.findMany({ where: { entityType, entityId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: PAGE, select });
    return rows.map(toDto);
  },

  async create(user: CurrentUser, input: CreateCommentInput, meta: RequestMeta): Promise<CommentDto> {
    await requireEntityAccess(user, input.entityType, input.entityId, "view");
    if (input.clientId) {
      const existing = await prisma.comment.findFirst({ where: { clientId: input.clientId }, select });
      if (existing) {
        if (existing.authorId !== user.id) throw new ConflictError("Comment id conflict");
        return toDto(existing);
      }
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const row = await tx.comment.create({
          data: {
            organizationId: user.organizationId,
            entityType: input.entityType,
            entityId: input.entityId,
            authorId: user.id,
            body: input.body.trim(),
            clientId: input.clientId ?? null,
          },
          select,
        });
        await recordAudit(
          { entityType: input.entityType, entityId: input.entityId, action: "COMMENT_ADDED", actor: user, metadata: { commentId: row.id }, meta },
          tx,
        );
        return toDto(row);
      });
    } catch (error) {
      // Same clientId replayed concurrently (online + sync) – return the winner.
      if (input.clientId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await prisma.comment.findFirst({ where: { clientId: input.clientId, authorId: user.id }, select });
        if (winner) return toDto(winner);
      }
      throw error;
    }
  },
};
