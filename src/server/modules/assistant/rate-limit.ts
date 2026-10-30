/**
 * In-memory sliding-window rate limit for the AI assistant (per user). It protects the shared
 * OpenRouter key – the free tier allows 20 requests a minute and 50 a day (1,000 with ≥ 10
 * credits bought) for the whole company. Each server instance keeps its own counters, so with
 * several instances (Vercel functions, ECS tasks) the real limit is a multiple – good enough for
 * a help chat; a shared store (Postgres / Redis) is the upgrade path (docs/modules/assistant.md).
 */

export interface RateRule {
  limit: number;
  windowMs: number;
}

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly longestWindow: number;

  constructor(
    private readonly rules: readonly RateRule[],
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 20_000,
  ) {
    this.longestWindow = Math.max(...rules.map((r) => r.windowMs));
  }

  /** Records the attempt when it is allowed; a refused attempt is not counted. */
  hit(key: string): RateDecision {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.longestWindow);
    let retryAfterMs = 0;
    for (const rule of this.rules) {
      const inWindow = recent.filter((t) => t > now - rule.windowMs);
      if (inWindow.length >= rule.limit) {
        // The oldest hit inside the window has to age out before the next one is allowed.
        const oldest = inWindow[inWindow.length - rule.limit];
        retryAfterMs = Math.max(retryAfterMs, oldest + rule.windowMs - now);
      }
    }
    if (retryAfterMs > 0) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    recent.push(now);
    this.hits.delete(key); // re-insert so the Map stays in least-recently-used order
    this.hits.set(key, recent);
    this.prune();
    return { ok: true };
  }

  private prune() {
    while (this.hits.size > this.maxKeys) {
      const oldestKey = this.hits.keys().next().value;
      if (oldestKey === undefined) break;
      this.hits.delete(oldestKey);
    }
  }
}

/** Per person: 6 questions a minute and 60 an hour (the Configuration test box counts too). */
export const ASSISTANT_RATE_RULES: readonly RateRule[] = [
  { limit: 6, windowMs: 60_000 },
  { limit: 60, windowMs: 60 * 60_000 },
];

const globalForLimiter = globalThis as unknown as { __assistantLimiter?: SlidingWindowLimiter };

export const assistantLimiter = (globalForLimiter.__assistantLimiter ??= new SlidingWindowLimiter(ASSISTANT_RATE_RULES));

/** Plain-words message for a refused attempt. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  if (retryAfterSeconds <= 90) return `You're asking a little fast – please wait ${retryAfterSeconds} seconds and try again.`;
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `You've reached the limit of questions for now – please try again in ${minutes} minutes.`;
}
