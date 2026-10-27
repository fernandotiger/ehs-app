import { apiHandler } from "@/server/http/api-handler";
import { notificationService } from "@/server/modules/notifications/notification.service";

/** POST /api/notifications/:id/read */
export const POST = apiHandler({}, async ({ user, params }) => {
  await notificationService.markRead(user.id, params.id!);
});
