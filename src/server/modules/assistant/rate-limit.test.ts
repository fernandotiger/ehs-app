import { describe, expect, it } from "vitest";
import { ASSISTANT_RATE_RULES, rateLimitMessage, SlidingWindowLimiter } from "./rate-limit";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit per window, then says how long to wait", () => {
    const c = clock();
    const limiter = new SlidingWindowLimiter([{ limit: 3, windowMs: 60_000 }], c.now);
    expect([limiter.hit("u"), limiter.hit("u"), limiter.hit("u")].every((d) => d.ok)).toBe(true);
    c.advance(20_000);
    expect(limiter.hit("u")).toEqual({ ok: false, retryAfterSeconds: 40 });
    c.advance(40_000);
    expect(limiter.hit("u")).toEqual({ ok: true });
  });

  it("counts people separately and does not count refused attempts", () => {
    const c = clock();
    const limiter = new SlidingWindowLimiter([{ limit: 1, windowMs: 10_000 }], c.now);
    expect(limiter.hit("a").ok).toBe(true);
    expect(limiter.hit("b").ok).toBe(true);
    expect(limiter.hit("a").ok).toBe(false);
    expect(limiter.hit("a").ok).toBe(false);
    c.advance(10_001);
    expect(limiter.hit("a").ok).toBe(true);
  });

  it("applies every rule – the hourly cap after several quiet minutes", () => {
    const c = clock();
    const limiter = new SlidingWindowLimiter(ASSISTANT_RATE_RULES, c.now);
    let allowed = 0;
    for (let minute = 0; minute < 15; minute++) {
      for (let i = 0; i < 6; i++) if (limiter.hit("u").ok) allowed++;
      expect(limiter.hit("u").ok).toBe(false); // 7th in a minute
      c.advance(60_000);
    }
    expect(allowed).toBe(60);
    const refused = limiter.hit("u");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBeGreaterThan(60);
  });

  it("forgets the least recently used people when it holds too many", () => {
    const c = clock();
    const limiter = new SlidingWindowLimiter([{ limit: 1, windowMs: 60_000 }], c.now, 2);
    limiter.hit("a");
    limiter.hit("b");
    limiter.hit("c"); // "a" is forgotten
    expect(limiter.hit("a").ok).toBe(true);
    expect(limiter.hit("c").ok).toBe(false);
  });
});

describe("rateLimitMessage", () => {
  it("uses seconds for short waits and minutes for long ones", () => {
    expect(rateLimitMessage(12)).toMatch(/12 seconds/);
    expect(rateLimitMessage(600)).toMatch(/10 minutes/);
  });
});
