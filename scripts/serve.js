#!/usr/bin/env node
/**
 * Zero-dependency static dev server.
 *
 * Why it exists: ES modules + import maps cannot be loaded from file:// URLs,
 * so the game must be served over HTTP. This server needs no install step.
 *
 * Usage: npm start [-- --port 8080 --host 0.0.0.0]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function parseArgs(argv) {
  const args = { port: Number(process.env.PORT) || 8080, host: process.env.HOST || '0.0.0.0' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') args.port = Number(argv[++i]);
    else if (argv[i] === '--host' || argv[i] === '-h') args.host = argv[++i];
  }
  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error(`Invalid port: ${args.port}`);
  }
  return args;
}

/** Resolve a URL path to a file inside ROOT, or null when it escapes/unexists. */
export function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, safePath);

  // Directory traversal guard.
  if (!(filePath === ROOT || filePath.startsWith(ROOT + sep))) return null;

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) return null;
  return filePath;
}

export function createStaticServer() {
  return createServer((req, res) => {
    const filePath = resolveFile(req.url || '/');

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — Not found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': statSync(filePath).size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(filePath).pipe(res);
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { port, host } = parseArgs(process.argv.slice(2));
  const server = createStaticServer();
  server.listen(port, host, () => {
    console.log(`\n  SECTOR-7 // BODYCAM OPS\n  ➜  http://localhost:${port}\n  ➜  http://${host}:${port}\n`);
  });
}
