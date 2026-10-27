"use client";

import { ImageUp, Palette, RotateCcw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FileDropzone } from "@/components/common/file-dropzone";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingCards } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { BrandMark } from "@/components/layout/brand-logo";
import { useBranding } from "@/components/providers/branding-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { contrastRatio, DEFAULT_BRAND_COLOURS, readableTextColour } from "@/lib/branding";
import { uploadFile, formatBytes } from "@/lib/upload-client";
import { LOGO_MAX_BYTES } from "@/lib/validation/configuration";
import { useBrandingSettings, useRemoveLogo, useSaveBranding, useSetLogo, type BrandingSettings } from "../api";
import { ConfigHeader } from "./shared";

type ColourKey = "primary" | "secondary" | "tertiary";

const COLOURS: { key: ColourKey; label: string; description: string }[] = [
  { key: "primary", label: "Primary", description: "Page banners, main buttons and the active menu item." },
  { key: "secondary", label: "Secondary", description: "Dark buttons and strong accents." },
  { key: "tertiary", label: "Tertiary", description: "Highlights, hover borders and small accents." },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

interface Draft {
  name: string;
  primary: string;
  secondary: string;
  tertiary: string;
}

function draftOf(b: BrandingSettings): Draft {
  return {
    name: b.name,
    primary: b.colours.primary ?? DEFAULT_BRAND_COLOURS.primary,
    secondary: b.colours.secondary ?? DEFAULT_BRAND_COLOURS.secondary,
    tertiary: b.colours.tertiary ?? DEFAULT_BRAND_COLOURS.tertiary,
  };
}

/** Checks the browser can decode the image before uploading (the server checks the bytes again). */
async function readableImage(file: File): Promise<string | null> {
  if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type) && !/\.(png|jpe?g|svg)$/i.test(file.name)) return "Use a PNG, JPG or SVG image.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > LOGO_MAX_BYTES) return `The logo is larger than ${formatBytes(LOGO_MAX_BYTES)}.`;
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => (img.naturalWidth > 0 || file.type === "image/svg+xml" ? resolve() : reject(new Error("empty")));
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    });
    return null;
  } catch {
    return "The image could not be read – it looks damaged or is not really a PNG, JPG or SVG.";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** /configuration/branding – logo, company name and colours (applied live, saved for everyone). */
export function BrandingPage() {
  const query = useBrandingSettings();
  if (query.isPending) return <LoadingCards count={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <BrandingForm key={query.data.version} saved={query.data} onReload={() => query.refetch()} />;
}

function BrandingForm({ saved, onReload }: { saved: BrandingSettings; onReload: () => unknown }) {
  const router = useRouter();
  const { setPreview } = useBranding();
  const save = useSaveBranding();
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [stale, setStale] = useState(false);
  const initial = draftOf(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty, "Your branding changes have not been saved. Leave and discard them?");
  const invalid = COLOURS.filter((c) => !HEX.test(draft[c.key])).map((c) => c.key);
  const nameError = draft.name.trim() ? null : "Enter the company name";

  // Live preview across the whole app while editing; cleared when leaving the page.
  useEffect(() => {
    if (!invalid.length) setPreview({ primary: draft.primary.toLowerCase(), secondary: draft.secondary.toLowerCase(), tertiary: draft.tertiary.toLowerCase() });
  }, [draft.primary, draft.secondary, draft.tertiary, invalid.length, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  async function submit() {
    if (invalid.length || nameError) {
      toast.error("Fix the highlighted fields first");
      return;
    }
    try {
      await save.mutateAsync({ ...draft, name: draft.name.trim(), expectedVersion: saved.version });
      toast.success("Branding saved for everyone in your company");
      router.refresh();
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <ConfigHeader
        title="Branding"
        description="Your logo, company name and colours. Changes preview immediately across the app and apply to everyone once saved."
        actions={
          <>
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => setDraft(initial)}>
              <RotateCcw /> Discard
            </Button>
            <Button disabled={!dirty || save.isPending} onClick={() => void submit()}>
              {save.isPending ? <Spinner /> : <Save />} Save branding
            </Button>
          </>
        }
      />
      {stale && <StaleVersionAlert className="mb-4" draft={draft} draftName="branding" onReload={onReload} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <LogoCard saved={saved} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="size-4 text-brand" /> Name and colours
              </CardTitle>
              <CardDescription>Warning, risk and status colours keep their meaning and are not changed.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field data-invalid={Boolean(nameError)}>
                  <FieldLabel htmlFor="company-name">Company name *</FieldLabel>
                  <Input id="company-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-invalid={Boolean(nameError)} />
                  <FieldError errors={nameError ? [{ message: nameError }] : []} />
                </Field>
                {COLOURS.map((c) => (
                  <ColourField key={c.key} label={c.label} description={c.description} value={draft[c.key]} onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} />
                ))}
                <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setDraft((d) => ({ ...d, ...DEFAULT_BRAND_COLOURS }))}>
                  <RotateCcw /> Use the default OleoQ colours
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
        <PreviewCard draft={draft} logoUrl={saved.logoUrl} />
      </div>
    </>
  );
}

function ColourField({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (v: string) => void }) {
  const id = `colour-${label.toLowerCase()}`;
  const valid = HEX.test(value);
  const lowContrast = valid && contrastRatio(value, "#ffffff") < 3;
  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v.startsWith("#") || !v ? v : `#${v}`);
          }}
          className="w-32 font-mono uppercase"
          maxLength={7}
          aria-invalid={!valid}
        />
        {valid && (
          <span className="rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: value, color: readableTextColour(value) }}>
            Aa
          </span>
        )}
      </div>
      <FieldDescription>
        {description}
        {lowContrast ? " Light colour: text on white in this colour may be hard to read – banners switch to dark text automatically." : ""}
      </FieldDescription>
      <FieldError errors={valid ? [] : [{ message: "Use a six-digit colour like #18344A" }]} />
    </Field>
  );
}

function LogoCard({ saved }: { saved: BrandingSettings }) {
  const router = useRouter();
  const setLogo = useSetLogo();
  const removeLogo = useRemoveLogo();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function upload(next: File[]) {
    setFiles(next);
    setError(null);
    const file = next[0];
    if (!file) return;
    setBusy(true);
    try {
      const problem = await readableImage(file);
      if (problem) throw new Error(problem);
      const { uploadId } = await uploadFile(file, "branding-logo", { onProgress: (pct) => setProgress({ [file.name]: pct }) });
      await setLogo.mutateAsync(uploadId);
      toast.success("Logo updated");
      setFiles([]);
      router.refresh();
    } catch (e) {
      setError(`${errorMessage(e)} Your previous logo is still in use.`);
    } finally {
      setBusy(false);
      setProgress({});
    }
  }

  async function remove() {
    try {
      await removeLogo.mutateAsync();
      toast.success("Logo removed – the default mark is shown");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageUp className="size-4 text-brand" /> Logo
        </CardTitle>
        <CardDescription>PNG, JPG or SVG up to 2 MB. A square or wide logo on a transparent background works best.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
          {saved.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorised API route
            <img src={saved.logoUrl} alt="Current logo" className="h-14 max-w-40 object-contain" />
          ) : (
            <BrandMark className="size-12 text-brand" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{saved.logo ? saved.logo.fileName : "Default OleoQ mark"}</p>
            {saved.logo && <p className="text-xs text-muted-foreground">{formatBytes(saved.logo.sizeBytes)}</p>}
          </div>
          {saved.logo && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)} disabled={busy || removeLogo.isPending}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <FileDropzone
          files={files}
          onChange={(next) => void upload(next)}
          maxBytes={LOGO_MAX_BYTES}
          accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
          progress={progress}
          disabled={busy}
          hint="PNG, JPG or SVG · up to 2 MB"
        />
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Checking and uploading…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the logo?"
        description="The default OleoQ mark is shown instead."
        confirmLabel="Remove logo"
        destructive
        onConfirm={remove}
      />
    </Card>
  );
}

function PreviewCard({ draft, logoUrl }: { draft: Draft; logoUrl: string | null }) {
  const ok = HEX.test(draft.primary) && HEX.test(draft.secondary) && HEX.test(draft.tertiary);
  const primary = ok ? draft.primary : DEFAULT_BRAND_COLOURS.primary;
  const secondary = ok ? draft.secondary : DEFAULT_BRAND_COLOURS.secondary;
  const tertiary = ok ? draft.tertiary : DEFAULT_BRAND_COLOURS.tertiary;
  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle className="text-base">Preview</CardTitle>
        <CardDescription>The whole app already shows these colours while you edit. Save to apply them for everyone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl px-5 py-5" style={{ backgroundColor: primary, color: readableTextColour(primary) }}>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- authorised API route
              <img src={logoUrl} alt="" className="h-8 max-w-24 rounded bg-white/90 object-contain p-0.5" />
            ) : (
              <BrandMark className="size-8" />
            )}
            <div>
              <p className="text-lg font-semibold">{draft.name || "Company name"}</p>
              <p className="text-sm opacity-75">Welcome back – here is what needs your attention.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-md bg-white px-3 py-1.5 text-sm font-medium" style={{ color: secondary }}>
              My work
            </span>
            <span className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: secondary, color: readableTextColour(secondary) }}>
              Report
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Primary button</Button>
          <Button size="sm" variant="outline">
            Secondary
          </Button>
          <span className="rounded-full border-2 px-2.5 py-0.5 text-xs font-medium" style={{ borderColor: tertiary, color: secondary }}>
            Highlight
          </span>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Status colours stay the same:</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success" dot>
              Completed
            </StatusBadge>
            <StatusBadge tone="warning" dot>
              Due soon
            </StatusBadge>
            <StatusBadge tone="danger" dot>
              Overdue
            </StatusBadge>
            <StatusBadge tone="info" dot>
              In review
            </StatusBadge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
