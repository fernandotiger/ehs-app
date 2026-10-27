"use client";

import { FilePlus2, FileText, Inbox, LayoutDashboard, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { PERMISSIONS } from "@/lib/permissions";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** Thumb-friendly bottom navigation for phones: Home, My work, Report (incidents) or Documents, Menu. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { hasModule, can } = useCurrentUser();
  const { setOpenMobile } = useSidebar();

  const tabs = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/my-work", label: "My work", icon: Inbox },
    ...(hasModule("incidents") && can(PERMISSIONS.INCIDENT_CREATE)
      ? [{ href: "/incidents/new", label: "Report", icon: FilePlus2 }]
      : hasModule("documents")
        ? [{ href: "/documents", label: "Documents", icon: FileText }]
        : []),
  ];
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-safe backdrop-blur md:hidden" aria-label="Primary">
      <div className={cn("mx-auto grid h-16 max-w-md items-center", tabs.length === 3 ? "grid-cols-4" : "grid-cols-3")}>
        {tabs.map((t) => (
          <Tab key={t.href} {...t} active={active(t.href)} />
        ))}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground"
        >
          <Menu className="size-5" />
          Menu
        </button>
      </div>
    </nav>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof FileText; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center gap-1 text-[11px]", active ? "font-medium text-brand" : "text-muted-foreground")}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
