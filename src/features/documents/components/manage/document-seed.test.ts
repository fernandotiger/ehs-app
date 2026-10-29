import { describe, expect, it } from "vitest";
import { sanitiseSnapshot } from "@/lib/favourites/snapshot";
import { EMPTY_AUDIENCE, type UpdateDocumentInput } from "@/lib/validation/documents";
import { knownStructureOf, mergeDocument, pickDocument } from "./document-seed";

const fresh: UpdateDocumentInput = {
  title: "",
  description: "",
  referenceCode: "",
  categoryName: "",
  tags: [],
  audience: EMPTY_AUDIENCE,
  ack: { requiresAcknowledgement: true, ackDueDays: 14, reminderIntervalDays: 7, escalationDays: 21, escalationTarget: "MANAGER" },
};

const typed: UpdateDocumentInput = {
  title: "Fire evacuation procedure",
  description: "What to do when the alarm sounds",
  referenceCode: "HS-PRO-004",
  categoryName: "Fire safety",
  tags: ["Fire safety", "Induction"],
  audience: { ...EMPTY_AUDIENCE, siteIds: ["site-cork"], roleIds: ["role-manager"], userIds: ["u-emma"] },
  ack: { requiresAcknowledgement: true, ackDueDays: 7, reminderIntervalDays: 3, escalationDays: 10, escalationTarget: "HR" },
};

const known = knownStructureOf({
  businessUnits: [{ id: "bu-1", name: "Ports" }],
  sites: [{ id: "site-cork", name: "Cork", businessUnitId: "bu-1" }],
  locations: [],
  departments: [],
  roles: [{ id: "role-manager", name: "Manager", key: "manager" }],
});

describe("pickDocument", () => {
  it("keeps the details and settings the user changed", () => {
    expect(pickDocument(typed, fresh)).toEqual(typed);
    expect(pickDocument({ ...fresh, title: "Fire" }, fresh)).toEqual({ title: "Fire" });
  });

  it("keeps nothing for an untouched form – and never a file or upload id", () => {
    expect(sanitiseSnapshot(pickDocument(fresh, fresh))).toBeNull();
    expect(sanitiseSnapshot({ ...pickDocument(typed, fresh), uploadId: "up1" })).not.toHaveProperty("uploadId");
  });
});

describe("mergeDocument", () => {
  const seed = sanitiseSnapshot(pickDocument(typed, fresh))!;

  it("restores the details and settings and reports kept acknowledgement settings", () => {
    expect(mergeDocument(fresh, seed, { known })).toEqual({ values: typed, ackKept: true });
  });

  it("drops roles and structure nodes that no longer exist (named people stay)", () => {
    const { values } = mergeDocument(fresh, { audience: { ...typed.audience, siteIds: ["site-gone"], roleIds: ["role-manager", "role-gone"] } }, { known });
    expect(values.audience).toEqual({ ...EMPTY_AUDIENCE, roleIds: ["role-manager"], userIds: ["u-emma"] });
  });

  it("falls back on odd values: out-of-range days, unknown escalation, long or duplicate tags", () => {
    const { values, ackKept } = mergeDocument(fresh, {
      ack: { requiresAcknowledgement: "yes", ackDueDays: 999, reminderIntervalDays: 0, escalationDays: 5, escalationTarget: "CEO" },
      tags: ["Fire", "fire", "x".repeat(41), 7],
      title: ["not", "text"],
    });
    expect(ackKept).toBe(true);
    expect(values.ack).toEqual({ ...fresh.ack, escalationDays: 5 });
    expect(values.tags).toEqual(["Fire"]);
    expect(values.title).toBe("");
  });

  it("an empty seed gives the fresh form without kept acknowledgement settings", () => {
    expect(mergeDocument(fresh, {})).toEqual({ values: fresh, ackKept: false });
  });
});
