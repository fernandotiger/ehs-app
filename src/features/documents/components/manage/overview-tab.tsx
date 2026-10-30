"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useSystemSettings } from "@/features/shared/settings";
import { errorMessage } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { updateDocumentSchema, type UpdateDocumentInput } from "@/lib/validation/documents";
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from "@/lib/settings/system";
import { useUpdateDocument, type ManageDocumentDto } from "../../api";
import { audienceLabel, ESCALATION_TARGET_LABELS, formatDate, formatDateTime } from "../../format";
import { ComplianceProgress } from "../compliance-progress";
import { TagChips } from "../tag-chips";
import { AckSettingsFields } from "./ack-settings-fields";
import { AudienceBuilder } from "./audience-builder";
import { DocumentDetailsFields } from "./document-fields";
import { FormSection } from "./form-section";

function toFormValues(doc: ManageDocumentDto, settings: SystemSettings): UpdateDocumentInput {
  return {
    title: doc.title,
    description: doc.description ?? "",
    referenceCode: doc.referenceCode ?? "",
    categoryName: doc.category?.name ?? "",
    tags: doc.tags.map((t) => t.name),
    audience: {
      allEmployees: doc.audience.allEmployees,
      roleIds: doc.audience.roles.map((r) => r.id),
      businessUnitIds: doc.audience.businessUnits.map((b) => b.id),
      siteIds: doc.audience.sites.map((s) => s.id),
      locationIds: doc.audience.locations.map((l) => l.id),
      departmentIds: doc.audience.departments.map((d) => d.id),
      userIds: doc.audience.users.map((u) => u.id),
    },
    ack: {
      requiresAcknowledgement: doc.requiresAcknowledgement,
      ackDueDays: doc.ackDueDays ?? settings.defaultAckDueDays,
      reminderIntervalDays: doc.reminderIntervalDays ?? settings.defaultReminderIntervalDays,
      escalationDays: doc.escalationDays ?? settings.defaultEscalationDays,
      escalationTarget: doc.escalationTarget,
    },
  };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </>
  );
}

function EditForm({ doc, survey }: { doc: ManageDocumentDto; survey: boolean }) {
  const settings = useSystemSettings().data ?? DEFAULT_SYSTEM_SETTINGS;
  const update = useUpdateDocument(doc.id);
  const form = useForm<UpdateDocumentInput>({ resolver: zodResolver(updateDocumentSchema), values: toFormValues(doc, settings), resetOptions: { keepDirtyValues: true } });

  const onSubmit = form.handleSubmit(
    async (values) => {
      try {
        const res = await update.mutateAsync(values);
        form.reset(values);
        toast.success(res.notified ? `Saved – ${res.notified.toLocaleString()} ${res.notified === 1 ? "person" : "people"} notified.` : "Changes saved.");
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    () => toast.error("Please check the highlighted fields."),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {/* A survey's title and introduction are edited with its questions (Response form → Edit response form). */}
      {!survey && (
        <FormSection title="Details">
          <DocumentDetailsFields control={form.control} />
        </FormSection>
      )}
      <FormSection
        title={survey ? "Who should complete it?" : "Audience"}
        description={
          survey
            ? "Anyone matching at least one audience can complete the response form. Newly included people are notified."
            : "Anyone matching at least one audience can open the document. Newly included people are notified."
        }
      >
        <AudienceBuilder control={form.control} />
      </FormSection>
      <FormSection title="Acknowledgement">
        <AckSettingsFields
          control={form.control}
          unavailableReason={
            doc.currentVersion ? undefined : `Add a file first (${survey ? "File → Add a file" : "Versions → Upload new version"}) to ask people to confirm they have read it.`
          }
        />
      </FormSection>
      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur md:bottom-4 assistant:mr-15">
        {form.formState.isDirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="button" variant="ghost" disabled={!form.formState.isDirty || update.isPending} onClick={() => form.reset(toFormValues(doc, settings))}>
          Discard
        </Button>
        <Button type="submit" size="lg" disabled={!form.formState.isDirty || update.isPending}>
          {update.isPending ? <Spinner /> : <Save />} Save changes
        </Button>
      </div>
    </form>
  );
}

function ReadOnlySummary({ doc, survey }: { doc: ManageDocumentDto; survey: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{survey ? "Settings" : "Details"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {doc.description && <p className="text-muted-foreground">{doc.description}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {!survey && <Detail label="Reference">{doc.referenceCode ?? "—"}</Detail>}
          {!survey && <Detail label="Category">{doc.category?.name ?? "Uncategorised"}</Detail>}
          {!survey && <Detail label="Tags">{doc.tags.length ? <TagChips tags={doc.tags} max={20} /> : "—"}</Detail>}
          <Detail label="Audience">{audienceLabel(doc.audience)}</Detail>
          <Detail label="Acknowledgement">{doc.requiresAcknowledgement ? `Required within ${doc.ackDueDays ?? "default"} days` : "Not required"}</Detail>
          {doc.requiresAcknowledgement && <Detail label="Escalation">{ESCALATION_TARGET_LABELS[doc.escalationTarget]}</Detail>}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Document Overview, or a survey's Settings tab (`survey`: no document details, survey wording). */
export function OverviewTab({ doc, survey = false }: { doc: ManageDocumentDto; survey?: boolean }) {
  const { can } = useCurrentUser();
  const editable = can(PERMISSIONS.DOCUMENTS_MANAGE) && doc.status !== "ARCHIVED";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <div className="min-w-0">{editable ? <EditForm doc={doc} survey={survey} /> : <ReadOnlySummary doc={doc} survey={survey} />}</div>
      <aside className="space-y-4 lg:sticky lg:top-20">
        {doc.compliance && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Acknowledgement progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ComplianceProgress stats={doc.compliance} />
              {doc.compliance.requiredVersionNumber && doc.compliance.requiredVersionNumber > 1 && (
                <p className="text-xs text-muted-foreground">Counting acknowledgements of version {doc.compliance.requiredVersionNumber} or later.</p>
              )}
            </CardContent>
          </Card>
        )}
        <Card size="sm">
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Detail label="Created by">{doc.createdBy.name}</Detail>
              <Detail label="Created">{formatDate(doc.createdAt)}</Detail>
              <Detail label="Published">{formatDateTime(doc.publishedAt)}</Detail>
              {doc.archivedAt && <Detail label="Archived">{formatDateTime(doc.archivedAt)}</Detail>}
              {survey ? (
                <Detail label="File">{doc.currentVersion ? `Version ${doc.currentVersion.versionNumber}` : "None"}</Detail>
              ) : (
                <Detail label="Versions">{doc.versionCount}</Detail>
              )}
              <Detail label="Audience">
                {doc.audience.allEmployees ? (
                  <StatusBadge tone="brand">All employees</StatusBadge>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {[
                      ...doc.audience.roles,
                      ...doc.audience.businessUnits,
                      ...doc.audience.sites,
                      ...doc.audience.locations,
                      ...doc.audience.departments,
                      ...doc.audience.users,
                    ].map((a) => (
                      <StatusBadge key={a.id} tone="brand" className="h-5">
                        {a.name}
                      </StatusBadge>
                    ))}
                  </span>
                )}
              </Detail>
            </dl>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
