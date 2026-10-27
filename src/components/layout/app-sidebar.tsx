"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useBranding } from "@/components/providers/branding-provider";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandMark } from "./brand-logo";
import { TOP_ITEMS, allNavItems, findActiveHref, visibleSections, type NavItem, type NavSection } from "./nav-config";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function NavLink({ item, activeHref }: { item: NavItem; activeHref: string | null }) {
  const { setOpenMobile } = useSidebar();
  const active = item.href === activeHref;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.title}
        className="h-10 rounded-lg data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-brand"
      >
        <Link href={item.href} onClick={() => setOpenMobile(false)}>
          <span
            className={
              active
                ? "flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground"
                : "flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand"
            }
          >
            <item.icon className="size-3.5" />
          </span>
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** A module section that folds away; the section holding the current page opens by itself. */
function CollapsibleSection({ section, activeHref }: { section: NavSection; activeHref: string | null }) {
  const containsActive = section.items.some((i) => i.href === activeHref);
  const [open, setOpen] = useState(containsActive);
  // Navigating into the section opens it (state adjusted during render, not in an effect).
  const [wasActive, setWasActive] = useState(containsActive);
  if (containsActive !== wasActive) {
    setWasActive(containsActive);
    if (containsActive) setOpen(true);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CollapsibleTrigger className="flex w-full items-center gap-2 hover:text-foreground">
            <section.icon className="size-3.5" />
            <span className="flex-1 text-left">{section.title}</span>
            <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} activeHref={activeHref} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const { branding } = useBranding();
  const sections = visibleSections(user);
  const activeHref = findActiveHref(pathname, allNavItems(user));
  // A section with a single item of the same name (Configuration) is a plain link, not a folder.
  const isSingle = (s: NavSection) => s.items.length === 1 && s.items[0]!.title === s.title;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-4 px-4 pt-5 group-data-[collapsible=icon]:px-2">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 text-brand" title={user.organizationName}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorised API route, not a static asset
            <img src={branding.logoUrl} alt="" className="size-8 shrink-0 rounded object-contain" />
          ) : (
            <BrandMark className="size-7 shrink-0" />
          )}
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-heading text-base font-semibold leading-tight">{user.organizationName}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">OleoQ EHS</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-2.5 group-data-[collapsible=icon]:hidden">
          <Avatar className="size-9 border border-border">
            <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-muted-foreground">Hello</p>
            <p className="truncate text-sm font-semibold">{user.name}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {TOP_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} activeHref={activeHref} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {sections.map((section) =>
          isSingle(section) ? (
            <SidebarGroup key={section.key} className="py-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavLink item={section.items[0]!} activeHref={activeHref} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <CollapsibleSection key={section.key} section={section} activeHref={activeHref} />
          ),
        )}
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
        {[user.siteName, user.locationName, user.departmentName].filter(Boolean).join(" · ") || "Whole company"}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
