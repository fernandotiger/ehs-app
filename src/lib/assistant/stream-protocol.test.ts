import { describe, expect, it } from "vitest";
import { historyForRequest, type ChatTurn } from "./history";
import { createStreamEventDecoder, encodeStreamEvent } from "./stream-protocol";

describe("stream events", () => {
  it("round-trips events, including lines split across chunks", () => {
    const wire = encodeStreamEvent({ type: "delta", text: "Open **Docs**\n" }) + encodeStreamEvent({ type: "done", model: "openrouter/free" });
    const decoder = createStreamEventDecoder();
    const events = [...decoder.push(wire.slice(0, 15)), ...decoder.push(wire.slice(15)), ...decoder.flush()];
    expect(events).toEqual([
      { type: "delta", text: "Open **Docs**\n" },
      { type: "done", model: "openrouter/free" },
    ]);
  });

  it("skips broken or unknown lines", () => {
    const decoder = createStreamEventDecoder();
    expect(decoder.push('{"type":"delta"}\nnot json\n{"type":"other"}\n{"type":"error","code":"busy","message":"Busy","partial":false}\n')).toEqual([
      { type: "error", code: "busy", message: "Busy", partial: false },
    ]);
  });
});

const turn = (role: ChatTurn["role"], content: string, status?: ChatTurn["status"]): ChatTurn => ({ id: Math.random().toString(36), role, content, status });

describe("historyForRequest", () => {
  it("sends answered pairs plus the new question", () => {
    const turns = [turn("user", "q1"), turn("assistant", "a1", "done")];
    expect(historyForRequest(turns, "q2")).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });

  it("leaves out questions whose answer failed or was stopped", () => {
    const turns = [turn("user", "q1"), turn("assistant", "half", "error"), turn("user", "q2"), turn("assistant", "", "stopped"), turn("user", "q3"), turn("assistant", "a3", "done")];
    expect(historyForRequest(turns, "q4").map((m) => m.content)).toEqual(["q3", "a3", "q4"]);
  });

  it("keeps the newest messages and starts with a question", () => {
    const turns = [turn("user", "q1"), turn("assistant", "a1", "done"), turn("user", "q2"), turn("assistant", "a2", "done")];
    expect(historyForRequest(turns, "q3", 4).map((m) => m.content)).toEqual(["q2", "a2", "q3"]);
  });
});
