import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    '.next-ux/**',
    'test-results/**',
    'playwright-report/**',
    'blob-report/**',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@brand/platform', message: 'Web must use contracts, never infrastructure.' },
          { name: '@brand/domain', message: 'Web must not depend on the domain package.' }
        ],
        patterns: ['@brand/platform/*', '@brand/domain/*']
      }]
    }
  }
]);
