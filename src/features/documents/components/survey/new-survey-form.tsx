"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Save, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { FileDropzone } from "@/components/common/file-dropzone";
import { LoadingCards } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useFavouriteSeed } from "@/features/favourites/api";
import { FavouriteSeedBanner } from "@/features/favourites/components/seed-banner";
import { useFavouriteCapture } from "@/features/favourites/use-favourite-capture";
import { useLookups } from "@/features/shared/lookups";
import { useSystemSettings } from "@/features/shared/settings";
import { errorMessage } from "@/lib/api-client";
import type { Snapshot } from "@/lib/favourites/snapshot";
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from "@/lib/settings/system";
import { uploadFile } from "@/lib/upload-client";
import { z } from "zod";
import { ackSettingsSchema, audienceSchema, EMPTY_AUDIENCE, type CreateSurveyDocumentInput, type UpdateDocumentInput } from "@/lib/validation/documents";
import { useCreateSurveyDocument } from "../../api";
import { useSurveySettings } from "../../survey-api";
import { draftToInput, emptyDraft, exampleDraft, SURVEY_EXAMPLES, surveyPageHref, validateDraft, type SurveyDraft, type SurveyDraftUpdater, type SurveyExampleKey } from "../../survey-format";
import { AckSettingsFields } from "../manage/ack-settings-fields";
import { AudienceBuilder } from "../manage/audience-builder";
import { knownStructureOf, type KnownStructure } from "../manage/document-seed";
import { FormSection } from "../manage/form-section";
import { SurveyBuilder } from "./survey-builder";
import { mergeSurvey, pickSurvey } from "./survey-seed";

type Intent = "publish" | "draft";

const settingsSchema = z.object({ audience: audienceSchema, ack: ackSettingsSchema });
type SettingsValues = Pick<CreateSurveyDocumentInput, "audience" | "ack">;

function blankDraft(defaultDueDays: number): SurveyDraft {
  return { ...emptyDraft("", defaultDueDays), title: "" };
}

function freshSettings(settings: SystemSettings): SettingsValues {
  return {
    audience: EMPTY_AUDIENCE,
    ack: {
      // The survey has its own "Everyone must complete it"; confirming the file is an extra step to opt into.
      requiresAcknowledgement: false,
      ackDueDays: settings.defaultAckDueDays,
      reminderIntervalDays: settings.defaultReminderIntervalDays,
      escalationDays: settings.defaultEscalationDays,
      escalationTarget: "MANAGER",
    },
  };
}

/** Ready-made question sets; they replace the questions, the title and settings stay. */
function ExampleStarters({ onPick, disabled }: { onPick: (example: SurveyExampleKey) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand/25 bg-brand-soft/60 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <span className="text-sm text-muted-foreground">Start from an example:</span>
      {(Object.keys(SURVEY_EXAMPLES) as SurveyExampleKey[]).map((key) => (
        <Button key={key} type="button" variant="outline" className="h-auto justify-start bg-card py-2 text-left" disabled={disabled} onClick={() => onPick(key)}>
          <Sparkles className="text-brand" />
          <span>
            <span className="block font-medium">{SURVEY_EXAMPLES[key].label}</span>
            <span className="block text-xs font-normal whitespace-normal text-muted-foreground">{SURVEY_EXAMPLES[key].description}</span>
          </span>
        </Button>
      ))}
    </div>
  );
}

/**
 * Survey page (Documents → Survey): questions → optional file people read first → audiences →
 * acknowledgement (only with a file) → publish or save draft. No document details: the survey
 * title and introduction become the document's title and description.
 * Opened from a favourite (`?fav=`), it starts from the settings and questions kept with it (survey-seed.ts).
 */
export function NewSurveyForm() {
  const seed = useFavouriteSeed("survey.new");
  const lookups = useLookups();
  if (seed.status === "loading" || (seed.seed && lookups.isPending)) return <LoadingCards count={3} />;
  return <SurveyCreateForm key={seed.favId ?? "new"} seed={seed.seed} known={knownStructureOf(lookups.data)} />;
}

function SurveyCreateForm({ seed, known }: { seed: Snapshot | null; known: KnownStructure }) {
  const router = useRouter();
  const settingsQuery = useSystemSettings();
  const settings = settingsQuery.data ?? DEFAULT_SYSTEM_SETTINGS;
  const surveyDefaults = useSurveySettings();
  const create = useCreateSurveyDocument();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [intent, setIntent] = useState<Intent | null>(null);
  // A favourite's kept settings and questions are merged here, once, so the restored page is not "dirty".
  const [start] = useState(() => {
    const fresh = { draft: blankDraft(surveyDefaults.defaultDueDays), settings: freshSettings(settings) };
    return seed ? mergeSurvey(fresh, seed, { known }) : { ...fresh, ackKept: false };
  });
  const [survey, setSurvey] = useState<SurveyDraft>(start.draft);
  const [showSurveyErrors, setShowSurveyErrors] = useState(false);
  const surveyRef = useRef<HTMLDivElement>(null);
  const updateSurvey: SurveyDraftUpdater = (change) => setSurvey((d) => change(d));

  // "Complete within" follows the configured default until the creator changes it.
  const [dueDaysSeen, setDueDaysSeen] = useState(surveyDefaults.defaultDueDays);
  if (surveyDefaults.defaultDueDays !== dueDaysSeen) {
    setDueDaysSeen(surveyDefaults.defaultDueDays);
    if (survey.dueDays === dueDaysSeen) setSurvey({ ...survey, dueDays: surveyDefaults.defaultDueDays });
  }

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: start.settings,
  });
  // The shared audience / acknowledgement fields only touch the `audience` and `ack` paths.
  const control = form.control as unknown as Control<UpdateDocumentInput>;

  // Apply the real system defaults once loaded, unless the user already changed them (or a favourite set them).
  const settingsLoaded = !settingsQuery.isPlaceholderData && Boolean(settingsQuery.data);
  const ackKept = start.ackKept;
  useEffect(() => {
    if (!settingsLoaded || ackKept || form.getFieldState("ack").isDirty) return;
    form.setValue("ack.ackDueDays", settings.defaultAckDueDays);
    form.setValue("ack.reminderIntervalDays", settings.defaultReminderIntervalDays);
    form.setValue("ack.escalationDays", settings.defaultEscalationDays);
  }, [settingsLoaded, ackKept, settings.defaultAckDueDays, settings.defaultReminderIntervalDays, settings.defaultEscalationDays, form]);

  // Favourites star: keeps the settings and the questions as drafted, never the file.
  useFavouriteCapture("survey.new", () => pickSurvey(survey, blankDraft(surveyDefaults.defaultDueDays), form.getValues(), freshSettings(settings)));

  const busy = intent !== null;
  const surveyErrors = showSurveyErrors ? validateDraft(survey) : {};

  const pickExample = (example: SurveyExampleKey) => {
    const before = survey;
    setSurvey((d) => ({ ...d, questions: exampleDraft(example, "", d.dueDays).questions }));
    if (before.questions.some((q) => q.label.trim())) {
      toast("Questions replaced with the example", { action: { label: "Undo", onClick: () => setSurvey(before) } });
    }
  };

  /** Shows the survey errors inline and scrolls to them; true when the survey is valid. */
  const checkSurvey = () => {
    if (!Object.keys(validateDraft(survey)).length) return true;
    setShowSurveyErrors(true);
    surveyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return false;
  };

  const submit = (nextIntent: Intent) =>
    form.handleSubmit(
      async (values) => {
        if (!checkSurvey()) {
          toast.error("Please check the highlighted fields.");
          return;
        }
        const file = files[0];
        setIntent(nextIntent);
        try {
          const uploadId = file
            ? (await uploadFile(file, "document-version", { onProgress: (pct) => setProgress({ [file.name]: pct }) })).uploadId
            : null;
          const created = await create.mutateAsync({ ...values, survey: draftToInput(survey), uploadId, publish: nextIntent === "publish" });
          toast.success(
            nextIntent === "publish" ? `Induction published – ${created.notified.toLocaleString()} ${created.notified === 1 ? "person" : "people"} notified.` : "Draft saved.",
          );
          router.push(surveyPageHref(created.id));
        } catch (error) {
          toast.error(errorMessage(error));
          setProgress({});
          setIntent(null);
        }
      },
      () => {
        checkSurvey();
        toast.error("Please check the highlighted fields.");
      },
    )();

  return (
    <>
      <PageHeader
        title="Create Employee Induction"
        description="Ask people a few questions, add a file for them to read first if you like, and choose who should complete it."
        actions={
          <Button asChild variant="outline">
            <Link href="/documents/surveys/library">
              <ClipboardList /> Existing inductions
            </Link>
          </Button>
        }
      />
      {seed && <FavouriteSeedBanner sendLabel="Save as draft or Publish now" className="max-w-4xl" />}

      <form className="max-w-4xl space-y-4 pb-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <div ref={surveyRef} className="scroll-mt-20">
          <FormSection step={1} title="Induction questions" description="The induction goes live when you publish it. If you add a file, people open it before answering.">
            <div className="space-y-4">
              <ExampleStarters onPick={pickExample} disabled={busy} />
              <SurveyBuilder draft={survey} onChange={updateSurvey} errors={surveyErrors} idPrefix="new-survey" />
            </div>
          </FormSection>
        </div>

        <FormSection
          step={2}
          title="File (optional)"
          description="Something people read before answering – for example a procedure, training slides or a notice. Leave it empty for an induction with questions only."
        >
          <FileDropzone
            id="survey-file"
            files={files}
            onChange={(next) => {
              setFiles(next);
              // Nothing to confirm without a file.
              if (!next.length) form.setValue("ack.requiresAcknowledgement", false);
            }}
            progress={progress}
            disabled={busy}
          />
        </FormSection>

        <FormSection step={3} title="Who should have access?" description="Combine as many audiences as you need – anyone matching at least one will see the induction and can complete it.">
          <AudienceBuilder control={control} />
        </FormSection>

        <FormSection step={4} title="Acknowledgement" description="Optional – ask people to confirm they have read the file as well as answering the questions.">
          <AckSettingsFields control={control} unavailableReason={files.length ? undefined : "Add a file in step 2 to ask people to confirm they have read it."} />
        </FormSection>

        <div className="sticky bottom-20 z-10 flex flex-col-reverse gap-2 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:justify-end md:bottom-4">
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => void submit("draft")}>
            {intent === "draft" ? <Spinner /> : <Save />} Save as draft
          </Button>
          <Button type="button" size="lg" disabled={busy} onClick={() => void submit("publish")}>
            {intent === "publish" ? <Spinner /> : <Send />} Publish now
          </Button>
        </div>
      </form>
    </>
  );
}
