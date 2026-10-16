import { builtinModules } from 'node:module';
import * as esbuild from 'esbuild';

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

const result = await esbuild.build({
  entryPoints: ['netlify/bff.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/netlify/bff.mjs',
  metafile: true,
  logLevel: 'info',
});

const external = Object.values(result.metafile.outputs).flatMap((output) =>
  output.imports.filter((item) => item.external).map((item) => item.path),
);
const unresolved = external.filter(
  (specifier) =>
    !builtins.has(specifier) || specifier.endsWith('.ts') || specifier.includes('@brand/'),
);
if (unresolved.length > 0) {
  console.error('Netlify function bundle has unresolved imports:');
  for (const specifier of unresolved) console.error(`  ${specifier}`);
  process.exit(1);
}
