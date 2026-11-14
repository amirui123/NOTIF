/**
 * HUD renderer.
 *
 * Writes only the values that actually changed (the original wrote ~15 DOM
 * properties per frame, which forces layout on every tick and is a measurable
 * FPS cost on integrated GPUs).
 */
import { setText } from '../core/dom.js';
import { clamp, formatBearing } from '../core/math.js';

export class Hud {
  constructor() {
    this.el = {
      hpVal: document.getElementById('hp-val'),
      hpFill: document.getElementById('hp-fill'),
      armorVal: document.getElementById('armor-val'),
      armorFill: document.getElementById('armor-fill'),
      wpnName: document.getElementById('wpn-name'),
      wpnMode: document.getElementById('wpn-mode'),
      ammoMag: document.getElementById('ammo-mag'),
      ammoRes: document.getElementById('ammo-res'),
      pillFrag: document.getElementById('pill-frag'),
      pillLight: document.getElementById('pill-light'),
      pillLaser: document.getElementById('pill-laser'),
      pillNvg: document.getElementById('pill-nvg'),
      waveLabel: document.getElementById('wave-label'),
      enemyCount: document.getElementById('enemy-count'),
      killfeed: document.getElementById('killfeed'),
      crosshair: document.getElementById('crosshair'),
      chTop: document.getElementById('ch-top'),
      chBot: document.getElementById('ch-bot'),
      chLeft: document.getElementById('ch-left'),
      chRight: document.getElementById('ch-right'),
      hitmarker: document.getElementById('hitmarker'),
      bearing: document.getElementById('bearing-val'),
      compassStrip: document.getElementById('compass-strip'),
      dmgDir: document.getElementById('dmg-dir'),
      prompt: document.getElementById('action-prompt'),
      bannerMain: document.getElementById('banner-main'),
      bannerSub: document.getElementById('banner-sub'),
      osdBpm: document.getElementById('osd-bpm'),
      osdTime: document.getElementById('osd-time'),
      osdFps: document.getElementById('osd-fps'),
      osdUnit: document.getElementById('osd-unit'),
      bodycam: document.getElementById('bodycam-osd'),
      vitals: document.getElementById('vitals-panel'),
      hud: document.getElementById('hud'),
    };

    this._cache = Object.create(null);
    this.rendererTag = 'WEBGL2';
    this._hitmarkerTimer = 0;
    this._promptTimer = 0;
    this._bannerTimer = 0;
    this._lastClock = '';
    this.buildCompass();
  }

  /**
   * Build the compass track as evenly spaced, absolutely positioned labels.
   *
   * It used to be a single text node whose spacing only *approximately* matched
   * the px-per-degree offset used to scroll it, so the letter under the centre
   * mark drifted away from the real heading (up to ~7% error, i.e. a whole
   * 22.5° tick over a turn). Laying the labels out at exact 15° intervals makes
   * the correspondence exact by construction.
   */
  buildCompass() {
    const strip = this.el.compassStrip;
    if (!strip) return;
    strip.textContent = '';
    const marks = [
      'N',
      'NNE',
      'NE',
      'ENE',
      'E',
      'ESE',
      'SE',
      'SSE',
      'S',
      'SSW',
      'SW',
      'WSW',
      'W',
      'WNW',
      'NW',
      'NNW',
    ];
    // Two copies so the -180..+180 window always has content on both sides.
    for (let turn = 0; turn < 2; turn++) {
      for (let i = 0; i < marks.length; i++) {
        const tick = document.createElement('span');
        tick.className = i % 4 === 0 ? 'c-tick major' : 'c-tick';
        tick.textContent = marks[i];
        // 360° / 16 marks = 22.5° per mark.
        tick.style.left = `${(turn * 360 + i * 22.5) * Hud.COMPASS_SCALE}px`;
        if (i === 0 && turn === 0) tick.textContent = marks[0];
        strip.append(tick);
      }
    }
    strip.style.width = `${2 * 360 * Hud.COMPASS_SCALE}px`;
  }

  /** Pixels per degree. The tick positions use the same constant. */
  static COMPASS_SCALE = 2;

  showPlaying() {
    this.el.hud.classList.add('active');
  }

  hidePlaying() {
    this.el.hud.classList.remove('active');
  }

  #write(key, value, apply) {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    apply(value);
  }

  /** @param {object} state snapshot assembled by the game */
  update(state) {
    const { player, weapon, wave, remaining, score, frags, nvgOn, spread } = state;

    this.#write('hp', Math.round(player.hp), (v) => {
      setText('hp-val', v);
      if (this.el.hpFill) this.el.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
      if (this.el.vitals) this.el.vitals.classList.toggle('critical', v / player.maxHp <= 0.3);
    });
    this.#write('armor', Math.round(player.armor), (v) => {
      setText('armor-val', v);
      if (this.el.armorFill) {
        this.el.armorFill.style.width = `${player.maxArmor > 0 ? (player.armor / player.maxArmor) * 100 : 0}%`;
      }
    });

    const ammo = weapon.ammoState;
    const ammoKey = `${ammo.id}|${ammo.mag}|${ammo.reserve}`;
    this.#write('ammo', ammoKey, () => {
      setText('wpn-name', ammo.name);
      setText('wpn-mode', ammo.modeText);
      if (this.el.ammoMag) {
        this.el.ammoMag.textContent = String(ammo.mag);
        this.el.ammoMag.classList.toggle('low', ammo.isLow);
      }
      setText('ammo-res', `/ ${ammo.reserve}`);
    });

    this.#write('gadgets', `${frags}|${weapon.lightOn}|${weapon.laserOn}|${nvgOn}`, () => {
      setText('pill-frag', `FRAG: ${frags}`);
      this.el.pillLight?.classList.toggle('on', weapon.lightOn);
      this.el.pillLaser?.classList.toggle('on', weapon.laserOn);
      this.el.pillNvg?.classList.toggle('on', nvgOn);
      this.el.bodycam?.classList.toggle('nvg-active', nvgOn);
    });

    this.#write('wave', wave, () => setText('wave-label', wave));
    this.#write('remaining', `${remaining}|${score}`, () =>
      setText('enemy-count', `HOSTILES REMAINING: ${remaining} | SCORE: ${score}`),
    );

    // Crosshair bloom + ADS fade.
    this.#write('crosshair', `${Math.round(state.adsFade * 100)}|${Math.round(spread * 1000)}`, () => {
      if (this.el.crosshair) this.el.crosshair.style.opacity = String(state.adsFade);
      // Max gap is 14 px: the crosshair box is 64 px with 8 px ticks, so a
      // larger value would push the ticks outside the container and clip them.
      const gap = clamp(Math.round(14 - spread * 280), 2, 14);
      if (this.el.chTop) this.el.chTop.style.top = `${gap}px`;
      if (this.el.chBot) this.el.chBot.style.bottom = `${gap}px`;
      if (this.el.chLeft) this.el.chLeft.style.left = `${gap}px`;
      if (this.el.chRight) this.el.chRight.style.right = `${gap}px`;
    });

    // Compass. `formatBearing` returns '000° N'-style text; the numeric part is
    // what both the label and the strip need.
    const bearingText = formatBearing(player.yaw);
    this.#write('bearing', bearingText, (v) => {
      setText('bearing-val', v);
      const deg = Number.parseFloat(v) || 0;
      if (this.el.compassStrip) {
        const width = this.el.compassStrip.parentElement?.clientWidth ?? 300;
        // 0° must land under the centre mark: shift by half the window, then
        // scroll by the bearing at exactly COMPASS_SCALE pixels per degree.
        this.el.compassStrip.style.transform = `translateX(${width / 2 - deg * Hud.COMPASS_SCALE}px)`;
      }
    });

    // Directional damage arc.
    this.#write('damage', `${player.damageAlpha.toFixed(2)}|${Math.round(player.damageAngle)}`, () => {
      if (!this.el.dmgDir) return;
      this.el.dmgDir.style.opacity = player.damageAlpha.toFixed(2);
      this.el.dmgDir.style.transform = `rotate(${player.damageAngle}deg)`;
    });

    // Bodycam telemetry.
    const bpm = Math.round(
      74 + (1 - player.hp / player.maxHp) * 55 + player.sprintAmt * 25 + player.damageVignette * 20,
    );
    this.#write('bpm', bpm, (v) => setText('osd-bpm', `BPM ${v}`));

    const clock = new Date().toLocaleTimeString('en-GB', { hour12: false });
    if (clock !== this._lastClock) {
      this._lastClock = clock;
      // The bodycam OSD should show the operator's local clock, not UTC.
      setText('osd-time', clock);
    }
  }

  setFps(fps) {
    // No battery API access from a sandboxed page on most browsers, so the OSD
    // reports the renderer instead of inventing a battery level.
    this.#write('fps', fps, (v) => setText('osd-fps', `${v} FPS | ${this.rendererTag}`));
  }

  setRenderer(tag) {
    this.rendererTag = tag;
  }

  setUnit(tag) {
    setText('osd-unit', tag);
  }

  addKillfeed(text, isHead) {
    const div = document.createElement('div');
    div.className = `kf-item${isHead ? ' hs' : ''}`;
    div.textContent = text;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastElementChild.remove();
    setTimeout(() => div.remove(), 4500);
  }

  hitmarker(isHead) {
    if (!this.el.hitmarker) return;
    this.el.hitmarker.className = `show${isHead ? ' head' : ''}`;
    clearTimeout(this._hitmarkerTimer);
    this._hitmarkerTimer = setTimeout(() => {
      if (this.el.hitmarker) this.el.hitmarker.className = '';
    }, 130);
  }

  prompt(text) {
    if (!this.el.prompt) return;
    this.el.prompt.textContent = text;
    this.el.prompt.style.opacity = '1';
    clearTimeout(this._promptTimer);
    this._promptTimer = setTimeout(() => {
      if (this.el.prompt) this.el.prompt.style.opacity = '0';
    }, 1500);
  }

  banner(main, sub, duration = 2800) {
    if (!this.el.bannerMain || !this.el.bannerSub) return;
    this.el.bannerMain.textContent = main;
    this.el.bannerSub.textContent = sub;
    this.el.bannerMain.style.opacity = '1';
    this.el.bannerSub.style.opacity = '1';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      if (!this.el.bannerMain) return;
      this.el.bannerMain.style.opacity = '0';
      this.el.bannerSub.style.opacity = '0';
    }, duration);
  }

  clearKillfeed() {
    if (this.el.killfeed) this.el.killfeed.textContent = '';
  }
}
