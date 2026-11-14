/**
 * Hard-surface geometry kit for weapons.
 *
 * The original viewmodel was built from `BoxGeometry` and `CylinderGeometry`
 * with no edge treatment at all: every rifle came out under 900 triangles and
 * every surface met its neighbour at a mathematically perfect 90 degrees. That
 * is the single thing that makes a gun read as a toy, and it has nothing to do
 * with polygon count.
 *
 * A real machined edge is a 0.3-1.5 mm fillet. Light grazing that fillet
 * produces a soft gradient highlight instead of a broken specular line, and
 * that gradient is what the eye reads as "made of metal". So every primitive
 * here is chamfered by default, every extrusion is bevelled, and every tube
 * gets a crowned rim.
 *
 * Everything is authored in metres at real scale. Ground rules:
 *  - +X right, +Y up, -Z toward the muzzle (camera convention).
 *  - The bore sits at y = 0 and z = 0 is the receiver's centre, so a part's
 *    position is meaningful on its own.
 *  - Cylinders and tubes are built along +Z then left alone: weapon space is
 *    already Z-forward.
 *
 * Why the kit is hand-rolled rather than vendored: `RoundedBoxGeometry` and
 * `BufferGeometryUtils` live in three's `examples/jsm`, and this repo vendors
 * only the modules it actually uses so the game stays offline-capable with a
 * single runtime dependency. Re-implementing the three pieces we need
 * (`roundedBox`, `mergeAll`, `weld`) costs ~120 lines and no network.
 */
import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/*  internals                                                                 */
/* -------------------------------------------------------------------------- */

const KEEP = ['position', 'normal', 'uv'];

/**
 * Drop attributes a merge cannot reconcile, and guarantee position/normal/uv
 * exist on everything that goes into one.
 */
export function normalize(geo) {
  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP.includes(name)) geo.deleteAttribute(name);
  }
  const pos = geo.getAttribute('position');
  if (!geo.getAttribute('uv')) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

/** Remove triangles that reference the same vertex twice. */
export function stripDegenerate(geo) {
  const idx = geo.getIndex();
  if (!idx) return geo;
  const keep = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (a === b || b === c || a === c) continue;
    keep.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', geo.getAttribute('position').clone());
  if (geo.getAttribute('normal')) out.setAttribute('normal', geo.getAttribute('normal').clone());
  if (geo.getAttribute('uv')) out.setAttribute('uv', geo.getAttribute('uv').clone());
  out.setIndex(keep);
  return out;
}

/** Merge indexed and non-indexed geometry into one non-indexed buffer. */
function toNonIndexed(geo) {
  return geo.getIndex() ? geo.toNonIndexed() : geo;
}

/**
 * Weld coincident vertices that also share a normal. Positions alone are not
 * enough: welding across a hard edge would smooth it, which is the exact
 * opposite of what a chamfer is for.
 */
function weld(geo, tol = 1e-6) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const outPos = [];
  const outNor = [];
  const outUv = [];
  const lookup = new Map();
  const inv = 1 / tol;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nor ? nor.getX(i) : 0;
    const ny = nor ? nor.getY(i) : 0;
    const nz = nor ? nor.getZ(i) : 0;
    const key =
      Math.round(x * inv) +
      '|' +
      Math.round(y * inv) +
      '|' +
      Math.round(z * inv) +
      '|' +
      Math.round(nx * 1000) +
      '|' +
      Math.round(ny * 1000) +
      '|' +
      Math.round(nz * 1000);
    let idx = lookup.get(key);
    if (idx === undefined) {
      idx = outPos.length / 3;
      lookup.set(key, idx);
      outPos.push(x, y, z);
      outNor.push(nx, ny, nz);
      if (uv) outUv.push(uv.getX(i), uv.getY(i));
    }
  }

  // Rebuild the triangle list against the welded index.
  const src = geo.getIndex();
  const count = src ? src.count : pos.count;
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const v = src ? src.getX(i) : i;
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    const nx = nor ? nor.getX(v) : 0;
    const ny = nor ? nor.getY(v) : 0;
    const nz = nor ? nor.getZ(v) : 0;
    const key =
      Math.round(x * inv) +
      '|' +
      Math.round(y * inv) +
      '|' +
      Math.round(z * inv) +
      '|' +
      Math.round(nx * 1000) +
      '|' +
      Math.round(ny * 1000) +
      '|' +
      Math.round(nz * 1000);
    indices[i] = lookup.get(key);
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(outNor, 3));
  if (outUv.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/** Concatenate geometries, tolerating a mix of indexed and non-indexed input. */
export function mergeAll(list) {
  const clean = list.filter((g) => g && g.getAttribute('position'));
  if (!clean.length) return null;
  if (clean.length === 1) return normalize(clean[0]);

  let totalVerts = 0;
  const nonIndexed = [];
  for (const g of clean) {
    const n = toNonIndexed(g);
    if (n !== g) g.dispose();
    normalize(n);
    nonIndexed.push(n);
    totalVerts += n.getAttribute('position').count;
  }

  const position = new Float32Array(totalVerts * 3);
  const normal = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  let p = 0;
  let u = 0;
  for (const g of nonIndexed) {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const tex = g.getAttribute('uv');
    position.set(pos.array, p);
    normal.set(nor.array, p);
    if (tex) uv.set(tex.array, u);
    p += pos.array.length;
    u += pos.count * 2;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return normalize(weld(out, 1e-6));
}

/* -------------------------------------------------------------------------- */
/*  primitives                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A box with a real fillet on all twelve edges.
 *
 * `chamfer` is the fillet radius in metres; `rings` is how many bands that
 * fillet is made of — 1 gives the 45-degree chamfer a milling bit leaves, 3-4
 * the rounder transition of a casting or moulded polymer part.
 *
 * Construction: one closed rounded-rectangle ring swept along Z, with inset
 * bands at each end. Those bands are both the top and bottom edge fillets and
 * the four corner patches at once, which is why this costs 64 triangles at
 * `rings: 1` where a per-edge-strip construction needs ~270.
 *
 * Why the fillet matters more than polygon count: with a perfectly sharp
 * 90-degree edge there is no geometry for a highlight to roll across, so the
 * specular term breaks into a hard line and the object reads as a CAD block.
 * Real edges are 0.3-1.5 mm fillets, and those fillets *are* the highlight.
 */
export function box(w, h, d, chamfer = 0.0012, seg = 2, rings = 2) {
  // `seg` is arc segments per rounded corner and must be at least 2: with a
  // single segment there is exactly one vertex at the 45-degree midpoint, so
  // the corner reads as one flat facet with a near-axis normal and the fillet
  // catches no highlight at all — which defeats the entire point of the kit.
  seg = Math.max(2, seg);
  rings = Math.max(2, rings);
  const r = Math.min(chamfer, Math.min(w, Math.min(h, d)) * 0.49);
  if (r <= 1e-5) return normalize(new THREE.BoxGeometry(w, h, d));

  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const zHalf = hd - r;

  /**
   * The swept section. Eight points: two per straight run and one on each
   * 45-degree corner at `seg: 1`. Kept independent of the fillet radius so the
   * wall, the end bands and the caps all share the exact same vertex count and
   * a bridge between any two rings is a straight quad strip.
   *
   * @param {number} inset  distance to pull the corners in
   * @param {number} rad    corner radius for this ring
   */
  const section = (inset, rad) => {
    const x = hw - inset;
    const y = hh - inset;
    const pts = [];
    for (const [cx, cy, a0] of [
      [x - rad, y - rad, 0],
      [-x + rad, y - rad, Math.PI / 2],
      [-x + rad, -y + rad, Math.PI],
      [x - rad, -y + rad, -Math.PI / 2],
    ]) {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
    }
    return pts;
  };

  const position = [];
  const index = [];
  const push = (pts, z) => {
    const base = position.length / 3;
    for (const [x, y] of pts) position.push(x, y, z);
    return base;
  };

  // Rings from -Z to +Z. `inset`/`rad` track the fillet at each end.
  const ringsOut = [];
  for (let k = rings; k >= 1; k--) {
    const t = k / rings;
    const ang = (Math.PI / 2) * t;
    const inset = r * (1 - Math.cos(ang));
    const rad = Math.max(1e-5, r - inset);
    const z = -zHalf - r * (1 - Math.sin(ang));
    ringsOut.push({ base: push(section(inset, rad), z), n: section(inset, rad).length });
  }
  const wallNeg = push(section(0, r), -zHalf);
  const wallPos = push(section(0, r), zHalf);
  const n = section(0, r).length;
  for (let k = 1; k <= rings; k++) {
    const t = k / rings;
    const ang = (Math.PI / 2) * t;
    const inset = r * (1 - Math.cos(ang));
    const rad = Math.max(1e-5, r - inset);
    const z = zHalf + r * (1 - Math.sin(ang));
    ringsOut.push({ base: push(section(inset, rad), z), n });
  }

  // Bridge every consecutive ring pair.
  const link = (a, b, flip) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) index.push(a + i, b + j, a + j, a + i, b + i, b + j);
      else index.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  };
  // Rear cap band -> rear wall -> front wall -> front cap band.
  for (let k = 0; k < rings - 1; k++) link(ringsOut[k].base, ringsOut[k + 1].base, true);
  link(ringsOut[rings - 1].base, wallNeg, true);
  link(wallNeg, wallPos, false);
  link(wallPos, ringsOut[rings].base, false);
  for (let k = rings; k < ringsOut.length - 1; k++) link(ringsOut[k].base, ringsOut[k + 1].base, false);

  // Caps: fan around a centre vertex.
  const capNeg = position.length / 3;
  position.push(0, 0, -zHalf - r);
  const capPosIdx = position.length / 3;
  position.push(0, 0, zHalf + r);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    index.push(capNeg, ringsOut[0].base + j, ringsOut[0].base + i);
    index.push(capPosIdx, ringsOut[ringsOut.length - 1].base + i, ringsOut[ringsOut.length - 1].base + j);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return stripDegenerate(normalize(g));
}

/** A softly rounded block: grips, palm swells, butt pads. */
export function blob(w, h, d, radius = 0.006, seg = 2) {
  return box(w, h, d, radius, seg);
}

/**
 * Lathe around +Z. `profile` is a flat list of [axialZ, radius] pairs; a radius
 * of 0 closes the form. This is the workhorse for anything turned on a lathe:
 * suppressors, optic tubes, grip profiles, muzzle crowns.
 */
export function latheZ(profile, seg = 24) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(1e-5, p[1]), p[0]));
  const g = new THREE.LatheGeometry(pts, seg);
  // Lathe spins around +Y; a -90 degree rotation about X maps (r, a) -> (r, 0, a)
  // so the axis becomes +Z with the axial coordinates preserved.
  g.rotateX(-Math.PI / 2);
  g.scale(1, 1, -1);
  return normalize(g);
}

/**
 * Tube along Z with a real wall: outer surface, inner bore, crowned rims.
 * Used for barrels, optic tubes and suppressors. The crown is what makes a
 * muzzle read as a hole rather than a painted dot.
 */
export function tubeZ(rOuter, rInner, len, seg = 24, crown = 0.0006) {
  const z0 = -len / 2;
  const z1 = len / 2;
  const c = Math.min(crown, (rOuter - rInner) * 0.4);
  return latheZ(
    [
      [z0 + c, rInner],
      [z0, rInner + c],
      [z0, rOuter - c],
      [z0 + c, rOuter],
      [z1 - c, rOuter],
      [z1, rOuter - c],
      [z1, rInner + c],
      [z1 - c, rInner],
    ],
    seg,
  );
}

/** A spherical cap: knuckle lumps, bosses, buttons. `cut` is the fraction of the sphere. */
export function dome(r, seg = 10, cut = 0.6) {
  const g = new THREE.SphereGeometry(
    r,
    seg,
    Math.max(3, Math.round(seg * 0.5)),
    0,
    Math.PI * 2,
    0,
    Math.PI * cut,
  );
  g.rotateX(Math.PI / 2);
  return normalize(g);
}

/** Solid rod along Z with chamfered rims. */
export function rodZ(r0, r1, len, seg = 20, chamfer = 0.0008) {
  const z0 = -len / 2;
  const z1 = len / 2;
  const c = Math.min(chamfer, len * 0.4, Math.min(r0, r1) * 0.5);
  return latheZ(
    [
      [z0, 0],
      [z0, r0 - c],
      [z0 + c, r0],
      [z1 - c, r1],
      [z1, r1 - c],
      [z1, 0],
    ],
    seg,
  );
}

/**
 * Extrude a 2-D outline along Z with a bevelled face on both sides.
 * `pts` is a flat array of [x, y]; it closes automatically.
 */
export function extrude(pts, depth, opts = {}) {
  const bevel = opts.bevel ?? 0.0008;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  if (opts.holes) {
    for (const hole of opts.holes) {
      const path = new THREE.Path();
      path.moveTo(hole[0][0], hole[0][1]);
      for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
      path.closePath();
      shape.holes.push(path);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - bevel * 2),
    bevelEnabled: bevel > 1e-6,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: opts.bevelSegments ?? 1,
    curveSegments: opts.curveSegments ?? 6,
    steps: opts.steps ?? 1,
  });
  g.translate(0, 0, -depth / 2 + bevel);
  const merged = normalize(mergeAll([g]));
  // three's ExtrudeGeometry emits a handful of triangles with a repeated
  // vertex index when it stitches the end caps to the side walls (8 of them for
  // a hexagonal section, always). They are invisible but they poison anything
  // that counts triangles or walks the mesh, so drop them here.
  return stripDegenerate(merged);
}

/** Rounded-rectangle outline for extruded plates that need soft corners. */
export function roundRect(w, h, r, seg = 3) {
  const pts = [];
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const corners = [
    [hw, hh, 0],
    [-hw, hh, Math.PI / 2],
    [-hw, -hh, Math.PI],
    [hw, -hh, -Math.PI / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Hex-socket cap screw: a genuine counterbore, not a painted dot. */
export function screw(rHead, rShank, headH, shankL, seg = 12) {
  const rSocket = rHead * 0.52;
  const head = latheZ(
    [
      [0, rSocket],
      [0, rHead - 0.0002],
      [0.0002, rHead],
      [headH, rHead],
      [headH, rShank],
      [headH + shankL, rShank],
      [headH + shankL, 0],
    ],
    seg,
  );
  const bore = latheZ(
    [
      [headH * 0.62, 0],
      [headH * 0.62, rSocket],
      [0, rSocket],
    ],
    6,
  );
  return mergeAll([head, bore]);
}

/** A band of tiny pyramids around a cylinder: knurling and checkering. */
export function knurlBand(radius, len, count = 28, size = 0.0004, rows = 3) {
  const parts = [];
  const cell = new THREE.OctahedronGeometry(size * 2.2, 0);
  cell.scale(1, 1, 0.55);
  for (let r = 0; r < rows; r++) {
    const z = -len / 2 + ((r + 0.5) / rows) * len;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (r % 2) * (Math.PI / count);
      const g = cell.clone();
      g.rotateZ(a);
      g.translate(Math.cos(a) * radius, Math.sin(a) * radius, z);
      parts.push(normalize(g));
    }
  }
  cell.dispose();
  return mergeAll(parts);
}

/** Fine longitudinal serrations: slide grip, handguard panels, magazine ribs. */
export function serrations(w, h, len, count, axis = 'x') {
  const parts = [];
  const step = (axis === 'x' ? w : h) / count;
  // A 12-triangle box is plenty for a 0.6 mm rib: the fillet would be
  // sub-pixel, and 14 of them at 44 triangles each is the whole budget.
  const rib = new THREE.BoxGeometry(axis === 'x' ? step * 0.55 : w, axis === 'x' ? h : step * 0.55, len);
  normalize(rib);
  for (let i = 0; i < count; i++) {
    const t = -0.5 + (i + 0.5) / count;
    const g = rib.clone();
    if (axis === 'x') g.translate(t * w, 0, 0);
    else g.translate(0, t * h, 0);
    parts.push(g);
  }
  rib.dispose();
  return mergeAll(parts);
}

/**
 * MIL-STD-1913 Picatinny rail running along Z.
 *
 * Real dimensions: 21.2 mm across the top, 45-degree flanks down to a 15.7 mm
 * waist, 5.35 mm recoil slots on a 10.55 mm pitch, slot floor 3 mm below the
 * crown. Built as a run of crown-length teeth so the slots are genuine gaps in
 * the silhouette.
 *
 * The up-facing area is the whole problem with a cheap rail: one flat 21 mm deck
 * pointing straight up catches the entire specular lobe of the key light at
 * once and reads as a bright comb, which is the most-cited "toy" tell. The fix
 * is the real cross-section, a 45-degree chamfer on both top edges.
 */
export function picatinny(len, opts = {}) {
  const width = opts.width ?? 0.0212;
  const waist = opts.waist ?? 0.0157;
  const baseH = opts.baseH ?? 0.0042;
  const topH = opts.topH ?? 0.0032;
  const pitch = opts.pitch ?? 0.01055;
  const slot = opts.slot ?? 0.00535;
  const chamfer = 0.00035;
  const ch = opts.crownChamfer ?? 0.0015;

  const teeth = Math.max(1, Math.floor((len + slot) / pitch));
  const toothLen = pitch - slot;
  const parts = [];

  const base = box(width, baseH, len, chamfer, 1);
  base.translate(0, baseH / 2, 0);
  parts.push(base);

  const profile = [
    [-waist / 2, 0],
    [-width / 2, topH - ch],
    [-width / 2 + ch, topH],
    [width / 2 - ch, topH],
    [width / 2, topH - ch],
    [waist / 2, 0],
  ];
  // Unbevelled: a 0.25 mm bevel on a 5 mm tooth is invisible and costs 5x.
  const tooth = extrude(profile, toothLen, { bevel: 0 });
  for (let i = 0; i < teeth; i++) {
    const z = len / 2 - toothLen / 2 - i * pitch;
    if (z - toothLen / 2 < -len / 2) break;
    const g = tooth.clone();
    g.translate(0, baseH, z);
    parts.push(g);
  }
  tooth.dispose();
  return mergeAll(parts);
}

/** M-LOK style recessed pocket with a raised lip, for handguard slats. */
export function mlokSlot(len = 0.032, wide = 0.0075, depth = 0.0022) {
  const outer = extrude(roundRect(len, wide + 0.0028, 0.0014, 3), 0.0016, { bevel: 0.0004 });
  const inner = extrude(roundRect(len - 0.0016, wide, 0.0012, 3), depth, { bevel: 0.0003 });
  inner.translate(0, 0, -depth * 0.35);
  return mergeAll([outer, inner]);
}

/** A shallow raised ring around the Z axis: suppressor hold bands, mag ribs. */
export function ringProfile(radius, height, thickness, seg = 20) {
  return latheZ(
    [
      [-thickness / 2, radius],
      [-thickness / 4, radius + height],
      [thickness / 4, radius + height],
      [thickness / 2, radius],
    ],
    seg,
  );
}

/** Hexagon outline, for AR-style free-float handguards. */
export function hexOutline(radius, flat = true) {
  const pts = [];
  const n = 6;
  const start = flat ? 0 : Math.PI / 6;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

/* -------------------------------------------------------------------------- */
/*  assembly                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Collects transformed geometry per material, then merges each bucket into one
 * mesh. A whole rifle lands in 6-8 draw calls this way, which is what makes a
 * 6k-triangle weapon affordable.
 *
 * Also carries the named attachment nodes (muzzle, optic axis, grips, moving
 * parts) that the animation rig drives by name.
 */
export class Assembly {
  constructor(name) {
    this.name = name;
    /** @type {Map<string, THREE.BufferGeometry[]>} */
    this.buckets = new Map();
    /** @type {Map<string, {pos: number[], rot: number[]}>} */
    this.nodes = new Map();
  }

  /**
   * @param {THREE.BufferGeometry} geo  consumed (cloned internally)
   * @param {string} matKey             material bucket
   * @param {object} [t]  { x,y,z, rx,ry,rz, sx,sy,sz }
   */
  add(geo, matKey, t = null) {
    if (!geo) return this;
    const g = geo.clone();
    if (t) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'XYZ'));
      m.compose(
        new THREE.Vector3(t.x ?? 0, t.y ?? 0, t.z ?? 0),
        q,
        new THREE.Vector3(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1),
      );
      g.applyMatrix4(m);
    }
    normalize(g);
    let list = this.buckets.get(matKey);
    if (!list) this.buckets.set(matKey, (list = []));
    list.push(g);
    return this;
  }

  /** The same part on both sides of the bore. */
  addMirrored(geo, matKey, t) {
    this.add(geo, matKey, t);
    this.add(geo, matKey, { ...t, x: -(t.x ?? 0), sx: -(t.sx ?? 1) });
    return this;
  }

  /** Register a named attachment point. */
  node(name, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.nodes.set(name, { pos: [x, y, z], rot: [rx, ry, rz] });
    return this;
  }

  /** @returns {{ meshes: Map<string, THREE.BufferGeometry>, nodes: Map<string, {pos:number[],rot:number[]}> }} */
  build() {
    const meshes = new Map();
    for (const [matKey, list] of this.buckets) {
      const merged = mergeAll(list);
      if (merged) meshes.set(matKey, merged);
    }
    this.buckets.clear();
    return { meshes, nodes: new Map(this.nodes) };
  }
}

/** Triangle count of a finished geometry, for the budget log and tests. */
export function triCount(geo) {
  if (!geo) return 0;
  const idx = geo.getIndex();
  if (idx) return idx.count / 3;
  return (geo.getAttribute('position')?.count ?? 0) / 3;
}
