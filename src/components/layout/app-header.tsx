"use client";

import { Suspense } from "react";
import { useBranding } from "@/components/providers/branding-provider";
import { Separator } from "@/components/ui/separator";
import { FavouriteStarButton } from "@/features/favourites/components/favourite-star-button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";
import { SyncButton } from "./sync-button";
import { UserMenu } from "./user-menu";

export function AppHeader() {
  const { branding } = useBranding();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-5">
      <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
      <Separator orientation="vertical" className="mr-1 hidden h-5 md:block" />
      {branding.logoUrl ? (
        <span className="flex min-w-0 items-center gap-2 md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- authorised API route */}
          <img src={branding.logoUrl} alt="" className="h-7 max-w-20 object-contain" />
          <span className="truncate font-heading text-base font-semibold text-brand">{branding.name}</span>
        </span>
      ) : (
        <BrandLogo className="md:hidden" />
      )}
      <div className="ml-auto flex items-center gap-1">
        {/* The star reads the query string (useSearchParams), so it sits in its own Suspense boundary. */}
        <Suspense fallback={null}>
          <FavouriteStarButton />
        </Suspense>
        <SyncButton />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
