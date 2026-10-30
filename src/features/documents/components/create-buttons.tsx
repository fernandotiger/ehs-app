"use client";

import { ClipboardCheck, FileUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SOLID = "bg-white text-brand-dark hover:bg-white/90";
const OUTLINE = "border-white/30 bg-transparent text-brand-foreground hover:bg-white/10 hover:text-brand-foreground";

/** Banner button on the blue background: solid white for the page or tab's main job, outlined otherwise; full width on phones. */
function BannerLinkButton({ href, solid, children }: { href: string; solid: boolean; children: React.ReactNode }) {
  return (
    <Button asChild size="lg" variant={solid ? "default" : "outline"} className={cn("w-full sm:w-auto", solid ? SOLID : OUTLINE)}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function UploadDocumentButton({ solid = true }: { solid?: boolean }) {
  return (
    <BannerLinkButton href="/documents/manage/new" solid={solid}>
      <FileUp /> Upload document
    </BannerLinkButton>
  );
}

export function CreateResponseFormButton({ solid = true }: { solid?: boolean }) {
  return (
    <BannerLinkButton href="/documents/surveys/new" solid={solid}>
      <ClipboardCheck /> Create response form
    </BannerLinkButton>
  );
}

/**
 * Upload document · Create response form for the Document Library banner (My Documents shows only the first, My Response
 * Forms only the second).
 * Render them only for `documents.manage`. `primary` is the solid one – the open tab's job.
 */
export function DocumentCreateButtons({ primary = "document" }: { primary?: "document" | "form" }) {
  return (
    <>
      <UploadDocumentButton solid={primary === "document"} />
      <CreateResponseFormButton solid={primary === "form"} />
    </>
  );
}
