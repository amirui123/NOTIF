#!/usr/bin/env node
/**
 * Generate a test-only copy of the vendored three.js module whose
 * WebGLRenderer / PMREMGenerator are replaced with GPU-free stubs.
 *
 * `THREE`'s module namespace is read-only, so instead of monkey-patching at
 * runtime we emit `node_modules/.cache/three.test.mjs` and map the bare
 * specifier `three` to it via the W3C import map in test/helpers.
 *
 * Run automatically by `npm test` (pretest).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = join(ROOT, 'vendor/three/build/three.module.js');
const OUT_DIR = join(ROOT, 'node_modules/.cache');
const OUT = join(OUT_DIR, 'three.test.mjs');

const STUB = `
class StubRenderer {
  constructor(params = {}) {
    this.domElement = params.canvas || globalThis.document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true };
    this.info = { render: { calls: 0, triangles: 0 }, memory: {}, programs: [] };
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.xr = { enabled: false, isPresenting: false, setAnimationLoop() {}, getSession: () => null };
    this.outputColorSpace = 'srgb';
    this._pr = 1; this._w = 1280; this._h = 800;
  }
  setPixelRatio(r) { this._pr = r; }
  getPixelRatio() { return this._pr; }
  setSize(w, h) { this._w = w; this._h = h; }
  getSize(t) { t.x = this._w; t.y = this._h; return t; }
  getDrawingBufferSize(t) { t.x = this._w * this._pr; t.y = this._h * this._pr; return t; }
  getClearColor(t) { t?.setRGB?.(0, 0, 0); return t; }
  getClearAlpha() { return 1; }
  setClearColor() {} setClearAlpha() {}
  setRenderTarget() {} getRenderTarget() { return null; }
  getActiveCubeFace() { return 0; } getActiveMipmapLevel() { return 0; }
  clear() {} compile() {} dispose() {} setAnimationLoop() {}
  setViewport() {} setScissor() {}
  getContext() { return { getExtension: () => null }; }
  copyFramebufferToTexture() {}
  render(scene, camera) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    globalThis.__SMOKE_FRAMES__ = (globalThis.__SMOKE_FRAMES__ || 0) + 1;
  }
}

class StubPMREM {
  compileEquirectangularShader() {}
  compileCubemapShader() {}
  fromScene() { return { texture: new Texture(), dispose() {} }; }
  fromEquirectangular() { return { texture: new Texture(), dispose() {} }; }
  fromCubemap() { return { texture: new Texture(), dispose() {} }; }
  dispose() {}
}
`;

export async function patchThreeForTests() {
  const source = await readFile(SOURCE, 'utf8');
  const exportStart = source.indexOf('export {');
  if (exportStart === -1) throw new Error('three.module.js has no export block');

  let header = source.slice(0, exportStart);
  let exportsBlock = source.slice(exportStart);

  // Drop the GPU-only classes from the export list, export the stubs instead.
  exportsBlock = exportsBlock
    .replace(/WebGLRenderer,\s*/, '')
    .replace(/PMREMGenerator,\s*/, '')
    .replace('export {', 'export { StubRenderer as WebGLRenderer, StubPMREM as PMREMGenerator,');

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT, `${header}\n${STUB}\n${exportsBlock}`, 'utf8');
  return OUT;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = await patchThreeForTests();
  console.log(`Test build of three.js written to ${out}`);
}
