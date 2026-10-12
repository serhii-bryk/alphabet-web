import fs from 'node:fs';
import { createCatalogUseCases } from '@brand/domain';
import { createPlatformClient, readPlatformConfig } from '@brand/platform';

const required = ['FINAL_PLATFORM_API_URL', 'FINAL_PLATFORM_API_KEY', 'FINAL_PLATFORM_API_SECRET'] as const;

function loadEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of fs.readFileSync(path, 'utf8').split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(new URL('./.env.local', import.meta.url));
let missing = false;
for (const key of required) {
  const present = Boolean(fileEnv[key]);
  console.log(`${key}=${present ? 'present' : 'absent'}`);
  if (!present) missing = true;
}
if (missing) process.exit(2);

let config: ReturnType<typeof readPlatformConfig>;
try {
  config = readPlatformConfig(fileEnv);
  const url = new URL(config.baseUrl);
  console.log(`config_parse=ok protocol=${url.protocol} path_has_api_v1=true`);
} catch {
  console.log('config_parse=failed');
  process.exit(2);
}

type CallResult = { path: string; status: number; classification: string };
const calls: CallResult[] = [];

function classify(status: number, body: string): string {
  if (status === 401 && /invalid key/i.test(body)) return 'invalid_key';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status >= 200 && status < 300) return 'ok';
  return 'http_error';
}

const fetchImpl: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const body = await response.clone().text();
  calls.push({
    path: target.pathname,
    status: response.status,
    classification: classify(response.status, body),
  });
  return response;
};

const catalog = createCatalogUseCases(
  createPlatformClient({ ...config, fetch: fetchImpl, timeoutMs: 20_000 }),
);

function imageKind(imageUrl: string | null, secretValues: string[]): string {
  if (imageUrl === null) return 'null';
  if (secretValues.some((value) => value.length > 0 && imageUrl.includes(value))) return 'leaks_credential';
  try {
    const url = new URL(imageUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.protocol.replace(':', '') : 'non_http';
  } catch {
    return imageUrl.startsWith('/') ? 'relative' : 'unparseable';
  }
}

const steps: Array<{ name: string; run: () => Promise<void> }> = [
  {
    name: 'GET /games',
    run: async () => {
      const games = await catalog.listGames({ page: 1, perPage: 20 });
      const game = games.games[0];
      console.log(
        JSON.stringify({
          endpoint: 'GET /games',
          result: 'ok',
          mappedGameCount: games.games.length,
          pagination: games.pagination,
          sampleGame: game
            ? {
                mapped: Boolean(game.id && game.slug && game.title && (game.kind === 'casino' || game.kind === 'live')),
                id: game.id,
                title: game.title,
                kind: game.kind,
                image: imageKind(game.imageUrl, [fileEnv.FINAL_PLATFORM_API_KEY, fileEnv.FINAL_PLATFORM_API_SECRET]),
                providerMapped: Boolean(game.provider?.id && game.provider.code && game.provider.name),
                categoryCount: game.categories.length,
              }
            : null,
        }),
      );
    },
  },
  {
    name: 'GET /games/providers',
    run: async () => {
      const { providers } = await catalog.listProviders();
      const provider = providers[0];
      console.log(
        JSON.stringify({
          endpoint: 'GET /games/providers',
          result: 'ok',
          count: providers.length,
          sampleProvider: provider
            ? {
                mapped: Boolean(provider.id && provider.code && provider.name && provider.displayName),
                id: provider.id,
                code: provider.code,
                name: provider.name,
                groupedCodeIsNullable: provider.groupedCode === null || typeof provider.groupedCode === 'string',
              }
            : null,
        }),
      );
    },
  },
  {
    name: 'GET /games/categories',
    run: async () => {
      const { categories } = await catalog.listCategories();
      const category = categories[0];
      console.log(
        JSON.stringify({
          endpoint: 'GET /games/categories',
          result: 'ok',
          count: categories.length,
          sampleCategory: category
            ? {
                mapped: Boolean(category.id && category.slug && category.name),
                id: category.id,
                slug: category.slug,
                name: category.name,
                parentIdIsNullable: category.parentId === null || typeof category.parentId === 'string',
              }
            : null,
        }),
      );
    },
  },
];

for (const step of steps) {
  const before = calls.length;
  try {
    await step.run();
  } catch (error) {
    const call = calls[calls.length - 1];
    const code = error instanceof Error ? error.name : 'unknown';
    console.log(
      JSON.stringify({
        endpoint: step.name,
        result: 'failed',
        status: call && calls.length > before ? call.status : null,
        classification: call && calls.length > before ? call.classification : 'no_response',
        error: code,
      }),
    );
  }
  const call = calls[calls.length - 1];
  if (call && (call.status === 401 || call.status === 403)) {
    console.log('stopped=auth_failure');
    process.exit(1);
  }
  if (!call || call.classification !== 'ok') {
    console.log('stopped=request_failed');
    process.exit(1);
  }
}

console.log('stage_smoke=complete');
