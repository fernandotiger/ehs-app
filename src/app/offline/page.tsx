import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";

export const metadata: Metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Fallback shown by the service worker for pages that were never cached. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <BrandLogo />
      <div className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
        <CloudOff className="size-8" />
      </div>
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page hasn&apos;t been saved for offline use yet. Documents and pages you have opened before are
          still available. Anything you record offline will sync when you press Sync.
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/dashboard" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Home</Link>
        <Link href="/my-work" className="rounded-lg border px-4 py-2 text-sm font-medium">My work</Link>
      </div>
    </main>
  );
}
