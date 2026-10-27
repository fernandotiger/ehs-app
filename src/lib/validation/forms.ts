import { z } from "zod";
import { formFieldDefinitionSchema } from "@/lib/forms/definition-schema";
import { RISK_DOMAINS } from "@/lib/risk/scoring";

/** Form Builder API schemas (designer ↔ /api/forms). Business rules live in src/lib/forms/form-rules.ts. */

const name = z.string().trim().min(1, "Enter a form name").max(80, "Use at most 80 characters");

export const formCreateSchema = z.object({
  name,
  module: z.string().min(1).max(40),
  purpose: z.string().min(1).max(40),
  /** Risk only: Health & Safety or Environment. */
  domain: z.enum(RISK_DOMAINS).optional(),
});
export type FormCreateInput = z.infer<typeof formCreateSchema>;

const fieldsSchema = z.array(formFieldDefinitionSchema).max(100, "A form can have at most 100 questions");
const settingsSchema = z.record(z.string(), z.unknown());

export const formDraftSchema = z.object({
  name: name.optional(),
  fields: fieldsSchema,
  settings: settingsSchema,
  expectedVersion: z.number().int().min(1),
});
export type FormDraftInput = z.infer<typeof formDraftSchema>;

/** Publish the current draft; the designer may send its unsaved design to save and publish at once. */
export const formPublishSchema = z.object({
  name: name.optional(),
  fields: fieldsSchema.optional(),
  settings: settingsSchema.optional(),
  expectedVersion: z.number().int().min(1),
});
export type FormPublishInput = z.infer<typeof formPublishSchema>;

export const riskRulesSchema = z.object({
  settings: settingsSchema,
  expectedVersion: z.number().int().min(1),
});

export const formListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  module: z.string().max(40).optional(),
});

export const publishedFormsQuerySchema = z.object({
  module: z.string().min(1).max(40),
  purpose: z.string().max(40).optional(),
  siteId: z.string().max(64).optional(),
});

export const reusableQuestionsQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  excludeFormId: z.string().max(64).optional(),
});

export const snapshotQuerySchema = z.object({ siteId: z.string().max(64).optional() });
