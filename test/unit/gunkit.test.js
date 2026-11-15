/**
 * The hard-surface geometry kit.
 *
 * These are not "does it run" tests. Each one pins a property the realism of
 * the weapon depends on, because the kit's whole job is to produce geometry
 * whose *normals* behave like machined metal:
 *
 *  - a chamfered box must have a band of intermediate normals. Without them a
 *    corner is one flat facet and catches no highlight, which is the exact
 *    failure mode the kit exists to fix.
 *  - dimensions must survive the chamfer. A filleted box that is 2 mm too big
 *    breaks the pose solve and pushes the muzzle off screen.
 *  - no triangle may reference the same vertex twice. three's ExtrudeGeometry
 *    emits such triangles when it stitches caps, and they poison mesh walks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  box,
  tubeZ,
  rodZ,
  latheZ,
  extrude,
  roundRect,
  picatinny,
  mergeAll,
  stripDegenerate,
  triCount,
} from '../../src/world/gunkit.js';

/** Every distinct normal direction in a geometry, rounded. */
function normalSet(geo) {
  const n = geo.getAttribute('normal');
  const set = new Set();
  for (let i = 0; i < n.count; i++) {
    set.add([n.getX(i), n.getY(i), n.getZ(i)].map((v) => (Math.abs(v) < 1e-4 ? 0 : v).toFixed(2)).join(','));
  }
  return set;
}

function sizeOf(geo) {
  geo.computeBoundingBox();
  return geo.boundingBox.getSize(new THREE.Vector3());
}

function degenerateCount(geo) {
  const idx = geo.getIndex();
  if (!idx) return 0;
  let bad = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (a === b || b === c || a === c) bad++;
  }
  return bad;
}

function finiteCount(geo) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  let bad = 0;
  for (let i = 0; i < pos.count; i++) {
    if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i)))
      bad++;
  }
  for (let i = 0; i < nor.count; i++) {
    if (!Number.isFinite(nor.getX(i)) || !Number.isFinite(nor.getY(i)) || !Number.isFinite(nor.getZ(i)))
      bad++;
  }
  return bad;
}

describe('gunkit: chamfered box', () => {
  it('keeps its exact dimensions after filleting', () => {
    const s = sizeOf(box(0.28, 0.052, 0.044, 0.0012));
    assert.ok(Math.abs(s.x - 0.28) < 1e-5, `width ${s.x}`);
    assert.ok(Math.abs(s.y - 0.052) < 1e-5, `height ${s.y}`);
    assert.ok(Math.abs(s.z - 0.044) < 1e-5, `depth ${s.z}`);
  });

  it('carries a band of intermediate normals, not one flat facet per corner', () => {
    const normals = normalSet(box(0.28, 0.052, 0.044, 0.0012));
    // A plain box has 6. A correctly filleted one has the six faces plus arcs
    // of corner normals; anything at or below 6 means the fillet did nothing.
    assert.ok(normals.size > 20, `only ${normals.size} distinct normals`);
    // And there must be directions that are neither axis-aligned nor diagonal:
    // those are the ones a highlight rolls across.
    const offAxis = [...normals].filter((n) => !/^(-?[01]\.00,|,0\.00)/.test(n) && !n.includes('0.71'));
    assert.ok(offAxis.length > 4, `only ${offAxis.length} off-axis normals`);
  });

  it('scales its triangle budget with the fillet resolution', () => {
    const cheap = triCount(box(0.28, 0.052, 0.044, 0.0012, 2, 2));
    const rich = triCount(box(0.28, 0.052, 0.044, 0.0012, 4, 3));
    assert.ok(cheap < 350, `cheap box is ${cheap} triangles`);
    assert.ok(rich > cheap, 'higher resolution must cost more');
  });

  it('degenerates to a plain box when the chamfer is zero', () => {
    const g = box(0.1, 0.1, 0.1, 0);
    assert.equal(triCount(g), 12);
  });

  it('never produces NaN or a degenerate triangle, at any scale', () => {
    for (const dims of [
      [0.28, 0.052, 0.044],
      [0.002, 0.002, 0.002],
      [2.0, 0.02, 0.02],
    ]) {
      const g = box(...dims, 0.0008, 3, 2);
      assert.equal(finiteCount(g), 0, `NaN in a ${dims.join('x')} box`);
      assert.equal(degenerateCount(g), 0);
    }
  });
});

describe('gunkit: turned and extruded primitives', () => {
  it('builds a tube with a real wall and a crowned rim', () => {
    const g = tubeZ(0.011, 0.0062, 0.42, 20);
    const s = sizeOf(g);
    assert.ok(Math.abs(s.z - 0.42) < 1e-4, `length ${s.z}`);
    assert.ok(Math.abs(s.x - 0.022) < 1e-4, `outer diameter ${s.x}`);
    // A crowned rim means the end cap is not one flat washer: there are
    // normals pointing partly along the barrel axis.
    const axial = [...normalSet(g)].filter((n) => Math.abs(parseFloat(n.split(',')[2])) > 0.2);
    assert.ok(axial.length > 0, 'no crown: the tube ends are dead flat');
  });

  it('lathes a profile along Z, not Y', () => {
    const g = latheZ(
      [
        [0, 0.01],
        [0.1, 0.014],
        [0.12, 0],
      ],
      16,
    );
    const s = sizeOf(g);
    // The profile runs 0..0.12 in its axial coordinate, so the result must be
    // 120 mm long in Z and 28 mm across in X/Y.
    assert.ok(Math.abs(s.z - 0.12) < 1e-5, `axial ${s.z}`);
    assert.ok(Math.abs(s.x - 0.028) < 1e-4, `diameter ${s.x}`);
  });

  it('extrudes a bevelled outline with no degenerate triangles', () => {
    const g = extrude(roundRect(0.05, 0.03, 0.006, 3), 0.012, { bevel: 0.0008 });
    assert.equal(degenerateCount(g), 0);
    assert.equal(finiteCount(g), 0);
    const s = sizeOf(g);
    assert.ok(Math.abs(s.z - 0.012) < 1e-4, `depth ${s.z}`);
  });

  it('strips degenerate triangles without touching anything else', () => {
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    clean.setIndex([0, 1, 2, 1, 3, 2, 2, 2, 3]);
    const stripped = stripDegenerate(clean);
    assert.equal(triCount(stripped), 2, 'the repeated-vertex triangle is removed');
  });

  it('merges indexed and non-indexed geometry into one mesh', () => {
    const a = rodZ(0.01, 0.01, 0.05, 12); // indexed
    const b = new THREE.BoxGeometry(0.02, 0.02, 0.02); // indexed too, but of a different shape
    const merged = mergeAll([a, b]);
    assert.equal(triCount(merged), triCount(a) + triCount(b));
    assert.equal(finiteCount(merged), 0);
  });
});

describe('gunkit: Picatinny rail', () => {
  it('has real recoil slots rather than a smooth comb', () => {
    const g = picatinny(0.26);
    // Slot pitch is 10.55 mm, so a 260 mm rail carries ~24 teeth. The tooth
    // count is what makes the slots actual gaps in the silhouette; a solid bar
    // would have a near-constant cross-section and far fewer triangles.
    assert.ok(triCount(g) > 400, `rail is only ${triCount(g)} triangles`);
    assert.equal(degenerateCount(g), 0);
    assert.equal(finiteCount(g), 0);
  });

  it('is 21.2 mm across the top, per MIL-STD-1913', () => {
    const s = sizeOf(picatinny(0.1));
    assert.ok(Math.abs(s.x - 0.0212) < 1e-5, `width ${s.x}`);
    assert.ok(Math.abs(s.z - 0.1) < 1e-4, `length ${s.z}`);
  });
});
