import { HttpRequest, HttpResponseInit } from '@azure/functions';

// Simple fixed-window rate limiter, in memory per function instance. That's
// deliberately unfancy: it needs no storage round-trip and is enough to stop
// someone hammering the API from a script; a scaled-out attacker gets one
// window per instance, which is still a tiny multiple of the limit.

const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** The original caller is first in x-forwarded-for ("ip:port, proxy:port…"). */
function clientIp(req: HttpRequest): string {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  // Azure appends a :port to IPv4 addresses — strip it (IPv6 colons stay intact)
  const m = first.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  return m ? m[1] : first || 'unknown';
}

/**
 * Count a request against `limit` per IP per minute for the given route.
 * Returns a ready-made 429 response when over the limit, null when allowed.
 */
export function rateLimit(req: HttpRequest, route: string, limit: number): HttpResponseInit | null {
  const now = Date.now();
  // opportunistic prune so the map can't grow without bound
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const key = `${route}:${clientIp(req)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  bucket.count++;
  if (bucket.count > limit) {
    return {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))) },
      jsonBody: { error: 'too many requests — slow down' },
    };
  }
  return null;
}
