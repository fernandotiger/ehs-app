import "server-only";
import { notFound, redirect } from "next/navigation";
import type { ModuleKey } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";
import { getCurrentUser, type CurrentUser } from "./current-user";

/**
 * For server page components: returns the user when they hold ANY of the permissions,
 * `null` when signed in without access (render <AccessDenied/>), and redirects to
 * /login when not signed in.
 */
export async function guardPage(...permissions: Permission[]): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permissions.length && !permissions.some((p) => user.permissions.includes(p))) return null;
  return user;
}

/** Like guardPage, and 404s when the tenant has not enabled the module. */
export async function guardModulePage(module: ModuleKey, ...permissions: Permission[]): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.enabledModules.includes(module)) notFound();
  if (permissions.length && !permissions.some((p) => user.permissions.includes(p))) return null;
  return user;
}
