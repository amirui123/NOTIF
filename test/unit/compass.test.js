/**
 * Compass calibration.
 *
 * The heading shown on the HUD and the label under the reticle must agree. The
 * first implementation built one long text node and scrolled it by an assumed
 * px-per-degree value that did not match the real font metrics, so the letter
 * under the centre mark drifted by up to a whole tick.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();

describe('hud compass', () => {
  let Hud;
  let window;
  let hud;

  beforeEach(async () => {
    const dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    ensureBrowserGlobals(window);
    stubCanvas2D(window);
    ({ Hud } = await import(join(ROOT, 'src/ui/hud.js')));
    hud = new Hud();
  });

  it('places every tick at an exact multiple of 22.5 degrees', () => {
    const strip = window.document.getElementById('compass-strip');
    const ticks = [...strip.querySelectorAll('.c-tick')];
    assert.equal(ticks.length, 32, '16 labels × 2 turns');

    ticks.forEach((tick, index) => {
      const turn = Math.floor(index / 16);
      const slot = index % 16;
      const expected = (turn * 360 + slot * 22.5) * Hud.COMPASS_SCALE;
      assert.equal(Number.parseFloat(tick.style.left), expected, `tick ${index}`);
    });
  });

  it('labels the cardinal points in order', () => {
    const strip = window.document.getElementById('compass-strip');
    const labels = [...strip.querySelectorAll('.c-tick')].map((t) => t.textContent);
    assert.equal(labels[0], 'N');
    assert.equal(labels[4], 'E');
    assert.equal(labels[8], 'S');
    assert.equal(labels[12], 'W');
    assert.deepEqual(labels.slice(0, 4), ['N', 'NNE', 'NE', 'ENE']);
  });

  it('makes every fourth label a major tick', () => {
    const strip = window.document.getElementById('compass-strip');
    const ticks = [...strip.querySelectorAll('.c-tick')];
    assert.equal(ticks.filter((t) => t.classList.contains('major')).length, 8);
    assert.ok(ticks[0].classList.contains('major'));
    assert.ok(!ticks[1].classList.contains('major'));
  });

  it('scrolls the track by exactly COMPASS_SCALE pixels per degree', () => {
    const strip = window.document.getElementById('compass-strip');
    const width = Number.parseFloat(strip.style.width);
    assert.equal(width, 2 * 360 * Hud.COMPASS_SCALE, 'track is two full turns wide');

    hud.update({
      player: {
        hp: 100,
        maxHp: 100,
        armor: 50,
        maxArmor: 50,
        // compassDegrees(yaw) = mod(-yaw°, 360): yaw = -PI/2 is 090° (east).
        yaw: -Math.PI / 2,
        damageAlpha: 0,
        damageAngle: 0,
        sprintAmt: 0,
        damageVignette: 0,
        adsAmt: 0,
      },
      weapon: {
        ammoState: { id: 'mk18', mag: 30, reserve: 150, name: 'MK18', modeText: 'AUTO', isLow: false },
        lightOn: false,
        laserOn: false,
      },
      wave: 'WAVE 01',
      remaining: 0,
      score: 0,
      frags: 2,
      nvgOn: false,
      spread: 0,
      adsFade: 1,
    });

    const tx = Number.parseFloat(strip.style.transform.match(/-?[\d.]+px/)[0]);
    assert.equal(tx, -90 * Hud.COMPASS_SCALE, 'scrolled 90° worth of pixels');
  });
});
