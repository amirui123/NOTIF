/**
 * Cached DOM lookups + small UI helpers.
 * Every id below exists in index.html — missing ids throw a clear error at
 * boot instead of silently producing `null.textContent = …` crashes later.
 */

const cache = new Map();

/** @param {string} id @returns {HTMLElement} */
export function $(id) {
  let node = cache.get(id);
  if (!node) {
    node = document.getElementById(id);
    if (!node) throw new Error(`Missing required DOM element #${id}`);
    cache.set(id, node);
  }
  return node;
}

/** Safely set text content (no-op when the element is absent). */
export function setText(id, text) {
  const node = document.getElementById(id);
  if (node && node.textContent !== String(text)) node.textContent = String(text);
}

/** Toggle a class on an element. */
export function toggleClass(id, className, force) {
  document.getElementById(id)?.classList.toggle(className, force);
}

/** Show / hide with the hidden attribute. */
export function setHidden(id, hidden) {
  const node = document.getElementById(id);
  if (node) node.hidden = hidden;
}

/** Create an element with a class and optional text. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** True when the user asked the OS for less animation. */
export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
