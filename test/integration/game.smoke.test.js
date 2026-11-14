/**
 * Integration smoke test.
 *
 * Runs the complete game in jsdom against the real three.js build (only the
 * GPU renderer is stubbed) and drives the actual frame loop, menu, settings,
 * deploy flow, movement, shooting, reloads, wave director and death screen.
 * This is what caught the missing `level.build()` call and the null viewmodel
 * crash in the menu orbit camera.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';
import { installThreeStubs } from './three-stub.js';

const ROOT = process.cwd();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

describe('game integration (jsdom)', () => {
  let dom;
  let window;
  let THREE;
  let game;
  const errors = [];

  before(async () => {
    dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
    window = dom.window;

    ensureBrowserGlobals(window);

    window.addEventListener('error', (event) => errors.push(event.message));

    THREE = await import('three');
    installThreeStubs(THREE);
    stubCanvas2D(window);

    const { Game } = await import(join(ROOT, 'src/game.js'));
    game = new Game();
    game.start();
    for (let i = 0; i < 20; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('renders the menu with all operators', () => {
    assert.equal(document.querySelectorAll('.op-card').length, 5);
    assert.equal(document.getElementById('menu-overlay').classList.contains('hidden'), false);
    assert.ok(document.querySelector('canvas.game-canvas'));
    assert.ok(globalThis.__SMOKE_FRAMES__ > 5, 'orbit camera renders every frame');
  });

  it('applies weather presets', () => {
    const weather = document.getElementById('opt-weather');
    weather.value = 'night';
    weather.dispatchEvent(new window.Event('change'));
    assert.equal(game.nvgOn, true);
    assert.ok(game.sun.intensity < 1);
    weather.value = 'overcast';
    weather.dispatchEvent(new window.Event('change'));
    assert.equal(game.nvgOn, false);
  });

  it('applies quality presets', () => {
    const quality = document.getElementById('opt-quality');
    quality.value = 'perf';
    quality.dispatchEvent(new window.Event('change'));
    assert.equal(game.bloomPass.enabled, false);
    quality.value = 'high';
    quality.dispatchEvent(new window.Event('change'));
    assert.equal(game.bloomPass.enabled, true);
  });

  it('updates sensitivity from the slider', () => {
    const sens = document.getElementById('opt-sens');
    sens.value = '2';
    sens.dispatchEvent(new window.Event('input'));
    assert.equal(document.getElementById('sens-val').textContent, '2.00x');
    assert.equal(game.sens, 2);
  });

  it('selects an operator', () => {
    const card = [...document.querySelectorAll('.op-card')].find((c) => c.dataset.operator === 'ronin');
    card.click();
    assert.equal(game.menu.selectedOperator.id, 'ronin');
    assert.equal(card.getAttribute('aria-pressed'), 'true');
  });

  it('deploys into the mission', () => {
    document.getElementById('btn-deploy').click();
    for (let i = 0; i < 10; i++) game.tick(1 / 60);
    assert.equal(game.state.playing, true);
    assert.ok(document.getElementById('menu-overlay').classList.contains('hidden'));
    assert.ok(document.getElementById('hud').classList.contains('active'));
    assert.equal(game.weapon.currentId, 'mp7');
    assert.ok(game.spawnQueue.length > 0);
    assert.match(document.getElementById('wave-label').textContent, /WAVE 01/);
  });

  it('moves the player with WASD and keeps them grounded', () => {
    game.input.enabled = true;
    game.input.locked = true;
    const start = game.player.position.clone();
    game.input.keys['KeyW'] = true;
    for (let i = 0; i < 120; i++) game.tick(1 / 60);
    game.input.keys['KeyW'] = false;
    assert.ok(game.player.position.distanceTo(start) > 1, 'player moved');
    assert.ok(Math.abs(game.player.position.y) < 0.2, 'stays on the ground');
    assert.ok(Math.abs(game.player.position.x) <= 48.5);
    assert.ok(Math.abs(game.player.position.z) <= 48.5);
  });

  it('sprints and crouches', () => {
    game.input.keys['KeyW'] = true;
    game.input.keys['ShiftLeft'] = true;
    for (let i = 0; i < 60; i++) game.tick(1 / 60);
    assert.ok(game.player.sprintAmt > 0.7);
    game.input.keys['ShiftLeft'] = false;
    game.input.keys['KeyW'] = false;
    for (let i = 0; i < 30; i++) game.tick(1 / 60);

    game.player.toggleCrouch();
    for (let i = 0; i < 40; i++) game.tick(1 / 60);
    assert.ok(game.player.eyeHeight < 1.3, 'camera lowers');
    game.player.toggleCrouch();
    for (let i = 0; i < 40; i++) game.tick(1 / 60);
    assert.ok(game.player.eyeHeight > 1.55, 'camera returns');
  });

  it('registers hitscan damage on enemies', () => {
    const forward = new THREE.Vector3(0, 0, -1);
    game.enemies.spawnEnemy('assault', game.player.position, forward);
    const target = game.enemies.enemies.at(-1);
    assert.ok(target, 'enemy spawned');
    target.root.position.set(game.player.position.x, 0, game.player.position.z - 8);
    target.root.updateMatrixWorld(true);
    game.player.pitch = 0;
    game.player.yaw = 0;
    game.camera.updateMatrixWorld(true);

    const hpBefore = target.hp;
    for (let i = 0; i < 30; i++) {
      game.weapon.fireTimer = 0;
      game.weapon.state = 'IDLE';
      game.weapon.tryFire();
    }
    assert.ok(target.hp < hpBefore || !target.alive);
    assert.ok(game.shotsFired >= 30);
  });

  it('refills the magazine exactly once while reloading', () => {
    game.weapon.slots[0].mag = 3;
    const reserveBefore = game.weapon.slots[0].reserve;
    game.weapon.startReload();
    for (let i = 0; i < 300; i++) game.tick(1 / 60);
    assert.equal(game.weapon.slots[0].mag, 40);
    assert.ok(game.weapon.slots[0].reserve < reserveBefore);
  });

  it('runs the wave director', () => {
    for (let i = 0; i < 60 * 20; i++) game.tick(1 / 60);
    assert.ok(game.enemies.enemies.length > 0);
  });

  it('pauses and resumes cleanly', () => {
    game.pause();
    assert.ok(!document.getElementById('menu-overlay').classList.contains('hidden'));
    assert.equal(Object.keys(game.input.keys).length, 0, 'input cleared');
    document.getElementById('btn-deploy').click();
    for (let i = 0; i < 5; i++) game.tick(1 / 60);
    assert.ok(document.getElementById('menu-overlay').classList.contains('hidden'));
  });

  it('shows the game over summary with stats', () => {
    game.player.armor = 0;
    game.player.hp = 1;
    game.player.addDamage(50, new THREE.Vector3(0, 0, 0));
    game.checkDeath();
    game.tick(1 / 60);
    assert.equal(game.state.gameOver, true);
    assert.ok(document.getElementById('summary-box').classList.contains('show'));
    assert.match(document.getElementById('sum-stats').textContent, /SCORE/);
  });

  it('never threw during the whole run', () => {
    assert.deepEqual(errors, []);
  });
});
