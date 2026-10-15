import { describe, expect, it } from 'vitest';
import { createRateLimiter, createResponseCache, searchCacheKey, searchClientKey } from './catalog-guard.js';

describe('catalog guard', () => {
  it('rejects an over-long client key and bounds a search cache entry', () => {
    expect(searchClientKey(() => undefined)).toBe('local');
    expect(searchClientKey((name) => (name === 'x-forwarded-for' ? `${'1'.repeat(81)}, 10.0.0.2` : undefined))).toBe('local');
    expect(searchClientKey((name) => (name === 'x-real-ip' ? '10.0.0.8' : undefined))).toBe('10.0.0.8');
    expect(searchCacheKey({ search: 'mega', perPage: 8 })).toBe(
      searchCacheKey({ search: 'mega', perPage: 8, page: 1 }),
    );
  });

  it('expires cached search responses and blocks the next request in the window', () => {
    let now = 1_000;
    const cache = createResponseCache<string>(15_000, 2, () => now);
    cache.set('a', 'one');
    expect(cache.get('a')).toBe('one');
    now = 16_001;
    expect(cache.get('a')).toBeUndefined();

    const limiter = createRateLimiter(2, 10_000, () => now);
    expect(limiter.allow('client')).toBe(true);
    expect(limiter.allow('client')).toBe(true);
    expect(limiter.allow('client')).toBe(false);
    now += 10_000;
    expect(limiter.allow('client')).toBe(true);
  });
});
