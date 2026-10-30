import { z } from "zod";
import { ASSISTANT_LIMITS as L } from "@/lib/assistant/defaults";

/** AI assistant – schemas shared by the chat pop-up, Configuration → AI assistant and the API. */

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .trim()
    .min(1, "Type a question")
    .max(L.messageChars, `Keep messages to ${L.messageChars.toLocaleString("en-IE")} characters or fewer`),
});

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

const messagesSchema = z
  .array(assistantMessageSchema)
  .min(1, "Type a question")
  .max(L.messages, "The conversation is too long – clear it and ask again")
  .refine((list) => list[list.length - 1]?.role === "user", "The last message must be your question");

/** The page the person is on ("/documents/manage") – helps the assistant point to the right place. */
const pageSchema = z
  .string()
  .max(200)
  .refine((v) => v.startsWith("/") && !v.startsWith("//"), "Not a page of this application")
  .optional();

/** POST /api/assistant/chat */
export const assistantChatSchema = z.object({
  messages: messagesSchema,
  page: pageSchema,
});

export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

/** "openrouter/free", "google/gemma-4-31b-it:free", "~openai/gpt-sol-latest". */
const MODEL_ID = /^~?[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export const assistantModelSchema = z
  .string()
  .trim()
  .min(1, "Enter a model id, e.g. openrouter/free")
  .max(L.modelChars, "The model id is too long")
  .regex(MODEL_ID, "Use an OpenRouter model id such as openrouter/free or vendor/model:free");

/** Configuration → AI assistant (PUT /api/configuration/assistant). */
export const assistantConfigSchema = z.object({
  enabled: z.boolean(),
  name: z.string().trim().min(1, "Enter a name").max(L.nameChars, `Keep the name to ${L.nameChars} characters or fewer`),
  welcomeMessage: z
    .string()
    .trim()
    .min(1, "Enter a welcome message")
    .max(L.welcomeChars, `Keep the welcome message to ${L.welcomeChars} characters or fewer`),
  suggestedQuestions: z
    .array(z.string().trim().max(L.suggestionChars, `Keep each question to ${L.suggestionChars} characters or fewer`))
    .max(L.suggestions)
    .transform((list) => list.filter((q) => q.length > 0)),
  model: assistantModelSchema,
  /** Empty = no fallback. */
  fallbackModel: z
    .union([assistantModelSchema, z.literal(""), z.null()])
    .transform((v) => (v ? v : null)),
  temperature: z.coerce.number({ error: "Enter a number" }).min(0, "0 to 1.5").max(1.5, "0 to 1.5"),
  maxTokens: z.coerce
    .number({ error: "Enter a number" })
    .int("Whole numbers only")
    .min(L.minTokens, `At least ${L.minTokens}`)
    .max(L.maxTokens, `At most ${L.maxTokens.toLocaleString("en-IE")}`),
  knowledgeText: z
    .string()
    .trim()
    .min(1, "Write the guide the assistant answers from")
    .max(L.knowledgeChars, `Keep the guide to ${L.knowledgeChars.toLocaleString("en-IE")} characters or fewer`),
});

export type AssistantConfigInput = z.input<typeof assistantConfigSchema>;
export type AssistantConfigValues = z.output<typeof assistantConfigSchema>;

export const assistantConfigUpdateSchema = z.object({
  value: assistantConfigSchema,
  expectedVersion: z.number().int().min(1),
});

/** POST /api/configuration/assistant/test – one question against the unsaved settings on screen. */
export const assistantTestSchema = z.object({
  question: assistantMessageSchema.shape.content,
  config: assistantConfigSchema.omit({ enabled: true, welcomeMessage: true, suggestedQuestions: true }),
});

export type AssistantTestInput = z.infer<typeof assistantTestSchema>;
