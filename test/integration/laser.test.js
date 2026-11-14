/**
 * Laser sight contract.
 *
 * The beam used to stay switched on by default and kept its last geometry when
 * hidden, leaving a 65 m green line across the map and a dot stranded in world
 * space after toggling it off.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('laser sight', () => {
  let game;
  let window;

  const lineLength = () => {
    const pos = game.weapon.vm.laserLine.geometry.attributes.position;
    const a = new THREE.Vector3().fromBufferAttribute(pos, 0);
    const b = new THREE.Vector3().fromBufferAttribute(pos, 1);
    return a.distanceTo(b);
  };

  before(async () => {
    const dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    ensureBrowserGlobals(window);
    stubCanvas2D(window);
    const { Game } = await import(join(ROOT, 'src/game.js'));
    game = new Game();
    game.start();
    window.document.getElementById('btn-deploy').click();
    game.input.enabled = true;
    game.input.locked = true;
    for (let i = 0; i < 20; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('is off by default', () => {
    assert.equal(game.weapon.laserOn, false);
    assert.equal(game.weapon.vm.laserLine.visible, false);
  });

  it('draws a short beam when switched on', () => {
    game.weapon.laserOn = true;
    for (let i = 0; i < 3; i++) game.tick(1 / 60);
    assert.equal(game.weapon.vm.laserLine.visible, true);
    const length = lineLength();
    assert.ok(length > 0.5, `beam has length (${length.toFixed(2)} m)`);
    assert.ok(length < 70, `beam is not absurd (${length.toFixed(2)} m)`);
  });

  it('collapses the beam instead of leaving stale geometry', () => {
    game.weapon.laserOn = false;
    for (let i = 0; i < 3; i++) game.tick(1 / 60);
    assert.equal(game.weapon.vm.laserLine.visible, false);
    assert.ok(lineLength() < 1e-6, 'beam geometry is collapsed');
    assert.equal(game.weapon.vm.laserDot.visible, false);
  });

  it('lands the dot on the world, not on the gun', () => {
    game.weapon.laserOn = true;
    for (let i = 0; i < 3; i++) game.tick(1 / 60);
    const dot = game.weapon.vm.laserDot;
    if (dot.visible) {
      assert.equal(dot.parent, game.scene, 'dot is a world-space object');
      assert.ok(dot.position.distanceTo(game.camera.position) > 1, 'dot is not on the lens');
    }
    game.weapon.laserOn = false;
    game.tick(1 / 60);
  });
});
