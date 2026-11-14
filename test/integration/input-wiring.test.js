/**
 * End-to-end input wiring: dispatch *real* DOM events and assert the game
 * reacts. The earlier smoke test called `game.weapon.tryFire()` directly, which
 * hid a total failure of the mouse path: Game assigned `input.onMove = fn`
 * (a property) while Input defines `onMove(fn)` (a method), so the listener
 * slots stayed null and the camera never turned.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('input wiring (real DOM events)', () => {
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
    // Pretend pointer lock succeeded; jsdom never grants it.
    game.input.enabled = true;
    game.input.locked = true;
    for (let i = 0; i < 5; i++) game.tick(1 / 60);
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('registers listeners through the Input API (not by clobbering methods)', () => {
    // The bug: assigning `input.onMove = fn` replaced the method, so the
    // internal slot stayed undefined. Methods must still be callable.
    assert.equal(typeof game.input.onMove, 'function');
    assert.equal(typeof game.input.onMouseButton, 'function');
    assert.equal(typeof game.input.onWheel, 'function');
    assert.equal(typeof game.input.onLockChange, 'function');
  });

  it('turns the camera on mousemove', () => {
    // jsdom drops movementX/movementY from constructed MouseEvents, so the
    // values are attached to the event object afterwards — the same shape the
    // browser hands to the handler during pointer lock.
    const move = (dx, dy) => {
      const event = new window.MouseEvent('mousemove', { bubbles: true });
      Object.defineProperty(event, 'movementX', { value: dx });
      Object.defineProperty(event, 'movementY', { value: dy });
      window.dispatchEvent(event);
    };

    const yawBefore = game.player.yaw;
    move(120, 0);
    assert.notEqual(game.player.yaw, yawBefore, 'yaw changed from a mousemove');

    const pitchBefore = game.player.pitch;
    move(0, 90);
    assert.ok(game.player.pitch < pitchBefore, 'pitch changed from a mousemove');
  });

  it('fires the weapon on a real mousedown', () => {
    const slot = game.weapon.currentSlot;
    slot.mag = 30;
    game.weapon.fireTimer = 0;
    const before = game.shotsFired;
    window.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true }));
    game.tick(1 / 60);
    // Automatic weapons keep firing while held; either way a shot must land.
    game.weapon.fireTimer = 0;
    game.tick(1 / 60);
    window.dispatchEvent(new window.MouseEvent('mouseup', { button: 0, bubbles: true }));
    assert.ok(game.shotsFired > before, `shotsFired ${before} -> ${game.shotsFired}`);
    assert.ok(slot.mag < 30, 'ammunition consumed by a real click');
  });

  it('aims down sights on right mouse button', () => {
    window.dispatchEvent(new window.MouseEvent('mousedown', { button: 2, bubbles: true }));
    for (let i = 0; i < 12; i++) game.tick(1 / 60);
    assert.ok(game.player.adsAmt > 0.4, `adsAmt=${game.player.adsAmt.toFixed(2)}`);
    window.dispatchEvent(new window.MouseEvent('mouseup', { button: 2, bubbles: true }));
  });

  it('swaps weapons on a real wheel tick', () => {
    const before = game.weapon.currentId;
    window.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, deltaMode: 0, bubbles: true }));
    for (let i = 0; i < 40; i++) game.tick(1 / 60);
    assert.notEqual(game.weapon.currentId, before, `slot swapped from ${before}`);
  });

  it('reopens the game from the click-to-capture banner', () => {
    // The banner used to be a child of #hud (pointer-events:none) and had no
    // handler at all, so a lost pointer lock was an unrecoverable dead end.
    const banner = window.document.getElementById('lock-banner');
    assert.ok(!window.document.getElementById('hud').contains(banner), 'banner is clickable');
    assert.equal(game.state.paused, false);

    // Simulate the browser dropping the lock (pointerlockchange).
    game.input.locked = false;
    game.input.enabled = true;
    game.input.fallbackLook = false;
    window.document.dispatchEvent(new window.Event('pointerlockchange'));
    assert.ok(banner.classList.contains('show'), 'banner appears when capture is lost');

    banner.click();
    assert.ok(!banner.classList.contains('show'), 'banner dismisses on click');
  });

  it('pauses on Escape and hides the HUD', () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    assert.equal(game.state.paused, true);
    assert.ok(window.document.getElementById('menu-overlay').classList.contains('hidden') === false);
  });
});
