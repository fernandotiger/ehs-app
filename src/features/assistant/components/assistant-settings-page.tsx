"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Bot, CheckCircle2, KeyRound, MessageSquareText, RotateCcw, Save, Send, Sparkles, Square } from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingCards } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { ASSISTANT_KEY_ENV, ASSISTANT_LIMITS as L } from "@/lib/assistant/defaults";
import type { AssistantConfigDto, AssistantConfigView } from "@/lib/assistant/types";
import { assistantConfigSchema, type AssistantConfigInput, type AssistantConfigValues } from "@/lib/validation/assistant";
import { AssistantRequestError, streamAssistant, useAssistantConfig, useSaveAssistantConfig } from "../api";
import { AssistantMarkdown } from "./assistant-markdown";

const FREE_MODELS_URL = "https://openrouter.ai/models?max_price=0";

/** Four inputs always, so empty suggestion slots can be filled in. */
function toForm(value: AssistantConfigDto): AssistantConfigInput {
  const suggestions = [...value.suggestedQuestions];
  while (suggestions.length < L.suggestions) suggestions.push("");
  return { ...value, suggestedQuestions: suggestions, fallbackModel: value.fallbackModel ?? "" };
}

/** /configuration/assistant – the AI assistant's guide, wording and model, with a test box. */
export function AssistantSettingsPage() {
  const config = useAssistantConfig();
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  if (config.isPending) {
    return (
      <>
        <Header />
        <LoadingCards count={3} className="lg:grid-cols-2" />
      </>
    );
  }
  return <SettingsForm key={config.data.version} view={config.data} onReload={() => void config.refetch()} />;
}

function Header({ actions }: { actions?: React.ReactNode }) {
  return (
    <PageHeader
      title="AI assistant"
      description="The help chatbot behind the ✦ button at the bottom right. It answers questions about using OleoQ from the guide on this page. Conversations are not saved."
      backHref="/configuration"
      backLabel="Configuration"
      actions={actions}
    />
  );
}

function SettingsForm({ view, onReload }: { view: AssistantConfigView; onReload: () => void }) {
  const save = useSaveAssistantConfig();
  const form = useForm<AssistantConfigInput, unknown, AssistantConfigValues>({ resolver: zodResolver(assistantConfigSchema), defaultValues: toForm(view.value) });
  const [stale, setStale] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const dirty = form.formState.isDirty;
  const guard = useUnsavedChangesGuard(dirty);
  const knowledge = useWatch({ control: form.control, name: "knowledgeText" }) ?? "";

  async function onSubmit(values: AssistantConfigValues) {
    try {
      await save.mutateAsync({ value: values, expectedVersion: view.version });
      toast.success("AI assistant settings saved");
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit, () => toast.error("Please check the highlighted fields."))} noValidate>
      {guard.dialog}
      <Header
        actions={
          <>
            <Button type="button" variant="outline" disabled={!dirty || save.isPending} onClick={() => form.reset(toForm(view.value))}>
              <RotateCcw /> Discard
            </Button>
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? <Spinner /> : <Save />} Save changes
            </Button>
          </>
        }
      />
      {stale && <StaleVersionAlert className="mb-4" draft={form.getValues()} draftName="ai-assistant" onReload={onReload} />}
      <KeyStatus configured={view.keyConfigured} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-brand" /> Guide the answers are based on
            </CardTitle>
            <CardDescription>
              Explain how your company uses OleoQ in plain words: menu names, step-by-step paths, who does what. The assistant only answers from this text. Markdown headings and lists help;
              page addresses such as /incidents/new become links in the answers.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <Controller
              name="knowledgeText"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="flex-1">
                  <FieldLabel htmlFor="knowledgeText" className="sr-only">
                    Guide
                  </FieldLabel>
                  <Textarea
                    id="knowledgeText"
                    {...field}
                    aria-invalid={fieldState.invalid}
                    spellCheck
                    className="h-[28rem] resize-y font-mono text-xs leading-relaxed lg:h-auto lg:min-h-[32rem] lg:flex-1 lg:resize-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldDescription className={knowledge.length > L.knowledgeCharsRecommended ? "text-amber-700 dark:text-amber-400" : undefined}>
                      {knowledge.length.toLocaleString("en-IE")} of {L.knowledgeChars.toLocaleString("en-IE")} characters
                      {knowledge.length > L.knowledgeCharsRecommended && " – long guides make answers slower and may not fit small free models"}
                    </FieldDescription>
                    <Button type="button" size="sm" variant="outline" onClick={() => setResetOpen(true)} disabled={knowledge.trim() === view.defaultKnowledgeText}>
                      <RotateCcw /> Use the built-in guide
                    </Button>
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <ConfirmDialog
              open={resetOpen}
              onOpenChange={setResetOpen}
              title="Replace the guide with the built-in one?"
              description="The text on screen is replaced by OleoQ's standard “How to use OleoQ” guide. Nothing is saved until you click Save changes."
              confirmLabel="Replace text"
              onConfirm={() => form.setValue("knowledgeText", view.defaultKnowledgeText, { shouldDirty: true, shouldValidate: true })}
            />
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareText className="size-4 text-brand" /> Pop-up
              </CardTitle>
              <CardDescription>What people see when they open the assistant.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Controller
                  name="enabled"
                  control={form.control}
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Switch id="enabled" checked={field.value} onCheckedChange={field.onChange} />
                      <div>
                        <FieldLabel htmlFor="enabled">Show the assistant</FieldLabel>
                        <FieldDescription>Off hides the button for everyone in your company.</FieldDescription>
                      </div>
                    </Field>
                  )}
                />
                <TextField control={form.control} name="name" label="Name" maxLength={L.nameChars} />
                <Controller
                  name="welcomeMessage"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="welcomeMessage">Welcome message</FieldLabel>
                      <Textarea id="welcomeMessage" rows={3} maxLength={L.welcomeChars} {...field} aria-invalid={fieldState.invalid} />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Suggested questions</legend>
                  {Array.from({ length: L.suggestions }, (_, i) => (
                    <Controller
                      key={i}
                      name={`suggestedQuestions.${i}`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <Input {...field} value={field.value ?? ""} maxLength={L.suggestionChars} placeholder={`Question ${i + 1} (optional)`} aria-label={`Suggested question ${i + 1}`} />
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  ))}
                  <p className="text-sm text-muted-foreground">Shown as buttons under the welcome message. Leave a box empty to show fewer.</p>
                </fieldset>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="size-4 text-brand" /> AI model
              </CardTitle>
              <CardDescription>
                OpenRouter model ids.{" "}
                <a href={FREE_MODELS_URL} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">
                  See the free models
                </a>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <TextField
                  control={form.control}
                  name="model"
                  label="Model"
                  description="openrouter/free picks one of the free models for each question (no cost, 20 questions a minute and 50 a day for the whole company – 1,000 a day once you have bought 10 credits)."
                />
                <TextField
                  control={form.control}
                  name="fallbackModel"
                  label="Fallback model"
                  description="Tried once when the model is busy or unavailable. Leave empty for none. Free model ids end in :free."
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField control={form.control} name="temperature" label="Creativity" inputMode="decimal" description="0 = precise, 1.5 = creative. 0.3 suits help answers." />
                  <TextField control={form.control} name="maxTokens" label="Answer length" inputMode="numeric" description={`Most tokens per answer (${L.minTokens}–${L.maxTokens.toLocaleString("en-IE")}).`} />
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <TestBox control={form.control} keyConfigured={view.keyConfigured} getConfig={() => assistantConfigSchema.safeParse(form.getValues())} />
        </div>
      </div>
    </form>
  );
}

function TextField({
  control,
  name,
  label,
  description,
  maxLength,
  inputMode,
}: {
  control: Control<AssistantConfigInput, unknown, AssistantConfigValues>;
  name: "name" | "model" | "fallbackModel" | "temperature" | "maxTokens";
  label: string;
  description?: string;
  maxLength?: number;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input
            id={name}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={String(field.value ?? "")}
            onChange={(e) => field.onChange(e.target.value)}
            maxLength={maxLength}
            inputMode={inputMode}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function KeyStatus({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        <CheckCircle2 />
        <AlertTitle>Connected</AlertTitle>
        <AlertDescription className="text-emerald-800 dark:text-emerald-300">The OpenRouter API key is set on the server. Use the test box to try a question.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <KeyRound />
      <AlertTitle>Not connected yet – the button is hidden for everyone except administrators</AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        <p>
          Add your OpenRouter API key to the server as <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">{ASSISTANT_KEY_ENV}</code> and restart or redeploy the app. The key
          is never stored in the database or shown in the browser.
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>On this computer: a line in the .env file.</li>
          <li>Vercel: Project → Settings → Environment Variables.</li>
          <li>AWS: a secret in Secrets Manager, passed to the app by the ECS task definition.</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}

type TestState = { status: "idle" } | { status: "streaming" | "done"; text: string; model?: string | null } | { status: "error"; text: string; error: string };

function TestBox({
  control,
  keyConfigured,
  getConfig,
}: {
  control: Control<AssistantConfigInput, unknown, AssistantConfigValues>;
  keyConfigured: boolean;
  getConfig: () => ReturnType<typeof assistantConfigSchema.safeParse>;
}) {
  const [question, setQuestion] = useState("How do I report an incident?");
  const [state, setState] = useState<TestState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const name = useWatch({ control, name: "name" });
  const busy = state.status === "streaming";

  async function ask() {
    const parsed = getConfig();
    if (!parsed.success) {
      toast.error("Please fix the highlighted settings before testing.");
      return;
    }
    const { name: assistantName, model, fallbackModel, temperature, maxTokens, knowledgeText } = parsed.data;
    const controller = new AbortController();
    controllerRef.current = controller;
    let text = "";
    setState({ status: "streaming", text });
    try {
      await streamAssistant(
        "/api/configuration/assistant/test",
        { question, config: { name: assistantName, model, fallbackModel, temperature, maxTokens, knowledgeText } },
        controller.signal,
        (event) => {
          if (event.type === "delta") {
            text += event.text;
            setState({ status: "streaming", text });
          } else if (event.type === "done") setState({ status: "done", text, model: event.model });
          else setState({ status: "error", text, error: event.message });
        },
      );
      setState((s) => (s.status === "streaming" ? { status: "error", text, error: "The answer was cut off. Please try again." } : s));
    } catch (error) {
      if (controller.signal.aborted) setState({ status: "done", text: text || "(stopped)" });
      else setState({ status: "error", text, error: error instanceof AssistantRequestError ? error.message : errorMessage(error) });
    } finally {
      controllerRef.current = null;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-brand" /> Try it
        </CardTitle>
        <CardDescription>Ask a question using the settings on screen – before you save them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field>
          <FieldLabel htmlFor="assistant-test-question">Question</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="assistant-test-question"
              value={question}
              maxLength={L.messageChars}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!busy && question.trim() && keyConfigured) void ask();
                }
              }}
            />
            {busy ? (
              <Button type="button" variant="outline" onClick={() => controllerRef.current?.abort()}>
                <Square className="fill-current" /> Stop
              </Button>
            ) : (
              <Button type="button" onClick={() => void ask()} disabled={!question.trim() || !keyConfigured}>
                <Send /> Ask
              </Button>
            )}
          </div>
          {!keyConfigured && <FieldDescription>Testing needs the OpenRouter key on the server.</FieldDescription>}
        </Field>
        {state.status !== "idle" && (
          <div className="rounded-xl border bg-muted/40 p-3 text-sm" aria-live="polite" aria-busy={busy}>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" /> {name || "Assistant"}
              {state.status === "done" && state.model && <span className="font-normal">· answered by {state.model}</span>}
            </p>
            {state.text ? <AssistantMarkdown text={state.text} /> : busy && <Spinner className="text-brand" />}
            {state.status === "error" && (
              <p role="alert" className="mt-2 text-destructive">
                {state.error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
