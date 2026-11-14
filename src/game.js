/**
 * SECTOR-7 // BODYCAM OPS — game orchestrator.
 *
 * Owns the renderer, scene, post-processing chain, wave director and the
 * frame loop, and wires the systems together. Everything is dependency
 * injected, which keeps modules testable and replaces the original 2,639-line
 * single file with focused units.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { OPERATORS, WEAPONS, DEFAULT_SETTINGS, STORAGE_KEY, MAX_LIVE_HOSTILES } from './config.js';
import { BodycamShader, createSkyDome } from './engine/shaders.js';
import { TextureFactory } from './engine/textures.js';
import { SoundEngine } from './engine/audio.js';
import { Level } from './world/level.js';
import { EnemyManager } from './world/enemy.js';
import { FXManager } from './world/fx.js';
import { WeaponController } from './player/weapon.js';
import { Player } from './player/player.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Input } from './core/input.js';
import { storage } from './core/storage.js';
import { clamp, damp } from './core/math.js';
import { showFatal } from './core/errors.js';

const WAVE_TITLES = ['RECON BREACH', 'COMPOUND ASSAULT', 'ALPINE OVERWATCH', 'RONIN FLANK', 'ARMORED PUSH'];

const QUALITY_PRESETS = {
  ultra: { pixelRatio: 2, shadow: 2048, bloom: true, smoke: true },
  high: { pixelRatio: 1.5, shadow: 1024, bloom: true, smoke: true },
  perf: { pixelRatio: 1, shadow: 512, bloom: false, smoke: false },
};

export class Game {
  // ------------------------------------------------------------------ setup

  /** @param {{onProgress?: (percent:number, label:string) => void}} [options] */
  constructor({ onProgress } = {}) {
    this.settings = storage.read(STORAGE_KEY, { ...DEFAULT_SETTINGS });
    const report = onProgress ?? (() => {});

    this.renderer = this.#createRenderer();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x6f7f8c, 0.011);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.035, 450);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frameId = 0;

    this.state = {
      playing: false,
      paused: true,
      gameOver: false,
      started: false,
    };

    this.tex = new TextureFactory(this.renderer.capabilities.getMaxAnisotropy());
    report(30, 'Generating procedural PBR textures…');
    this.tex.initAll();
    report(55, 'Building SECTOR-7 geometry…');
    this.sound = new SoundEngine();
    this.sky = createSkyDome();
    this.scene.add(this.sky);

    this.#buildLighting();
    this.level = new Level(this.scene, this.tex);
    this.level.build();
    this.fx = new FXManager(this.scene, this.level, this.sound);
    this.enemies = new EnemyManager(this.scene, this.level, this.tex, this.sound, this.fx);
    this.player = new Player(this.level, this.sound);
    this.hud = new Hud();
    this.hud.setRenderer('WEBGL2');

    this.weapon = new WeaponController({
      camera: this.camera,
      tex: this.tex,
      sound: this.sound,
      fx: this.fx,
      enemies: this.enemies,
      level: this.level,
    });
    this.weapon.onExplosion = (pos, radius, damage) => this.#handleExplosion(pos, radius, damage);
    this.fx.setExplosionHandler((pos, radius, damage) => this.#handleExplosion(pos, radius, damage));

    this.input = new Input(this.renderer.domElement);
    this.menu = new Menu({
      settings: this.settings,
      onChange: (next) => this.#applySettings(next, true),
      onDeploy: () => this.deploy(),
      onRestart: () => this.startMission(),
    });

    this.wave = 1;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveClearDelay = 0;
    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.frags = 2;
    this.nvgOn = false;
    this.bodycamOn = this.settings.bodycam;
    this.audioOn = this.settings.audio;
    this.sens = this.settings.sens;

    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.lastAmmoKey = '';
    this.frozen = false;

    this.#createComposer();
    this.bindInput();
    this.bindWindowEvents();

    this.#applySettings(this.settings, false);
    report(80, 'Warming tactical systems…');
    this.menu.show({ paused: false });
    this.hud.setUnit(OPERATORS[0].tag);
  }

  #createRenderer() {
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('tabindex', '0');
    document.body.prepend(canvas);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (error) {
      showFatal(
        'WebGL is unavailable',
        `${error?.message || error}\n\nSECTOR-7 needs hardware-accelerated WebGL2. ` +
          'Enable "Use hardware acceleration when available" in your browser settings.',
      );
      throw error;
    }

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    return renderer;
  }

  #buildLighting() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader?.();
    const envScene = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(0xa9bccb, 0x36332c, 1.05);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sun.position.set(48, 56, -42);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -56;
    this.sun.shadow.camera.right = 56;
    this.sun.shadow.camera.top = 56;
    this.sun.shadow.camera.bottom = -56;
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 165;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);

    this.muzzleFlashLight = new THREE.PointLight(0xffb84d, 0, 14);
    this.scene.add(this.muzzleFlashLight);

    // Fill light for the viewmodel. The gun is metalness 0.85 with no light of
    // its own, so in the night preset (sun 0.55, dark blue hemisphere) it went
    // pitch black — the player could not see the weapon at all. A soft key light
    // parented to the camera keeps the silhouette readable in every preset
    // without touching the world lighting.
    this.viewLight = new THREE.PointLight(0xffe8c8, 0, 3.2, 1.6);
    this.viewLight.position.set(0.25, 0.4, -0.2);
    this.camera.add(this.viewLight);
  }

  #createComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.34,
      0.42,
      0.9,
    );
    this.bodycamPass = new ShaderPass(BodycamShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.bodycamPass);
    this.composer.addPass(this.outputPass);
    this.#syncViewport();
  }

  #syncViewport() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = this.renderer.getPixelRatio();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bodycamPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  }

  // ------------------------------------------------------------- wiring

  bindWindowEvents() {
    this._onResize = () => {
      // Coalesce bursts of resize events (window drag, zoom) into one update.
      if (this._resizeRaf) return;
      this._resizeRaf = requestAnimationFrame(() => {
        this._resizeRaf = 0;
        // devicePixelRatio changes when the window moves between monitors or the
        // OS scale changes; without re-applying quality the canvas stays soft.
        if (this.quality) this.#applyQuality(this.quality);
        else this.#syncViewport();
      });
    };
    window.addEventListener('resize', this._onResize);

    this._onVisibility = () => {
      if (document.hidden && this.state.playing && !this.state.paused) this.pause();
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    document.addEventListener('pointerlockerror', () => {
      this.hud.prompt('MOUSE CAPTURE WAS BLOCKED — CLICK THE SCREEN AND TRY AGAIN');
    });
  }

  #setLockBanner(visible) {
    const banner = document.getElementById('lock-banner');
    if (!banner) return;
    banner.classList.toggle('show', visible);
    if (visible) banner.focus({ preventScroll: true });
  }

  /**
   * The "click to capture" overlay is the only way back into the mission when
   * the browser drops pointer lock, so it needs a real click/keyboard handler.
   */
  #bindLockBanner() {
    const banner = document.getElementById('lock-banner');
    if (!banner) return;
    const engage = () => {
      if (!this.state.playing || this.state.gameOver) return;
      this.#setLockBanner(false);
      this.sound.resume();
      this.input.enabled = true;
      this.requestLock();
    };
    banner.addEventListener('click', engage);
    banner.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        engage();
      }
    });
  }

  bindInput() {
    const input = this.input;
    input.connect();
    this.#bindLockBanner();

    input.onMove((dx, dy) => {
      if (!this.state.playing || this.state.paused || this.state.gameOver) return;
      const sensitivity = 0.002 * this.sens * (this.player.adsAmt > 0.5 ? 0.58 : 1);
      this.player.yaw -= dx * sensitivity;
      this.player.pitch = clamp(this.player.pitch - dy * sensitivity, -1.48, 1.48);
      this.player.swayX = clamp(this.player.swayX - dx * sensitivity * 0.45, -0.045, 0.045);
      this.player.swayY = clamp(this.player.swayY + dy * sensitivity * 0.45, -0.045, 0.045);
      this.weapon.setSway(this.player.swayX, this.player.swayY);
    });

    input.onMouseButton((button, down) => {
      if (!this.state.playing || this.state.paused || this.state.gameOver) return;
      if (button === 0) {
        this.triggerHeld = down;
        if (down && !WEAPONS[this.weapon.currentId].auto) this.weapon.tryFire();
        if (down) this.sound.resume();
      }
      if (button === 2) this.adsHeld = down;
    });

    input.onLockChange((locked) => {
      const needsCapture = !locked && !input.fallbackLook;
      this.#setLockBanner(needsCapture && this.state.playing && !this.state.paused && !this.state.gameOver);
      if (locked) this.sound.resume();
    });

    input.onWheel((direction) => {
      if (!this.state.playing || this.state.paused) return;
      this.weapon.cycleSlot(direction);
    });

    const action = (code, fn) => input.onAction(code, fn);
    action('KeyC', () => this.player.toggleCrouch());
    action('KeyR', () => this.weapon.startReload());
    action('Digit1', () => this.weapon.switchSlot(0));
    action('Digit2', () => this.weapon.switchSlot(1));
    action('KeyF', () => this.weapon.startInspect());
    action('KeyX', () => this.weapon.doMelee(this.menu.selectedOperator));
    action('KeyG', () => this.throwFrag());
    action('KeyL', () => this.#toggleGadget('light'));
    action('KeyT', () => this.#toggleGadget('laser'));
    action('KeyN', () => this.#toggleGadget('nvg'));
    action('KeyB', () => this.toggleBodycam());
    action('KeyM', () => this.toggleAudio());
    action('KeyP', () => this.pause());
    action('Escape', () => this.pause());
  }

  #toggleGadget(which) {
    if (which === 'light') {
      this.weapon.lightOn = !this.weapon.lightOn;
      this.sound.playUI('pickup');
    } else if (which === 'laser') {
      this.weapon.laserOn = !this.weapon.laserOn;
      this.sound.playUI('pickup');
    } else {
      this.nvgOn = !this.nvgOn;
      this.sound.playUI('nvg');
    }
  }

  toggleBodycam() {
    this.bodycamOn = !this.bodycamOn;
    this.settings.bodycam = this.bodycamOn;
    document.getElementById('opt-bodycam').checked = this.bodycamOn;
    document.getElementById('bodycam-osd').classList.toggle('hidden', !this.bodycamOn);
  }

  toggleAudio() {
    this.audioOn = !this.audioOn;
    this.settings.audio = this.audioOn;
    document.getElementById('opt-audio').checked = this.audioOn;
    this.sound.setEnabled(this.audioOn);
    this.hud.prompt(this.audioOn ? 'SPATIAL AUDIO ON' : 'SPATIAL AUDIO MUTED');
  }

  // ------------------------------------------------------------ settings

  #applySettings(next, persist) {
    this.settings = { ...this.settings, ...next };
    this.sens = Number(this.settings.sens) || 1;
    this.bodycamOn = !!this.settings.bodycam;
    this.audioOn = !!this.settings.audio;
    this.sound.setEnabled(this.audioOn);
    document.getElementById('bodycam-osd')?.classList.toggle('hidden', !this.bodycamOn);
    this.#applyWeather(this.settings.weather);
    this.#applyQuality(this.settings.quality);
    if (persist) storage.write(STORAGE_KEY, this.settings);
  }

  #applyWeather(mode) {
    const uniforms = this.sky.material.uniforms;
    if (mode === 'dusk') {
      this.scene.fog.color.setHex(0x4b4c60);
      this.scene.fog.density = 0.012;
      uniforms.uTopColor.value.setHex(0x1d2d4a);
      uniforms.uHorizonColor.value.setHex(0xc97a4b);
      uniforms.uSunColor.value.setHex(0xffa95c);
      uniforms.uNight.value = 0;
      this.sun.color.setHex(0xffaa66);
      this.sun.intensity = 2.65;
      this.sun.position.set(-55, 22, -45);
      this.hemi.color.setHex(0x7b8db0);
      this.hemi.groundColor.setHex(0x38261e);
      this.hemi.intensity = 0.85;
      this.scene.environmentIntensity = 0.55;
      if (this.viewLight) this.viewLight.intensity = 0.9;
      this.nvgOn = false;
    } else if (mode === 'night') {
      this.scene.fog.color.setHex(0x0a1018);
      this.scene.fog.density = 0.019;
      uniforms.uTopColor.value.setHex(0x040811);
      uniforms.uHorizonColor.value.setHex(0x132033);
      uniforms.uSunColor.value.setHex(0x6c90c2);
      uniforms.uNight.value = 1;
      this.sun.color.setHex(0x6088b8);
      this.sun.intensity = 0.55;
      this.sun.position.set(35, 45, 30);
      this.hemi.color.setHex(0x1d2e47);
      if (this.viewLight) this.viewLight.intensity = 2.2;
      this.hemi.groundColor.setHex(0x0c1014);
      this.hemi.intensity = 0.42;
      this.scene.environmentIntensity = 0.22;
      this.nvgOn = true;
      this.weapon.lightOn = true;
    } else {
      this.scene.fog.color.setHex(0x6f7f8c);
      this.scene.fog.density = 0.011;
      uniforms.uTopColor.value.setHex(0x3f5265);
      uniforms.uHorizonColor.value.setHex(0x99abb8);
      uniforms.uSunColor.value.setHex(0xfff1d6);
      uniforms.uNight.value = 0;
      this.sun.color.setHex(0xeef3f8);
      this.sun.intensity = 2.2;
      this.sun.position.set(42, 58, -40);
      this.hemi.color.setHex(0xa9bccb);
      this.hemi.groundColor.setHex(0x36332c);
      this.hemi.intensity = 1.05;
      this.scene.environmentIntensity = 0.62;
      if (this.viewLight) this.viewLight.intensity = 0.6;
      this.nvgOn = false;
    }
    uniforms.uSunDir.value.copy(this.sun.position).normalize();

    for (const item of this.level.compoundLights) {
      if (item.nightOnly) item.light.intensity = mode === 'night' ? item.baseIntensity : 0;
    }
  }

  #applyQuality(quality) {
    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high;
    this.quality = quality;
    this.qualityPreset = preset;
    const pixelRatio = Math.min(preset.pixelRatio, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pixelRatio);
    this.composer.setPixelRatio(pixelRatio);
    if (this.sun.shadow.mapSize.width !== preset.shadow) {
      this.sun.shadow.mapSize.set(preset.shadow, preset.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.bloomPass.enabled = preset.bloom;
    this.smokeEnabled = preset.smoke;
    this.#syncViewport();
  }

  // ------------------------------------------------------------- mission

  deploy() {
    this.sound.init();
    if (!this.state.playing || this.state.gameOver) {
      this.startMission();
      return;
    }
    this.resume();
  }

  startMission() {
    this.sound.init();
    this.enemies.clearAll();
    this.fx.clear();
    this.level.resetBarrels();

    const operator = this.menu.selectedOperator;
    this.player.reset(operator);
    this.weapon.equip(operator);
    this.weapon.onShot = () => {
      this.shotsFired++;
    };
    this.weapon.onHit = (result) => {
      this.shotsHit++;
      this.hud.hitmarker(result.headshot);
      this.sound.playHitmarker(result.headshot);
    };
    this.weapon.onKill = (enemy, isHead, via) => this.#onEnemyKilled(enemy, isHead, via);
    this.weapon.onPrompt = (text) => this.hud.prompt(text);

    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.frags = 2;
    this.waveClearDelay = 0;

    this.state.playing = true;
    this.state.paused = false;
    this.state.gameOver = false;
    this.state.started = true;

    this.menu.hide();
    this.hud.showPlaying();
    this.hud.clearKillfeed();
    this.hud.setUnit(operator.tag);
    document.body.classList.add('in-game');

    this.input.enabled = true;
    this.startWave(1);
    this.requestLock();
  }

  requestLock() {
    this.input.requestLock().then((ok) => {
      if (!ok) this.#setLockBanner(true);
      else if (this.input.fallbackLook) this.#announceFallbackLook();
    });
  }

  /** Explain the lock-free mode once, so the cursor vanishing is not a surprise. */
  #announceFallbackLook() {
    if (this._fallbackAnnounced) return;
    this._fallbackAnnounced = true;
    this.hud.prompt('POINTER CAPTURE UNAVAILABLE — MOVE THE MOUSE TO AIM, [ESC] TO PAUSE');
  }

  pause() {
    if (!this.state.playing || this.state.gameOver) return;
    this.state.paused = true;
    this.input.releaseLock();
    this.input.reset();
    this.triggerHeld = false;
    this.adsHeld = false;
    this.#setLockBanner(false);
    document.body.classList.remove('in-game');
    this.menu.show({ paused: true });
  }

  resume() {
    this.state.paused = false;
    this.menu.hide();
    this.input.enabled = true;
    this.sound.resume();
    this.requestLock();
    document.body.classList.add('in-game');
  }

  startWave(number) {
    this.wave = number;
    const pool = ['assault', 'ghost'];
    if (number >= 2) pool.push('spectre');
    if (number >= 3) pool.push('alpine');
    if (number >= 4) pool.push('ronin');
    const total = 4 + number * 2;
    this.spawnQueue = [];
    for (let i = 0; i < total; i++) this.spawnQueue.push(pool[i % pool.length]);
    if (number >= 3 && number % 2 === 0) this.spawnQueue.push('juggernaut');
    this.spawnTimer = 0.6;
    this.waveClearDelay = 0;

    const title = WAVE_TITLES[(number - 1) % WAVE_TITLES.length];
    document.getElementById('wave-label').textContent = `WAVE ${String(number).padStart(2, '0')} // ${title}`;
    this.hud.banner(
      `WAVE ${String(number).padStart(2, '0')}`,
      `${this.spawnQueue.length} HOSTILES ENTERING SECTOR`,
    );
  }

  #updateWaves(dt) {
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.aliveCount() < MAX_LIVE_HOSTILES) {
        const nextType = this.spawnQueue.shift();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.enemies.spawnEnemy(nextType, this.player.position, forward);
        this.spawnTimer = 1.35;
      }
      return;
    }

    if (this.enemies.aliveCount() === 0) {
      this.waveClearDelay += dt;
      if (this.waveClearDelay > 3.5) {
        this.player.heal(25, 30);
        this.frags = Math.min(3, this.frags + 1);
        for (const slot of this.weapon.slots) {
          slot.reserve = Math.min(WEAPONS[slot.id].reserveMax, slot.reserve + WEAPONS[slot.id].magSize * 2);
        }
        this.startWave(this.wave + 1);
      } else if (this.waveClearDelay < 0.1) {
        this.hud.banner(
          `WAVE ${String(this.wave).padStart(2, '0')} CLEARED`,
          'RESUPPLY DELIVERED — NEXT WAVE INBOUND',
        );
      }
    }
  }

  // ---------------------------------------------------------------- combat

  throwFrag() {
    if (this.frags <= 0 || this.weapon.state === 'SWAPPING') return;
    this.frags--;
    this.sound.playFoley('swap');
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = this.camera.position.clone().addScaledVector(dir, 0.55);
    this.fx.throwGrenade(origin, dir, this.player.velocity);
  }

  #handleExplosion(pos, radius, maxDamage) {
    const distance = pos.distanceTo(this.player.position);
    this.sound.playExplosion(pos, distance);
    this.player.camShake = Math.max(this.player.camShake, Math.max(0, 1 - distance / 24) * 0.06);
    if (distance < 12) this.player.flashAmt = Math.max(this.player.flashAmt, (1 - distance / 12) * 0.75);
    if (distance < radius && this.player.takeHit(maxDamage * 0.45 * (1 - distance / radius), pos)) {
      this.#triggerGameOver();
    }

    for (const enemy of [...this.enemies.enemies]) {
      if (!enemy.alive) continue;
      const d = enemy.root.position.distanceTo(pos);
      if (d >= radius) continue;
      const dir = enemy.root.position.clone().sub(pos).normalize();
      const result = this.enemies.damageEnemy(
        enemy,
        maxDamage * (1 - d / radius),
        'torso',
        enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0)),
        dir,
      );
      if (result.killed) this.#onEnemyKilled(enemy, false, 'EXPLOSION');
    }
  }

  #onEnemyKilled(enemy, isHead, via) {
    this.kills++;
    const points = enemy.cfg.score + (isHead ? 50 : 0);
    this.score += points;
    if (isHead) this.headshots++;
    this.hud.addKillfeed(`${isHead ? '⌖ HEADSHOT // ' : ''}${enemy.cfg.name} [${via}] +${points}`, isHead);
  }

  #checkDeath() {
    if (this.state.gameOver || !this.player.isDead) return;
    this.#triggerGameOver();
  }

  /** Public death check (kept for the frame loop and tests). */
  checkDeath() {
    this.#checkDeath();
  }

  #triggerGameOver() {
    this.state.gameOver = true;
    this.state.paused = true;
    this.triggerHeld = false;
    this.adsHeld = false;
    this.input.releaseLock();
    this.input.reset();
    this.input.enabled = false;
    this.#setLockBanner(false);
    document.body.classList.remove('in-game');

    const accuracy = this.shotsFired ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    this.menu.show({ gameOver: true });
    this.menu.showGameOver({
      wave: this.wave,
      kills: this.kills,
      headshots: this.headshots,
      accuracy,
      score: this.score,
    });
    this.hud.hidePlaying();
  }

  // ----------------------------------------------------------------- loop

  start() {
    if (this.frameId) return;
    this.clock.start();
    const loop = () => {
      this.frameId = requestAnimationFrame(loop);
      this.tick();
    };
    this.frameId = requestAnimationFrame(loop);
  }

  /** Advance one frame. Public so integration tests can drive the loop. */
  tick(dtOverride) {
    const dt = dtOverride ?? Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    this.sky.material.uniforms.uTime.value = this.elapsed;
    this.sky.position.copy(this.camera.position);
    this.level.update(this.elapsed, dt);

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.hud.setFps(Math.round(this.fpsFrames / this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    const live = this.state.playing && !this.state.paused && !this.state.gameOver;
    if (!live) {
      this.renderOrbit();
      return;
    }

    this.#updateGameplay(dt);
    this.composer.render();
  }

  /** Drives the menu background orbit camera. */
  renderOrbit() {
    const angle = this.elapsed * 0.12;
    this.camera.position.set(Math.sin(angle) * 26, 8.5, Math.cos(angle) * 26);
    this.camera.lookAt(0, 2.2, -3);
    if (this.weapon.vm) this.weapon.vm.root.visible = false;
    const uniforms = this.bodycamPass.uniforms;
    uniforms.uDistortion.value = 0;
    uniforms.uNVG.value = 0;
    uniforms.uDamage.value = 0;
    uniforms.uFlash.value = 0;
    this.composer.render();
  }

  #updateGameplay(dt) {
    const input = this.input;
    if (this.weapon.vm) this.weapon.vm.root.visible = true;

    const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const moveInput = {
      forward,
      strafe,
      sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      crouchHeld: input.isDown('ControlLeft') || input.isDown('ControlRight'),
      jump: input.isDown('Space'),
      ads: !!this.adsHeld,
      lean: (input.isDown('KeyE') ? 1 : 0) - (input.isDown('KeyQ') ? 1 : 0),
      moving: forward !== 0 || strafe !== 0,
    };

    this.player.update(dt, moveInput, this.weapon, this.camera);
    this.weapon.sprintAmt = this.player.sprintAmt;
    this.weapon.adsAmt = this.player.adsAmt;
    this.weapon.setSway(this.player.swayX, this.player.swayY);

    const horizontalSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const moveFactor = clamp(horizontalSpeed / 5, 0, 1);

    this.weapon.update(dt, {
      adsAmt: this.player.adsAmt,
      moveFactor,
      triggerHeld: !!this.triggerHeld,
      triggerPressed: false,
    });

    // Muzzle light.
    if (this.weapon.muzzleFlashTimer > 0) {
      const spec = WEAPONS[this.weapon.currentId];
      this.weapon.vm.muzzlePoint.getWorldPosition(this.muzzleFlashLight.position);
      this.muzzleFlashLight.intensity = spec.suppressed ? 4 : 18;
    } else {
      this.muzzleFlashLight.intensity = 0;
    }

    this.#updateWaves(dt);
    this.enemies.update(dt, this.player.position, this.player.isCrouched, (damage, source) => {
      if (this.player.takeHit(damage, source)) this.#triggerGameOver();
    });
    this.fx.update(dt);
    this.#collectPickups();
    this.checkDeath();

    const worldForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.sound.updateListener(this.camera.position, worldForward, worldUp);

    const uniforms = this.bodycamPass.uniforms;
    uniforms.uTime.value = this.elapsed;
    uniforms.uDistortion.value = this.bodycamOn ? 0.08 * (1 - this.player.adsAmt * 0.92) : 0;
    uniforms.uAberration.value = damp(uniforms.uAberration.value, this.bodycamOn ? 0.0014 : 0.0004, 8, dt);
    uniforms.uBodycam.value = this.bodycamOn ? 1 : 0;
    uniforms.uNVG.value = damp(uniforms.uNVG.value, this.nvgOn ? 1 : 0, 10, dt);
    uniforms.uDamage.value = Math.max(
      this.player.damageVignette,
      (1 - this.player.hp / this.player.maxHp) * 0.55,
    );
    uniforms.uFlash.value = this.player.flashAmt;

    this.hud.update({
      player: this.player,
      weapon: this.weapon,
      wave: `WAVE ${String(this.wave).padStart(2, '0')} // ${WAVE_TITLES[(this.wave - 1) % WAVE_TITLES.length]}`,
      remaining: this.enemies.aliveCount() + this.spawnQueue.length,
      score: this.score,
      frags: this.frags,
      nvgOn: this.nvgOn,
      spread: this.weapon.spreadExtra + moveFactor * 0.01,
      adsFade: clamp(1 - this.player.adsAmt * 1.4 - this.player.sprintAmt, 0, 1),
    });
  }

  #collectPickups() {
    for (let i = this.fx.pickups.length - 1; i >= 0; i--) {
      const pickup = this.fx.pickups[i];
      if (pickup.pos.distanceTo(this.player.position) >= 1.9) continue;
      if (pickup.type === 'med') {
        this.player.heal(35, 25);
        this.hud.prompt('+35 HEALTH // +25 ARMOR PLATE');
      } else {
        for (const slot of this.weapon.slots) {
          slot.reserve = Math.min(WEAPONS[slot.id].reserveMax, slot.reserve + WEAPONS[slot.id].magSize * 2);
        }
        this.frags = Math.min(3, this.frags + 1);
        this.hud.prompt('+AMMO RESUPPLY // +1 FRAG');
      }
      this.sound.playUI('pickup');
      this.fx.removePickup(pickup);
    }
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this._onResize);
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.input.dispose();
    this.input.releaseLock();
    this.weapon.dispose();
    this.enemies.dispose();
    this.fx.dispose();
    this.level.dispose();
    this.tex.dispose();
    this.sound.dispose();
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}
