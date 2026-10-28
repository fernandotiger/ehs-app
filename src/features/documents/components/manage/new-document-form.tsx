"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FileDropzone } from "@/components/common/file-dropzone";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSystemSettings } from "@/features/shared/settings";
import { errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload-client";
import { EMPTY_AUDIENCE, updateDocumentSchema, type UpdateDocumentInput } from "@/lib/validation/documents";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/settings/system";
import { useCreateDocument } from "../../api";
import { AckSettingsFields } from "./ack-settings-fields";
import { AudienceBuilder } from "./audience-builder";
import { DocumentDetailsFields } from "./document-fields";
import { FormSection } from "./form-section";

type Intent = "publish" | "draft";

/** Upload a new document: file → details → audiences → acknowledgement → publish or save draft. Surveys have their own page. */
export function NewDocumentForm() {
  const router = useRouter();
  const settingsQuery = useSystemSettings();
  const settings = settingsQuery.data ?? DEFAULT_SYSTEM_SETTINGS;
  const create = useCreateDocument();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [intent, setIntent] = useState<Intent | null>(null);

  const form = useForm<UpdateDocumentInput>({
    resolver: zodResolver(updateDocumentSchema),
    defaultValues: {
      title: "",
      description: "",
      referenceCode: "",
      categoryName: "",
      tags: [],
      audience: EMPTY_AUDIENCE,
      ack: {
        requiresAcknowledgement: true,
        ackDueDays: settings.defaultAckDueDays,
        reminderIntervalDays: settings.defaultReminderIntervalDays,
        escalationDays: settings.defaultEscalationDays,
        escalationTarget: "MANAGER",
      },
    },
  });

  // Apply the real system defaults once loaded, unless the user already changed them.
  const settingsLoaded = !settingsQuery.isPlaceholderData && Boolean(settingsQuery.data);
  useEffect(() => {
    if (!settingsLoaded || form.getFieldState("ack").isDirty) return;
    form.setValue("ack.ackDueDays", settings.defaultAckDueDays);
    form.setValue("ack.reminderIntervalDays", settings.defaultReminderIntervalDays);
    form.setValue("ack.escalationDays", settings.defaultEscalationDays);
  }, [settingsLoaded, settings.defaultAckDueDays, settings.defaultReminderIntervalDays, settings.defaultEscalationDays, form]);

  const busy = intent !== null;

  const submit = (nextIntent: Intent) =>
    form.handleSubmit(
      async (values) => {
        const file = files[0];
        if (!file) {
          setFileError("Choose the document file to upload.");
          return;
        }
        setIntent(nextIntent);
        try {
          const { uploadId } = await uploadFile(file, "document-version", {
            onProgress: (pct) => setProgress({ [file.name]: pct }),
          });
          const created = await create.mutateAsync({ ...values, uploadId, publish: nextIntent === "publish" });
          toast.success(
            nextIntent === "publish" ? `Published – ${created.notified.toLocaleString()} ${created.notified === 1 ? "person" : "people"} notified.` : "Draft saved.",
          );
          router.push(`/documents/manage/${created.id}`);
        } catch (error) {
          toast.error(errorMessage(error));
          setProgress({});
          setIntent(null);
        }
      },
      () => {
        if (!files[0]) setFileError("Choose the document file to upload.");
        toast.error("Please check the highlighted fields.");
      },
    )();

  return (
    <>
      <PageHeader title="Upload document" description="Add a policy or procedure and choose who needs to read it." backHref="/documents/manage" backLabel="Document Library" />

      <form className="max-w-4xl space-y-4 pb-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <FormSection step={1} title="File" description="Any file type. PDFs and images can be previewed in the browser.">
          <FileDropzone
            id="doc-file"
            files={files}
            onChange={(next) => {
              setFiles(next);
              setFileError(null);
            }}
            progress={progress}
            disabled={busy}
          />
          {fileError && <p className="mt-2 text-sm text-destructive">{fileError}</p>}
        </FormSection>

        <FormSection step={2} title="Details">
          <DocumentDetailsFields control={form.control} disabled={busy} />
        </FormSection>

        <FormSection step={3} title="Who should have access?" description="Combine as many audiences as you need – anyone matching at least one will see the document.">
          <AudienceBuilder control={form.control} />
        </FormSection>

        <FormSection step={4} title="Acknowledgement">
          <AckSettingsFields control={form.control} />
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
