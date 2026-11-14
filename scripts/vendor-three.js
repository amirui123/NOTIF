#!/usr/bin/env node
/**
 * Copy the pinned three.js release from node_modules into vendor/ so the game
 * keeps working offline. Run after bumping three: `npm i three@<ver> && npm run vendor:three`.
 */
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = join(ROOT, 'node_modules/three');
const OUT = join(ROOT, 'vendor/three');

const FILES = [
  'build/three.module.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'LICENSE',
];

const CHECK_ONLY = process.argv.includes('--check');

if (CHECK_ONLY) {
  let missing = 0;
  for (const file of FILES) {
    try {
      await stat(join(OUT, file));
    } catch {
      console.error(`missing vendor/three/${file}`);
      missing++;
    }
  }
  if (missing) {
    console.error(`vendor/three is incomplete (${missing} files) — run: npm run vendor:three`);
    process.exit(1);
  }
  console.log(`vendor/three is complete (${FILES.length} files)`);
  process.exit(0);
}

await mkdir(OUT, { recursive: true });
for (const file of FILES) {
  try {
    await cp(join(SRC, file), join(OUT, file));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.warn(`skipped missing ${file}`);
  }
}

const pkg = JSON.parse(await readFile(join(SRC, 'package.json'), 'utf8'));
await writeFile(
  join(OUT, 'VERSION'),
  `three.js ${pkg.version}\nVendored for offline use. MIT licensed — see LICENSE.\n`,
);
console.log(`vendored three.js ${pkg.version} → vendor/three`);
