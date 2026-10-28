"use client";

import { Ban, Link2, ListPlus, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { UserPicker } from "@/components/common/user-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { BlockerList } from "@/features/incidents/components/shared";
import { SimpleSelect } from "@/features/incidents/components/fields";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { LAW_LINK_TARGET_LABELS, type LawLinkTarget } from "@/lib/law";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { linkBlockers, raiseActionBlockers } from "@/server/modules/law/workflow";
import { useExcludeRequirement, useLawLinkOptions, useLinkRecord, useRaiseAction, useRaiseIncident, type LawRequirementDetailDto } from "../../api";
import { addDaysLocal, blockersOf, todayLocal } from "../../format";

/** Departments of one site (Law work stays on the profile's site). */
export function SiteDepartmentSelect({ id, siteId, value, onChange, invalid }: { id?: string; siteId: string | null; value: string | null; onChange: (id: string | null) => void; invalid?: boolean }) {
  const lookups = useLookups();
  const names = new Map(structureOptions(lookups.data).departments.map((d) => [d.id, d.name]));
  const options = (lookups.data?.departments ?? []).filter((d) => !siteId || d.siteId === siteId).map((d) => ({ value: d.id, label: names.get(d.id) ?? d.name }));
  return <SimpleSelect id={id} value={value} onChange={onChange} options={options} placeholder="Choose a department…" invalid={invalid} />;
}

/** The current user's department when it belongs to the site. */
export function useDefaultDepartment(siteId: string | null): string | null {
  const { user } = useCurrentUser();
  const lookups = useLookups();
  const dept = lookups.data?.departments.find((d) => d.id === user?.departmentId);
  return dept && (!siteId || dept.siteId === siteId) ? dept.id : null;
}

function failed(error: unknown, setBlockers: (b: string[]) => void, what: string) {
  setBlockers(blockersOf(error));
  toast.error(isStaleVersion(error) ? `Someone else changed this ${what} – reload to see their changes.` : errorMessage(error));
}

// ── Doesn't apply ───────────────────────────────────────────────────────────

export function ExcludeDialog({ requirement: r, open, onOpenChange }: { requirement: LawRequirementDetailDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const exclude = useExcludeRequirement(r.id);
  async function save() {
    if (!reason.trim()) {
      setShowErrors(true);
      return;
    }
    try {
      await exclude.mutateAsync({ reason: reason.trim(), expectedVersion: r.version });
      toast.success("Marked as not applying – earlier work is kept");
      onOpenChange(false);
    } catch (error) {
      failed(error, setBlockers, "requirement");
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This doesn&apos;t apply to us</DialogTitle>
          <DialogDescription>Say why, so others understand the decision. The check, evidence, tasks and links stay saved, and you can mark it as applying again at any time.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={(showErrors && !reason.trim()) || undefined}>
          <FieldLabel htmlFor="ex-reason">Why doesn&apos;t it apply? *</FieldLabel>
          <Textarea id="ex-reason" rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. This activity is no longer performed at this site" />
          {showErrors && !reason.trim() && <FieldError>Explain why this requirement does not apply to us.</FieldError>}
        </Field>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={exclude.isPending}>
            {exclude.isPending ? <Spinner /> : <Ban />} Mark as not applying
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Link a record ───────────────────────────────────────────────────────────

export function LinkRecordDialog({ requirement: r, open, onOpenChange }: { requirement: LawRequirementDetailDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const types = (["RiskAssessment", "Incident", "CorrectiveAction"] as LawLinkTarget[]).filter((t) => (t === "RiskAssessment" ? r.modules.risk : r.modules.incidents));
  const [type, setType] = useState<LawLinkTarget>(types[0] ?? "RiskAssessment");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [targetId, setTargetId] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const options = useLawLinkOptions(r.id, type, q, open && types.length > 0);
  const link = useLinkRecord(r.id);
  const errors = linkBlockers({ targetId, context });

  async function save() {
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    try {
      const res = await link.mutateAsync({ targetType: type, targetId, context: context.trim() });
      toast.success(res.created ? "Record linked – it shows this requirement too" : "That record was already linked");
      onOpenChange(false);
    } catch (error) {
      failed(error, setBlockers, "requirement");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a risk assessment or incident</DialogTitle>
          <DialogDescription>Connect a record from {r.profileSiteName ?? "this site"} that supports or challenges compliance. Linking changes nothing in either record.</DialogDescription>
        </DialogHeader>
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">The Risk and Incidents modules are not enabled for your company.</p>
        ) : (
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="lk-type">Type of record</FieldLabel>
              <SimpleSelect
                id="lk-type"
                value={type}
                onChange={(v) => {
                  setType((v ?? types[0]) as LawLinkTarget);
                  setTargetId(null);
                }}
                options={types.map((t) => ({ value: t, label: LAW_LINK_TARGET_LABELS[t] }))}
              />
            </Field>
            <Field data-invalid={(showErrors && !targetId) || undefined}>
              <FieldLabel htmlFor="lk-search">Which one? *</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input id="lk-search" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference or title" />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border" role="listbox" aria-label="Records">
                {options.isPending ? (
                  <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                ) : !options.data?.length ? (
                  <p className="p-3 text-sm text-muted-foreground">No {LAW_LINK_TARGET_LABELS[type].toLowerCase()} found at this site.</p>
                ) : (
                  options.data.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="option"
                      aria-selected={targetId === o.id}
                      onClick={() => setTargetId(o.id)}
                      className={cn("block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50", targetId === o.id && "bg-brand-soft")}
                    >
                      <span className="block truncate text-sm font-medium">{o.label}</span>
                      <span className="block text-xs capitalize text-muted-foreground">{o.detail}</span>
                    </button>
                  ))
                )}
              </div>
              {showErrors && !targetId && <FieldError>Choose the record to link.</FieldError>}
            </Field>
            <Field data-invalid={(showErrors && !context.trim()) || undefined}>
              <FieldLabel htmlFor="lk-context">How does it relate? *</FieldLabel>
              <Textarea id="lk-context" rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. Loading bay route conflict" />
              <FieldDescription>The hazard, environmental aspect or reason – shown on both records.</FieldDescription>
              {showErrors && !context.trim() && <FieldError>Say how the record relates to this requirement.</FieldError>}
            </Field>
            <BlockerList title="Not linked" blockers={blockers} tone="destructive" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={link.isPending || types.length === 0}>
            {link.isPending ? <Spinner /> : <Link2 />} Link record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Raise a Non Compliance incident ─────────────────────────────────────────

export function RaiseIncidentDialog({ requirement: r, open, onOpenChange }: { requirement: LawRequirementDetailDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const defaultDepartment = useDefaultDepartment(r.siteId);
  const [departmentId, setDepartmentId] = useState<string | null>(defaultDepartment ?? r.departmentId);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [created, setCreated] = useState<{ id: string; reference: string; existed: boolean } | null>(null);
  const raise = useRaiseIncident(r.id);
  const ready = r.incidentReadiness.ready;

  async function save() {
    if (!departmentId) {
      setShowErrors(true);
      return;
    }
    try {
      const res = await raise.mutateAsync({ departmentId, ownerId, note: note.trim() });
      setCreated({ id: res.incidentId, reference: res.reference, existed: !res.created });
      toast.success(res.created ? `Incident draft ${res.reference} created` : `${res.reference} was already raised for this requirement`);
    } catch (error) {
      failed(error, setBlockers, "requirement");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a non-compliance as an incident</DialogTitle>
          <DialogDescription>Creates a draft Non Compliance incident that remembers this requirement. Someone completes and submits it in Incidents. The check here does not change.</DialogDescription>
        </DialogHeader>
        {created ? (
          <Alert>
            <TriangleAlert />
            <AlertTitle>{created.existed ? `${created.reference} already exists for this requirement` : `${created.reference} is ready as a draft`}</AlertTitle>
            <AlertDescription>Open it to complete the report (what happened, people involved) and submit it.</AlertDescription>
          </Alert>
        ) : !ready ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Incidents cannot be raised from Law yet</AlertTitle>
            <AlertDescription>
              {r.incidentReadiness.problem} Ask an administrator to set it up in Configuration → Law content &amp; settings.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <Field data-invalid={(showErrors && !departmentId) || undefined}>
              <FieldLabel htmlFor="ri-dept">Where did it happen? *</FieldLabel>
              <SiteDepartmentSelect id="ri-dept" siteId={r.siteId} value={departmentId} onChange={setDepartmentId} invalid={showErrors && !departmentId} />
              {showErrors && !departmentId && <FieldError>Choose a department in this profile&apos;s site.</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="ri-owner">Who should look into it?</FieldLabel>
              <UserPicker id="ri-owner" value={ownerId} onChange={(id) => setOwnerId(id)} placeholder="Optional – choose a person" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ri-note">What is the gap?</FieldLabel>
              <Textarea id="ri-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional – a short description for the incident report" />
            </Field>
            <p className="text-xs text-muted-foreground">
              Uses the incident type “{r.incidentReadiness.typeName}” and its form “{r.incidentReadiness.formName}”.
            </p>
            <BlockerList title="Not raised" blockers={blockers} tone="destructive" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {created ? "Close" : "Cancel"}
          </Button>
          {created ? (
            <Button asChild>
              <Link href={`/incidents/${created.id}`}>Open {created.reference}</Link>
            </Button>
          ) : (
            <Button onClick={() => void save()} disabled={!ready || raise.isPending}>
              {raise.isPending ? <Spinner /> : <TriangleAlert />} Create incident draft
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Raise a corrective action ───────────────────────────────────────────────

export function RaiseActionDialog({ requirement: r, open, onOpenChange }: { requirement: LawRequirementDetailDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(r.ownerId ?? user?.id ?? null);
  const defaultDepartment = useDefaultDepartment(r.siteId);
  const [departmentId, setDepartmentId] = useState<string | null>(r.departmentId ?? defaultDepartment);
  const [dueDate, setDueDate] = useState(addDaysLocal(todayLocal(), 14));
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const raise = useRaiseAction(r.id);
  const errors = raiseActionBlockers({ description, ownerId, departmentId, dueDate, today: todayLocal() });
  const has = (word: string) => showErrors && errors.find((e) => e.includes(word));

  async function save() {
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    try {
      const res = await raise.mutateAsync({ description: description.trim(), ownerId, departmentId, dueDate, requestKey });
      toast.success(res.created ? `Corrective action ${res.reference} raised` : `${res.reference} was already raised`, { action: { label: "Open", onClick: () => router.push(`/incidents/actions/${res.actionId}`) } });
      onOpenChange(false);
    } catch (error) {
      failed(error, setBlockers, "requirement");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a corrective action</DialogTitle>
          <DialogDescription>An action to close this compliance gap. It is followed up in Incidents → Actions (completion and effectiveness check) and remembers this requirement. No incident is needed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field data-invalid={has("Describe") ? true : undefined}>
            <FieldLabel htmlFor="ra-desc">What needs to be done? *</FieldLabel>
            <Textarea id="ra-desc" rows={3} autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Repair route barrier" />
            {has("Describe") && <FieldError>{has("Describe")}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={has("who") ? true : undefined}>
              <FieldLabel htmlFor="ra-owner">Who will do it? *</FieldLabel>
              <UserPicker id="ra-owner" value={ownerId} onChange={(id) => setOwnerId(id)} allowClear={false} placeholder="Choose a person" />
              {has("who") && <FieldError>{has("who")}</FieldError>}
            </Field>
            <Field data-invalid={has("due date") ? true : undefined}>
              <FieldLabel htmlFor="ra-due">Due date *</FieldLabel>
              <Input id="ra-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              {has("due date") && <FieldError>{has("due date")}</FieldError>}
            </Field>
          </div>
          <Field data-invalid={has("department") ? true : undefined}>
            <FieldLabel htmlFor="ra-dept">Department *</FieldLabel>
            <SiteDepartmentSelect id="ra-dept" siteId={r.siteId} value={departmentId} onChange={setDepartmentId} invalid={Boolean(has("department"))} />
            {has("department") && <FieldError>{has("department")}</FieldError>}
          </Field>
          <BlockerList title="Not raised" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={raise.isPending}>
            {raise.isPending ? <Spinner /> : <ListPlus />} Raise action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
