import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { initialFields } from "../../src/lib/forms/catalog";
import { defaultFormSettings } from "../../src/lib/forms/settings";
import type { FormFieldDefinition } from "../../src/lib/forms/types";
import type { RiskDomain } from "../../src/lib/risk/scoring";
import type { TenantSeed } from "./common";

/**
 * Published Form Builder forms (version 1) for a tenant. Idempotent: forms that already exist
 * (by name) are left alone, so designer changes made in the app are kept. The incident
 * questionnaires (one Report + one Investigation form per type) come from `incident-types.ts`.
 */

interface FormSpec {
  name: string;
  module: "risk";
  purpose: string;
  domain?: RiskDomain;
  extra: (seed: TenantSeed) => FormFieldDefinition[];
}

const FORMS: FormSpec[] = [
  {
    name: "Health & Safety · 5×5 assessment",
    module: "risk",
    purpose: "5x5",
    domain: "HEALTH_SAFETY",
    extra: () => [
      {
        key: "activityFrequency",
        label: "How often is the activity carried out?",
        type: "select",
        options: [
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
          { value: "rarely", label: "Rarely" },
        ],
      },
    ],
  },
  {
    name: "Environment · FMEA assessment",
    module: "risk",
    purpose: "FMEA",
    domain: "ENVIRONMENT",
    extra: () => [{ key: "receivingEnvironment", label: "Receiving environment", type: "text", placeholder: "e.g. River Lee, storm drain, soil" }],
  },
  {
    name: "Workplace checklist assessment",
    module: "risk",
    purpose: "CHECKLIST",
    domain: "HEALTH_SAFETY",
    extra: () => [{ key: "areaInspected", label: "Area inspected", type: "text" }],
  },
];

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function seedForms(db: PrismaClient, seed: TenantSeed, publishedBy: { id: string; name: string } | null, modules?: string[]): Promise<void> {
  for (const spec of FORMS.filter((f) => !modules || modules.includes(f.module))) {
    const settings = defaultFormSettings(spec.module, spec.purpose, { domain: spec.domain });
    const fields = [...initialFields(spec.module, spec.purpose, settings), ...spec.extra(seed)];
    await publishSeedForm(db, seed.organizationId, { name: spec.name, module: spec.module, purpose: spec.purpose, fields, settings }, publishedBy);
  }
}

/** Creates and publishes (version 1) a form unless one with that name exists. Returns its id. */
export async function publishSeedForm(
  db: PrismaClient,
  organizationId: string,
  spec: { name: string; module: string; purpose: string; fields: FormFieldDefinition[]; settings: Record<string, unknown> },
  publishedBy: { id: string; name: string } | null,
): Promise<{ id: string; created: boolean }> {
  const existing = await db.formDefinition.findFirst({ where: { organizationId, name: spec.name }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const id = await db.$transaction(async (tx) => {
    const form = await tx.formDefinition.create({
      data: {
        organizationId,
        name: spec.name,
        module: spec.module,
        purpose: spec.purpose,
        fields: json(spec.fields),
        settings: json(spec.settings),
        createdById: publishedBy?.id ?? null,
        updatedById: publishedBy?.id ?? null,
      },
    });
    const version = await tx.formVersion.create({
      data: {
        organizationId,
        formId: form.id,
        version: 1,
        name: spec.name,
        module: spec.module,
        purpose: spec.purpose,
        fields: json(spec.fields),
        settings: json(spec.settings),
        publishedById: publishedBy?.id ?? null,
        publishedByName: publishedBy?.name ?? null,
      },
    });
    await tx.formDefinition.update({
      where: { id: form.id },
      data: { status: "PUBLISHED", currentVersion: 1, currentVersionId: version.id, publishedAt: version.publishedAt },
    });
    return form.id;
  });
  return { id, created: true };
}
