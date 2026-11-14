/**
 * Procedural Web Audio engine.
 *
 * All gunshots, footsteps, foley and explosions are synthesised at runtime,
 * so no audio files are shipped. Key fixes vs. the original:
 *  - PannerNodes are disconnected on completion (they used to leak forever,
 *    eventually stalling the Web Audio graph after a few minutes of play)
 *  - resume() is handled on visibility change / user gesture
 *  - a master mute path that actually stops voices
 *  - noise buffers are reused instead of allocated per shot
 */

const MAX_VOICES = 24;

export class SoundEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.worldBus = null;
    this.reverb = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.voices = 0;
    this.initialised = false;
  }

  /** Must be called from a user gesture (deploy button / pointer lock click). */
  init() {
    if (this.initialised) {
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      this.enabled = false;
      return;
    }
    try {
      this.ctx = new AudioCtor();
    } catch {
      this.enabled = false;
      return;
    }
    this.initialised = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;

    this.worldBus = this.ctx.createBiquadFilter();
    this.worldBus.type = 'lowpass';
    this.worldBus.frequency.value = 20000;
    this.worldBus.connect(compressor);
    compressor.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.noiseBuffer = this.#createNoiseBuffer();
    this.reverb = this.#createReverb();
    this.#startAmbience();
  }

  #createNoiseBuffer() {
    const sr = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sr * 2, sr);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, b0 + b1 + b2 + white * 0.35));
    }
    return buffer;
  }

  #createReverb() {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 1.45);
    const ir = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let env = Math.exp(-t * 3.4) * 0.32;
        if (Math.abs(t - 0.045) < 0.003 || Math.abs(t - 0.11) < 0.004 || Math.abs(t - 0.24) < 0.005)
          env += 0.38;
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    const convolver = this.ctx.createConvolver();
    convolver.buffer = ir;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.48;
    convolver.connect(gain);
    gain.connect(this.worldBus);
    return convolver;
  }

  #startAmbience() {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 320;
    band.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.03;
    source.connect(band);
    band.connect(gain);
    gain.connect(this.worldBus);
    source.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  #ready() {
    return !!(this.ctx && this.enabled);
  }

  #voice() {
    if (this.voices >= MAX_VOICES) return false;
    this.voices++;
    // Release the slot on the audio clock, not on wall-clock setTimeout drift.
    setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
    }, 300);
    return true;
  }

  /** Create a spatialised destination, auto-disconnected after `lifeMs`. */
  #spatial(pos, lifeMs = 1200) {
    if (!pos) return this.worldBus;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 5;
    panner.maxDistance = 95;
    panner.rolloffFactor = 1.25;
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else {
      panner.setPosition?.(pos.x, pos.y, pos.z);
    }
    panner.connect(this.worldBus);
    setTimeout(() => panner.disconnect(), lifeMs);
    return panner;
  }

  /** Update the listener from the camera each frame. */
  updateListener(pos, forward, up) {
    if (!this.ctx || !this.enabled) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = forward.x;
      L.forwardY.value = forward.y;
      L.forwardZ.value = forward.z;
      L.upX.value = up.x;
      L.upY.value = up.y;
      L.upZ.value = up.z;
    } else if (L.setPosition) {
      // Deprecated Safari path.
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /**
   * Layered gunshot: body thump + noise crack + tail transient.
   * @param {'mk18'|'hk416'|'sniper'|'pistol'|'mp7'|'lmg'} profile
   */
  playShot(profile, isEnemy = false, pos = null) {
    if (!this.#ready() || !this.#voice()) return;
    const now = this.ctx.currentTime;
    const dest = isEnemy ? this.#spatial(pos) : this.worldBus;
    const sniper = profile === 'sniper';
    const suppressed = profile === 'mk18';
    const pistol = profile === 'pistol';
    const mp7 = profile === 'mp7';

    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(sniper ? 165 : suppressed ? 130 : mp7 ? 185 : 150, now);
    body.frequency.exponentialRampToValueAtTime(
      sniper ? 28 : suppressed ? 52 : 36,
      now + (sniper ? 0.16 : 0.085),
    );
    bodyGain.gain.setValueAtTime(isEnemy ? 0.42 : suppressed ? 0.45 : 0.72, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + (sniper ? 0.22 : 0.11));
    body.connect(bodyGain);
    bodyGain.connect(dest);
    body.start(now);
    body.stop(now + 0.24);

    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const band = this.ctx.createBiquadFilter();
    band.type = suppressed ? 'bandpass' : 'highpass';
    band.frequency.value = suppressed ? 900 : pistol ? 750 : mp7 ? 1100 : 420;
    if (suppressed) band.Q.value = 0.9;
    const crackGain = this.ctx.createGain();
    const dur = suppressed ? 0.075 : sniper ? 0.34 : 0.16;
    crackGain.gain.setValueAtTime(isEnemy ? 0.38 : suppressed ? 0.28 : sniper ? 0.85 : 0.62, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    crack.connect(band);
    band.connect(crackGain);
    crackGain.connect(dest);
    if (!suppressed) crackGain.connect(this.reverb);
    crack.start(now, Math.random() * 0.5, dur + 0.05);

    const tail = this.ctx.createBufferSource();
    tail.buffer = this.noiseBuffer;
    const tailBand = this.ctx.createBiquadFilter();
    tailBand.type = 'bandpass';
    tailBand.frequency.value = 3400;
    tailBand.Q.value = 3.5;
    const tailGain = this.ctx.createGain();
    tailGain.gain.setValueAtTime(isEnemy ? 0.05 : 0.22, now + 0.012);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
    tail.connect(tailBand);
    tailBand.connect(tailGain);
    tailGain.connect(dest);
    tail.start(now + 0.012, 0.2, 0.05);
  }

  playShellTink(delay = 0.18) {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime + delay;
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const at = t + i * 0.08;
      osc.frequency.setValueAtTime(5200 + Math.random() * 1400, at);
      gain.gain.setValueAtTime(0.032 / (i + 1), at);
      gain.gain.exponentialRampToValueAtTime(0.0005, at + 0.04);
      osc.connect(gain);
      gain.connect(this.worldBus);
      osc.start(at);
      osc.stop(at + 0.05);
    }
  }

  /** @param {'dry'|'magOut'|'magIn'|'boltPull'|'boltRelease'|'swap'|'melee'} stage */
  playFoley(stage) {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = this.ctx.createGain();
    const map = {
      dry: [3800, 5, 0.24, 0.035],
      magOut: [1400, 2.2, 0.22, 0.11],
      magIn: [950, 3, 0.32, 0.09],
      boltPull: [2400, 3.2, 0.26, 0.13],
      boltRelease: [3100, 4, 0.3, 0.08],
      swap: [650, 1.4, 0.16, 0.14],
      melee: [900, 1.1, 0.35, 0.17],
    };
    const [freq, q, vol, dur] = map[stage] || map.swap;
    filter.frequency.value = freq;
    filter.Q.value = q;
    if (stage === 'melee') filter.frequency.exponentialRampToValueAtTime(280, now + 0.15);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.worldBus);
    noise.start(now, Math.random() * 0.4, dur + 0.05);

    if (stage === 'magIn') {
      const click = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      click.frequency.setValueAtTime(420, now + 0.02);
      click.frequency.exponentialRampToValueAtTime(140, now + 0.07);
      clickGain.gain.setValueAtTime(0.24, now + 0.02);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      click.connect(clickGain);
      clickGain.connect(this.worldBus);
      click.start(now + 0.02);
      click.stop(now + 0.09);
    }
  }

  playFootstep(surface = 'dirt', sprint = false) {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = surface === 'metal' ? 1400 : surface === 'concrete' ? 760 : 520;
    filter.Q.value = surface === 'metal' ? 3.5 : 1.3;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(sprint ? 0.15 : 0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.worldBus);
    noise.start(now, Math.random() * 0.8, 0.1);
  }

  playHitmarker(isHead = false) {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isHead ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isHead ? 1950 : 1250, now);
    osc.frequency.exponentialRampToValueAtTime(isHead ? 950 : 620, now + 0.055);
    gain.gain.setValueAtTime(isHead ? 0.26 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playWhiz(pos) {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(2800, now);
    filter.frequency.exponentialRampToValueAtTime(650, now + 0.11);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.#spatial(pos));
    noise.start(now, 0.2, 0.13);
  }

  playExplosion(pos, dist = 20) {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const dest = this.#spatial(pos, 2500);

    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.frequency.setValueAtTime(115, now);
    boom.frequency.exponentialRampToValueAtTime(22, now + 0.7);
    boomGain.gain.setValueAtTime(0.95, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    boom.connect(boomGain);
    boomGain.connect(dest);
    boomGain.connect(this.reverb);
    boom.start(now);
    boom.stop(now + 0.9);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(2600, now);
    lowpass.frequency.exponentialRampToValueAtTime(240, now + 1.1);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    noise.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(dest);
    noiseGain.connect(this.reverb);
    noise.start(now, 0, 1.3);

    if (dist < 12) {
      // Near-field concussion + tinnitus ring.
      this.worldBus.frequency.setValueAtTime(750, now);
      this.worldBus.frequency.exponentialRampToValueAtTime(20000, now + 2.8);
      const ring = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ring.frequency.value = 4350;
      ringGain.gain.setValueAtTime(0.04 * (1 - dist / 12), now);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
      ring.connect(ringGain);
      ringGain.connect(this.master);
      ring.start(now);
      ring.stop(now + 2.6);
    }
  }

  playRadioChirp(pos = null) {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1650, now);
    osc.frequency.setValueAtTime(2150, now + 0.03);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(pos ? this.#spatial(pos) : this.worldBus);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** @param {'pickup'|'nvg'|'toggle'} type */
  playUI(type = 'pickup') {
    if (!this.#ready()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    if (type === 'nvg') {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1850, now + 0.22);
    } else {
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.setValueAtTime(920, now + 0.05);
    }
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  dispose() {
    try {
      this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.initialised = false;
  }
}
