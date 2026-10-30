/**
 * AI assistant – built-in defaults and limits shared by the API, the Configuration page and the
 * chat pop-up. A tenant without an AssistantConfig row uses these values (plus the built-in
 * guide, src/server/modules/assistant/default-knowledge.ts).
 */

/**
 * OpenRouter's Free Models Router: picks one of the currently available free models for each
 * request (https://openrouter.ai/docs/guides/routing/routers/free-router). Free models change
 * often, so the router is the safest default.
 */
export const DEFAULT_ASSISTANT_MODEL = "openrouter/free";

/** Tried once when the router fails (busy / unavailable). A specific free model – check it still exists in the OpenRouter model list. */
export const DEFAULT_ASSISTANT_FALLBACK_MODEL = "google/gemma-4-31b-it:free";

export const DEFAULT_ASSISTANT_NAME = "OleoQ Assistant";

export const DEFAULT_ASSISTANT_WELCOME =
  "Hi! I can help you find your way around OleoQ – where things are and how to do them, step by step. What would you like to do?";

export const DEFAULT_ASSISTANT_SUGGESTIONS = [
  "How do I report an incident?",
  "How do I upload a new version of a document?",
  "Where do I see the work assigned to me?",
  "How do I create an action?",
];

export const DEFAULT_ASSISTANT_TEMPERATURE = 0.3;
export const DEFAULT_ASSISTANT_MAX_TOKENS = 1024;

export const ASSISTANT_LIMITS = {
  /** Characters per chat message (user or assistant). */
  messageChars: 4000,
  /** Messages the client may send per request (recent history + the new question). */
  messages: 20,
  /** Messages actually forwarded to the model (the newest ones). */
  historyMessages: 12,
  /** Characters of history forwarded to the model (oldest dropped first; the new question always stays). */
  historyChars: 16_000,
  knowledgeChars: 80_000,
  /** Shown as a hint on the Configuration page – longer guides are slower and may not fit small models. */
  knowledgeCharsRecommended: 40_000,
  suggestions: 4,
  suggestionChars: 120,
  nameChars: 60,
  welcomeChars: 600,
  modelChars: 120,
  minTokens: 100,
  maxTokens: 4000,
} as const;

/** Where admins are told to put the key (shown in the pop-up and on the Configuration page). */
export const ASSISTANT_KEY_ENV = "OPENROUTER_API_KEY";
