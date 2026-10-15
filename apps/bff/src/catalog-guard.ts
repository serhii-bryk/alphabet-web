export const SEARCH_RATE_LIMIT = 30;
export const SEARCH_RATE_WINDOW_MS = 10_000;
export const SEARCH_CACHE_MS = 15_000;
export const SEARCH_CACHE_MAX = 32;
export const CATALOG_LIST_CACHE_MS = 60_000;

export function searchClientKey(header: (name: string) => string | undefined): string {
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  if (forwarded.length > 0 && forwarded.length <= 80) return forwarded;
  const real = header('x-real-ip')?.trim() ?? '';
  if (real.length > 0 && real.length <= 80) return real;
  return 'local';
}

export function searchCacheKey(filters: {
  page?: number;
  perPage?: number;
  search?: string;
  category?: string;
  provider?: string;
  groupedProvider?: string;
  type?: string;
}): string {
  return JSON.stringify({
    page: filters.page ?? 1,
    perPage: filters.perPage ?? 0,
    search: filters.search ?? '',
    category: filters.category ?? '',
    provider: filters.provider ?? '',
    groupedProvider: filters.groupedProvider ?? '',
    type: filters.type ?? '',
  });
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string) {
      const time = now();
      const recent = (hits.get(key) ?? []).filter((at) => time - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      hits.set(key, recent);
      if (hits.size > 5_000) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined && oldest !== key) hits.delete(oldest);
      }
      return true;
    },
  };
}

export function createResponseCache<T>(ttlMs: number, maxEntries: number, now: () => number = Date.now) {
  const entries = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, { at: now(), value });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export function createInflight<T>() {
  const pending = new Map<string, Promise<T>>();
  return {
    run(key: string, load: () => Promise<T>) {
      const existing = pending.get(key);
      if (existing) return existing;
      const request = load().finally(() => {
        pending.delete(key);
      });
      pending.set(key, request);
      return request;
    },
  };
}
