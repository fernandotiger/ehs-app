import { describe, expect, it } from "vitest";
import { sanitiseSnapshot } from "@/lib/favourites/snapshot";
import type { FormFieldDefinition } from "@/lib/forms";
import { mergeReport, pickReport, type ReportMergeContext } from "./report-seed";
import type { ReportValues } from "./report-wizard";

const fields: FormFieldDefinition[] = [
  { key: "incidentTitle", label: "Incident title", type: "text", system: true },
  { key: "chemical", label: "Chemical", type: "select", options: [{ value: "diesel", label: "Diesel" }, { value: "oil", label: "Oil" }] },
  { key: "spill", label: "Spill size", type: "text" },
  { key: "noticed", label: "Noticed on", type: "date" },
  { key: "photo", label: "Photo", type: "file" },
];

const spillType = {
  id: "t-spill",
  subtypes: [
    { id: "s-small", name: "Small", isActive: true },
    { id: "s-old", name: "Old", isActive: false },
  ],
  defaultConfidential: false,
  multipleInvestigators: true,
  targetDays: 7,
  reportFormVersion: { versionId: "v1", version: 1, name: "Spill report", fields },
};
const nearMiss = { id: "t-nm", subtypes: [], defaultConfidential: true, multipleInvestigators: false, targetDays: 3, reportFormVersion: null };

function fresh(): ReportValues {
  return {
    typeId: "",
    subtypeId: null,
    severity: "MINOR",
    title: "",
    occurredAt: "2026-10-29T10:15",
    departmentId: null,
    preciseLocation: "",
    shift: null,
    narrative: "",
    investigationTargetDate: "2026-11-05",
    targetTouched: false,
    people: [{ name: "", userId: null, personType: "EMPLOYEE", involvement: "INJURED", injuryDetails: null, injuryType: null, bodyPart: null }],
    immediateAction: "",
    firstAid: "",
    nurseNotified: false,
    investigatorIds: [],
    notifyUserIds: [],
    isConfidential: false,
    anonymous: false,
    answers: {},
  } as unknown as ReportValues;
}

const context: ReportMergeContext = { types: [spillType, nearMiss], departmentIds: ["dep-yard", "dep-office"] };

const typed: ReportValues = {
  ...fresh(),
  typeId: "t-spill",
  subtypeId: "s-small",
  severity: "MAJOR",
  title: "Diesel spill at pump 2",
  occurredAt: "2026-10-01T08:00",
  departmentId: "dep-yard",
  preciseLocation: "Fuel bay",
  shift: "Night",
  narrative: "Hose split while refuelling.",
  investigationTargetDate: "2026-10-08",
  targetTouched: true,
  people: [{ name: "Liam", userId: "u-liam", personType: "EMPLOYEE", involvement: "WITNESS" } as ReportValues["people"][number]],
  immediateAction: "Spill kit used",
  firstAid: "None",
  investigatorIds: ["u-helen"],
  notifyUserIds: ["u-sam"],
  isConfidential: true,
  answers: { chemical: "diesel", spill: "About 20 litres", noticed: "2026-10-01", photo: [{ uploadId: "up1", fileName: "spill.jpg" }], stale: "x" },
};

describe("pickReport", () => {
  it("keeps the type and the What & where text – never dates, people, files or the review step", () => {
    const seed = pickReport(typed, fresh(), fields.filter((f) => f.key !== "incidentTitle"));
    expect(seed).toEqual({
      typeId: "t-spill",
      subtypeId: "s-small",
      severity: "MAJOR",
      title: "Diesel spill at pump 2",
      departmentId: "dep-yard",
      preciseLocation: "Fuel bay",
      shift: "Night",
      narrative: "Hose split while refuelling.",
      answers: { chemical: "diesel", spill: "About 20 litres" },
    });
    for (const key of ["occurredAt", "investigationTargetDate", "people", "investigatorIds", "isConfidential", "anonymous", "firstAid"]) expect(seed).not.toHaveProperty(key);
  });

  it("keeps nothing for an untouched form", () => {
    expect(sanitiseSnapshot(pickReport(fresh(), fresh(), fields))).toBeNull();
  });
});

describe("mergeReport", () => {
  const seed = sanitiseSnapshot(pickReport(typed, fresh(), fields))!;

  it("restores the type (with its defaults) and the text; dates stay now-based", () => {
    const { values, typeKept } = mergeReport(fresh(), seed, context);
    expect(typeKept).toBe(true);
    expect(values).toMatchObject({
      typeId: "t-spill",
      subtypeId: "s-small",
      severity: "MAJOR",
      title: "Diesel spill at pump 2",
      departmentId: "dep-yard",
      preciseLocation: "Fuel bay",
      shift: "Night",
      narrative: "Hose split while refuelling.",
      occurredAt: "2026-10-29T10:15",
      investigationTargetDate: "2026-11-05",
      targetTouched: false,
      isConfidential: false,
      anonymous: false,
      investigatorIds: [],
      answers: { chemical: "diesel", spill: "About 20 litres" },
    });
  });

  it("drops a type that is no longer offered, with its subtype and answers (wizard opens on the type step)", () => {
    const { values, typeKept } = mergeReport(fresh(), { ...seed, typeId: "t-removed" }, context);
    expect(typeKept).toBe(false);
    expect(values).toMatchObject({ typeId: "", subtypeId: null, answers: {}, title: "Diesel spill at pump 2" });
  });

  it("drops answers to questions the type's form no longer asks, and an inactive subtype", () => {
    const changed = { ...spillType, subtypes: [{ id: "s-small", name: "Small", isActive: false }], reportFormVersion: { ...spillType.reportFormVersion, fields: [fields[2]!] } };
    const { values } = mergeReport(fresh(), seed, { types: [changed] });
    expect(values.answers).toEqual({ spill: "About 20 litres" });
    expect(values.subtypeId).toBeNull();
  });

  it("never brings back anonymous, files or 'now' dates, even from a hand-made seed", () => {
    const { values } = mergeReport(fresh(), { ...seed, anonymous: true, occurredAt: "2020-01-01T00:00", investigationTargetDate: "2020-01-08", answers: { photo: [{ uploadId: "u", fileName: "a" }] } }, context);
    expect(values.anonymous).toBe(false);
    expect(values.occurredAt).toBe("2026-10-29T10:15");
    expect(values.investigationTargetDate).toBe("2026-11-05");
    expect(values.answers).toEqual({});
  });

  it("ignores a department that no longer exists, unknown fields and odd values", () => {
    const { values } = mergeReport(fresh(), { ...seed, departmentId: "dep-gone", severity: "HUGE", title: 42, unknownField: "x" }, context);
    expect(values.departmentId).toBeNull();
    expect(values.severity).toBe("MINOR");
    expect(values.title).toBe("");
    expect(values).not.toHaveProperty("unknownField");
  });

  it("an empty or broken seed gives the fresh form", () => {
    expect(mergeReport(fresh(), null, context)).toEqual({ values: fresh(), typeKept: false });
  });
});
