export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

export function createRateLimiter({ limit, windowMs }: RateLimiterOptions) {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  function record(key: string): boolean {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now >= entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  }

  function reset(key?: string): void {
    if (key) {
      attempts.delete(key);
    } else {
      attempts.clear();
    }
  }

  return { record, reset };
}