import type {
  CatalogCategory,
  CatalogGameFilters,
  CatalogGamesResponse,
  CatalogLobbyResponse,
  PlatformGameType,
} from '@brand/contracts';

const DEFAULT_BFF_URL = 'http://localhost:4000';
const MAX_FILTER_LENGTH = 200;

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export class CatalogUnavailableError extends Error {
  constructor() {
    super('Catalog is unavailable');
    this.name = 'CatalogUnavailableError';
  }
}

export function getCategoryFilterValue(category: CatalogCategory): string {
  return category.slug;
}

function scalar(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_FILTER_LENGTH ? trimmed : undefined;
}

export function parseCatalogFilters(searchParams: CatalogSearchParams): CatalogGameFilters {
  const pageValue = scalar(searchParams.page);
  const page = pageValue && /^\d+$/.test(pageValue) ? Number(pageValue) : undefined;

  return {
    page: page && Number.isSafeInteger(page) && page > 0 ? page : undefined,
    search: scalar(searchParams.search),
    category: scalar(searchParams.category),
    provider: scalar(searchParams.provider),
    groupedProvider: scalar(searchParams.group),
  };
}

export function toCatalogQuery(filters: CatalogGameFilters): string {
  const query = new URLSearchParams();
  if (filters.page) query.set('page', String(filters.page));
  if (filters.perPage) query.set('limit', String(filters.perPage));
  if (filters.search) query.set('search', filters.search);
  if (filters.category) query.set('category', filters.category);
  if (filters.provider) query.set('provider', filters.provider);
  if (filters.groupedProvider) query.set('grouped_provider', filters.groupedProvider);
  if (filters.type) query.set('type', filters.type);
  return query.toString();
}

function onNetlify(env: Record<string, string | undefined>): boolean {
  // NETLIFY and DEPLOY_PRIME_URL exist while the site builds. The Next.js
  // server function only receives URL, SITE_ID, and SITE_NAME.
  return env.NETLIFY === 'true' || Boolean(env.SITE_ID?.trim()) || Boolean(env.SITE_NAME?.trim());
}

export function resolveBffBaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (onNetlify(env)) {
    const site = siteOrigin(env.DEPLOY_PRIME_URL) ?? siteOrigin(env.URL);
    if (site) return `${site}/api`;
  }
  const configured = env.BFF_INTERNAL_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return DEFAULT_BFF_URL;
}

function siteOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

const CATALOG_ENV_NAMES = [
  'NETLIFY',
  'URL',
  'DEPLOY_PRIME_URL',
  'DEPLOY_URL',
  'SITE_ID',
  'SITE_NAME',
  'BFF_INTERNAL_URL',
] as const;

function catalogEnvPresence(env: Record<string, string | undefined>): string[] {
  return CATALOG_ENV_NAMES.filter((name) => Boolean(env[name]?.trim()));
}

function sanitizeDiagnosticMessage(message: string): string {
  return message
    .replace(/[\r\n]/g, ' ')
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/\b(token|secret|password|signature|api[-_]?key|authorization|cookie)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 180);
}

function fetchErrorFacts(error: unknown): { name: string; code: string | null; message: string } {
  const current = error instanceof Error ? error : null;
  const cause = current?.cause instanceof Error ? current.cause : null;
  const codeOf = (value: Error | null) =>
    value && 'code' in value && typeof value.code === 'string' ? value.code : null;
  return {
    name: cause?.name ?? current?.name ?? 'unknown',
    code: codeOf(cause) ?? codeOf(current),
    message: sanitizeDiagnosticMessage(cause?.message ?? current?.message ?? 'unknown'),
  };
}

async function bffErrorCode(response: Response): Promise<string | null> {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('json')) return null;
  try {
    const text = await response.clone().text();
    if (text.length > 500) return null;
    const parsed = JSON.parse(text) as { error?: { code?: unknown } };
    const code = parsed.error?.code;
    return typeof code === 'string' && /^[a-z0-9_]{1,40}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function logCatalogLobby(
  env: Record<string, string | undefined>,
  entry: Record<string, unknown>,
): void {
  // Temporary production diagnosis. Names and the resolved catalog URL only.
  console.error(
    `[catalog-ssr] ${JSON.stringify({
      netlifyFlag: env.NETLIFY === 'true',
      envPresent: catalogEnvPresence(env),
      cache: 'no-store',
      ...entry,
    })}`,
  );
}

async function requestCatalog<T>(path: string, filters: CatalogGameFilters): Promise<T> {
  const env = process.env;
  const baseUrl = resolveBffBaseUrl(env);
  const query = toCatalogQuery(filters);
  const url = `${baseUrl}${path}${query ? `?${query}` : ''}`;
  const started = Date.now();
  const lobby = path === '/catalog/lobby';

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const durationMs = Date.now() - started;
    if (!response.ok) {
      if (lobby) {
        logCatalogLobby(env, {
          url,
          status: response.status,
          durationMs,
          contentType: response.headers.get('content-type'),
          errorCode: await bffErrorCode(response),
        });
      }
      throw new CatalogUnavailableError();
    }
    try {
      const body = (await response.json()) as T;
      return body;
    } catch (error) {
      if (lobby) {
        logCatalogLobby(env, {
          url,
          status: response.status,
          durationMs,
          contentType: response.headers.get('content-type'),
          error: fetchErrorFacts(error),
        });
      }
      throw new CatalogUnavailableError();
    }
  } catch (error) {
    if (error instanceof CatalogUnavailableError) throw error;
    if (lobby) {
      logCatalogLobby(env, {
        url,
        status: null,
        durationMs: Date.now() - started,
        error: fetchErrorFacts(error),
      });
    }
    throw new CatalogUnavailableError();
  }
}

export function getCatalogLobby(
  type: PlatformGameType,
  filters: CatalogGameFilters = {},
): Promise<CatalogLobbyResponse> {
  return requestCatalog<CatalogLobbyResponse>('/catalog/lobby', { ...filters, type });
}

export function searchCatalogGames(
  filters: CatalogGameFilters = {},
): Promise<CatalogGamesResponse> {
  return requestCatalog<CatalogGamesResponse>('/catalog/games', filters);
}
