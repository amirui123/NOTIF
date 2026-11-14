import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATORS, WEAPONS, ENEMY_TYPES, DEFAULT_SETTINGS, MAX_LIVE_HOSTILES } from '../../src/config.js';

describe('config integrity', () => {
  it('every operator references a real primary weapon', () => {
    for (const op of OPERATORS) {
      assert.ok(WEAPONS[op.primary], `${op.id} has unknown primary ${op.primary}`);
      assert.ok(op.hp > 0 && op.armor >= 0);
      assert.ok(op.speedMult > 0.5 && op.speedMult < 2);
      assert.ok(op.desc.length > 20, `${op.id} needs a description`);
    }
  });

  it('every weapon is internally consistent', () => {
    for (const [id, w] of Object.entries(WEAPONS)) {
      assert.equal(w.id, id);
      assert.ok(w.rpm > 0, `${id}.rpm`);
      assert.ok(w.damage > 0, `${id}.damage`);
      assert.ok(w.magSize > 0, `${id}.magSize`);
      assert.ok(w.reserveMax >= w.magSize, `${id} reserve must cover a magazine`);
      assert.ok(w.reloadTime > 0.2, `${id}.reloadTime`);
      assert.ok(w.adsFov > 10 && w.adsFov < 90, `${id}.adsFov`);
      assert.ok(w.spreadAds <= w.spreadHip, `${id} ADS must be tighter than hip`);
      assert.equal(w.hipPos.length, 3);
      assert.equal(w.adsPos.length, 3);
      assert.ok(typeof w.auto === 'boolean');
      assert.ok(['holo', 'acog', 'scope', 'reflex', 'iron'].includes(w.opticType));
    }
  });

  it('defines the six documented enemy archetypes', () => {
    const keys = Object.keys(ENEMY_TYPES);
    assert.equal(keys.length, 6);
    for (const key of keys) {
      const cfg = ENEMY_TYPES[key];
      assert.ok(cfg.hp > 0 && cfg.speed > 0);
      assert.ok(cfg.burst >= 1);
      assert.ok(cfg.score > 0);
      assert.ok(cfg.scale > 0.5 && cfg.scale < 2);
    }
  });

  it('points default settings at existing content', () => {
    assert.ok(OPERATORS.some((op) => op.id === DEFAULT_SETTINGS.operator));
    assert.ok(['overcast', 'dusk', 'night'].includes(DEFAULT_SETTINGS.weather));
    assert.ok(['ultra', 'high', 'perf'].includes(DEFAULT_SETTINGS.quality));
    assert.ok(MAX_LIVE_HOSTILES > 0);
  });
});
