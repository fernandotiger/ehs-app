import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SurveySummaryDto } from "@/server/modules/documents/survey.dto";

export function answersLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "answer" : "answers"}`;
}

/** Small "Response form · 12 answers" marker on library rows and the manage header. */
export function SurveyIndicator({ survey, className }: { survey: SurveySummaryDto | null | undefined; className?: string }) {
  if (!survey) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center gap-1 rounded-full px-2 text-[0.7rem] font-medium whitespace-nowrap",
        survey.status === "ACTIVE" ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <ClipboardList className="size-3" />
      {survey.status === "ACTIVE" ? "Response form" : "Response form closed"} · {answersLabel(survey.participantCount)}
    </span>
  );
}
