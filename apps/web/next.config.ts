import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const bffUrl = process.env.BFF_INTERNAL_URL ?? 'http://localhost:4000';
const onNetlify = process.env.NETLIFY === 'true';
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config: NextConfig = {
  // Playwright starts its own dev server while a local one may already own `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  ...(onNetlify
    ? {
        outputFileTracingRoot: monorepoRoot,
        turbopack: { root: monorepoRoot },
      }
    : {}),
  transpilePackages: ['@brand/contracts', '@brand/config'],
  async rewrites() {
    // On Netlify, /api/* is the Hono function. A rewrite to localhost would take those requests.
    if (process.env.NETLIFY === 'true') return [];
    return [{ source: '/api/:path*', destination: `${bffUrl}/:path*` }];
  },
};
export default withNextIntl(config);
