/**
 * Menu / settings UI controller.
 *
 * Fixes vs. the original:
 *  - operator cards were `<button>` elements whose inner text was set with
 *    innerHTML from a template string; the name/description came from config
 *    (safe), but the card is now built with textContent so it can never be an
 *    injection point
 *  - changing operator while paused updated the selection but not the HUD
 *    weapon panel until the next shot
 *  - the summary box stayed visible after "redeploy"
 *  - the restart button was revealed with an inline style instead of the
 *    hidden attribute
 */
import { OPERATORS, WEAPONS, DEFAULT_SETTINGS } from '../config.js';
import { el } from '../core/dom.js';

export class Menu {
  /**
   * @param {object} opts
   * @param {DEFAULT_SETTINGS} opts.settings
   * @param {(settings:object) => void} opts.onChange live settings change
   * @param {() => void} opts.onDeploy deploy / resume
   * @param {() => void} opts.onRestart restart mission
   */
  constructor({ settings, onChange, onDeploy, onRestart }) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.onChange = onChange;
    this.onDeploy = onDeploy;
    this.onRestart = onRestart;

    this.overlay = document.getElementById('menu-overlay');
    this.list = document.getElementById('op-list');
    this.summaryBox = document.getElementById('summary-box');
    this.btnDeploy = document.getElementById('btn-deploy');
    this.btnRestart = document.getElementById('btn-restart');

    this.buildOperators();
    this.bind();
    this.applySettingsToInputs();
  }

  get selectedOperator() {
    return OPERATORS.find((op) => op.id === this.settings.operator) ?? OPERATORS[0];
  }

  buildOperators() {
    this.list.textContent = '';
    for (const op of OPERATORS) {
      const weapon = WEAPONS[op.primary];
      const card = el('button', 'op-card');
      card.type = 'button';
      card.dataset.operator = op.id;
      card.setAttribute('aria-pressed', String(op.id === this.settings.operator));

      card.append(
        el('div', 'op-tag', op.tag),
        el('div', 'op-name', op.name),
        el('div', 'op-wpn', weapon.name),
        el('div', 'op-desc', op.desc),
        el('div', 'op-stats', `HP:${op.hp} | ARM:${op.armor} | DMG:${weapon.damage} | MAG:${weapon.magSize}`),
      );

      if (op.id === this.settings.operator) card.classList.add('selected');
      card.addEventListener('click', () => this.selectOperator(op.id));
      this.list.append(card);
    }
  }

  selectOperator(id) {
    if (this.settings.operator === id) return;
    this.settings.operator = id;
    for (const card of this.list.querySelectorAll('.op-card')) {
      const selected = card.dataset.operator === id;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
    this.onChange(this.settings);
  }

  applySettingsToInputs() {
    const weather = document.getElementById('opt-weather');
    const quality = document.getElementById('opt-quality');
    const sens = document.getElementById('opt-sens');
    const bodycam = document.getElementById('opt-bodycam');
    const audio = document.getElementById('opt-audio');

    if (weather) weather.value = this.settings.weather;
    if (quality) quality.value = this.settings.quality;
    if (sens) {
      sens.value = String(this.settings.sens);
      const label = document.getElementById('sens-val');
      if (label) label.textContent = `${Number(this.settings.sens).toFixed(2)}x`;
    }
    if (bodycam) bodycam.checked = this.settings.bodycam;
    if (audio) audio.checked = this.settings.audio;
  }

  bind() {
    document.getElementById('opt-weather')?.addEventListener('change', (e) => {
      this.settings.weather = e.target.value;
      this.onChange(this.settings);
    });
    document.getElementById('opt-quality')?.addEventListener('change', (e) => {
      this.settings.quality = e.target.value;
      this.onChange(this.settings);
    });
    document.getElementById('opt-sens')?.addEventListener('input', (e) => {
      this.settings.sens = Number.parseFloat(e.target.value);
      const label = document.getElementById('sens-val');
      if (label) label.textContent = `${this.settings.sens.toFixed(2)}x`;
      this.onChange(this.settings);
    });
    document.getElementById('opt-bodycam')?.addEventListener('change', (e) => {
      this.settings.bodycam = e.target.checked;
      this.onChange(this.settings);
    });
    document.getElementById('opt-audio')?.addEventListener('change', (e) => {
      this.settings.audio = e.target.checked;
      this.onChange(this.settings);
    });

    this.btnDeploy?.addEventListener('click', () => this.onDeploy());
    this.btnRestart?.addEventListener('click', () => this.onRestart());
  }

  show({ paused = false, gameOver = false } = {}) {
    this.overlay.classList.remove('hidden');
    this.summaryBox.classList.toggle('show', gameOver);
    this.btnDeploy.textContent = gameOver
      ? 'REDEPLOY INTO SECTOR-7'
      : paused
        ? 'RESUME MISSION'
        : 'DEPLOY INTO SECTOR-7';
    this.btnRestart.hidden = !paused || gameOver;
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.summaryBox.classList.remove('show');
    this.btnRestart.hidden = true;
  }

  showGameOver(stats) {
    this.summaryBox.classList.add('show');
    const target = document.getElementById('sum-stats');
    if (!target) return;
    target.textContent = '';
    const rows = [
      ['WAVE REACHED', stats.wave],
      ['ELIMINATIONS', stats.kills],
      ['HEADSHOTS', stats.headshots],
      ['ACCURACY', `${stats.accuracy}%`],
      ['SCORE', stats.score],
    ];
    for (const [label, value] of rows) {
      const span = el('span', '', `${label}: `);
      const strong = el('b', '', String(value));
      span.append(strong);
      target.append(span);
    }
    this.btnDeploy.textContent = 'REDEPLOY INTO SECTOR-7';
    this.btnRestart.hidden = true;
  }

  focusDeploy() {
    this.btnDeploy?.focus();
  }
}
