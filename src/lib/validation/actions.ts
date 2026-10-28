import { z } from "zod";
import { ACTION_PRIORITIES, ACTION_STATUSES } from "../actions";
import { optionalId, paginationQuerySchema } from "./common";

/** Zod schemas shared by the Actions screens and the API. Business gates live in src/server/modules/actions/workflow.ts. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const actionDate = z.string().trim().regex(DATE, "Use a valid date");
const expectedVersion = z.number().int().min(1);
const answers = z.record(z.string(), z.unknown()).default({});

const actionFields = {
  title: z.string().trim().max(200, "Use at most 200 characters").default(""),
  description: z.string().trim().max(5000, "Use at most 5000 characters").default(""),
  ownerId: optionalId,
  dueDate: actionDate,
  priority: z.enum(ACTION_PRIORITIES).default("NORMAL"),
  /** Where the action applies (department); empty = the whole company. */
  departmentId: optionalId,
  /** Answers to the extra questions of the captured Form Builder form. */
  answers,
};

export const actionCreateSchema = z.object({
  ...actionFields,
  /** Client-generated id – a repeated submit returns the action already created. */
  clientId: z.string().trim().min(8).max(64).optional(),
  /** Published version of an Actions form (extra questions); omit when no form is used. */
  formVersionId: optionalId,
});
export type ActionCreateInput = z.infer<typeof actionCreateSchema>;

export const actionUpdateSchema = z.object({ ...actionFields, expectedVersion });
export type ActionUpdateInput = z.infer<typeof actionUpdateSchema>;

export const actionVersionSchema = z.object({ expectedVersion });

export const actionCompleteSchema = z.object({
  notes: z.string().trim().max(5000, "Use at most 5000 characters").default(""),
  completedOn: z.string().trim().max(10).default(""),
  expectedVersion,
});
export type ActionCompleteInput = z.infer<typeof actionCompleteSchema>;

export const actionCancelSchema = z.object({
  reason: z.string().trim().max(2000, "Use at most 2000 characters").default(""),
  expectedVersion,
});
export type ActionCancelInput = z.infer<typeof actionCancelSchema>;

const optionalFlag = z.enum(["true", "false"]).optional();

export const ACTION_LIST_VIEWS = ["mine", "assigned", "created", "all"] as const;
export type ActionListView = (typeof ACTION_LIST_VIEWS)[number];

export const actionListQuerySchema = paginationQuerySchema.extend({
  /** mine = assigned to me or created by me (default); all = every action I may see. */
  view: z.enum(ACTION_LIST_VIEWS).default("mine"),
  /** ACTIVE = To do or In progress (default); ALL = every status. */
  status: z.enum([...ACTION_STATUSES, "ACTIVE", "ALL"]).default("ACTIVE"),
  priority: z.enum(ACTION_PRIORITIES).optional(),
  overdue: optionalFlag,
  sort: z.enum(["dueDate", "reference", "priority", "updatedAt"]).default("dueDate"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ActionListQuery = z.infer<typeof actionListQuerySchema>;
