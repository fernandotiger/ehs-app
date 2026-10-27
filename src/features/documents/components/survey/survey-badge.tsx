import { ClipboardList } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import type { MySurveySummaryDto } from "@/server/modules/documents/survey.dto";
import { MY_SURVEY_STATUS_META } from "../../survey-format";

/**
 * Reader-facing survey pill for document lists: "Survey to answer" (mandatory, not answered yet),
 * "Survey" (optional, not answered yet), nothing once answered, closed or pending sync.
 */
export function SurveyBadge({ survey, pendingSync = false, className }: { survey: MySurveySummaryDto | null | undefined; pendingSync?: boolean; className?: string }) {
  if (!survey || pendingSync) return null;
  if (survey.status === "ANSWERED" || survey.status === "CLOSED") return null;
  const meta = MY_SURVEY_STATUS_META[survey.status];
  return (
    <StatusBadge tone={meta.tone} className={className}>
      <ClipboardList className="size-3.5" />
      {meta.label}
    </StatusBadge>
  );
}
