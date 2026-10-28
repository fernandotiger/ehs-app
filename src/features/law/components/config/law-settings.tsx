"use client";

import { AlertTriangle, CheckCircle2, Download, FileJson, Library, Settings2, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockerList } from "@/features/incidents/components/shared";
import { errorMessage } from "@/lib/api-client";
import { ALL_REGISTERS, LAW_ACTIVITIES, LAW_CATEGORIES } from "@/lib/law";
import { fetchSamplePackage, useInstallLawPackage, useLawSettings, usePreviewLawPackage, useSetUpNonComplianceType, type LawPackagePreviewDto, type LawSettingsDto } from "../../api";
import { blockersOf, formatDate, formatDateTime } from "../../format";

/** Version of the fictional sample update the server offers (`/api/law/content/sample`). */
const SAMPLE_VERSION = "2026.Q4";
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

/** Configuration → Law content & settings: legal content versions, installing updates, the Non Compliance incident type. */
export function LawSettings() {
  const settings = useLawSettings();
  return (
    <>
      <PageHeader title="Law content & settings" description="Install legal content updates and set up what Law needs from other modules." backHref="/configuration" backLabel="Configuration" />
      {settings.isPending ? (
        <LoadingRows rows={5} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="min-w-0 space-y-4">
            <LibraryCard settings={settings.data} />
          </div>
          <div className="min-w-0 space-y-4">
            <IncidentTypeCard settings={settings.data} />
            <VocabularyCard />
          </div>
        </div>
      )}
    </>
  );
}

// ── Legal content library ───────────────────────────────────────────────────

function LibraryCard({ settings }: { settings: LawSettingsDto }) {
  const library = settings.library;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2">
          <Library className="size-4 text-muted-foreground" /> Legal content library
        </CardTitle>
        <CardDescription>
          {library.latest ? (
            <>
              Current version <span className="font-medium text-foreground">{library.latest}</span>
              {library.jurisdictions.length ? ` · covers ${library.jurisdictions.join(", ")}` : ""}
            </>
          ) : (
            "No legal content installed yet."
          )}
        </CardDescription>
      </CardHeader>
      {library.versions.length > 0 ? (
        <ul className="divide-y">
          {library.versions.map((v) => {
            const added = v.changes.filter((c) => c.change === "NEW").length;
            const amended = v.changes.filter((c) => c.change === "AMENDED").length;
            return (
              <li key={v.version} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{v.version}</span>
                  {v.version === library.latest && <StatusBadge tone="success">Current</StatusBadge>}
                  <span className="text-xs text-muted-foreground">released {formatDate(v.releasedOn)}</span>
                </div>
                {v.summary && <p className="text-sm">{v.summary}</p>}
                <p className="text-xs text-muted-foreground">
                  {added} new · {amended} amended · {v.legislationCount} laws and guidance · {v.checklistCount} requirement checklists · installed {formatDateTime(v.installedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">Install the first content package below to fill the law library.</p>
      )}
      {library.canInstall ? (
        <div className="border-t p-4">
          <InstallUpdate sampleInstalled={library.versions.some((v) => v.version === SAMPLE_VERSION)} />
        </div>
      ) : (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Installing updates needs the Manage requirements permission for the whole company.</p>
      )}
    </Card>
  );
}

type Stage = { step: "choose" } | { step: "preview"; pkg: unknown; preview: LawPackagePreviewDto; source: string };

function InstallUpdate({ sampleInstalled }: { sampleInstalled: boolean }) {
  const [stage, setStage] = useState<Stage>({ step: "choose" });
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = usePreviewLawPackage();
  const install = useInstallLawPackage();

  const reset = () => {
    setStage({ step: "choose" });
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  async function check(pkg: unknown, source: string) {
    try {
      const result = await preview.mutateAsync(pkg);
      setStage({ step: "preview", pkg, preview: result, source });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function trySample() {
    setFileError(null);
    setLoadingSample(true);
    try {
      await check(await fetchSamplePackage(), `the sample update ${SAMPLE_VERSION}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingSample(false);
    }
  }

  async function downloadSample() {
    try {
      const pkg = await fetchSamplePackage();
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `law-content-${SAMPLE_VERSION}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function pickFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_PACKAGE_BYTES) {
      setFileError("This file is larger than 2 MB. A legal content package is a small .json file.");
      return;
    }
    let pkg: unknown;
    try {
      pkg = JSON.parse(await file.text());
    } catch (error) {
      setFileError(`“${file.name}” is not a valid package file: ${error instanceof Error ? error.message : "it could not be read"}.`);
      return;
    }
    await check(pkg, `“${file.name}”`);
  }

  async function confirmInstall(pkg: unknown) {
    try {
      const result = await install.mutateAsync(pkg);
      toast.success(`Legal content ${result.version} installed`, { description: `${result.changes} change${result.changes === 1 ? "" : "s"} added to the library. Profiles accept it on their own page.` });
      reset();
    } catch (error) {
      const blockers = blockersOf(error);
      toast.error(errorMessage(error), blockers.length ? { description: blockers.join(" ") } : undefined);
    }
  }

  if (stage.step === "preview") {
    const p = stage.preview;
    if (!p.ok) {
      return (
        <div className="space-y-3">
          <h3 className="font-medium">Check of {stage.source}</h3>
          <BlockerList title="This package cannot be installed" blockers={p.problems} tone="destructive" />
          <p className="text-sm text-muted-foreground">Nothing was installed.</p>
          <Button variant="outline" onClick={reset}>
            Choose another package
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div>
          <h3 className="font-medium">
            Update {p.version} · released {formatDate(p.released)}
          </h3>
          {p.summary && <p className="text-sm text-muted-foreground">{p.summary}</p>}
          {p.replaces && <p className="text-xs text-muted-foreground">Comes after {p.replaces}, the current version.</p>}
        </div>
        {p.changes.length ? (
          <ul className="divide-y rounded-lg border">
            {p.changes.map((c) => (
              <li key={`${c.kind}-${c.id}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                <StatusBadge tone={c.change === "NEW" ? "success" : "warning"} className="w-fit">
                  {c.change === "NEW" ? "New" : "Amended"}
                </StatusBadge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.kind === "legislation" ? "Law or guidance" : "Requirement checklist"} · {c.id} · {c.domain}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">This package changes nothing in the library.</p>
        )}
        <p className="text-sm">Installing adds this version to the library. Each profile keeps its current version until someone accepts the update on the profile page.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void confirmInstall(stage.pkg)} disabled={install.isPending}>
            <CheckCircle2 /> Install {p.version}
          </Button>
          <Button variant="outline" onClick={reset} disabled={install.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const busy = preview.isPending || loadingSample;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Install an update</h3>
        <p className="text-sm text-muted-foreground">You see what changes before anything is installed.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-muted-foreground" /> Try the sample update
          </p>
          <p className="text-xs text-muted-foreground">{sampleInstalled ? `The fictional sample update ${SAMPLE_VERSION} is already installed.` : `A fictional update (${SAMPLE_VERSION}) to see how updates work.`}</p>
          <div className="flex flex-wrap gap-2">
            {!sampleInstalled && (
              <Button size="sm" onClick={() => void trySample()} disabled={busy}>
                Try the sample update ({SAMPLE_VERSION})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void downloadSample()}>
              <Download /> Download the sample file
            </Button>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileJson className="size-4 text-muted-foreground" /> Upload a package file (.json)
          </p>
          <p className="text-xs text-muted-foreground">The file your legal content provider sent you – at most 2 MB.</p>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="Package file (.json)"
            disabled={busy}
            onChange={(e) => void pickFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
          />
          {fileError && (
            <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {fileError}
            </p>
          )}
        </div>
      </div>
      {busy && <p className="text-xs text-muted-foreground">Checking the package…</p>}
    </div>
  );
}

// ── Non Compliance incident type ────────────────────────────────────────────

function IncidentTypeCard({ settings }: { settings: LawSettingsDto }) {
  const setUp = useSetUpNonComplianceType();
  const t = settings.incidentType;

  async function run() {
    try {
      const result = await setUp.mutateAsync();
      if (result.ready) toast.success("Done – Law can now raise Non Compliance incidents.");
      else toast.warning(result.problem ?? "It is not ready yet.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" /> Raise incident from Law
        </CardTitle>
        <CardDescription>When a requirement is not met, Law can start a Non Compliance incident draft.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {t.ready ? (
          <p className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Ready – Law raises Non Compliance drafts with the incident type “{t.typeName}” and the form “{t.formName}”.
            </span>
          </p>
        ) : (
          <>
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#9a5b00] dark:text-warning" />
              <span>
                {t.problem ?? "Not ready yet."}
                {!settings.incidentsEnabled && " Corrective actions from Law still work."}
              </span>
            </p>
            {settings.incidentsEnabled &&
              (settings.canSetUpIncidentType && t.fixable ? (
                <Button onClick={() => void run()} disabled={setUp.isPending}>
                  <Settings2 /> Set it up for me
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Ask someone who can configure incidents (Configuration → Incident settings).</p>
              ))}
          </>
        )}
        {settings.incidentsEnabled && (
          <Link href="/configuration/incidents" className="inline-block text-sm font-medium text-brand hover:underline">
            Open incident settings
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ── Vocabulary (read-only) ──────────────────────────────────────────────────

function VocabularyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activities, categories and registers</CardTitle>
        <CardDescription>These come with the legal content. They cannot be changed in Lists, because content packages refer to them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Chips label="Activities (used by profiles to decide what applies)" items={LAW_ACTIVITIES} />
        <Chips label="Categories" items={LAW_CATEGORIES} />
        <Chips label="Registers" items={ALL_REGISTERS} />
      </CardContent>
    </Card>
  );
}

function Chips({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <StatusBadge key={i} tone="neutral">
            {i}
          </StatusBadge>
        ))}
      </div>
    </div>
  );
}
