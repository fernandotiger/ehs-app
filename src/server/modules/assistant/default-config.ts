import {
  DEFAULT_ASSISTANT_FALLBACK_MODEL,
  DEFAULT_ASSISTANT_MAX_TOKENS,
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_SUGGESTIONS,
  DEFAULT_ASSISTANT_TEMPERATURE,
  DEFAULT_ASSISTANT_WELCOME,
} from "@/lib/assistant/defaults";
import type { AssistantConfigDto } from "@/lib/assistant/types";
import { DEFAULT_ASSISTANT_KNOWLEDGE } from "./default-knowledge";

/** The settings a company has before anyone saves Configuration → AI assistant (also what the demo seed writes). No server-only import, so seeds can use it. */
export function defaultAssistantConfig(): AssistantConfigDto {
  return {
    enabled: true,
    name: DEFAULT_ASSISTANT_NAME,
    welcomeMessage: DEFAULT_ASSISTANT_WELCOME,
    suggestedQuestions: [...DEFAULT_ASSISTANT_SUGGESTIONS],
    model: DEFAULT_ASSISTANT_MODEL,
    fallbackModel: DEFAULT_ASSISTANT_FALLBACK_MODEL,
    temperature: DEFAULT_ASSISTANT_TEMPERATURE,
    maxTokens: DEFAULT_ASSISTANT_MAX_TOKENS,
    knowledgeText: DEFAULT_ASSISTANT_KNOWLEDGE.trim(),
  };
}
