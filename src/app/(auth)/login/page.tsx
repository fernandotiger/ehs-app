import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo, BrandMark } from "@/components/layout/brand-logo";
import { brandingCss, type BrandingDto } from "@/lib/branding";
import { getCurrentUser } from "@/server/auth/current-user";
import { publicBrandingService } from "@/server/modules/configuration/branding.service";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next, workspace } = await props.searchParams;
  const redirectTo = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  // Optional tenant look for /login?workspace=<slug> (public: name, colours and logo only).
  let tenant: BrandingDto | null = null;
  if (typeof workspace === "string" && /^[a-z0-9-]{1,50}$/.test(workspace)) {
    tenant = await publicBrandingService.bySlug(workspace).catch(() => null);
  }
  const css = tenant ? brandingCss(tenant.colours) : "";

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {css && <style data-tenant-branding>{css}</style>}
      <aside className="relative hidden overflow-hidden bg-brand text-brand-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-hex-pattern absolute inset-0" aria-hidden />
        <div className="relative flex items-center gap-3">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public logo route
            <img src={tenant.logoUrl} alt="" className="h-10 max-w-32 rounded bg-white/90 object-contain p-1" />
          ) : (
            <BrandMark className="size-10" />
          )}
          <span className="font-heading text-2xl font-semibold">{tenant?.name ?? "OleoQ EHS"}</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">Safer workplaces, one record at a time.</h2>
          <p className="mt-4 text-brand-foreground/75">
            Read and acknowledge your policies, keep track of the work assigned to you – even offline – and see
            every follow-up through to closure.
          </p>
        </div>
        <p className="relative text-xs text-brand-foreground/60">{tenant ? "OleoQ EHS · " : ""}Environment · Health · Safety</p>
      </aside>

      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          {tenant ? (
            <p className="mb-8 flex items-center gap-2 font-heading text-xl font-semibold text-brand lg:hidden">
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- public logo route
                <img src={tenant.logoUrl} alt="" className="h-8 max-w-24 object-contain" />
              ) : (
                <BrandMark className="size-7" />
              )}
              {tenant.name}
            </p>
          ) : (
            <BrandLogo className="mb-8 lg:hidden" />
          )}
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in with your work email to continue.</p>
          <LoginForm redirectTo={redirectTo} />
        </div>
      </main>
    </div>
  );
}
