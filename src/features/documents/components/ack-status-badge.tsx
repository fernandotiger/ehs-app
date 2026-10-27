import { StatusBadge } from "@/components/common/status-badge";
import type { MyAckStatus } from "@/server/modules/documents/document.dto";
import { formatDate } from "../format";

/** Employee-facing acknowledgement pill: required · overdue · acknowledged on … · pending sync. */
export function AckStatusBadge({
  status,
  acknowledgedAt,
  pendingSync = false,
  className,
}: {
  status: MyAckStatus;
  acknowledgedAt?: string | null;
  pendingSync?: boolean;
  className?: string;
}) {
  if (pendingSync && status !== "acknowledged") {
    return (
      <StatusBadge tone="info" dot className={className}>
        Acknowledgement pending sync
      </StatusBadge>
    );
  }
  switch (status) {
    case "acknowledged":
      return (
        <StatusBadge tone="success" dot className={className}>
          Acknowledged{acknowledgedAt ? ` on ${formatDate(acknowledgedAt)}` : ""}
        </StatusBadge>
      );
    case "overdue":
      return (
        <StatusBadge tone="danger" dot className={className}>
          Overdue
        </StatusBadge>
      );
    case "outstanding":
      return (
        <StatusBadge tone="warning" dot className={className}>
          Acknowledgement required
        </StatusBadge>
      );
    default:
      return null;
  }
}
