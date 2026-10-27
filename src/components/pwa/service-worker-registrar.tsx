"use client";

import { useEffect } from "react";

const ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true";

/** Registers /sw.js. Disabled in `next dev` unless NEXT_PUBLIC_ENABLE_SW=true. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!ENABLED || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }, []);
  return null;
}

/** Ask the service worker to pre-cache the core app screens for offline use. */
export function warmOfflineRoutes() {
  if (!ENABLED || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "WARM_ROUTES" })).catch(() => {});
}
