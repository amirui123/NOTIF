/**
 * Centralised input handling.
 *
 * Fixes several bugs of the original build:
 *  - mouse wheel flipped weapons on every single scroll tick (accidental swaps)
 *  - keydown auto-repeat toggled crouch / NVG / laser dozens of times
 *  - pressing Escape triggered BOTH the pointerlock handler and a manual pause
 *  - audio never resumed after the tab was backgrounded
 *  - no way to mute, and Y/Z keyboard layouts broke crouch (e.code is fine,
 *    but the old code also listened on Ctrl which conflicted with browser zoom)
 *
 * All listeners are added once and removed via `dispose()`.
 */

export class Input {
  /**
   * @param {HTMLElement} target element that receives the pointer lock
   */
  constructor(target) {
    this.target = target;
    this.keys = Object.create(null);
    this.mouse = Object.create(null);
    this.locked = false;
    this.enabled = false;
    /**
     * Some environments (embedded iframes, sandboxed previews, older Safari)
     * refuse requestPointerLock. In that case we fall back to "free look":
     * mouse movement still rotates the camera because mousemove delivers
     * movementX/Y outside pointer lock too.
     */
    this.fallbackLook = false;
    this.wheelAccumulator = 0;
    this._handlers = [];
    this._listeners = {
      action: null,
      pause: null,
      wheel: null,
      lockChange: null,
    };
  }

  /** Register a one-shot key action. `code` is a KeyboardEvent.code value. */
  onAction(code, fn) {
    this._actions ||= new Map();
    const list = this._actions.get(code) || [];
    list.push(fn);
    this._actions.set(code, list);
  }

  /** Register a wheel-slot-swap callback: fn(direction) where direction is -1|1. */
  onWheel(fn) {
    this._listeners.wheel = fn;
  }

  /** Register pointer-lock change callback: fn(locked). */
  onLockChange(fn) {
    this._listeners.lockChange = fn;
  }

  connect() {
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._handlers.push(() => target.removeEventListener(type, fn, opts));
    };

    add(window, 'keydown', (e) => this.#onKeyDown(e));
    add(window, 'keyup', (e) => this.#onKeyUp(e));
    add(window, 'blur', () => this.reset());
    add(document, 'visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    add(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.reset();
      this._listeners.lockChange?.(this.locked);
    });
    add(window, 'mousemove', (e) => this.#onMouseMove(e));
    add(window, 'mousedown', (e) => this.#onMouseDown(e));
    add(window, 'mouseup', (e) => this.#onMouseUp(e));
    add(window, 'contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    add(window, 'wheel', (e) => this.#onWheel(e), { passive: false });
    return this;
  }

  dispose() {
    for (const off of this._handlers) off();
    this._handlers = [];
  }

  /** Gameplay input only counts while the mission is live and captured. */
  get active() {
    return this.enabled && (this.locked || this.fallbackLook);
  }

  /** Switch to lock-free mouse look (no pointer capture available). */
  enableFallbackLook() {
    if (this.fallbackLook) return;
    this.fallbackLook = true;
    document.body.classList.add('fallback-look');
  }

  isDown(code) {
    return !!this.keys[code];
  }

  /** Clear all transient state (pointer lock lost, tab hidden, pause…). */
  reset() {
    this.keys = Object.create(null);
    this.mouse = Object.create(null);
    this.wheelAccumulator = 0;
  }

  /**
   * Ask for pointer lock. Resolves true when the camera is under control —
   * either through a real lock or the lock-free fallback.
   */
  requestLock() {
    if (document.pointerLockElement === this.target) return Promise.resolve(true);
    if (this.fallbackLook) return Promise.resolve(true);
    if (!this.target.requestPointerLock) {
      this.enableFallbackLook();
      return Promise.resolve(true);
    }

    try {
      const result = this.target.requestPointerLock({ unadjustedMovement: false });
      if (result && typeof result.then === 'function') {
        return result.then(
          () => true,
          () => {
            this.enableFallbackLook();
            return true;
          },
        );
      }
      // Legacy (void-returning) implementations: confirm on the next tick.
      return new Promise((resolve) => {
        setTimeout(() => {
          if (document.pointerLockElement === this.target) resolve(true);
          else {
            this.enableFallbackLook();
            resolve(true);
          }
        }, 80);
      });
    } catch {
      this.enableFallbackLook();
      return Promise.resolve(true);
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  #onKeyDown(e) {
    const code = e.code;
    // Never steal browser shortcuts (Ctrl/Cmd/Alt combos, F5, devtools…).
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const wasDown = !!this.keys[code];
    this.keys[code] = true;
    if (e.repeat || wasDown) return;

    if (this.enabled) {
      const actions = this._actions?.get(code);
      if (actions) {
        for (const fn of actions) fn(e);
      }
      // Prevent page scrolling with space / arrows while playing.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
        e.preventDefault();
      }
    }
  }

  #onKeyUp(e) {
    this.keys[e.code] = false;
  }

  #onMouseMove(e) {
    if (!this.active) return;
    this._listeners.move?.(e.movementX || 0, e.movementY || 0);
  }

  /** Register mouse-look callback: fn(dx, dy). */
  onMove(fn) {
    this._listeners.move = fn;
  }

  /** Register mouse button callback: fn(button, down). */
  onMouseButton(fn) {
    this._listeners.button = fn;
  }

  #onMouseDown(e) {
    if (!this.active) return;
    this.mouse[e.button] = true;
    if (e.button === 1) e.preventDefault(); // middle-click autoscroll
    this._listeners.button?.(e.button, true);
  }

  #onMouseUp(e) {
    this.mouse[e.button] = false;
    if (!this.enabled) return;
    // In fallback mode the game never owns the pointer, so a release outside
    // the window must still stop automatic fire.
    this._listeners.button?.(e.button, false);
  }

  #onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    // Require a deliberate gesture: accumulate until a clear threshold.
    this.wheelAccumulator += e.deltaY;
    const threshold = e.deltaMode === 1 ? 3 : 60;
    if (Math.abs(this.wheelAccumulator) < threshold) return;
    const dir = this.wheelAccumulator > 0 ? 1 : -1;
    this.wheelAccumulator = 0;
    this._listeners.wheel?.(dir);
  }
}
