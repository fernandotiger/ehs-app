"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, Save, Send, X } from "lucide-react";
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
import { formatBytes, getUploadSummary, uploadFile } from "@/lib/upload-client";
import { EMPTY_AUDIENCE, updateDocumentSchema, type UpdateDocumentInput } from "@/lib/validation/documents";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/settings/system";
import { useCreateDocument } from "../../api";
import { AckSettingsFields } from "./ack-settings-fields";
import { AudienceBuilder } from "./audience-builder";
import { DocumentDetailsFields } from "./document-fields";
import { FormSection } from "./form-section";

type Intent = "publish" | "draft";

/**
 * A file the server already prepared for this user (e.g. Risk → "Save as document (PDF)"), passed
 * as `?uploadId=…&title=…&description=…`; title and description are editable suggestions.
 */
export interface DocumentPrefill {
  uploadId: string;
  title?: string;
  description?: string;
}

/** Upload a new document: file → details → audiences → acknowledgement → publish or save draft. Surveys have their own page. */
export function NewDocumentForm({ prefill }: { prefill?: DocumentPrefill } = {}) {
  const router = useRouter();
  const settingsQuery = useSystemSettings();
  const settings = settingsQuery.data ?? DEFAULT_SYSTEM_SETTINGS;
  const create = useCreateDocument();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [intent, setIntent] = useState<Intent | null>(null);
  // Prepared file: shown as attached until the user removes it (then the normal file picker is used).
  const [preparedRemoved, setPreparedRemoved] = useState(false);
  const preparedQuery = useQuery({
    queryKey: ["uploads", "summary", prefill?.uploadId ?? ""],
    queryFn: () => getUploadSummary(prefill!.uploadId),
    enabled: Boolean(prefill?.uploadId),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
  const prepared = !preparedRemoved && preparedQuery.data?.purpose === "document-version" ? preparedQuery.data : null;
  const preparedGone = Boolean(prefill?.uploadId) && !preparedRemoved && (preparedQuery.isError || (preparedQuery.isSuccess && !prepared));

  const form = useForm<UpdateDocumentInput>({
    resolver: zodResolver(updateDocumentSchema),
    defaultValues: {
      title: prefill?.title ?? "",
      description: prefill?.description ?? "",
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
        if (!file && !prepared) {
          setFileError("Choose the document file to upload.");
          return;
        }
        setIntent(nextIntent);
        try {
          const { uploadId } = prepared
            ? prepared
            : await uploadFile(file!, "document-version", {
                onProgress: (pct) => setProgress({ [file!.name]: pct }),
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
        if (!files[0] && !prepared) setFileError("Choose the document file to upload.");
        toast.error("Please check the highlighted fields.");
      },
    )();

  return (
    <>
      <PageHeader title="Upload document" description="Add a policy or procedure and choose who needs to read it." backHref="/documents/manage" backLabel="Document Library" />

      <form className="max-w-4xl space-y-4 pb-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <FormSection step={1} title="File" description="Any file type. PDFs and images can be previewed in the browser.">
          {prefill?.uploadId && !preparedRemoved && preparedQuery.isPending ? (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
              <Spinner /> Getting the prepared file…
            </div>
          ) : prepared ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{prepared.fileName}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(prepared.sizeBytes)}</span>
                {!busy && (
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove ${prepared.fileName}`} onClick={() => setPreparedRemoved(true)}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">File already attached. Remove it to choose a different file.</p>
            </div>
          ) : (
            <>
              {preparedGone && <p className="mb-2 text-sm text-destructive">The prepared file is no longer available – choose the file to upload.</p>}
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
            </>
          )}
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
