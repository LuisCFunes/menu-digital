import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rateLimit';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRateLimiter', () => {
  it('allows attempts up to the limit, then blocks', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.record('ip')).toBe(false);
    expect(limiter.record('ip')).toBe(false);
    expect(limiter.record('ip')).toBe(false);
    expect(limiter.record('ip')).toBe(true);
    expect(limiter.record('other')).toBe(false);
  });

  it('resets a key after the window expires', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    limiter.record('ip');
    limiter.record('ip');
    limiter.record('ip');
    vi.advanceTimersByTime(1001);
    expect(limiter.record('ip')).toBe(false);
  });

  it('resets a specific key or everything', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.record('a');
    limiter.record('b');
    limiter.reset('a');
    expect(limiter.record('a')).toBe(false);
    limiter.reset();
    expect(limiter.record('b')).toBe(false);
  });
});