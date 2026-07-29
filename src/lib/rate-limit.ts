/**
 * A rate limiter that holds ACROSS app instances when configured, and degrades
 * to per-process in-memory when it is not.
 *
 * The login route already had an honest in-memory limiter with a note that a
 * real deploy wants Redis or the edge. This is that, without betraying the
 * codebase's dependency-free ethos: the shared backend speaks the Upstash Redis
 * REST API — plain fetch and a bearer token, no client library, and it works on
 * the edge runtime too. Set RATE_LIMIT_REST_URL and RATE_LIMIT_REST_TOKEN to turn
 * it on; unset, logins are still limited, just per-process (fine for one server).
 *
 * It FAILS OPEN. A rate store that is down must not lock every user out of
 * login — the limiter is a brake on abuse, not a gate on the front door.
 */

export interface RateLimitResult {
  limited: boolean;
  count: number;
}

interface Backend {
  hit(key: string, windowMs: number, max: number): Promise<RateLimitResult>;
}

/** Per-process. The original login limiter, extracted so it can be swapped. */
class MemoryBackend implements Backend {
  private map = new Map<string, { count: number; first: number }>();

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now - entry.first > windowMs) {
      this.map.set(key, { count: 1, first: now });
      return { limited: false, count: 1 };
    }
    entry.count += 1;
    // Keep the map from growing without bound in a long-lived process.
    if (this.map.size > 10_000) {
      for (const [k, v] of this.map) if (now - v.first > windowMs) this.map.delete(k);
    }
    return { limited: entry.count > max, count: entry.count };
  }
}

/**
 * Shared across instances via the Upstash Redis REST API. INCR the key and set
 * its TTL to the window each hit; the counter resets once a window passes with
 * no attempts. Fixed-window, which is exactly the shape login abuse needs.
 */
class RestBackend implements Backend {
  constructor(
    private url: string,
    private token: string,
  ) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
    try {
      const res = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(windowSec)],
        ]),
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) throw new Error(`rate store responded ${res.status}`);
      const out = (await res.json()) as Array<{ result?: number }>;
      const count = Number(out?.[0]?.result ?? 0);
      return { limited: count > max, count };
    } catch (err) {
      // Fail open — see the file header. A store outage allows the attempt.
      console.error("[rate-limit] backend error, allowing:", err instanceof Error ? err.message : err);
      return { limited: false, count: 0 };
    }
  }
}

let backend: Backend | null = null;

function selectBackend(): Backend {
  if (backend) return backend;
  const url = process.env.RATE_LIMIT_REST_URL;
  const token = process.env.RATE_LIMIT_REST_TOKEN;
  backend = url && token ? new RestBackend(url, token) : new MemoryBackend();
  return backend;
}

/** True when a shared, cross-instance limiter is configured. */
export function usingSharedRateLimiter(): boolean {
  return Boolean(process.env.RATE_LIMIT_REST_URL && process.env.RATE_LIMIT_REST_TOKEN);
}

/** Record a hit for `key`, returning whether it is now over the limit. */
export function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  return selectBackend().hit(key, opts.windowMs, opts.max);
}

/** Test seam only — forces the backend to be re-selected (e.g. after setting env). */
export function __resetRateLimiter() {
  backend = null;
}
