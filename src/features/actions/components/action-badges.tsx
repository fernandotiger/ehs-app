import { StatusBadge } from "@/components/common/status-badge";
import { ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS, type ActionPriorityKey, type ActionStatusKey } from "@/lib/actions";
import { ACTION_PRIORITY_TONES, ACTION_STATUS_TONES } from "../format";

/** Status pill; open work past its due date reads "Overdue" in red. */
export function ActionStatusBadge({ status, overdue }: { status: ActionStatusKey; overdue?: boolean }) {
  if (overdue) return <StatusBadge tone="danger">Overdue</StatusBadge>;
  return <StatusBadge tone={ACTION_STATUS_TONES[status]}>{ACTION_STATUS_LABELS[status]}</StatusBadge>;
}

/** Only High and Urgent are worth a pill in lists; Normal/Low stay quiet. */
export function ActionPriorityBadge({ priority, always = false }: { priority: ActionPriorityKey; always?: boolean }) {
  if (!always && (priority === "NORMAL" || priority === "LOW")) return null;
  return <StatusBadge tone={ACTION_PRIORITY_TONES[priority]}>{ACTION_PRIORITY_LABELS[priority]} priority</StatusBadge>;
}
