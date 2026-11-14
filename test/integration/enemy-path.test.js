/**
 * Enemy navigation contract.
 *
 * Enemies used to walk in a straight line from their spawn and wedge
 * permanently against the first wall — the "advance" branch had no step-up and
 * no detour, so most of a wave would sit out of the fight behind cover.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('enemy navigation', () => {
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
    for (let i = 0; i < 5; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('walks past the ledge that used to trap it', () => {
    const enemy = game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
    assert.ok(enemy, 'enemy spawned');
    // Due south of the player, with a 1 m dirt ledge in the direct path.
    enemy.root.position.set(0, 0, -20);
    const startDistance = enemy.root.position.distanceTo(game.player.position);
    assert.ok(startDistance > 35, `starts far away (${startDistance.toFixed(1)} m)`);

    for (let i = 0; i < 60 * 25; i++) {
      enemy.state = 'ADVANCE';
      enemy.stateTimer = 999;
      game.player.position.set(0, 0, 18);
      game.player.velocity.set(0, 0, 0);
      game.player.hp = 10000;
      game.player.armor = 10000;
      game.tick(1 / 60);
    }

    const distance = enemy.root.position.distanceTo(game.player.position);
    assert.ok(distance < 20, `closed the gap (${distance.toFixed(1)} m, was ${startDistance.toFixed(1)} m)`);
    assert.ok(Number.isFinite(enemy.root.position.y), 'stays on the ground');
  });

  it('never leaves the map bounds while pathing', () => {
    for (const enemy of game.enemies.enemies) {
      assert.ok(Math.abs(enemy.root.position.x) <= 46.01, `x=${enemy.root.position.x}`);
      assert.ok(Math.abs(enemy.root.position.z) <= 46.01, `z=${enemy.root.position.z}`);
    }
  });

  it('keeps enemy state finite during a long engagement', () => {
    for (let i = 0; i < 60 * 20; i++) {
      game.tick(1 / 60);
      game.player.hp = 10000;
      if (game.state.gameOver) break;
    }
    for (const enemy of game.enemies.enemies) {
      const p = enemy.root.position;
      assert.ok(Number.isFinite(p.x + p.y + p.z), `finite position for ${enemy.typeKey}`);
      assert.ok(Number.isFinite(enemy.hp), 'finite hp');
      assert.ok(Number.isFinite(enemy.fireCooldown), 'finite cooldown');
    }
  });
});
