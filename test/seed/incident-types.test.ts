import { describe, expect, it } from "vitest";
import { validateFormDesign } from "@/lib/forms/form-rules";
import { normaliseLabel } from "@/lib/lookups";
import { INCIDENT_TYPE_CATALOGUE, INCIDENT_TYPE_KEYS, RETIRED_CATALOGUE } from "@/server/modules/incidents/catalogue";
import { DEMO_INCIDENT_QUESTIONNAIRES, demoFormDesign, demoFormName, type DemoPurpose } from "../../prisma/seed/incident-types";
import { NORTHSTAR_INCIDENTS, OLEO_DEMO_INCIDENTS } from "../../prisma/seed/incidents";

const PURPOSES: DemoPurpose[] = ["REPORT", "INVESTIGATION"];

describe("demo incident types (Port of Cork sheet)", () => {
  it("are the sheet's nine types in sheet order, with Other switched off", () => {
    expect(INCIDENT_TYPE_CATALOGUE.map((t) => t.name)).toEqual([
      "Accident",
      "Complaint",
      "Dangerous Occurrence",
      "Inspection Finding",
      "Incident",
      "Near Miss",
      "Occupational Health",
      "Safety Comment",
      "Other",
    ]);
    expect(INCIDENT_TYPE_CATALOGUE.filter((t) => t.isActive === false).map((t) => t.key)).toEqual(["other"]);
  });

  it("give every type distinct subtypes and both questionnaires", () => {
    for (const type of INCIDENT_TYPE_CATALOGUE) {
      expect(type.subtypes.length).toBeGreaterThan(0);
      expect(new Set(type.subtypes.map(normaliseLabel)).size).toBe(type.subtypes.length);
      expect(Object.keys(DEMO_INCIDENT_QUESTIONNAIRES[type.key] ?? {}).sort()).toEqual(["INVESTIGATION", "REPORT"]);
    }
    expect(Object.keys(DEMO_INCIDENT_QUESTIONNAIRES).sort()).toEqual(INCIDENT_TYPE_CATALOGUE.map((t) => t.key).sort());
  });

  it.each(INCIDENT_TYPE_CATALOGUE.flatMap((t) => PURPOSES.map((p) => [t.key, p] as const)))("%s %s form can be published as is", (key, purpose) => {
    const design = demoFormDesign(key, purpose);
    expect(validateFormDesign({ module: "incidents", purpose, ...design }, { forPublish: true })).toEqual([]);
    expect(new Set(design.fields.map((f) => f.key)).size).toBe(design.fields.length);
  });

  it("form names are unique and never the old generic names", () => {
    const names = INCIDENT_TYPE_CATALOGUE.flatMap((t) => PURPOSES.map((p) => demoFormName(t.name, p)));
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("Incident report");
    expect(names).not.toContain("Incident investigation");
    expect(demoFormName("Incident", "REPORT")).toBe("Incident · Report");
  });

  it("seeded demo incidents use the sheet's types and subtypes (fresh database)", () => {
    for (const s of [...NORTHSTAR_INCIDENTS.incidents, ...OLEO_DEMO_INCIDENTS.incidents]) {
      const type = INCIDENT_TYPE_CATALOGUE.find((t) => t.name === s.type);
      expect(type, s.key).toBeDefined();
      expect(type!.subtypes, s.key).toContain(s.subtype);
    }
  });

  it("retire only what the sheet dropped and keep the inspection-finding routing key", () => {
    const keys = INCIDENT_TYPE_CATALOGUE.map((t) => t.key);
    expect(RETIRED_CATALOGUE.types.filter((k) => keys.includes(k))).toEqual([]);
    expect(keys).toContain(INCIDENT_TYPE_KEYS.INSPECTION_FINDING);
    // "First aid" and "Equipment" survive as the sheet's "First Aid" and "Equipment".
    const accident = INCIDENT_TYPE_CATALOGUE.find((t) => t.key === "accident")!;
    expect(accident.subtypes.map(normaliseLabel)).toContain(normaliseLabel(RETIRED_CATALOGUE.subtypes.accident![0]!));
  });
});
