/**
 * Regression guard for the level's walkable envelope: the player must be able
 * to leave the spawn alive, and overhead geometry (catwalks, awnings, roofs)
 * must not knock them sideways. Both of these were broken at some point.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('level collision envelope', () => {
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

  it('builds a level with colliders and floors', () => {
    assert.ok(game.level.colliders.length > 50, `${game.level.colliders.length} colliders`);
    assert.ok(game.level.floors.length > 0, 'walkable floors exist');
  });

  it('spawns the player on solid ground', () => {
    const { position, grounded } = game.player;
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.z));
    assert.ok(grounded, 'player is standing');
    assert.ok(Math.abs(position.y) < 2, `y=${position.y}`);
  });

  it('lets the player walk out of the spawn zone', () => {
    const start = game.player.position.clone();
    game.input.enabled = true;
    game.input.locked = true;
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 180; i++) game.tick(1 / 60);
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyW' }));
    const travelled = start.distanceTo(game.player.position);
    assert.ok(travelled > 4, `travelled ${travelled.toFixed(2)} m in 3 s`);
  });

  it('keeps the player inside the map bounds', () => {
    const { position } = game.player;
    assert.ok(Math.abs(position.x) <= 48.5 && Math.abs(position.z) <= 48.5, 'inside ±48.5');
    assert.equal(game.player.isDead, false, 'did not clip into a wall and die');
  });

  it('stops the player against the arena perimeter', () => {
    game.player.position.set(0, 0, -44);
    game.player.velocity.set(0, 0, 0);
    game.player.yaw = 0;
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 300; i++) game.tick(1 / 60);
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyW' }));
    assert.ok(
      game.player.position.z >= -48.6,
      `blocked at the perimeter (z=${game.player.position.z.toFixed(2)})`,
    );
  });
});
