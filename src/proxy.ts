import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirect only (no database access). Real authorisation happens in
 * layouts and API handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (!hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/dashboard" : "/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals, PWA assets and static files.
  matcher: ["/((?!api|_next/static|_next/image|sw.js|manifest.webmanifest|icons|offline|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt)$).*)"],
};
