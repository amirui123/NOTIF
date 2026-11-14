/**
 * Procedural PBR texture factory.
 *
 * Every material in the game is generated at runtime on 2D canvases: albedo,
 * roughness and a height-derived normal map. No network asset is required,
 * which is why the game works fully offline.
 */
import * as THREE from 'three';

/** Deterministic 2D hash in [0, 1). */
export function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** Smooth value noise in [0, 1). */
export function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal Brownian motion built on value noise. */
export function fbm(x, y, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return v;
}

/**
 * Surface recipes. Each returns { r, g, b, rough, h } for a 0..1 uv sample.
 * Kept outside the class so new materials can be added without touching logic.
 */
export const SURFACES = {
  groundWet: (u, v) => {
    const n1 = fbm(u * 10, v * 10, 4);
    const n2 = fbm(u * 28 + 5, v * 28 + 2, 3);
    const wet = Math.min(1, Math.max(0, (n1 - 0.56) * 5));
    const base = 44 + n2 * 34 + (n1 - 0.5) * 24;
    return {
      r: base * (1 - wet * 0.45),
      g: base * 0.96 * (1 - wet * 0.42),
      b: base * 0.9 * (1 - wet * 0.34),
      rough: 0.9 - wet * 0.8,
      h: wet > 0.3 ? 0.2 : n2 * 0.8,
    };
  },
  concrete: (u, v) => {
    const n = fbm(u * 12, v * 12, 4);
    const seam = Math.abs(((u * 2) % 1) - 0.5) > 0.485 || Math.abs(((v * 2) % 1) - 0.5) > 0.485 ? -22 : 0;
    const c = 104 + (n - 0.5) * 44 + seam - Math.max(0, 0.5 - v) * 26;
    return { r: c, g: c * 0.99, b: c * 0.96, rough: 0.78 + n * 0.16, h: n + seam * 0.01 };
  },
  corrugated: (u, v) => {
    const rib = Math.sin(u * Math.PI * 36) * 0.5 + 0.5;
    const rust = Math.max(0, fbm(u * 9 + 3, v * 9 + 7, 3) - 0.58) * 2.5;
    const base = 76 + rib * 28;
    return {
      r: base * (1 - rust) + 115 * rust,
      g: (base + 6) * (1 - rust) + 58 * rust,
      b: (base + 12) * (1 - rust) + 34 * rust,
      rough: 0.38 + rust * 0.52,
      h: rib * 0.85 + fbm(u * 18, v * 18, 2) * 0.15,
    };
  },
  wood: (u, v) => {
    const seam = Math.abs(((v * 5) % 1) - 0.5) > 0.47 ? -35 : 0;
    const grain = fbm(u * 6 + Math.floor(v * 5) * 3.1, v * 38, 3);
    return {
      r: 108 + grain * 45 + seam,
      g: 76 + grain * 34 + seam,
      b: 48 + grain * 22 + seam,
      rough: 0.72 + grain * 0.2,
      h: grain + seam * 0.01,
    };
  },
  sandbag: (u, v) => {
    const weave = Math.sin(u * 120) * Math.sin(v * 120) * 0.5 + 0.5;
    const dirt = fbm(u * 8, v * 8, 3);
    return {
      r: 122 + dirt * 28 + weave * 14,
      g: 108 + dirt * 24 + weave * 12,
      b: 82 + dirt * 18 + weave * 8,
      rough: 0.88,
      h: weave * 0.5 + dirt * 0.5,
    };
  },
  gunmetal: (u, v) => {
    const brush = fbm(u * 40, v * 4, 3);
    const speck = hash2(Math.floor(u * 256), Math.floor(v * 256)) * 0.15;
    const vc = 38 + brush * 22 + speck * 30;
    return { r: vc, g: vc + 2, b: vc + 5, rough: 0.25 + brush * 0.28, h: brush * 0.6 + speck };
  },
  camo: (u, v) => {
    const n1 = fbm(u * 7, v * 7, 3);
    const n2 = fbm(u * 15 + 4, v * 15 + 9, 2);
    const weave = (Math.sin(u * 220) + Math.sin(v * 220)) * 4;
    let r = 68;
    let g = 74;
    let b = 56;
    if (n1 > 0.57) {
      r = 42;
      g = 46;
      b = 38;
    } else if (n2 > 0.6) {
      r = 104;
      g = 96;
      b = 76;
    }
    return { r: r + weave, g: g + weave, b: b + weave, rough: 0.84, h: weave * 0.05 + n1 * 0.4 };
  },
  veil: (u, v) => {
    const thread =
      Math.abs(Math.sin(u * Math.PI * 16)) < 0.34 || Math.abs(Math.sin(v * Math.PI * 16)) < 0.34 ? 1 : 0;
    return { r: 34, g: 42, b: 32, a: thread ? 255 : 55, rough: 0.85, h: thread ? 0.8 : 0.1 };
  },
};

/** Per-surface build options: texture size, tiling and normal strength. */
const SURFACE_OPTIONS = {
  groundWet: { size: 256, repeat: 18, normal: 3.2 },
  concrete: { size: 256, repeat: 2, normal: 2.8 },
  corrugated: { size: 256, repeat: 2, normal: 4.5 },
  wood: { size: 256, repeat: 1, normal: 2.5 },
  sandbag: { size: 128, repeat: 2, normal: 3.0 },
  gunmetal: { size: 256, repeat: 1, normal: 2.2 },
  camo: { size: 256, repeat: 1, normal: 2.4 },
  veil: { size: 128, repeat: 3, normal: 2.0 },
};

export class TextureFactory {
  constructor(maxAnisotropy = 4) {
    this.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
    /** @type {Record<string, {map: THREE.Texture, roughnessMap: THREE.Texture, normalMap: THREE.Texture}>} */
    this.cache = {};
  }

  /**
   * Build (or reuse) an albedo / roughness / normal set for one surface.
   * @param {string} key one of SURFACES
   */
  buildSet(key) {
    if (this.cache[key]) return this.cache[key];
    const recipe = SURFACES[key];
    const opts = SURFACE_OPTIONS[key];
    if (!recipe || !opts) throw new Error(`Unknown surface "${key}"`);

    const { size } = opts;
    const make = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      return canvas;
    };
    const albedoCanvas = make();
    const roughCanvas = make();
    const normalCanvas = make();
    const aCtx = albedoCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');
    const nCtx = normalCanvas.getContext('2d');
    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const heights = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const res = recipe(x / size, y / size);
        const idx = (y * size + x) * 4;
        aImg.data[idx] = clamp255(res.r);
        aImg.data[idx + 1] = clamp255(res.g);
        aImg.data[idx + 2] = clamp255(res.b);
        aImg.data[idx + 3] = res.a ?? 255;
        const rough = clamp255(res.rough * 255);
        rImg.data[idx] = rough;
        rImg.data[idx + 1] = rough;
        rImg.data[idx + 2] = rough;
        rImg.data[idx + 3] = 255;
        heights[y * size + x] = res.h;
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const left = heights[y * size + ((x - 1 + size) % size)];
        const right = heights[y * size + ((x + 1) % size)];
        const up = heights[((y - 1 + size) % size) * size + x];
        const down = heights[((y + 1) % size) * size + x];
        const dx = (left - right) * opts.normal;
        const dy = (up - down) * opts.normal;
        const inv = 1 / Math.hypot(dx, dy, 1);
        const idx = (y * size + x) * 4;
        nImg.data[idx] = clamp255((dx * inv * 0.5 + 0.5) * 255);
        nImg.data[idx + 1] = clamp255((dy * inv * 0.5 + 0.5) * 255);
        nImg.data[idx + 2] = clamp255((inv * 0.5 + 0.5) * 255);
        nImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const prepare = (canvas, srgb) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat, opts.repeat);
      tex.anisotropy = this.anisotropy;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    return (this.cache[key] = {
      map: prepare(albedoCanvas, true),
      roughnessMap: prepare(roughCanvas, false),
      normalMap: prepare(normalCanvas, false),
    });
  }

  /** Generate every registered surface. Memoised by buildSet. */
  initAll() {
    for (const key of Object.keys(SURFACES)) this.buildSet(key);
    return this;
  }

  /** Dispose all GPU textures (used when tearing the game down). */
  dispose() {
    for (const set of Object.values(this.cache)) {
      set.map.dispose();
      set.roughnessMap.dispose();
      set.normalMap.dispose();
    }
    this.cache = {};
  }
}

const clamp255 = (v) => Math.max(0, Math.min(255, v));

/**
 * Draw an optic reticle onto a canvas texture.
 * @param {'holo'|'acog'|'scope'|'reflex'|'iron'} type
 */
export function makeReticleTexture(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const cx = 128;
  const cy = 128;

  if (type === 'holo') {
    ctx.strokeStyle = 'rgba(255,65,50,0.92)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff2a1a';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.stroke();
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 34, cy + Math.sin(ang) * 34);
      ctx.lineTo(cx + Math.cos(ang) * 52, cy + Math.sin(ang) * 52);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff6b57';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'acog') {
    ctx.strokeStyle = 'rgba(255,130,30,0.95)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff5500';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 12);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,20,20,0.85)';
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 12);
    ctx.lineTo(cx, cy + 95);
    ctx.moveTo(cx - 90, cy);
    ctx.lineTo(cx - 18, cy);
    ctx.moveTo(cx + 18, cy);
    ctx.lineTo(cx + 90, cy);
    ctx.stroke();
  } else if (type === 'scope') {
    ctx.strokeStyle = 'rgba(12,14,18,0.92)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20, cy);
    ctx.lineTo(236, cy);
    ctx.moveTo(cx, 20);
    ctx.lineTo(cx, 236);
    ctx.stroke();
    ctx.fillStyle = 'rgba(12,14,18,0.92)';
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      ctx.beginPath();
      ctx.arc(cx + i * 24, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + i * 24, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // reflex / iron sights: simple glowing dot
    ctx.fillStyle = '#34d399';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
