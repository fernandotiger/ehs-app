"use client";

import { Download, History } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { formatBytes } from "@/lib/upload-client";
import { documentFileUrl, useDocumentVersions, type ManageDocumentDto, type VersionHistoryItem } from "../../api";
import { formatDateTime } from "../../format";
import { FileTypeIcon } from "../file-type-icon";
import { NewVersionDialog } from "./new-version-dialog";

function VersionBadges({ v }: { v: VersionHistoryItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      {v.isCurrent && (
        <StatusBadge tone="success" className="h-5">
          Current
        </StatusBadge>
      )}
      {v.requiresReacknowledgement && (
        <StatusBadge tone="warning" className="h-5">
          Re-acknowledgement
        </StatusBadge>
      )}
    </span>
  );
}

function DownloadButton({ documentId, v, canDownload }: { documentId: string; v: VersionHistoryItem; canDownload: boolean }) {
  if (!canDownload) return null;
  return (
    <Button asChild variant="outline" size="sm">
      <a href={documentFileUrl(documentId, v.id, true)} download={v.fileName}>
        <Download /> Download
      </a>
    </Button>
  );
}

/** `survey`: the survey's optional file ("File" tab) instead of a document's version history. */
export function VersionsTab({ doc, survey = false }: { doc: ManageDocumentDto; survey?: boolean }) {
  const versions = useDocumentVersions(doc.id);
  const { can, canAny } = useCurrentUser();
  const canUpload = can(PERMISSIONS.DOCUMENTS_MANAGE) && doc.status !== "ARCHIVED";
  // Historic files follow the visibility policy: managers and view-all users only.
  const canDownload = canAny([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_VIEW_ALL]);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{survey ? "File" : "Version history"}</CardTitle>
        <CardDescription>
          {survey
            ? "Optional – something people read before answering. Every version is kept; people only see the current one."
            : "Every issued version is retained. Employees only see the current one."}
        </CardDescription>
        {canUpload && (
          <CardAction>
            <NewVersionDialog doc={doc} survey={survey} />
          </CardAction>
        )}
      </CardHeader>
      {versions.isPending ? (
        <LoadingRows rows={3} className="p-4" />
      ) : versions.isError ? (
        <ErrorState error={versions.error} onRetry={() => versions.refetch()} className="m-4" />
      ) : versions.data.length === 0 ? (
        <EmptyState
          icon={History}
          title={survey ? "No file" : "No versions yet"}
          description={survey ? "People answer the survey straight away. Add a file if they should read something first." : undefined}
          className="m-4"
        />
      ) : (
        <>
          <ul className="divide-y md:hidden">
            {versions.data.map((v) => (
              <li key={v.id} className="space-y-2 p-4">
                <div className="flex items-start gap-3">
                  <FileTypeIcon mimeType={v.mimeType} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Version {v.versionNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.fileName} · {formatBytes(v.sizeBytes)}
                    </p>
                  </div>
                  <VersionBadges v={v} />
                </div>
                {v.changeNote && <p className="text-sm">{v.changeNote}</p>}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {v.uploadedBy.name} · {formatDateTime(v.createdAt)}
                  </p>
                  <DownloadButton documentId={doc.id} v={v} canDownload={canDownload} />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Version</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Change note</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Acknowledgements</TableHead>
                  <TableHead className="pr-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.data.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-4 align-top">
                      <p className="font-medium">v{v.versionNumber}</p>
                      <VersionBadges v={v} />
                    </TableCell>
                    <TableCell className="max-w-56 align-top">
                      <p className="truncate">{v.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(v.sizeBytes)}</p>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal align-top text-muted-foreground">{v.changeNote ?? "—"}</TableCell>
                    <TableCell className="align-top">
                      <p>{v.uploadedBy.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</p>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">{v.acknowledgementCount}</TableCell>
                    <TableCell className="pr-4 text-right align-top">
                      <DownloadButton documentId={doc.id} v={v} canDownload={canDownload} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}
