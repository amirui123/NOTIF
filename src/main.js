/**
 * Boot sequence.
 *
 * Runs AFTER the module graph has loaded (three.js is vendored locally, so a
 * CDN outage can never leave the page black). The loader reports progress and
 * `installGlobalErrorHandlers` guarantees that any failure is shown on screen
 * instead of silently leaving a blank canvas.
 */
import { installGlobalErrorHandlers, showFatal } from './core/errors.js';
import { Game } from './game.js';

installGlobalErrorHandlers();

const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderStatus = document.getElementById('loader-status');

let progress = 0;
function setProgress(value, label) {
  progress = Math.max(progress, value);
  if (loaderBar) loaderBar.style.width = `${progress}%`;
  if (label && loaderStatus) loaderStatus.textContent = label;
}

/** Yield to the browser so the loading bar can actually paint. */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Mouseless devices cannot play a pointer-lock FPS; tell them up front. */
function warnTouchDevices() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (!coarse) return;
  const note = document.querySelector('.fineprint');
  if (note) {
    note.textContent =
      'This is a keyboard + mouse experience. Connect a mouse and use a desktop browser for the full mission.';
    note.style.color = '#f59e0b';
  }
}

async function boot() {
  warnTouchDevices();
  setProgress(8, 'Checking WebGL2 support…');
  await nextFrame();

  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) {
    showFatal(
      'WebGL is disabled',
      'Your browser could not create a WebGL context.\n\n' +
        '• Enable hardware acceleration in the browser settings\n' +
        '• Update your graphics driver\n' +
        '• Try Chrome, Edge or Firefox on a desktop',
    );
    return;
  }

  setProgress(18, 'Compiling tactical environment…');
  await nextFrame();

  let game;
  try {
    // Texture generation happens inside Game with progress reporting so the
    // loading bar keeps moving during the heavy synchronous work.
    game = new Game({ onProgress: (value, label) => setProgress(value, label) });
  } catch (error) {
    showFatal('SECTOR-7 failed to start', error?.stack || String(error));
    return;
  }
  setProgress(88, 'Warming shaders…');
  await nextFrame();

  game.start();
  setProgress(100, 'Ready. Deploy when you are.');

  // Expose for debugging and for the e2e smoke test.
  window.__SECTOR7__ = game;

  setTimeout(() => loader?.classList.add('done'), 420);
  document.getElementById('btn-deploy')?.focus({ preventScroll: true });
}

boot().catch((error) => {
  showFatal('Boot sequence failed', error?.stack || String(error));
});
