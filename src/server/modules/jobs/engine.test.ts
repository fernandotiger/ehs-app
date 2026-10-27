import { describe, expect, it } from "vitest";
import { defaultJobInput, scheduledJobInputSchema, type ScheduledJobInput } from "@/lib/jobs";
import {
  addDays,
  dateMatch,
  dayDiff,
  digestDedupeKey,
  individualDedupeKey,
  localParts,
  matchJob,
  mergeDigestItems,
  myWorkGroup as groupFor,
  planDigests,
  planIndividual,
  scheduleDue,
  toDigestItem,
  type EngineJob,
  type RoleHolder,
} from "./engine";
import type { DueWorkItem } from "./types";

// Examples use local date 20 October 2026 (a Tuesday) in Europe/Dublin (IST, UTC+1).
const TODAY = "2026-10-20";
const DUBLIN = { businessUnitId: "bu-ops", siteId: "site-dublin", locationId: "loc-floor", departmentId: "dep-eng" };
const CORK = { businessUnitId: "bu-ops", siteId: "site-cork", locationId: "loc-warehouse", departmentId: "dep-3p" };

function job(overrides: Partial<EngineJob> = {}): EngineJob {
  return {
    id: "job1",
    kind: "OVERDUE",
    targets: ["risk.review", "incident.action", "document.acknowledgement"],
    scopeType: "COMPANY",
    scopeId: null,
    frequency: "DAILY",
    weekday: null,
    dayOfMonth: null,
    runTime: "08:00",
    timeZone: "Europe/Dublin",
    overdueDays: 2,
    upcomingDays: 7,
    recipients: { owners: true, roleIds: [] },
    delivery: "INDIVIDUAL",
    escalation: null,
    enabled: true,
    ...overrides,
  };
}

function item(id: string, dueDate: string, overrides: Partial<DueWorkItem> = {}): DueWorkItem {
  return {
    provider: "incident.action",
    entityType: "CorrectiveAction",
    entityId: id,
    title: `Action ${id}`,
    href: `/incidents/actions/${id}`,
    dueDate,
    ownerId: "sam",
    placement: DUBLIN,
    ...overrides,
  };
}

describe("local dates", () => {
  it("uses the job's time zone for today", () => {
    // 23:30 UTC on 19 Oct is already 20 Oct 00:30 in Dublin.
    expect(localParts(new Date("2026-10-19T23:30:00Z"), "Europe/Dublin").date).toBe("2026-10-20");
    expect(localParts(new Date("2026-10-19T23:30:00Z"), "America/New_York").date).toBe("2026-10-19");
    const parts = localParts(new Date("2026-10-20T06:59:00Z"), "Europe/Dublin");
    expect(parts).toMatchObject({ time: "07:59", weekday: 2, day: 20, daysInMonth: 31 });
  });
  it("counts whole calendar days", () => {
    expect(dayDiff("2026-10-17", TODAY)).toBe(3);
    expect(dayDiff(TODAY, "2026-10-27")).toBe(7);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("J-01 threshold boundaries", () => {
  it("overdue threshold 2: only 17 and 18 October match; today is not overdue", () => {
    const j = job({ overdueDays: 2 });
    const matched = ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"].filter((d) => dateMatch(j, d, TODAY).matched);
    expect(matched).toEqual(["2026-10-17", "2026-10-18"]);
    expect(dateMatch(job({ overdueDays: 1 }), TODAY, TODAY).matched).toBe(false);
  });
  it("upcoming window of 7 days is inclusive: 20–27 October", () => {
    const j = job({ kind: "UPCOMING", upcomingDays: 7 });
    const dates = ["2026-10-19", "2026-10-20", "2026-10-23", "2026-10-27", "2026-10-28"];
    expect(dates.filter((d) => dateMatch(j, d, TODAY).matched)).toEqual(["2026-10-20", "2026-10-23", "2026-10-27"]);
  });
  it("a digest covers all eligible open work", () => {
    expect(dateMatch(job({ kind: "DIGEST" }), "2027-01-01", TODAY).matched).toBe(true);
  });
});

describe("matching scope, targets and recipients", () => {
  it("ignores work types the job does not include", () => {
    const j = job({ targets: ["risk.review"] });
    expect(matchJob(j, [item("a", "2026-10-01")], [], TODAY)).toHaveLength(0);
  });

  it("J-05: Cork scope, owners, escalation to a Cork-scoped role (deduplicated)", () => {
    const SITE_MANAGER = "role-site-manager";
    const holders: RoleHolder[] = [
      { userId: "sam", roleId: SITE_MANAGER, scopeType: "SITE", scopeId: "site-cork" },
      { userId: "dana", roleId: SITE_MANAGER, scopeType: "SITE", scopeId: "site-dublin" },
      { userId: "emma", roleId: SITE_MANAGER, scopeType: "COMPANY", scopeId: null },
    ];
    const j = job({ scopeType: "SITE", scopeId: "site-cork", overdueDays: 2, escalation: { afterDays: 7, roleIds: [SITE_MANAGER] } });
    const corkAction = item("cork", "2026-10-10", { placement: CORK, ownerId: "liam" });
    const dublinAction = item("dublin", "2026-10-19", { placement: DUBLIN, ownerId: "priya" });
    const matches = matchJob(j, [corkAction, dublinAction], holders, TODAY);
    expect(matches.map((m) => m.item.entityId)).toEqual(["cork"]);
    const [m] = matches;
    expect(m!.daysOverdue).toBe(10);
    expect(m!.escalated).toBe(true);
    // Sam (Cork) and Emma (company) cover Cork; Dana's Dublin assignment does not.
    expect(m!.recipients).toEqual(["liam", "sam", "emma"]);
    expect(m!.escalationRecipients).toEqual(["sam", "emma"]);

    // Sam as owner: not added twice and not counted as an escalation recipient.
    const owned = matchJob(j, [{ ...corkAction, ownerId: "sam" }], holders, TODAY)[0]!;
    expect(owned.recipients).toEqual(["sam", "emma"]);
    expect(owned.escalationRecipients).toEqual(["emma"]);
  });

  it("no escalation below the extra threshold", () => {
    const j = job({ escalation: { afterDays: 7, roleIds: ["r"] } });
    const [m] = matchJob(j, [item("a", "2026-10-15")], [{ userId: "boss", roleId: "r", scopeType: "COMPANY", scopeId: null }], TODAY);
    expect(m!.escalated).toBe(false);
    expect(m!.recipients).toEqual(["sam"]);
  });

  it("role recipients need an assignment covering the item", () => {
    const j = job({ recipients: { owners: false, roleIds: ["ehs"] } });
    const holders: RoleHolder[] = [
      { userId: "dept-lead", roleId: "ehs", scopeType: "DEPARTMENT", scopeId: "dep-eng" },
      { userId: "cork-lead", roleId: "ehs", scopeType: "LOCATION", scopeId: "loc-warehouse" },
    ];
    const [m] = matchJob(j, [item("a", "2026-10-01")], holders, TODAY);
    expect(m!.recipients).toEqual(["dept-lead"]);
  });

  it("J-06: awaiting-effectiveness work uses the reviewer and the review date", () => {
    const j = job({ kind: "UPCOMING", upcomingDays: 3 });
    const action = item("a", "2026-10-22", { ownerId: "sam", reviewerId: "alex" });
    const [m] = matchJob(j, [action], [], TODAY);
    expect(m!.recipients).toEqual(["alex"]);
    expect(m!.daysUntil).toBe(2);
  });
});

describe("J-03 deduplication keys", () => {
  it("one reminder per job, record, recipient and local day", () => {
    const j = job();
    const matches = matchJob(j, [item("a", "2026-10-10")], [], TODAY);
    const first = planIndividual(j.id, matches, TODAY);
    const second = planIndividual(j.id, matches, TODAY);
    expect(first.map((d) => d.dedupeKey)).toEqual(["job:job1:CorrectiveAction:a:sam:2026-10-20"]);
    expect(second.map((d) => d.dedupeKey)).toEqual(first.map((d) => d.dedupeKey));
    expect(individualDedupeKey(j.id, matches[0]!.item, "sam", "2026-10-21")).not.toBe(first[0]!.dedupeKey);
  });
});

describe("J-04 recipient digest", () => {
  it("groups items per recipient and adds only new items on re-runs", () => {
    const j = job({ kind: "DIGEST", delivery: "DIGEST" });
    const three = ["a", "b", "c"].map((id) => item(id, "2026-10-25"));
    const [digest] = planDigests(j.id, matchJob(j, three, [], TODAY), TODAY);
    expect(digest!.dedupeKey).toBe(digestDedupeKey("job1", "sam", TODAY));
    expect(digest!.items).toHaveLength(3);

    const four = planDigests(j.id, matchJob(j, [...three, item("d", "2026-10-26")], [], TODAY), TODAY)[0]!;
    const second = mergeDigestItems(digest!.items, four.items);
    expect(second.added).toBe(1);
    expect(second.items.map((i) => i.entityId)).toEqual(["a", "b", "c", "d"]);

    const third = mergeDigestItems(second.items, four.items);
    expect(third.added).toBe(0);
    expect(toDigestItem(item("x", TODAY, { reference: "INC-1" })).title).toBe("INC-1 · Action x");
  });
});

describe("J-07 schedule gating and pause", () => {
  const weekdays = job({ frequency: "WEEKDAYS", runTime: "08:00" });
  const none = new Set<string>();
  it("does not run before the local run time", () => {
    expect(scheduleDue(weekdays, new Date("2026-10-20T06:59:00Z"), none)).toMatchObject({ due: false, reason: "before-run-time" });
    expect(scheduleDue(weekdays, new Date("2026-10-20T07:01:00Z"), none)).toMatchObject({ due: true, localDate: TODAY });
  });
  it("runs once per local day on a schedule", () => {
    expect(scheduleDue(weekdays, new Date("2026-10-20T15:00:00Z"), new Set([TODAY]))).toMatchObject({ due: false, reason: "already-ran-today" });
  });
  it("weekends do not match Weekdays; paused jobs never run", () => {
    expect(scheduleDue(weekdays, new Date("2026-10-24T10:00:00Z"), none)).toMatchObject({ due: false, reason: "not-scheduled-today" });
    expect(scheduleDue({ ...weekdays, enabled: false }, new Date("2026-10-20T10:00:00Z"), none)).toMatchObject({ due: false, reason: "paused" });
  });
  it("weekly and monthly frequencies (day 31 runs on the last day of shorter months)", () => {
    expect(scheduleDue(job({ frequency: "WEEKLY", weekday: 2 }), new Date("2026-10-20T10:00:00Z"), none).due).toBe(true);
    expect(scheduleDue(job({ frequency: "WEEKLY", weekday: 1 }), new Date("2026-10-20T10:00:00Z"), none).due).toBe(false);
    expect(scheduleDue(job({ frequency: "MONTHLY", dayOfMonth: 31 }), new Date("2026-11-30T10:00:00Z"), none).due).toBe(true);
    expect(scheduleDue(job({ frequency: "MONTHLY", dayOfMonth: 31 }), new Date("2026-11-29T10:00:00Z"), none).due).toBe(false);
  });
});

describe("J-09 save validation", () => {
  const valid: ScheduledJobInput = { ...defaultJobInput(), name: "Daily overdue", targets: ["incident.action"] };
  const messages = (input: ScheduledJobInput) => {
    const result = scheduledJobInputSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  it("accepts a complete job", () => {
    expect(messages(valid)).toEqual([]);
  });
  it("blocks missing name, targets, recipient route and in-app channel", () => {
    expect(messages({ ...valid, name: " " })).toContain("Enter a job name");
    expect(messages({ ...valid, targets: [] })).toContain("Choose at least one type of work to check");
    expect(messages({ ...valid, recipients: { owners: false, roleIds: [] } })).toContain("Choose who is notified: assigned owners and/or at least one role");
    expect(messages({ ...valid, channels: ["EMAIL"] })).toContain("In-app delivery is required");
  });
  it("escalation cannot start before the first overdue threshold", () => {
    expect(messages({ ...valid, overdueDays: 5, escalation: { afterDays: 3, roleIds: ["r"] } })).toContain("Escalation cannot start before the first overdue reminder");
    expect(messages({ ...valid, overdueDays: 5, escalation: { afterDays: 5, roleIds: ["r"] } })).toEqual([]);
  });
});

describe("My work grouping", () => {
  it("overdue, due this week (next 7 days) and later", () => {
    expect(groupFor("2026-10-19", TODAY)).toBe("overdue");
    expect(groupFor(TODAY, TODAY)).toBe("week");
    expect(groupFor("2026-10-26", TODAY)).toBe("week");
    expect(groupFor("2026-10-27", TODAY)).toBe("later");
  });
});
