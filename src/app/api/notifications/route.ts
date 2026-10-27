import { z } from "zod";
import { apiHandler } from "@/server/http/api-handler";
import { notificationService } from "@/server/modules/notifications/notification.service";

const querySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

/** GET /api/notifications */
export const GET = apiHandler({ query: querySchema }, async ({ user, query }) => notificationService.list(user.id, query));

/** POST /api/notifications – { action: "mark-all-read" } */
export const POST = apiHandler(
  { body: z.object({ action: z.literal("mark-all-read") }) },
  async ({ user }) => {
    await notificationService.markAllRead(user.id);
  },
);
