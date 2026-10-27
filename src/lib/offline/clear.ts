"use client";

import { clear as clearKeyval } from "idb-keyval";

/**
 * Removes cached data on sign-out so the next user of a shared device cannot see it.
 * Queued (unsynced) outbox operations are kept – they are scoped by user id and only
 * replayed for their owner.
 */
export async function clearOfflineData() {
  try {
    await clearKeyval();
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("ehs-api") || k.startsWith("ehs-files") || k.startsWith("ehs-pages")).map((k) => caches.delete(k)));
    }
  } catch {
    // best effort
  }
}
