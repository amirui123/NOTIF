import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp,
  lerp,
  inverseLerp,
  damp,
  angleDelta,
  wrapAngle,
  mod,
  compassDegrees,
  compassLabel,
  formatBearing,
  relativeBearingDeg,
  resolveCircleVsBox,
  randRange,
  randInt,
  randSign,
  saturate,
} from '../../src/core/math.js';

describe('core/math', () => {
  it('clamps into range', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-2, 0, 10), 0);
    assert.equal(clamp(42, 0, 10), 10);
  });

  it('lerps and inverse-lerps', () => {
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.equal(inverseLerp(0, 10, 2.5), 0.25);
    assert.equal(inverseLerp(4, 4, 4), 0, 'degenerate range is safe');
    assert.equal(inverseLerp(0, 10, 99), 1, 'clamps above range');
  });

  it('damps independently of frame rate', () => {
    const at60 = damp(0, 10, 10, 1 / 60);
    const steps1s = Array.from({ length: 60 }).reduce((v) => damp(v, 10, 10, 1 / 60), 0);
    assert.ok(Math.abs(steps1s - damp(0, 10, 10, 1)) < 0.01, 'one second is one second');
    assert.ok(at60 > 0 && at60 < 10);
  });

  it('finds shortest angular deltas across the wrap point', () => {
    assert.ok(Math.abs(angleDelta(0.1, Math.PI * 2 - 0.1) + 0.2) < 1e-9);
    assert.equal(angleDelta(0, Math.PI / 2), Math.PI / 2);
  });

  it('wraps angles into [-PI, PI)', () => {
    assert.ok(Math.abs(wrapAngle(Math.PI * 2)) < 1e-9, '2π == 0');
    assert.ok(Math.abs(Math.abs(wrapAngle(Math.PI * 3)) - Math.PI) < 1e-9, '3π == ±π');
    assert.ok(Math.abs(Math.abs(wrapAngle(-Math.PI * 3)) - Math.PI) < 1e-9);
    assert.ok(Math.abs(wrapAngle(0.5) - 0.5) < 1e-9);
    assert.ok(Math.abs(wrapAngle(-0.5) + 0.5) < 1e-9);
  });

  it('computes positive modulo', () => {
    assert.equal(mod(-1, 360), 359);
    assert.equal(mod(361, 360), 1);
    assert.equal(mod(0, 360), 0);
  });

  it('maps yaw to compass degrees', () => {
    assert.equal(Math.round(compassDegrees(0)), 0);
    assert.equal(Math.round(compassDegrees(-Math.PI / 2)), 90, 'yaw -90 looks east');
    assert.equal(Math.round(compassDegrees(Math.PI)), 180);
  });

  it('labels headings', () => {
    assert.equal(compassLabel(0), 'N');
    assert.equal(compassLabel(90), 'E');
    assert.equal(compassLabel(225), 'SW');
    assert.equal(compassLabel(359), 'N');
  });

  it('formats the HUD bearing', () => {
    assert.equal(formatBearing(0), '000° N');
    assert.equal(formatBearing(-Math.PI / 2), '090° E');
  });

  it('computes the relative damage bearing', () => {
    // Enemy straight ahead (-Z) → 0°
    assert.equal(Math.round(relativeBearingDeg(0, -5, 0)), 0);
    // Enemy to the right (+X) → +90°
    assert.equal(Math.round(relativeBearingDeg(5, 0, 0)), 90);
    // Enemy behind → ±180°
    assert.equal(Math.abs(Math.round(relativeBearingDeg(0, 5, 0))), 180);
  });

  it('pushes a circle out of a box', () => {
    const box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const outside = resolveCircleVsBox(0, 0, 0.4, box);
    assert.equal(outside.hit, true);
    const far = resolveCircleVsBox(10, 10, 0.4, box);
    assert.equal(far.hit, false);
    const touching = resolveCircleVsBox(1.3, 0, 0.4, box);
    assert.equal(touching.hit, true);
    assert.ok(touching.x >= 1.4 - 1e-9, 'pushed to the right face');
  });

  it('produces values inside the requested ranges', () => {
    for (let i = 0; i < 50; i++) {
      const f = randRange(2, 4);
      assert.ok(f >= 2 && f < 4);
      const n = randInt(1, 3);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= 3);
      assert.ok([-1, 1].includes(randSign()));
      assert.ok(saturate(f / 4) >= 0 && saturate(f / 4) <= 1);
    }
  });
});
