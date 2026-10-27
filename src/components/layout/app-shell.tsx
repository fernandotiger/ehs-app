"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandingProvider } from "@/components/providers/branding-provider";
import { CurrentUserProvider, type SessionUser } from "@/components/providers/current-user-provider";
import { warmOfflineRoutes } from "@/components/pwa/service-worker-registrar";
import { QueryProvider } from "@/components/providers/query-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { BrandingDto } from "@/lib/branding";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";

export function AppShell({
  user,
  branding,
  defaultOpen,
  children,
}: {
  user: SessionUser;
  /** Tenant name, colours (validated hex) and logo – colours become CSS variables for the whole app, portals included. */
  branding?: BrandingDto;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  // The API signals an expired session; send the user back to sign in.
  useEffect(() => {
    warmOfflineRoutes();
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener("ehs:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ehs:unauthorized", onUnauthorized);
  }, [router]);

  return (
    <CurrentUserProvider user={user}>
      <BrandingProvider branding={branding ?? { name: user.organizationName, colours: {}, logoUrl: null }}>
        <QueryProvider userId={user.id}>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar />
            <SidebarInset className="min-w-0 bg-background">
              <AppHeader />
              <main className="flex-1 px-3 pb-24 pt-4 md:px-6 md:pb-10 md:pt-6">
                <div className="mx-auto w-full max-w-7xl">{children}</div>
              </main>
            </SidebarInset>
            <MobileBottomNav />
          </SidebarProvider>
        </QueryProvider>
      </BrandingProvider>
    </CurrentUserProvider>
  );
}
