"use client";

import { format, parseISO } from "date-fns";
import { Download, ExternalLink, FileUp, Link2, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FileDropzone } from "@/components/common/file-dropzone";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSystemSettings } from "@/features/shared/settings";
import { useAddEvidenceFile, useAddEvidenceLink, useEvidence, useRemoveEvidence } from "@/features/shared/records";
import { errorMessage } from "@/lib/api-client";
import { formatBytes } from "@/lib/upload-client";
import { evidenceLinkSchema, type EvidenceDto } from "@/lib/validation/evidence";

type Mode = "idle" | "file" | "link";

/**
 * Evidence on any record: uploaded files (evidence size limit, default 2 MB) and named
 * external links. Access is decided by the server (the owning module's entity descriptor);
 * `readOnly` additionally hides the add/remove controls.
 */
export function EvidencePanel({ entityType, entityId, readOnly = false, title = "Evidence" }: { entityType: string; entityId: string; readOnly?: boolean; title?: string }) {
  const query = useEvidence(entityType, entityId);
  const settings = useSystemSettings().data;
  const maxBytes = (settings?.evidenceMaxUploadMb ?? 2) * 1024 * 1024;
  const addFile = useAddEvidenceFile(entityType, entityId);
  const addLink = useAddEvidenceLink(entityType, entityId);
  const remove = useRemoveEvidence(entityType, entityId);
  const [mode, setMode] = useState<Mode>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [link, setLink] = useState({ name: "", url: "" });
  const [linkErrors, setLinkErrors] = useState<{ name?: string; url?: string }>({});
  const editable = !readOnly && Boolean(query.data?.canEdit);

  async function uploadAll() {
    for (const file of files) {
      try {
        await addFile.mutateAsync({ file, onProgress: (pct) => setProgress((p) => ({ ...p, [file.name]: pct })) });
        setFiles((list) => list.filter((f) => f !== file));
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
        return;
      }
    }
    toast.success("Evidence added");
    setProgress({});
    setMode("idle");
  }

  async function saveLink() {
    const parsed = evidenceLinkSchema.safeParse(link);
    if (!parsed.success) {
      const errors: { name?: string; url?: string } = {};
      for (const issue of parsed.error.issues) errors[issue.path[0] as "name" | "url"] ??= issue.message;
      setLinkErrors(errors);
      return;
    }
    setLinkErrors({});
    try {
      await addLink.mutateAsync(parsed.data);
      toast.success("Link added");
      setLink({ name: "", url: "" });
      setMode("idle");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function removeItem(item: EvidenceDto) {
    try {
      await remove.mutateAsync(item.id);
      toast.success("Evidence removed");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-4 text-brand" /> {title}
        </CardTitle>
        <CardDescription>Files up to {formatBytes(maxBytes)} and links to other systems.</CardDescription>
        {editable && mode === "idle" && (
          <CardAction className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode("file")}>
              <FileUp /> Add file
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("link")}>
              <Link2 /> Add link
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "file" && (
          <div className="space-y-3 rounded-xl border p-3">
            <FileDropzone id="evidence-file" files={files} onChange={setFiles} multiple maxBytes={maxBytes} progress={progress} disabled={addFile.isPending} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => (setMode("idle"), setFiles([]))} disabled={addFile.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={uploadAll} disabled={!files.length || addFile.isPending}>
                Upload {files.length > 1 ? `${files.length} files` : "file"}
              </Button>
            </div>
          </div>
        )}

        {mode === "link" && (
          <FieldGroup className="gap-3 rounded-xl border p-3">
            <Field data-invalid={Boolean(linkErrors.name)}>
              <FieldLabel htmlFor="evidence-link-name">Description</FieldLabel>
              <Input id="evidence-link-name" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="e.g. Maintenance record in SAP" aria-invalid={Boolean(linkErrors.name)} />
              <FieldError>{linkErrors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(linkErrors.url)}>
              <FieldLabel htmlFor="evidence-link-url">Address</FieldLabel>
              <Input id="evidence-link-url" type="url" inputMode="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://" aria-invalid={Boolean(linkErrors.url)} />
              <FieldError>{linkErrors.url}</FieldError>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => (setMode("idle"), setLinkErrors({}))} disabled={addLink.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveLink} disabled={addLink.isPending}>
                Add link
              </Button>
            </div>
          </FieldGroup>
        )}

        {query.isPending ? (
          <LoadingRows rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />
        ) : query.data.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No evidence yet.</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-2 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  {item.kind === "LINK" ? <Link2 className="size-4" /> : <Paperclip className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.kind === "LINK" ? item.url : item.sizeBytes !== null ? formatBytes(item.sizeBytes) : null, item.uploadedBy.name, format(parseISO(item.createdAt), "d MMM yyyy")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {item.kind === "LINK" && item.url ? (
                  <Button asChild variant="ghost" size="icon" className="size-8" aria-label={`Open ${item.name}`}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                ) : item.downloadUrl ? (
                  <Button asChild variant="ghost" size="icon" className="size-8" aria-label={`Download ${item.name}`}>
                    <a href={`${item.downloadUrl}?download=1`}>
                      <Download className="size-4" />
                    </a>
                  </Button>
                ) : null}
                {editable && (
                  <ConfirmDialog
                    title="Remove this evidence?"
                    description="It will no longer be attached to this record. The change is recorded in the history."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => removeItem(item)}
                    trigger={
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Remove ${item.name}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
