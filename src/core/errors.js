/**
 * Fatal error surface.
 *
 * The original build only listened for `error` and appended raw text into a
 * div that starts hidden by CSS — meaning genuine startup failures (missing
 * CDN, WebGL unavailable) left a black screen with no explanation. This module
 * makes every uncaught failure visible and actionable, including rejected
 * promise imports and failed dynamic imports.
 */

const shown = new Set();

/** @returns {HTMLElement|null} */
function box() {
  return document.getElementById('fatal-error');
}

export function showFatal(title, detail = '') {
  const el = box();
  if (!el) return;
  const key = `${title}|${detail}`;
  if (shown.has(key)) return;
  shown.add(key);

  el.style.display = 'block';
  el.textContent = '';

  const heading = document.createElement('div');
  heading.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:12px;color:#f87171';
  heading.textContent = `■ ${title}`;

  const body = document.createElement('div');
  body.style.cssText = 'white-space:pre-wrap;color:#fecaca;max-width:900px';
  body.textContent = detail;

  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:20px;color:#94a3b8;font-size:12px;line-height:1.7';
  hint.textContent =
    'Try a hard refresh (Ctrl/Cmd + Shift + R). SECTOR-7 needs WebGL2 and JavaScript modules, ' +
    'and hardware acceleration must be enabled in the browser.';

  const reload = document.createElement('button');
  reload.textContent = 'RELOAD SECTOR-7';
  reload.style.cssText =
    'margin-top:16px;padding:10px 22px;font:700 13px/1 Consolas,monospace;letter-spacing:1px;' +
    'background:#f59e0b;color:#090d12;border:0;cursor:pointer';
  reload.addEventListener('click', () => window.location.reload());

  el.append(heading, body, hint, reload);
  document.getElementById('loader')?.classList.add('done');
}

/** Install global listeners once, before anything else runs. */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    const err = event.error;
    const where = event.filename ? `\n@ ${event.filename}:${event.lineno}:${event.colno}` : '';
    showFatal('Runtime Error', `${err?.stack || event.message}${where}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    showFatal('Unhandled Promise Rejection', reason?.stack || String(reason));
  });
}
