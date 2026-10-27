"use client";

import { ChevronRight, CornerDownRight } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/common/status-badge";
import { TASK_KIND_SHORT } from "@/lib/risk/labels";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "../../api";
import { formatDate } from "../../format";
import { TaskStatusBadge } from "../shared";

/** Compact task rows (sub-tasks indented under their parent when both are listed). */
export function TaskList({ tasks, empty = "No tasks yet.", showProgramme = true, showAssessment = false }: { tasks: TaskListItem[]; empty?: string; showProgramme?: boolean; showAssessment?: boolean }) {
  if (!tasks.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const ids = new Set(tasks.map((t) => t.id));
  const top = tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
  const children = (id: string) => tasks.filter((t) => t.parentId === id);
  return (
    <ul className="-mx-2 divide-y">
      {top.flatMap((t) => [t, ...children(t.id)]).map((t) => (
        <li key={t.id}>
          <Link href={`/risk/tasks/${t.id}`} className={cn("flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50", t.parentId && ids.has(t.parentId) && "pl-8")}>
            {t.parentId && ids.has(t.parentId) && <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <span className="text-muted-foreground">{t.reference} · </span>
                {t.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  t.owner.name,
                  `due ${formatDate(t.dueDate)}`,
                  t.factor ? `${t.factorLabel} ${t.originalValue ?? "—"} → ${t.actualValue ?? t.targetValue ?? "?"}` : null,
                  t.hazard ? t.hazard.name : null,
                  showAssessment && t.assessment ? t.assessment.reference : null,
                  showProgramme ? t.programme.title : null,
                  t.subTaskCount ? `${t.subTaskCount - t.openSubTasks}/${t.subTaskCount} sub-tasks done` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <StatusBadge tone="neutral" className="hidden sm:inline-flex">
              {TASK_KIND_SHORT[t.kind]}
            </StatusBadge>
            <TaskStatusBadge status={t.status} overdue={t.overdue} />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
