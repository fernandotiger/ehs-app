import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/server/auth/current-user";
import { organizationService } from "@/server/modules/organisation/organization.service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [cookieStore, branding] = await Promise.all([cookies(), organizationService.shellBranding(user.organizationId)]);
  const sidebarState = cookieStore.get("sidebar_state")?.value;

  return (
    <AppShell user={user} branding={branding} defaultOpen={sidebarState !== "false"}>
      {children}
    </AppShell>
  );
}
