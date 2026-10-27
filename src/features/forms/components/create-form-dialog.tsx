"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client";
import { FORM_MODULES, creatableModules, systemQuestions } from "@/lib/forms/catalog";
import { RISK_DOMAIN_LABELS, RISK_DOMAINS, type RiskDomain } from "@/lib/risk/scoring";
import { useCreateForm } from "../api";

/** New form: name, module and purpose (Risk: scoring method + domain). Opens the designer. */
export function CreateFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const create = useCreateForm();
  const modules = creatableModules();
  const [name, setName] = useState("");
  const [module, setModule] = useState(modules[0]?.key ?? "incidents");
  const [purpose, setPurpose] = useState(modules[0]?.purposes[0]?.key ?? "");
  const [domain, setDomain] = useState<RiskDomain>("HEALTH_SAFETY");
  const [error, setError] = useState<string | null>(null);
  const descriptor = FORM_MODULES[module]!;
  const mandatory = systemQuestions(module, purpose, { domain });
  const later = Object.values(FORM_MODULES).filter((m) => !m.available);

  function close(next: boolean) {
    if (!next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a form name");
      return;
    }
    try {
      const form = await create.mutateAsync({ name: name.trim(), module, purpose, ...(module === "risk" ? { domain } : {}) });
      toast.success(`${form.name} created as a draft`);
      close(false);
      router.push(`/configuration/forms/${form.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
          <DialogDescription>The required questions for the module are added for you. The form stays a draft until you publish it.</DialogDescription>
        </DialogHeader>
        <form id="create-form" onSubmit={submit} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="form-name">Form name *</FieldLabel>
              <Input
                id="form-name"
                value={name}
                autoComplete="off"
                placeholder="e.g. Loading bay event"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error)}
              />
              <FieldError errors={error ? [{ message: error }] : []} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="form-module">Module *</FieldLabel>
                <Select
                  value={module}
                  onValueChange={(v) => {
                    setModule(v);
                    setPurpose(FORM_MODULES[v]!.purposes[0]!.key);
                  }}
                >
                  <SelectTrigger id="form-module" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="form-purpose">{descriptor.purposeLabel} *</FieldLabel>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger id="form-purpose" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {descriptor.purposes.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {descriptor.purposes.find((p) => p.key === purpose)?.description && (
              <FieldDescription>{descriptor.purposes.find((p) => p.key === purpose)?.description}</FieldDescription>
            )}
            {module === "risk" && (
              <Field>
                <FieldLabel htmlFor="form-domain">Risk domain *</FieldLabel>
                <Select value={domain} onValueChange={(v) => setDomain(v as RiskDomain)}>
                  <SelectTrigger id="form-domain" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_DOMAINS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {RISK_DOMAIN_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <Lock className="size-3.5" /> {mandatory.length} required questions are included
              </p>
              <p className="text-muted-foreground">{mandatory.map((q) => q.label).join(" · ")}</p>
            </div>
            {later.length > 0 && <p className="text-xs text-muted-foreground">{later.map((m) => m.label).join(", ")} forms come with those modules later.</p>}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-form" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
