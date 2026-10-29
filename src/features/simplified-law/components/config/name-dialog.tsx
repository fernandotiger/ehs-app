"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { blockersOf } from "../../format";
import { Blockers } from "../shared";

/** Small dialog for a name (+ optional description): categories, jurisdictions. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName = "",
  initialDescription,
  nameLabel = "Name",
  placeholder,
  submitLabel = "Save",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialName?: string;
  /** Pass a string to show the description field. */
  initialDescription?: string;
  nameLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (values: { name: string; description: string }) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <NameForm
            title={title}
            description={description}
            initialName={initialName}
            initialDescription={initialDescription}
            nameLabel={nameLabel}
            placeholder={placeholder}
            submitLabel={submitLabel}
            onSubmit={onSubmit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm(props: {
  title: string;
  description?: string;
  initialName: string;
  initialDescription?: string;
  nameLabel: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (values: { name: string; description: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(props.initialName);
  const [description, setDescription] = useState(props.initialDescription ?? "");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBlockers([]);
    setPending(true);
    try {
      await props.onSubmit({ name: name.trim(), description: description.trim() });
      toast.success("Saved");
      props.onClose();
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        {props.description && <DialogDescription>{props.description}</DialogDescription>}
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="slaw-name">{props.nameLabel} *</FieldLabel>
        <Input id="slaw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={props.placeholder} autoFocus maxLength={120} />
      </Field>
      {props.initialDescription !== undefined && (
        <Field>
          <FieldLabel htmlFor="slaw-desc">Short description (optional)</FieldLabel>
          <Textarea id="slaw-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
      )}
      <Blockers title="Not saved" blockers={blockers} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && <Spinner />} {props.submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
