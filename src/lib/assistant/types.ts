import type { AssistantConfigValues } from "@/lib/validation/assistant";

/** AI assistant – shapes returned by the API (shared by the server and the browser). */

export type AssistantConfigDto = AssistantConfigValues;

/** GET /api/assistant – what the chat pop-up needs. */
export interface AssistantStatusDto {
  /** "ready" = the button works; "disabled" = switched off; "not-configured" = no OpenRouter key on the server. */
  state: "ready" | "disabled" | "not-configured";
  name: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  /** May open Configuration → AI assistant (admins see the set-up hint instead of a hidden button). */
  canConfigure: boolean;
}

/** GET/PUT /api/configuration/assistant */
export interface AssistantConfigView {
  value: AssistantConfigDto;
  version: number;
  /** OPENROUTER_API_KEY is set on the server (the key itself never leaves the server). */
  keyConfigured: boolean;
  /** The built-in guide, for "Use the built-in guide". */
  defaultKnowledgeText: string;
}
