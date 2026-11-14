/**
 * Input layer contract: pointer-lock fallback, wheel debouncing and
 * auto-repeat suppression. The DOM is faked just enough to drive events.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Input } from '../../src/core/input.js';

function makeTarget() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    requestPointerLock() {
      return Promise.reject(new Error('blocked'));
    },
    classList: { add() {}, toggle() {} },
    dispatch(type, event) {
      for (const fn of listeners[type] || []) fn(event);
    },
  };
}

// Minimal globals the Input module touches.
globalThis.document = {
  pointerLockElement: null,
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  exitPointerLock() {},
  body: { classList: { add() {}, remove() {} } },
};
globalThis.window = {
  addEventListener(type, fn) {
    this._l ||= {};
    (this._l[type] ||= []).push(fn);
  },
  removeEventListener() {},
};

describe('core/input', () => {
  let input;
  let target;

  beforeEach(() => {
    target = makeTarget();
    input = new Input(target);
    input.connect(); // registers the window-level listeners used below
  });

  it('falls back to lock-free look when pointer lock is rejected', async () => {
    assert.equal(input.fallbackLook, false);
    const ok = await input.requestLock();
    assert.equal(ok, true, 'reports usable input even in fallback mode');
    assert.equal(input.fallbackLook, true);
    input.enabled = true;
    assert.equal(input.active, true, 'free-look keeps the game playable');
  });

  it('is inactive until enabled', () => {
    assert.equal(input.active, false);
    input.locked = true;
    assert.equal(input.active, false, 'locked but not enabled');
    input.enabled = true;
    assert.equal(input.active, true);
  });

  it('ignores key auto-repeat for one-shot actions', () => {
    let fired = 0;
    input.onAction('KeyN', () => fired++);
    input.enabled = true;
    const handler = globalThis.window._l.keydown.at(-1);
    handler({
      code: 'KeyN',
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
    });
    handler({
      code: 'KeyN',
      repeat: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
    });
    handler({
      code: 'KeyN',
      repeat: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
    });
    assert.equal(fired, 1, 'action fired exactly once');
  });

  it('does not fire actions for browser-level shortcuts', () => {
    let fired = 0;
    input.onAction('KeyL', () => fired++);
    input.enabled = true;
    const handler = globalThis.window._l.keydown.at(-1);
    handler({
      code: 'KeyL',
      repeat: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      preventDefault() {},
    });
    assert.equal(fired, 0);
  });

  it('requires a deliberate wheel gesture before swapping', () => {
    const swaps = [];
    input.onWheel((dir) => swaps.push(dir));
    input.locked = true;
    input.enabled = true;
    const wheelHandler = globalThis.window._l.wheel.at(-1);
    const event = (deltaY, deltaMode = 0) => ({ deltaY, deltaMode, preventDefault() {} });

    wheelHandler(event(10));
    assert.equal(swaps.length, 0, 'small scroll is ignored');
    wheelHandler(event(70));
    assert.deepEqual(swaps, [1], 'large scroll swaps down once');
    wheelHandler(event(-80));
    assert.deepEqual(swaps, [1, -1], 'reverse scroll swaps up once');
  });

  it('drops movement while inactive', () => {
    const moves = [];
    input.onMove((dx, dy) => moves.push([dx, dy]));
    const moveHandler = globalThis.window._l.mousemove.at(-1);
    moveHandler({ movementX: 5, movementY: 5 });
    assert.equal(moves.length, 0, 'inactive input is ignored');
    input.enabled = true;
    input.locked = true;
    moveHandler({ movementX: 5, movementY: 5 });
    assert.deepEqual(moves, [[5, 5]]);
  });
});
