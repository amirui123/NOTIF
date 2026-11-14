/**
 * Test environment bootstrap.
 *
 * Prepares jsdom globals + a stubbed Canvas2D so the real game code can run
 * head-less. Called from integration tests only.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function ensureBrowserGlobals(window) {
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.self = window;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.localStorage = window.localStorage;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
}

export function stubCanvas2D(window) {
  const make = (canvas) =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'canvas') return canvas;
          if (prop === 'createImageData' || prop === 'getImageData') {
            return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          }
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop() {} });
          }
          return () => {};
        },
        set() {
          return true;
        },
      },
    );
  window.HTMLCanvasElement.prototype.getContext = function (type) {
    return type === '2d' ? make(this) : null;
  };
}

export const hasJsdom = () => {
  try {
    require('jsdom');
    return true;
  } catch {
    return false;
  }
};
