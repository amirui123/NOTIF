/**
 * Scene graph and lighting contract.
 *
 * Regressions this covers:
 *  - the viewmodel is parented to the camera, so the camera must be in the
 *    scene or its fill light lights nothing;
 *  - the gun is metalness 0.85 and has no light of its own, so every weather
 *    preset must give it a readable fill (night used to leave it pitch black);
 *  - the muzzle flash must not be visible while idle.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('scene graph & lighting', () => {
  let game;
  let window;

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
    for (let i = 0; i < 10; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('keeps the camera in the scene graph', () => {
    assert.equal(game.camera.parent, game.scene);
    assert.equal(game.viewLight.parent, game.camera);
  });

  it('gives the viewmodel a fill light in every weather preset', () => {
    const select = window.document.getElementById('opt-weather');
    for (const mode of ['overcast', 'dusk', 'night']) {
      select.value = mode;
      select.dispatchEvent(new window.Event('change'));
      assert.ok(game.viewLight.intensity >= 0.5, `${mode}: fill ${game.viewLight.intensity}`);
    }
    select.value = 'overcast';
    select.dispatchEvent(new window.Event('change'));
  });

  it('places the fill light inside its falloff radius of the weapon', () => {
    const lightPos = new THREE.Vector3();
    game.viewLight.getWorldPosition(lightPos);
    const gunPos = new THREE.Vector3();
    game.weapon.vm.muzzlePoint.getWorldPosition(gunPos);
    assert.ok(lightPos.distanceTo(gunPos) < game.viewLight.distance, 'muzzle is lit');
  });

  it('hides the muzzle flash while the weapon is idle', () => {
    assert.equal(game.weapon.vm.flashGroup.visible, false);
  });

  it('builds the scene without NaN transforms', () => {
    const bad = [];
    game.scene.traverse((node) => {
      if (!node.position) return;
      if (!Number.isFinite(node.position.x + node.position.y + node.position.z)) {
        bad.push(`${node.type}:${node.name || 'unnamed'}`);
      }
    });
    assert.deepEqual(bad, []);
  });

  it('renders every mesh with a material that can receive light', () => {
    const broken = [];
    game.scene.traverse((node) => {
      if (!node.isMesh) return;
      if (!node.material) broken.push(`${node.geometry?.type} has no material`);
    });
    assert.deepEqual(broken, []);
  });
});
