#!/usr/bin/env node
/**
 * Optional production build.
 *
 * The game ships as plain ES modules (no bundler required), so this script only:
 *  1. copies the runtime files into `dist/`
 *  2. rewrites nothing — the import map already points at `./vendor/...`
 *  3. prints the total payload size
 *
 * Keeping the build step trivial means GitHub Pages can also just serve the
 * repository root, which is what the deploy workflow does.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const ENTRIES = ['index.html', 'styles', 'src', 'vendor', 'favicon.svg'];

async function sizeOf(path) {
  const info = await stat(path);
  return info.isDirectory() ? 0 : info.size;
}

async function walk(dir) {
  const { readdir } = await import('node:fs/promises');
  let total = 0;
  let files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walk(full);
      total += sub.total;
      files += sub.files;
    } else {
      total += await sizeOf(full);
      files += 1;
    }
  }
  return { total, files };
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const entry of ENTRIES) {
  const from = join(ROOT, entry);
  try {
    await cp(from, join(DIST, entry), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const { total, files } = await walk(DIST);
console.log(`SECTOR-7 build complete → dist/`);
console.log(`  ${files} files, ${(total / 1024 / 1024).toFixed(2)} MB`);
