/**
 * Hitscan accuracy contract.
 *
 * The full chain (camera quaternion → spread → raycast against world and
 * enemy hitboxes → damageEnemy) must land shots when the player is aimed at a
 * target. A spread model that is too wide at range, or hitboxes detached from
 * their rigs, both show up here as a collapsed hit rate.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('hitscan', () => {
  let game;
  let window;

  const aimAt = (target) => {
    const eye = game.player.position.clone();
    eye.y += 1.62;
    const point = target.clone();
    point.y += 1.3;
    const delta = point.sub(eye);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
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
    // The wave spawner releases a hostile every 1.35 s.
    for (let i = 0; i < 60 * 3; i++) {
      game.tick(1 / 60);
      game.player.hp = 10000;
    }
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('hitboxes follow their enemy rig', () => {
    const enemy = game.enemies.enemies.find((e) => e.alive);
    assert.ok(enemy, 'a live enemy exists');
    const mine = game.enemies.hitboxes.filter((h) => h.userData?.enemy === enemy);
    assert.equal(mine.length, 3, 'head, torso and legs');
    const world = new THREE.Vector3();
    mine[0].getWorldPosition(world);
    assert.ok(
      world.distanceTo(enemy.root.position) < 3,
      `hitbox is parented to the rig (${world.distanceTo(enemy.root.position).toFixed(2)} m off)`,
    );
  });

  it('lands aimed shots at close range', () => {
    // Freeze the AI so this measures hit registration, not enemy movement.
    for (const e of game.enemies.enemies) {
      e.state = 'HOLD';
      e.stateTimer = 999;
    }

    let fired = 0;
    let hits = 0;
    for (let i = 0; i < 24; i++) {
      // Re-target every shot: the previous target may have just died, so top
      // the field back up when it is empty.
      let enemy = game.enemies.enemies.find((e) => e.alive);
      if (!enemy) {
        game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
        enemy = game.enemies.enemies.at(-1);
        enemy.state = 'HOLD';
        enemy.stateTimer = 999;
      }
      assert.ok(enemy, 'a live target remains');
      game.player.position.set(enemy.root.position.x, enemy.root.position.y, enemy.root.position.z + 8);
      aimAt(enemy.root.position);
      game.weapon.recoilPitch = 0;
      game.weapon.recoilYaw = 0;
      game.weapon.spreadExtra = 0;
      game.player.adsAmt = 1;
      game.weapon.adsAmt = 1;
      game.tick(1 / 60);
      game.player.hp = 10000;
      game.weapon.fireTimer = 0;
      const shots = game.shotsFired;
      const landed = game.shotsHit;
      game.weapon.tryFire();
      if (game.shotsFired > shots) {
        fired++;
        if (game.shotsHit > landed) hits++;
      }
    }
    assert.ok(fired >= 10, `${fired} shots fired`);
    assert.ok(hits / fired > 0.8, `aimed hit rate ${Math.round((hits / fired) * 100)}% at 8 m`);
  });

  it('registers headshots against the head hitbox', () => {
    let target = game.enemies.enemies.find((e) => e.alive);
    if (!target) {
      game.enemies.spawnEnemy('assault', game.player.position, new THREE.Vector3(0, 0, -1));
      target = game.enemies.enemies.at(-1);
    }
    const result = game.enemies.damageEnemy(
      target,
      500,
      'head',
      target.root.position.clone(),
      new THREE.Vector3(0, 0, -1),
    );
    assert.equal(result.headshot, true);
    assert.equal(result.killed, true);
  });

  it('does not reward shots at a corpse', () => {
    const corpse = game.enemies.enemies.find((e) => !e.alive);
    assert.ok(corpse, 'a dead enemy exists');
    const attached = game.enemies.hitboxes.filter((h) => h.userData?.enemy === corpse);
    assert.equal(attached.length, 0, 'dead hitboxes are detached');
  });
});
