import type { LawChecklist, LawLegislation, LawPackage } from "./content";

/**
 * Fictional demonstration legal content (from the prototype, ../ehs-screens/app/law-model.ts).
 * It asserts no real legal obligation. The 2026.Q3 library is installed by the demo seed; the
 * 2026.Q4 package is the "sample update" offered in Configuration → Law content & settings.
 */

const leg = (x: LawLegislation) => x;

const LEGISLATION: LawLegislation[] = [
  leg({ id: "LEG-001", title: "Workplace safety framework", reference: "DEMO-HS-01", jurisdiction: "Ireland", domain: "Health & Safety", category: "General", level: "Primary", parentId: "", synopsis: "Sample framework for documenting responsibilities, workplace controls and periodic checks. This fictional summary is for presentation only.", sourceUrl: "https://www.irishstatutebook.ie/", keywords: ["workplace", "safety"], active: true }),
  leg({ id: "LEG-002", title: "Safe use of work equipment", reference: "DEMO-HS-02", jurisdiction: "Ireland", domain: "Health & Safety", category: "Machinery", level: "Secondary", parentId: "LEG-001", synopsis: "Illustrative requirements for equipment checks, guarding and competent operation.", sourceUrl: "https://www.irishstatutebook.ie/", keywords: ["machinery", "forklift", "guarding"], active: true }),
  leg({ id: "LEG-003", title: "Workplace transport guidance", reference: "DEMO-HS-03", jurisdiction: "Ireland", domain: "Health & Safety", category: "Workplace transport", level: "Tertiary", parentId: "LEG-002", synopsis: "Illustrative guidance on traffic routes, pedestrian segregation and inspection records.", sourceUrl: "https://www.hsa.ie/", keywords: ["transport", "forklift", "pedestrians"], active: true }),
  leg({ id: "LEG-004", title: "Environmental protection framework", reference: "DEMO-ENV-01", jurisdiction: "Ireland", domain: "Environment", category: "General", level: "Primary", parentId: "", synopsis: "Fictional framework for identifying environmental controls and keeping evidence of their operation.", sourceUrl: "https://www.irishstatutebook.ie/", keywords: ["environment", "emissions", "waste"], active: true }),
  leg({ id: "LEG-005", title: "Waste management requirements", reference: "DEMO-ENV-02", jurisdiction: "Ireland", domain: "Environment", category: "Waste", level: "Secondary", parentId: "LEG-004", synopsis: "Sample controls for segregating waste, checking contractors and maintaining transfer records.", sourceUrl: "https://www.epa.ie/", keywords: ["waste", "contractor"], active: true }),
  leg({ id: "LEG-006", title: "Chemical storage and spill controls", reference: "DEMO-HS-04", jurisdiction: "Ireland", domain: "Health & Safety", category: "Chemical safety", level: "Secondary", parentId: "LEG-001", synopsis: "Illustrative requirements for chemical inventories, storage controls and response evidence.", sourceUrl: "https://www.hsa.ie/", keywords: ["chemicals", "spill", "storage"], active: true }),
];

const checklist = (id: string, title: string, category: string, domain: LawChecklist["domain"], requirements: string, legislationIds: string[], activityKeys: string[], keywords: string[]): LawChecklist => ({
  id,
  title,
  domain,
  category,
  requirements,
  legislationIds,
  activityKeys,
  keywords,
  relatedIds: [],
  active: true,
});

const CHECKLISTS: LawChecklist[] = [
  checklist("CL-001", "Workplace transport controls", "Workplace transport", "Health & Safety", "Document the traffic plan, pedestrian routes, competent operators and periodic route inspections. Keep evidence of the controls being checked.", ["LEG-002", "LEG-003"], ["Workplace transport"], ["forklift", "vehicles", "pedestrians"]),
  checklist("CL-002", "Machine guarding and inspections", "Machinery", "Health & Safety", "Identify machinery in scope, guarding arrangements and inspection responsibilities. Evaluate whether safeguards remain effective.", ["LEG-001", "LEG-002"], ["Machinery"], ["guarding", "equipment"]),
  checklist("CL-003", "Chemical storage and spill readiness", "Chemical safety", "Health & Safety", "Maintain a chemical inventory, describe storage and containment controls, and retain evidence of spill response readiness.", ["LEG-006"], ["Chemicals"], ["chemical", "spill", "containment"]),
  checklist("CL-004", "Waste segregation and contractor records", "Waste", "Environment", "Describe segregation arrangements, contractor checks and record retention. Evaluate these against the waste streams in your profile.", ["LEG-004", "LEG-005"], ["Waste"], ["waste", "contractors"]),
  checklist("CL-006", "Responsibilities and emergency readiness", "General", "Health & Safety", "Document relevant responsibilities, emergency arrangements and the evidence used to review them.", ["LEG-001"], ["Workplace operations"], ["emergency", "responsibility"]),
];

/** The first library (installed by the demo seed). */
export function initialLawPackage(): LawPackage {
  return {
    version: "2026.Q3",
    released: "2026-07-01",
    summary: "Initial fictional compliance content for the Northstar demonstration.",
    legislation: LEGISLATION.map((l) => ({ ...l, keywords: [...l.keywords] })),
    checklists: CHECKLISTS.map((c) => ({ ...c, legislationIds: [...c.legislationIds], activityKeys: [...c.activityKeys], keywords: [...c.keywords], relatedIds: [] })),
  };
}

/** Sample quarterly update: amends Workplace transport, adds an emissions checklist; Machinery unchanged. */
export function sampleLawPackage(): LawPackage {
  const transport = CHECKLISTS[0]!;
  return {
    version: "2026.Q4",
    released: "2026-10-01",
    summary: "Transport controls clarified; new emissions evidence checklist for profiles with air emissions.",
    legislation: [
      { ...LEGISLATION[2]!, keywords: [...LEGISLATION[2]!.keywords], synopsis: "Illustrative transport guidance now highlights review after layout changes and shift checks of pedestrian segregation." },
      { id: "LEG-007", title: "Workplace emissions evidence", reference: "DEMO-ENV-03", jurisdiction: "Ireland", domain: "Environment", category: "Emissions", level: "Secondary", parentId: "LEG-004", synopsis: "Sample recordkeeping and review requirements for workplace emissions controls.", sourceUrl: "https://www.epa.ie/", keywords: ["emissions", "monitoring"], active: true },
    ],
    checklists: [
      { ...transport, legislationIds: [...transport.legislationIds], activityKeys: [...transport.activityKeys], keywords: [...transport.keywords], relatedIds: [], requirements: `${transport.requirements} Review the layout after changes and keep representative shift-check evidence.` },
      checklist("CL-005", "Air emissions monitoring evidence", "Emissions", "Environment", "Describe the emission sources and monitoring arrangements; retain results and evidence of review against applicable conditions.", ["LEG-004", "LEG-007"], ["Air emissions"], ["emissions", "monitoring"]),
    ],
  };
}
