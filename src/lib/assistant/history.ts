import { ASSISTANT_LIMITS } from "./defaults";

/**
 * The chat pop-up's conversation (kept in memory only – gone on refresh or sign-out) and the
 * history it sends with each question.
 */

export type ChatTurnStatus = "streaming" | "done" | "error" | "stopped";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant turns only. */
  status?: ChatTurnStatus;
  /** Plain-words problem shown under a failed answer. */
  error?: string;
}

/**
 * Messages for the next request: answered question/answer pairs plus the new question.
 * Questions whose answer failed or was stopped are left out (with their partial answers), so the
 * model only sees a clean conversation. Capped at the newest `historyMessages`.
 */
export function historyForRequest(
  turns: readonly ChatTurn[],
  question: string,
  max: number = ASSISTANT_LIMITS.historyMessages,
): { role: "user" | "assistant"; content: string }[] {
  const pairs: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role !== "user") continue;
    const answer = turns[i + 1];
    if (answer?.role === "assistant" && answer.status === "done" && answer.content.trim()) {
      pairs.push({ role: "user", content: turn.content }, { role: "assistant", content: answer.content });
    }
  }
  const all = [...pairs, { role: "user" as const, content: question }];
  const kept = all.slice(-max);
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept.map((m) => ({ ...m, content: m.content.slice(0, ASSISTANT_LIMITS.messageChars) }));
}
