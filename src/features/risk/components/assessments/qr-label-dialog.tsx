"use client";

import { Download, ExternalLink, Printer } from "lucide-react";
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { riskScanUrl } from "@/lib/risk/qr";
import type { AssessmentDetailDto } from "../../api";
import { formatDate } from "../../format";

const MODULE = 6;
const QUIET = 4;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** The label as a standalone SVG: QR code (module squares) + reference, title, responsible person and review date. */
function labelSvg(url: string, lines: { reference: string; title: string; owner: string; review: string; labelId: string }): { svg: string; width: number; height: number } {
  const qr = qrcode(0, "M");
  qr.addData(url, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  const qrSize = (count + QUIET * 2) * MODULE;
  const width = Math.max(qrSize, 360);
  const textTop = qrSize + 8;
  const height = textTop + 104;
  let path = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += `M${(c + QUIET) * MODULE + (width - qrSize) / 2},${(r + QUIET) * MODULE}h${MODULE}v${MODULE}h-${MODULE}z`;
    }
  }
  const title = lines.title.length > 42 ? `${lines.title.slice(0, 41)}…` : lines.title;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial, Helvetica, sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
<path d="${path}" fill="#000"/>
<text x="${width / 2}" y="${textTop + 20}" font-size="20" font-weight="700" text-anchor="middle" fill="#000">${escapeXml(lines.reference)}</text>
<text x="${width / 2}" y="${textTop + 44}" font-size="14" text-anchor="middle" fill="#000">${escapeXml(title)}</text>
<text x="${width / 2}" y="${textTop + 66}" font-size="12" text-anchor="middle" fill="#333">Responsible: ${escapeXml(lines.owner)}</text>
<text x="${width / 2}" y="${textTop + 84}" font-size="12" text-anchor="middle" fill="#333">Review due: ${escapeXml(lines.review)}</text>
<text x="${width / 2}" y="${textTop + 100}" font-size="10" text-anchor="middle" fill="#666">Scan to open after signing in · label ${escapeXml(lines.labelId)}</text>
</svg>`;
  return { svg, width, height };
}

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * QR label of an assessment: the same label keeps opening this assessment through reviews and
 * revisions (it encodes the reference). Scanning asks for sign-in and never bypasses access.
 */
export function QrLabelDialog({ open, onOpenChange, assessment }: { open: boolean; onOpenChange: (o: boolean) => void; assessment: AssessmentDetailDto }) {
  const { user } = useCurrentUser();
  const url = useMemo(() => (typeof window === "undefined" ? "" : riskScanUrl(window.location.origin, assessment.reference, user.organizationSlug)), [assessment.reference, user.organizationSlug]);
  const label = useMemo(
    () =>
      url
        ? labelSvg(url, { reference: assessment.reference, title: assessment.title, owner: assessment.owner?.name ?? "—", review: assessment.reviewDate ? formatDate(assessment.reviewDate) : "Not set", labelId: assessment.labelId })
        : null,
    [url, assessment],
  );
  const svgUrl = label ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(label.svg)}` : "";
  const fileBase = `${assessment.reference}-label`;

  function downloadPng() {
    if (!label) return;
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = label.width * scale;
      canvas.height = label.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      download(`${fileBase}.png`, canvas.toDataURL("image/png"));
    };
    img.onerror = () => toast.error("The PNG could not be created – download the SVG instead.");
    img.src = svgUrl;
  }

  function print() {
    if (!label) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) {
      toast.error("Allow pop-ups to print the label.");
      return;
    }
    w.document.write(`<!doctype html><title>${escapeXml(fileBase)}</title><body style="margin:0;display:flex;justify-content:center;padding:24px">${label.svg}</body>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR label · {assessment.reference}</DialogTitle>
          <DialogDescription>Stick it where the work happens. Scanning opens this assessment after sign-in{assessment.status === "APPROVED" ? " and offers the periodic review" : ""}. The label stays valid through reviews and revisions.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-xl border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
          {label && <img src={svgUrl} alt={`QR label for ${assessment.reference}`} width={label.width} height={label.height} className="h-auto max-w-full" />}
        </div>
        <p className="break-all text-xs text-muted-foreground">{url}</p>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Test link
            </a>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => download(`${fileBase}.svg`, svgUrl)}>
              <Download /> SVG
            </Button>
            <Button variant="outline" onClick={downloadPng}>
              <Download /> PNG
            </Button>
            <Button onClick={print}>
              <Printer /> Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
