import { describe, it, expect } from "vitest";
import { FallbackStore } from "../src/config/redis.js";

// Tests run with REDIS_URL blank, so the store must work on memory alone (the "Redis is down" case).
describe("rate-limit fallback store", () => {
  it("counts in memory when Redis is not available", async () => {
    const s = new FallbackStore("rl:test:");
    s.init({ windowMs: 60_000 } as never);
    expect((await s.increment("ip:user")).totalHits).toBe(1);
    expect((await s.increment("ip:user")).totalHits).toBe(2);
    await s.decrement("ip:user");
    expect((await s.increment("ip:user")).totalHits).toBe(2);
    await s.resetKey("ip:user");
    expect((await s.increment("ip:user")).totalHits).toBe(1);
  });
});
