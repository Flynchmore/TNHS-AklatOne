import { setTimeout, clearTimeout } from "node:timers";
import { Redis } from "ioredis";
import { MemoryStore, type Options, type Store, type IncrementResponse } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Optional Redis for shared sign-in limits. When Redis is down the API keeps running on in-memory counters,
 * warns once (not on every retry), keeps retrying quietly and switches back as soon as Redis is up again.
 */
export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { lazyConnect: false, retryStrategy: (times) => Math.min(times * 1000, 10_000), maxRetriesPerRequest: 1 })
  : null;

let warned = false;
redis?.on("error", (err: Error) => {
  if (warned) return;
  warned = true;
  logger.warn({ code: (err as { code?: string }).code }, "Redis is not reachable; sign-in limits use memory until it is back (start it with: docker start aklatone-redis)");
});
redis?.on("ready", () => {
  if (warned) logger.info("Redis is back; sign-in limits are shared again");
  warned = false;
});

export const redisReady = () => redis?.status === "ready";

/** Waits up to `ms` for Redis to finish connecting (used by the startup summary). */
export function waitForRedis(ms = 1500): Promise<boolean> {
  if (!redis) return Promise.resolve(false);
  if (redisReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v: boolean) => { clearTimeout(t); redis.off("ready", onReady); resolve(v); };
    const onReady = () => done(true);
    const t = setTimeout(() => done(false), ms);
    redis.once("ready", onReady);
  });
}

/** Rate-limit store: Redis while it is reachable, memory otherwise. */
export class FallbackStore implements Store {
  private memory = new MemoryStore();
  private remote?: RedisStore;
  private options?: Options;
  constructor(public prefix: string) {}

  init(options: Options) {
    this.options = options;
    this.memory.init(options);
  }

  // Created on first use while Redis is ready, so no script load is queued against a dead connection.
  private live(): RedisStore | undefined {
    if (!redis || !redisReady()) return undefined;
    if (!this.remote) {
      this.remote = new RedisStore({ prefix: this.prefix, sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<never> });
      if (this.options) this.remote.init(this.options);
    }
    return this.remote;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const r = this.live();
    if (r) { try { return await r.increment(key); } catch { /* Redis dropped mid-request: count in memory */ } }
    return this.memory.increment(key);
  }
  async decrement(key: string) {
    const r = this.live();
    if (r) { try { return await r.decrement(key); } catch { /* fall back */ } }
    return this.memory.decrement(key);
  }
  async resetKey(key: string) {
    const r = this.live();
    if (r) { try { await r.resetKey(key); } catch { /* fall back */ } }
    return this.memory.resetKey(key);
  }
}
