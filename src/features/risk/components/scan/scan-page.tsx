"use client";

import { Camera, ImageUp, ScanLine, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api-client";
import { parseScanInput, riskQrValue } from "@/lib/risk/qr";
import { resolveScan } from "../../api";

interface DetectedCode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource | ImageBitmap): Promise<DetectedCode[]>;
}
type DetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const noopSubscribe = () => () => {};

function scanError(e: unknown, key: string): string {
  if (e instanceof ApiError && e.status === 404) return `No assessment you can open has the label ${key}. Check you are signed in to the right company.`;
  return e instanceof Error ? e.message : "The label could not be opened.";
}

function detectorCtor(): DetectorCtor | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector : null;
}

/**
 * QR field access: a label link (`/scan?qr=risk:RA-…`), a camera / image scan (where the browser
 * supports it) or a typed reference opens the assessment – Approved ones open their periodic
 * review. This page is behind sign-in and resolves inside the user's company and access only.
 */
export function ScanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useCurrentUser();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Client-only capability (null during server rendering, so hydration matches).
  const Detector = useSyncExternalStore(noopSubscribe, detectorCtor, () => null);
  const qr = params.get("qr");
  const workspace = params.get("workspace");
  const handled = useRef(false);
  const wrongWorkspace = Boolean(qr && workspace && workspace !== user.organizationSlug);

  const open = useCallback(
    async (raw: string) => {
      setError(null);
      let key: string;
      try {
        key = parseScanInput(raw, window.location.href).key;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Scan a label or type an assessment reference.");
        return;
      }
      setBusy(true);
      try {
        const result = await resolveScan(riskQrValue(key));
        router.replace(result.href);
      } catch (e) {
        setBusy(false);
        setError(scanError(e, key));
      }
    },
    [router],
  );

  useEffect(() => {
    if (!qr || handled.current) return;
    handled.current = true;
    if (wrongWorkspace) return;
    // Label link: the server parses and resolves the qr value; state changes only in the callbacks.
    resolveScan(qr)
      .then((result) => router.replace(result.href))
      .catch((e: unknown) => setError(scanError(e, qr.replace(/^risk:/i, ""))));
  }, [qr, wrongWorkspace, router]);

  useEffect(() => {
    if (!camera || !Detector) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    const detector = new Detector({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        while (!stopped) {
          const codes = await detector.detect(videoRef.current).catch(() => []);
          if (codes[0]) {
            stopped = true;
            setCamera(false);
            void open(codes[0].rawValue);
            break;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        setError("The camera could not be started – type the reference instead.");
        setCamera(false);
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, Detector, open]);

  async function fromImage(file: File) {
    if (!Detector) return;
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      if (!codes[0]) setError("No QR code found in that image.");
      else void open(codes[0].rawValue);
    } catch {
      setError("The image could not be read.");
    }
  }

  return (
    <>
      <PageHeader title="Scan a label" description="Open a risk assessment from its QR label or its reference. Approved assessments open their periodic review." />
      <div className="mx-auto max-w-xl space-y-4">
        {(busy || (qr && !wrongWorkspace && !error)) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Opening the assessment…
          </p>
        )}
        {wrongWorkspace && (
          <Alert variant="destructive">
            <AlertDescription>This label belongs to another company workspace. Sign in to that workspace to open it.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4 text-brand" /> Type the reference
            </CardTitle>
            <CardDescription>The reference is printed under the QR code, e.g. RA-2026-0002.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void open(value);
              }}
            >
              <Field className="flex-1">
                <FieldLabel htmlFor="scan-ref" className="sr-only">
                  Assessment reference or label link
                </FieldLabel>
                <Input id="scan-ref" value={value} onChange={(e) => setValue(e.target.value)} placeholder="RA-2026-0002 or a label link" autoComplete="off" />
              </Field>
              <Button type="submit" disabled={busy || !value.trim()}>
                <Search /> Open
              </Button>
            </form>
          </CardContent>
        </Card>
        {Detector ? (
          <Card>
            <CardHeader>
              <CardTitle>Scan with this device</CardTitle>
              <CardDescription>Point the camera at the label, or choose a photo of it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {camera && <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setCamera((c) => !c)}>
                  <Camera /> {camera ? "Stop camera" : "Use camera"}
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <ImageUp /> QR image
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void fromImage(e.target.files[0])} />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Field>
            <FieldDescription>Tip: the phone camera app opens the label link directly; you are asked to sign in first.</FieldDescription>
          </Field>
        )}
      </div>
    </>
  );
}
