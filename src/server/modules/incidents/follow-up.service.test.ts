import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestionnaireSnapshot } from "@/lib/forms";
import type { CurrentUser } from "@/server/auth/current-user";
import type { DbClient } from "@/server/db/client";

// The contract runs inside the caller's transaction; these tests use an in-memory transaction so
// the real RecordLink idempotency (recordLinkService.ensure) is exercised without a database.
vi.mock("@/server/tenancy/context", () => ({ requireTenantId: () => "org1", resolveTenantId: async () => "org1" }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/audit/audit-service", () => ({ recordAudit: vi.fn(async () => undefined), diff: vi.fn(() => null) }));
vi.mock("@/server/modules/organisation/placement", () => ({
  resolvePlacement: vi.fn(async () => ({ businessUnitId: "bu", siteId: "site-cork", locationId: "loc-w", departmentId: "dep-w" })),
}));
let counter = 0;
vi.mock("@/server/modules/numbering/numbering.service", () => ({ numberingService: { next: vi.fn(async () => `INC-2026-${String(++counter).padStart(4, "0")}`) } }));
const insertAction = vi.fn(async () => ({ id: `act${++counter}`, reference: `ACT-2026-${String(counter).padStart(4, "0")}` }));
vi.mock("./action.service", () => ({ insertAction: (...args: unknown[]) => insertAction(...(args as [])) }));

const SNAPSHOT: QuestionnaireSnapshot = {
  formId: "form1",
  versionId: "v1",
  version: 1,
  name: "Incident report",
  module: "incidents",
  purpose: "REPORT",
  siteId: "site-cork",
  fields: [
    { key: "incidentTitle", label: "Incident title", type: "text", required: true, system: true },
    { key: "occurredAt", label: "Date and time of event", type: "datetime", required: true, system: true },
    { key: "site", label: "Site or location", type: "text", required: true, system: true },
    { key: "whatHappened", label: "What happened?", type: "textarea", required: true, system: true },
  ],
  settings: {},
  capturedAt: "2026-10-20T09:00:00.000Z",
};
vi.mock("./forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forms")>()),
  publishedVersionId: vi.fn(async () => "v1"),
  captureIncidentForm: vi.fn(async () => SNAPSHOT),
}));

const { raiseAction, raiseIncidentDraft } = await import("./follow-up.service");

const user = { id: "u-inspector", name: "Priya Shah", organizationId: "org1", timeZone: "Europe/Dublin" } as CurrentUser;

function memoryTx() {
  const links: Record<string, unknown>[] = [];
  const incidents = new Map<string, Record<string, unknown>>();
  const actions = new Map<string, { reference: string }>();
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    recordLink: {
      findUnique: vi.fn(async ({ where }: { where: { organizationId_sourceType_sourceId_sourceKey_kind: Record<string, string> } }) => {
        const k = where.organizationId_sourceType_sourceId_sourceKey_kind;
        return links.find((l) => l.sourceType === k.sourceType && l.sourceId === k.sourceId && l.sourceKey === k.sourceKey && l.kind === k.kind) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `link${links.length + 1}`, ...data };
        links.push(row);
        if (data.targetType === "CorrectiveAction") actions.set(String(data.targetId), { reference: "ACT" });
        return row;
      }),
    },
    user: { count: vi.fn(async () => 1) },
    correctiveAction: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => actions.get(where.id) ?? null) },
    incidentType: {
      findUnique: vi.fn(async () => ({
        id: "type-insp",
        name: "Inspection Finding",
        key: "inspection-finding",
        isActive: true,
        reportFormId: "form1",
        targetDays: 7,
        assignmentRequired: true,
        multipleInvestigators: true,
        defaultConfidential: false,
        subtypes: [{ id: "sub-general", name: "General", isActive: true, sortOrder: 0 }],
      })),
    },
    incident: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `inc${incidents.size + 1}`;
        incidents.set(id, { id, ...data });
        return { id };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => incidents.get(where.id) ?? null),
    },
    incidentInvestigator: { create: vi.fn(async () => ({})) },
    attachment: { findMany: vi.fn(async () => []), create: vi.fn() },
  };
  return { tx: tx as unknown as DbClient, links, incidents };
}

const source = { type: "InspectionQuestion", id: "insp-1", key: "q-fire-exit", label: "INS-2026-0004 · Fire exits clear?", href: "/inspections/insp-1" };

describe("follow-up contract idempotency", () => {
  beforeEach(() => {
    insertAction.mockClear();
  });

  it("raiseAction twice for the same source returns the same action", async () => {
    const { tx, links } = memoryTx();
    const input = { kind: "corrective-action" as const, description: "Clear the fire exit", ownerId: "u-sam", dueDate: "2026-10-27", placement: { departmentId: "dep-w" }, source };
    const first = await raiseAction(tx, user, input);
    const second = await raiseAction(tx, user, input);
    expect(first.created).toBe(true);
    expect(second).toEqual({ actionId: first.actionId, reference: "ACT", created: false });
    expect(insertAction).toHaveBeenCalledTimes(1);
    expect(links).toHaveLength(1);
    // The action is raised without an incident, keeping the originating context.
    expect(insertAction.mock.calls[0]).toBeDefined();
    const data = (insertAction.mock.calls[0] as unknown as [unknown, unknown, { incidentIds: string[]; source: typeof source; kind: string }])[2];
    expect(data.incidentIds).toEqual([]);
    expect(data.source).toEqual(source);
    expect(data.kind).toBe("CORRECTIVE");
  });

  it("a different question (sourceKey) or kind routes to a new follow-up", async () => {
    const { tx } = memoryTx();
    const base = { description: "x", ownerId: "u-sam", dueDate: "2026-10-27", placement: { departmentId: "dep-w" } };
    const a = await raiseAction(tx, user, { ...base, kind: "corrective-action", source });
    const b = await raiseAction(tx, user, { ...base, kind: "corrective-action", source: { ...source, key: "q-signage" } });
    const c = await raiseAction(tx, user, { ...base, kind: "preventive-action", source });
    expect(new Set([a.actionId, b.actionId, c.actionId]).size).toBe(3);
    expect(insertAction).toHaveBeenCalledTimes(3);
  });

  it("raiseIncidentDraft is idempotent and keeps missing information as a Draft", async () => {
    const { tx, incidents } = memoryTx();
    const input = { typeKey: "inspection-finding", title: "Fire exit blocked", placement: { departmentId: "dep-w" }, ownerId: "u-sam", source };
    const first = await raiseIncidentDraft(tx, user, input);
    const second = await raiseIncidentDraft(tx, user, input);
    expect(first.created).toBe(true);
    expect(first.isDraft).toBe(true);
    expect(second.incidentId).toBe(first.incidentId);
    expect(second.created).toBe(false);
    expect(incidents.size).toBe(1);
    const row = incidents.get(first.incidentId)!;
    expect(row).toMatchObject({ status: "DRAFT", isDraft: true, sourceType: "InspectionQuestion", sourceKey: "q-fire-exit", typeLabel: "Inspection Finding", subtypeLabel: "General" });
    expect((row.reportForm as QuestionnaireSnapshot).versionId).toBe("v1");
  });
});
