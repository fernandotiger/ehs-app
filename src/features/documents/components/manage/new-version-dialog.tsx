"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FileDropzone } from "@/components/common/file-dropzone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload-client";
import { newVersionSchema } from "@/lib/validation/documents";
import { useAddVersion, type ManageDocumentDto } from "../../api";

/** The form edits everything except the upload id, which is obtained on submit. */
const formSchema = newVersionSchema.omit({ uploadId: true });
type FormValues = z.infer<typeof formSchema>;

/** `survey`: wording for a survey's optional file ("Add a file" when it has none yet). */
export function NewVersionDialog({ doc, survey = false }: { doc: ManageDocumentDto; survey?: boolean }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const addVersion = useAddVersion(doc.id);
  const nextVersion = (doc.currentVersion?.versionNumber ?? 0) + 1;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { changeNote: "", requireReacknowledgement: doc.requiresAcknowledgement },
  });

  const reset = () => {
    setFiles([]);
    setFileError(null);
    setProgress({});
    form.reset({ changeNote: "", requireReacknowledgement: doc.requiresAcknowledgement });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const file = files[0];
    if (!file) {
      setFileError("Choose the new file.");
      return;
    }
    setUploading(true);
    try {
      const { uploadId } = await uploadFile(file, "document-version", { onProgress: (pct) => setProgress({ [file.name]: pct }) });
      const res = await addVersion.mutateAsync({ ...values, uploadId });
      toast.success(
        res.requiresReacknowledgement
          ? `Version ${res.versionNumber} issued – ${res.notified.toLocaleString()} ${res.notified === 1 ? "person" : "people"} asked to acknowledge again.`
          : `Version ${res.versionNumber} issued.`,
      );
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(errorMessage(error));
      setProgress({});
    } finally {
      setUploading(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (uploading) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <FileUp /> {survey && !doc.currentVersion ? "Add a file" : "Upload new version"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload version {nextVersion}</DialogTitle>
          <DialogDescription>
            {survey && !doc.currentVersion
              ? "People will open this file before completing the response form."
              : "Previous versions stay in the history. Employees only see the current version."}
          </DialogDescription>
        </DialogHeader>
        <form id="new-version-form" onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <div>
              <FileDropzone
                files={files}
                onChange={(next) => {
                  setFiles(next);
                  setFileError(null);
                }}
                progress={progress}
                disabled={uploading}
              />
              {fileError && <p className="mt-2 text-sm text-destructive">{fileError}</p>}
            </div>
            <Controller
              name="changeNote"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="version-note">What changed?</FieldLabel>
                  <Textarea id="version-note" rows={3} placeholder="Summarise the changes for employees and the audit trail" disabled={uploading} {...field} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {doc.requiresAcknowledgement ? (
              <Controller
                name="requireReacknowledgement"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal" className="rounded-xl border p-3">
                    <Checkbox id="version-reack" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={uploading} />
                    <FieldContent>
                      <FieldLabel htmlFor="version-reack">Employees must acknowledge this version again</FieldLabel>
                      <FieldDescription>
                        {field.value
                          ? "Earlier acknowledgements stop counting and everyone in the audience is notified."
                          : "Existing acknowledgements continue to count (e.g. for minor corrections)."}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />
            ) : (
              <p className="text-xs text-muted-foreground">This document does not require acknowledgement.</p>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={uploading} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-version-form" disabled={uploading}>
            {uploading ? <Spinner /> : <FileUp />} Issue version {nextVersion}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
