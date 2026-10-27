import { describe, expect, it } from "vitest";
import {
  acknowledgementSigningPayload,
  acknowledgementStatus,
  addDays,
  decideReminder,
  dueDateFor,
  overdueCreatedBefore,
  progressPercent,
  reminderWindowCreatedBefore,
  requiredSince,
  resolveAckSettings,
  satisfiesRequirement,
  type EffectiveAckSettings,
} from "./acknowledgement-rules";

const d = (iso: string) => new Date(`${iso}T09:00:00.000Z`);
const settings: EffectiveAckSettings = { ackDueDays: 14, reminderIntervalDays: 3, escalationDays: 7, escalationTarget: "MANAGER" };

describe("effective acknowledgement settings", () => {
  it("falls back to system defaults for unset values", () => {
    expect(
      resolveAckSettings(
        { ackDueDays: null, reminderIntervalDays: 5, escalationDays: null, escalationTarget: "HR" },
        { defaultAckDueDays: 14, defaultReminderIntervalDays: 3, defaultEscalationDays: 7 },
      ),
    ).toEqual({ ackDueDays: 14, reminderIntervalDays: 5, escalationDays: 7, escalationTarget: "HR" });
  });
});

describe("due dates", () => {
  it("starts from publication, or the re-acknowledgement version if later", () => {
    expect(requiredSince(null, d("2026-01-01"))).toBeNull();
    expect(requiredSince(d("2026-01-01"), null)).toEqual(d("2026-01-01"));
    expect(requiredSince(d("2026-01-01"), d("2026-03-01"))).toEqual(d("2026-03-01"));
    // a version uploaded while still a draft counts from publication
    expect(requiredSince(d("2026-03-01"), d("2026-01-01"))).toEqual(d("2026-03-01"));
  });

  it("restarts the clock when acknowledgement is switched on after publication", () => {
    expect(requiredSince(d("2026-01-01"), null, d("2026-04-01"))).toEqual(d("2026-04-01"));
    expect(requiredSince(d("2026-01-01"), d("2026-05-01"), d("2026-04-01"))).toEqual(d("2026-05-01"));
    expect(requiredSince(null, null, d("2026-04-01"))).toBeNull();
  });

  it("gives new joiners their own due window", () => {
    expect(dueDateFor(d("2026-01-01"), d("2025-06-01"), 14)).toEqual(d("2026-01-15"));
    expect(dueDateFor(d("2026-01-01"), d("2026-02-01"), 14)).toEqual(d("2026-02-15"));
  });
});

describe("acknowledgement status", () => {
  const base = { requiresAcknowledgement: true, assigned: true, ackRequiredFromVersion: 2, latestAcknowledgedVersion: null, dueAt: d("2026-02-01"), now: d("2026-01-20") };

  it("is not required when acknowledgement is off or the user is not assigned", () => {
    expect(acknowledgementStatus({ ...base, requiresAcknowledgement: false })).toBe("not_required");
    expect(acknowledgementStatus({ ...base, assigned: false })).toBe("not_required");
  });

  it("counts acknowledgements of the required version or later", () => {
    expect(acknowledgementStatus({ ...base, latestAcknowledgedVersion: 2 })).toBe("acknowledged");
    expect(acknowledgementStatus({ ...base, latestAcknowledgedVersion: 3 })).toBe("acknowledged");
  });

  it("resets after a new version that requires re-acknowledgement", () => {
    expect(acknowledgementStatus({ ...base, latestAcknowledgedVersion: 1 })).toBe("outstanding");
    expect(satisfiesRequirement(1, 2)).toBe(false);
    expect(satisfiesRequirement(1, null)).toBe(true);
    expect(satisfiesRequirement(null, 1)).toBe(false);
  });

  it("is overdue only after the due date", () => {
    expect(acknowledgementStatus({ ...base, now: d("2026-02-01") })).toBe("outstanding");
    expect(acknowledgementStatus({ ...base, now: d("2026-02-02") })).toBe("overdue");
  });

  it("derives the SQL overdue cut-off consistently", () => {
    const now = d("2026-02-10");
    expect(overdueCreatedBefore(null, 14, now)).toBeNull();
    expect(overdueCreatedBefore(d("2026-02-01"), 14, now)).toBeNull();
    expect(overdueCreatedBefore(d("2026-01-01"), 14, now)).toEqual(d("2026-01-27"));
  });

  it("computes progress percentages", () => {
    expect(progressPercent(127, 143)).toBe(89);
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 4)).toBe(100);
  });
});

describe("reminder scheduling", () => {
  const dueAt = d("2026-02-15");

  it("does nothing before the reminder window opens", () => {
    expect(decideReminder({ now: d("2026-02-12"), dueAt, settings, state: null })).toEqual({ remind: false, escalate: false });
  });

  it("sends the first reminder when the due date is approaching", () => {
    expect(decideReminder({ now: d("2026-02-13"), dueAt, settings, state: null })).toEqual({ remind: true, escalate: false });
  });

  it("repeats reminders every interval while outstanding", () => {
    const state = { remindersSent: 1, lastRemindedAt: d("2026-02-13"), escalatedAt: null };
    expect(decideReminder({ now: d("2026-02-15"), dueAt, settings, state }).remind).toBe(false);
    expect(decideReminder({ now: d("2026-02-16"), dueAt, settings, state }).remind).toBe(true);
  });

  it("escalates once when overdue by the escalation days", () => {
    const state = { remindersSent: 3, lastRemindedAt: d("2026-02-21"), escalatedAt: null };
    expect(decideReminder({ now: d("2026-02-21"), dueAt, settings, state }).escalate).toBe(false);
    expect(decideReminder({ now: d("2026-02-22"), dueAt, settings, state }).escalate).toBe(true);
    expect(decideReminder({ now: d("2026-03-01"), dueAt, settings, state: { ...state, escalatedAt: d("2026-02-22") } }).escalate).toBe(false);
  });

  it("never escalates when the target is NONE, and escalates right after due with 0 days", () => {
    expect(decideReminder({ now: d("2026-04-01"), dueAt, settings: { ...settings, escalationTarget: "NONE" }, state: null }).escalate).toBe(false);
    expect(decideReminder({ now: dueAt, dueAt, settings: { ...settings, escalationDays: 0 }, state: null }).escalate).toBe(false);
    expect(decideReminder({ now: addDays(dueAt, 0.01), dueAt, settings: { ...settings, escalationDays: 0 }, state: null }).escalate).toBe(true);
  });

  it("pre-filters users whose reminder window has opened", () => {
    const now = d("2026-02-13");
    expect(reminderWindowCreatedBefore(null, 14, now)).toBeNull();
    expect(reminderWindowCreatedBefore(d("2026-02-10"), 14, now)).toBeNull();
    const bound = reminderWindowCreatedBefore(d("2026-02-01"), 14, now)!;
    expect(bound).toEqual(d("2026-02-01"));
    // every user at or before the bound has an open window
    expect(decideReminder({ now, dueAt: dueDateFor(d("2026-02-01"), bound, 14), settings, state: null }).remind).toBe(true);
  });
});

describe("acknowledgement signing payload", () => {
  it("serialises dates as ISO strings and keeps every canonical field", () => {
    const payload = acknowledgementSigningPayload({
      organizationId: "org-1",
      documentId: "doc",
      documentTitle: "Fire Safety Policy",
      versionId: "v2",
      versionNumber: 2,
      userId: "john",
      userName: "John Murphy",
      userEmail: "john@northstar.example",
      statement: "I confirm",
      acknowledgedAt: d("2026-01-01"),
      clientAcknowledgedAt: null,
      source: "ONLINE",
      ipAddress: null,
      userAgent: "vitest",
    });
    expect(payload.acknowledgedAt).toBe("2026-01-01T09:00:00.000Z");
    expect(Object.keys(payload).sort()).toEqual(
      ["acknowledgedAt", "clientAcknowledgedAt", "documentId", "organizationId", "documentTitle", "ipAddress", "source", "statement", "userAgent", "userEmail", "userId", "userName", "versionId", "versionNumber"].sort(),
    );
  });
});
