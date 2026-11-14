/**
 * UI contract tests. These lock in the accessibility and layout behaviour the
 * first version got wrong: the menu is a real modal dialog, the "click to
 * capture" banner can actually be clicked, and the HUD only writes what
 * changed.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('ui: menu + hud', () => {
  let game;
  let window;
  let doc;

  before(async () => {
    const dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    doc = window.document;
    ensureBrowserGlobals(window);
    stubCanvas2D(window);
    const { Game } = await import(join(ROOT, 'src/game.js'));
    game = new Game();
    game.start();
  });

  after(() => {
    game?.dispose();
    window?.close();
  });

  it('exposes the menu as a labelled modal dialog', () => {
    const overlay = doc.getElementById('menu-overlay');
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.equal(overlay.getAttribute('aria-modal'), 'true');
    const labelId = overlay.getAttribute('aria-labelledby');
    assert.ok(doc.getElementById(labelId)?.textContent.includes('SECTOR-7'), 'labelled by the title');
    assert.ok(doc.getElementById(overlay.getAttribute('aria-describedby')), 'has a description');
  });

  it('renders one operator card per operator, all keyboard reachable', () => {
    const cards = [...doc.querySelectorAll('.op-card')];
    assert.equal(cards.length, 5);
    for (const card of cards) {
      assert.equal(card.tagName, 'BUTTON', 'cards are buttons');
      assert.equal(card.getAttribute('type'), 'button', 'never submits');
      assert.ok(card.getAttribute('aria-pressed') !== null, 'exposes selection state');
    }
  });

  it('marks exactly one operator as selected', () => {
    const pressed = [...doc.querySelectorAll('.op-card[aria-pressed="true"]')];
    assert.equal(pressed.length, 1);
    assert.ok(pressed[0].classList.contains('selected'));
  });

  it('keeps the deploy button as the primary action in every menu state', () => {
    const deploy = doc.getElementById('btn-deploy');
    assert.equal(deploy.textContent, 'DEPLOY INTO SECTOR-7');
    game.menu.show({ paused: true });
    assert.equal(deploy.textContent, 'RESUME MISSION');
    assert.equal(doc.getElementById('btn-restart').hidden, false, 'restart offered on pause');
    game.menu.show({ gameOver: true });
    assert.equal(deploy.textContent, 'REDEPLOY INTO SECTOR-7');
    assert.equal(doc.getElementById('btn-restart').hidden, true, 'no restart on game over');
    game.menu.hide();
  });

  it('gives the lock banner click and keyboard handlers', () => {
    const banner = doc.getElementById('lock-banner');
    assert.ok(!doc.getElementById('hud').contains(banner), 'not inside the pointer-events:none HUD');
    assert.ok(banner.getAttribute('tabindex') !== null, 'focusable');
    assert.equal(banner.getAttribute('role'), 'button');
  });

  it('collapses the HUD panels on small screens and short viewports', () => {
    const css = readFileSync(join(ROOT, 'styles/main.css'), 'utf8');
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /@media \(max-height: 620px\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
  });

  it('updates the HUD without rewriting unchanged values', () => {
    doc.getElementById('btn-deploy').click();
    game.tick(1 / 60);
    const hp = doc.getElementById('hp-val');
    let writes = 0;
    const original = Object.getOwnPropertyDescriptor(window.Node.prototype, 'textContent');
    Object.defineProperty(hp, 'textContent', {
      configurable: true,
      get: () => original.get.call(hp),
      set: (value) => {
        writes++;
        original.set.call(hp, value);
      },
    });
    for (let i = 0; i < 10; i++) game.tick(1 / 60);
    assert.equal(writes, 0, 'unchanged health is not re-written every frame');
  });

  it('drops a critical class on the vitals panel when health is low', () => {
    game.player.hp = 20;
    game.tick(1 / 60);
    assert.ok(doc.getElementById('vitals-panel').classList.contains('critical'));
    game.player.hp = 100;
    game.tick(1 / 60);
    assert.ok(!doc.getElementById('vitals-panel').classList.contains('critical'));
  });

  it('shows local time on the bodycam OSD, not a UTC ISO string', () => {
    game.tick(1 / 60);
    const text = doc.getElementById('osd-time').textContent;
    assert.match(text, /^\d{2}:\d{2}:\d{2}$/, `clock format: ${text}`);
  });
});
