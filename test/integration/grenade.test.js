/**
 * Grenade path: FXManager must forward `onExplode` so thrown frags actually
 * hurt enemies and the player. This regressed once (the handler was never
 * registered, so grenades were purely cosmetic).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('grenade explosions', () => {
  let window;
  let dom;
  let game;

  before(async () => {
    dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    ensureBrowserGlobals(window);
    stubCanvas2D(window);
    const { Game } = await import(join(ROOT, 'src/game.js'));
    game = new Game();
    game.start();
    document.getElementById('btn-deploy').click();
    for (let i = 0; i < 5; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('damages nearby hostiles when a frag detonates', () => {
    const enemy = game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
    const target = game.enemies.enemies.at(-1);
    assert.ok(target, 'enemy exists');
    const expected = enemy;
    target.root.position.set(4, 0, 4);
    const before = expected.hp;

    game.fx.detonate(new THREE.Vector3(4, 0, 4), 10.5, 165, game.fx.onExplode);
    assert.ok(target.hp < before || !target.alive, `enemy took damage (${before} -> ${target.hp})`);
  });

  it('hurts the player inside the blast radius', () => {
    const before = game.player.hp;
    game.fx.detonate(game.player.position.clone(), 10.5, 165, game.fx.onExplode);
    assert.ok(game.player.hp < before, `player hp ${before} -> ${game.player.hp}`);
  });

  it('throws a frag and consumes it', () => {
    game.frags = 1;
    const before = game.fx.grenades.length;
    game.throwFrag();
    assert.equal(game.frags, 0);
    assert.equal(game.fx.grenades.length, before + 1);
    game.throwFrag();
    assert.equal(game.fx.grenades.length, before + 1, 'cannot throw without frags');
  });
});
