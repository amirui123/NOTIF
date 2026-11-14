import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hash2, valueNoise, fbm, SURFACES } from '../../src/engine/textures.js';

describe('engine/textures (pure noise + recipes)', () => {
  it('hashes deterministically inside [0, 1)', () => {
    assert.equal(hash2(1.5, 2.5), hash2(1.5, 2.5));
    for (let i = 0; i < 100; i++) {
      const v = hash2(i * 0.37, i * 1.13);
      assert.ok(v >= 0 && v < 1, `hash2 out of range: ${v}`);
    }
  });

  it('keeps value noise smooth (adjacent samples stay close)', () => {
    let maxJump = 0;
    for (let i = 0; i < 500; i++) {
      const a = valueNoise(i * 0.01, 3.3);
      const b = valueNoise((i + 1) * 0.01, 3.3);
      maxJump = Math.max(maxJump, Math.abs(a - b));
      assert.ok(a >= 0 && a <= 1.001, `noise out of range ${a}`);
    }
    assert.ok(maxJump < 0.05, `noise should not jump, saw ${maxJump}`);
  });

  it('fbm stays normalised', () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.7, i * 0.3, 4);
      assert.ok(v >= 0 && v <= 1.001, `fbm out of range: ${v}`);
    }
  });

  it('every surface recipe returns valid channels', () => {
    for (const [name, recipe] of Object.entries(SURFACES)) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const out = recipe(x / 8, y / 8);
          for (const key of ['r', 'g', 'b', 'h']) {
            assert.ok(Number.isFinite(out[key]), `${name}.${key} not finite`);
          }
          assert.ok(Number.isFinite(out.rough), `${name}.rough not finite`);
          assert.ok(out.rough >= 0 && out.rough <= 1.5, `${name}.rough out of range: ${out.rough}`);
        }
      }
    }
  });
});
