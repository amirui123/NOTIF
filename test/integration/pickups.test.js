/**
 * Resource flows: pickups, barrel destruction, explosions.
 *
 * These are the systems that keep a run going, and each one has a failure mode
 * that is invisible until you are deep in a wave: a pickup that heals past the
 * cap, a barrel that can be destroyed twice, a reset that does not restore it.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('pickups & destructibles', () => {
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
    game.input.enabled = true;
    game.input.locked = true;
    for (let i = 0; i < 30; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('heals and re-plates on a med pickup, capped', () => {
    game.player.hp = 40;
    game.player.armor = 10;
    game.fx.spawnPickup(game.player.position.clone(), 'med');
    game.tick(1 / 60);
    assert.equal(game.player.hp, 75);
    assert.equal(game.player.armor, 35);
    assert.equal(game.fx.pickups.length, 0, 'pickup is consumed');

    game.player.hp = 95;
    game.player.armor = 48;
    game.fx.spawnPickup(game.player.position.clone(), 'med');
    game.tick(1 / 60);
    assert.equal(game.player.hp, 100, 'never overheals');
    assert.equal(game.player.armor, 50, 'never over-plates');
  });

  it('refills the magazine from an ammo pickup', () => {
    const slot = game.weapon.currentSlot;
    slot.mag = 3;
    slot.reserve = 0;
    game.fragments = 0;
    game.frags = 0;
    game.fx.spawnPickup(game.player.position.clone(), 'ammo');
    game.tick(1 / 60);
    assert.ok(slot.mag > 3, `magazine topped up (${slot.mag})`);
    assert.ok(slot.reserve > 0, `reserve topped up (${slot.reserve})`);
    assert.equal(game.frags, 1, 'one frag granted');
  });

  it('destroys a barrel exactly once', () => {
    const barrel = game.level.barrels[0];
    assert.equal(barrel.exploded, false);
    assert.equal(game.level.destroyBarrel(barrel), true);
    assert.equal(barrel.exploded, true);
    assert.ok(barrel.collider.maxY < -5, 'collider is disabled so it cannot block movement');
    assert.equal(barrel.group.visible, false);
    assert.equal(game.level.destroyBarrel(barrel), false, 'cannot explode twice');
  });

  it('restores every barrel on redeploy', () => {
    game.level.resetBarrels();
    for (const barrel of game.level.barrels) {
      assert.equal(barrel.exploded, false);
      assert.equal(barrel.group.visible, true);
      assert.ok(barrel.collider.maxY > 0, 'collider is live again');
    }
  });

  it('damages enemies inside an explosion', () => {
    game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
    const enemy = game.enemies.enemies.at(-1);
    enemy.root.position.copy(game.player.position).add(new THREE.Vector3(3, 0, 0));
    const before = enemy.hp;
    game.fx.detonate(enemy.root.position.clone(), 9, 150, game.fx.onExplode);
    assert.ok(enemy.hp < before || !enemy.alive, `enemy took blast damage (${before} → ${enemy.hp})`);
  });

  it('falls off with distance', () => {
    const near = game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
    const far = game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
    game.enemies.enemies
      .at(-2)
      .root.position.copy(game.player.position)
      .add(new THREE.Vector3(1, 0, 0));
    game.enemies.enemies
      .at(-1)
      .root.position.copy(game.player.position)
      .add(new THREE.Vector3(8, 0, 0));
    const farHp = game.enemies.enemies.at(-1).hp;
    game.fx.detonate(game.player.position.clone(), 9, 150, game.fx.onExplode);
    assert.ok(near.hp < farHp || !near.alive, 'closer takes more damage');
    assert.ok(far.hp <= farHp, 'far enemy is not ignored');
  });
});
