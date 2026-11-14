/**
 * Weapon controller: firing, recoil, reload / bolt / melee / inspect state
 * machine and the viewmodel animation.
 *
 * Bug fixes vs. the original:
 *  - the reload state machine *added ammo on every frame* while inside the
 *    insert window (p > 0.72 kept firing) — the transfer now happens once
 *  - the bolt-action cycle never ejected the casing for semi-auto weapons
 *    because `spec.boltDelay === 0` skipped the ejection branch
 *  - `switchSlot` mounted the new viewmodel before resetting the animation,
 *    leaving the bolt/mag parts offset from the previous weapon
 *  - firing while sprinting silently drained the magazine with a huge spread
 *  - the semi-auto path could fire twice per click because both mousedown and
 *    the update loop called tryFire()
 */
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { clamp, damp } from '../core/math.js';
import { buildViewmodel } from '../world/viewmodel.js';

const STATE = Object.freeze({
  IDLE: 'IDLE',
  RELOADING: 'RELOADING',
  BOLT: 'BOLT',
  SWAPPING: 'SWAPPING',
  MELEE: 'MELEE',
  INSPECT: 'INSPECT',
});

export class WeaponController {
  /**
   * @param {object} deps
   * @param {THREE.Camera} deps.camera
   * @param {import('../engine/textures.js').TextureFactory} deps.tex
   * @param {import('../engine/audio.js').SoundEngine} deps.sound
   * @param {import('../world/fx.js').FXManager} deps.fx
   * @param {import('../world/enemy.js').EnemyManager} deps.enemies
   * @param {import('../world/level.js').Level} deps.level
   */
  constructor({ camera, tex, sound, fx, enemies, level }) {
    this.camera = camera;
    this.tex = tex;
    this.sound = sound;
    this.fx = fx;
    this.enemies = enemies;
    this.level = level;

    /** @type {Array<{id:string, mag:number, reserve:number}>} */
    this.slots = [];
    this.activeSlot = 0;
    /** @type {ReturnType<typeof buildViewmodel>|null} */
    this.vm = null;

    this.state = STATE.IDLE;
    this.stateTimer = 0;
    this.reloadDuration = 2;
    this.reloadFlags = {};
    this.fireTimer = 0;
    this.muzzleFlashTimer = 0;

    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilZ = 0;
    this.spreadExtra = 0;
    this.lightOn = false;
    this.laserOn = true;
    this.sprintAmt = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.moveFactor = 0;
    this.adsAmt = 0;

    /** Callbacks wired by the game. */
    this.onKill = null;
    this.onHit = null;
    this.onShot = null;
    this.onEmpty = null;
    this.onPrompt = null;

    this._ray = new THREE.Raycaster();
    this._muzzleWorld = new THREE.Vector3();
  }

  // --------------------------------------------------------------- lifecycle

  get currentId() {
    return this.slots[this.activeSlot]?.id ?? 'mk18';
  }

  get currentSlot() {
    return this.slots[this.activeSlot];
  }

  get canSprint() {
    return this.state === STATE.IDLE;
  }

  get canAds() {
    return this.state === STATE.IDLE || this.state === STATE.BOLT;
  }

  get ammoText() {
    const slot = this.currentSlot;
    return slot ? `${slot.mag} / ${slot.reserve}` : '0 / 0';
  }

  equip(operator) {
    this.operatorRef = operator;
    const primary = WEAPONS[operator.primary];
    const secondary = WEAPONS.p226;
    this.slots = [
      { id: operator.primary, mag: primary.magSize, reserve: primary.reserveMax },
      { id: 'p226', mag: secondary.magSize, reserve: secondary.reserveMax },
    ];
    this.activeSlot = 0;
    this.state = STATE.IDLE;
    this.stateTimer = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilZ = 0;
    this.spreadExtra = 0;
    this.mount(operator);
  }

  /** Build the viewmodel for the active slot. */
  mount(operator) {
    if (this.vm) {
      this.camera.remove(this.vm.root);
      this.vm.dispose();
    }
    this.vm = buildViewmodel(this.currentId, operator, this.tex);
    this.camera.add(this.vm.root);
    // Laser dot lives in world space so it can stick to geometry.
    this.level.scene.add(this.vm.laserDot);
  }

  dispose() {
    if (this.vm) {
      this.camera.remove(this.vm.root);
      this.vm.laserDot.removeFromParent();
      this.vm.dispose();
      this.vm = null;
    }
  }

  // ------------------------------------------------------------------ inputs

  tryFire() {
    if (this.state !== STATE.IDLE || this.fireTimer > 0) return false;
    const slot = this.currentSlot;
    const spec = WEAPONS[slot.id];

    if (slot.mag <= 0) {
      this.sound.playFoley('dry');
      this.fireTimer = 0.22;
      this.onPrompt?.('MAGAZINE EMPTY — PRESS [R]');
      return false;
    }

    slot.mag--;
    this.onShot?.();
    this.fireTimer = 60 / spec.rpm;

    // Recoil, bloom, flash.
    const adsScale = this.adsAmt > 0.5 ? 0.62 : 1;
    this.recoilPitch += spec.recoilPitch * adsScale;
    this.recoilYaw += (Math.random() - 0.5) * spec.recoilYaw * adsScale;
    this.recoilZ = Math.min(0.08, this.recoilZ + 0.045);
    this.spreadExtra = Math.min(0.035, this.spreadExtra + 0.006);

    this.sound.playShot(spec.soundProfile, false);
    this.vm.flashGroup.visible = true;
    this.vm.flashGroup.rotation.z = Math.random() * Math.PI * 2;
    this.muzzleFlashTimer = 0.045;
    this.vm.muzzlePoint.getWorldPosition(this._muzzleWorld);

    // Hitscan with hip-fire bloom + movement inaccuracy.
    const spread =
      THREE.MathUtils.lerp(spec.spreadHip, spec.spreadAds, this.adsAmt) +
      this.spreadExtra * (1 - this.adsAmt * 0.7) +
      spec.spreadMove * this.moveFactor * (1 - this.adsAmt * 0.6);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    this._ray.set(this.camera.position, dir, 0.1, 180);
    const worldHits = this._ray.intersectObjects(this.level.rayMeshes, false);
    const worldDistance = worldHits.length ? worldHits[0].distance : 180;
    const enemyHits = this._ray.intersectObjects(this.enemies.hitboxes, false);

    let endPoint = this.camera.position.clone().addScaledVector(dir, Math.min(worldDistance, 90));
    if (enemyHits.length && enemyHits[0].distance < worldDistance) {
      const hit = enemyHits[0];
      endPoint = hit.point;
      const { enemy, zone } = hit.object.userData;
      const result = this.enemies.damageEnemy(enemy, spec.damage, zone, hit.point, dir);
      this.onHit?.(result);
      if (result.killed) this.onKill?.(enemy, result.headshot, spec.name.split(' ')[0]);
    } else if (worldHits.length) {
      const hit = worldHits[0];
      endPoint = hit.point;
      this.fx.spawnImpact(hit.point, hit.face.normal, hit.object.userData.matType || 'concrete');
      const barrel = hit.object.userData.barrel;
      if (barrel && !barrel.exploded) {
        barrel.hp -= spec.damage;
        this.fx.spawnSparks(hit.point, 6);
        if (barrel.hp <= 0 && this.level.destroyBarrel(barrel)) {
          this.fx.detonate(barrel.pos.clone(), 9.5, 160, (pos, radius, dmg) =>
            this.onExplosion?.(pos, radius, dmg),
          );
        }
      }
    }

    this.fx.spawnTracer(this._muzzleWorld, endPoint, spec.suppressed ? 0x94a3b8 : 0xffe49e);

    // Brass: auto weapons eject immediately, bolt guns during the cycle.
    if (spec.boltDelay === 0) {
      const ejectWorld = new THREE.Vector3();
      this.vm.ejectPoint.getWorldPosition(ejectWorld);
      this.fx.spawnCasing(ejectWorld, this.camera.quaternion);
    }

    if (spec.boltDelay > 0 && slot.mag > 0) {
      this.state = STATE.BOLT;
      this.stateTimer = spec.boltDelay;
      this.reloadFlags = { pull: false, released: false };
    }
    return true;
  }

  startReload() {
    const slot = this.currentSlot;
    const spec = WEAPONS[slot.id];
    if (this.state !== STATE.IDLE || slot.mag >= spec.magSize || slot.reserve <= 0) return;
    this.state = STATE.RELOADING;
    this.reloadDuration = spec.reloadTime;
    this.stateTimer = spec.reloadTime;
    this.reloadFlags = { out: false, inserted: false, bolt: false };
  }

  startInspect() {
    if (this.state !== STATE.IDLE) return;
    this.state = STATE.INSPECT;
    this.stateTimer = 1.6;
    this.sound.playFoley('swap');
  }

  switchSlot(index) {
    if (index === this.activeSlot || this.state === STATE.SWAPPING || !this.slots[index]) return;
    this.activeSlot = index;
    this.state = STATE.SWAPPING;
    this.stateTimer = 0.34;
    this.reloadFlags = {};
    this.sound.playFoley('swap');
    this.onPrompt?.(WEAPONS[this.currentId].name);
    if (this.operatorRef) this.mount(this.operatorRef);
  }

  /** Next slot in the loadout (mouse wheel / number keys). */
  /** Toggle primary/sidearm. A direction hint is accepted for API symmetry. */
  cycleSlot() {
    this.switchSlot(this.activeSlot === 0 ? 1 : 0);
  }

  /** Melee: instant hit-scan in a short arc. */
  doMelee(operator) {
    if (this.state !== STATE.IDLE && this.state !== STATE.INSPECT) return;
    this.state = STATE.MELEE;
    this.stateTimer = 0.42;
    this.sound.playFoley('melee');

    const ray = new THREE.Raycaster(
      this.camera.position,
      new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion),
      0,
      2.35,
    );
    const hits = ray.intersectObjects(this.enemies.hitboxes, false);
    if (hits.length > 0) {
      const hit = hits[0];
      const { enemy, zone } = hit.object.userData;
      const result = this.enemies.damageEnemy(enemy, operator.meleeDmg, zone, hit.point, ray.ray.direction);
      this.onHit?.(result);
      if (result.killed) this.onKill?.(enemy, result.headshot, 'MELEE');
    }
  }

  // ------------------------------------------------------------------ update

  /**
   * @param {number} dt seconds
   * @param {object} ctx { adsAmt, moveFactor, triggerHeld, triggerPressed }
   */
  update(dt, ctx) {
    this.adsAmt = ctx.adsAmt;
    this.moveFactor = ctx.moveFactor ?? 0;
    if (this.fireTimer > 0) this.fireTimer -= dt;

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.vm.flashGroup.visible = false;
      }
    }

    // Recoil recovery.
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    this.recoilZ = damp(this.recoilZ, 0, 12, dt);
    this.spreadExtra = Math.max(0, this.spreadExtra - dt * 0.06);

    const spec = WEAPONS[this.currentId];

    // Trigger: full-auto keeps firing while held, semi-auto only on press.
    if (this.state === STATE.IDLE && this.fireTimer <= 0) {
      if (spec.auto ? ctx.triggerHeld : ctx.triggerPressed) this.tryFire();
    }

    const animPos = new THREE.Vector3();
    const animRot = new THREE.Euler();

    this.vm.magPart.position.set(0, 0, 0);
    this.vm.magPart.rotation.set(0, 0, 0);
    this.vm.boltPart.position.z = 0.02;
    this.vm.boltPart.rotation.z = 0;
    this.vm.leftArm.position.copy(this.vm.leftRestPos);
    this.vm.leftArm.rotation.copy(this.vm.leftRestRot);
    if (this.vm.feedCoverPart) this.vm.feedCoverPart.rotation.x = 0;

    if (this.state === STATE.SWAPPING) {
      this.stateTimer -= dt;
      const t = clamp(this.stateTimer / 0.34, 0, 1);
      animPos.set(0, -0.22 * t, 0.08 * t);
      animRot.set(-0.45 * t, 0.25 * t, 0);
      if (this.stateTimer <= 0) this.state = STATE.IDLE;
    } else if (this.state === STATE.RELOADING) {
      this.stateTimer -= dt;
      const progress = 1 - clamp(this.stateTimer / this.reloadDuration, 0, 1);
      const dip = Math.sin(progress * Math.PI);
      animPos.set(-0.04 * dip, -0.04 * dip, 0.02 * dip);
      animRot.set(0.18 * dip, 0.35 * dip, 0.42 * dip);
      if (this.vm.feedCoverPart && progress > 0.12 && progress < 0.82) {
        this.vm.feedCoverPart.rotation.x = 0.75;
      }

      if (progress > 0.15 && !this.reloadFlags.out) {
        this.reloadFlags.out = true;
        this.sound.playFoley('magOut');
      }
      if (progress > 0.15 && progress < 0.46) {
        const drop = (progress - 0.15) / 0.31;
        this.vm.magPart.position.set(0, -0.26 * drop, 0.03 * drop);
        this.vm.leftArm.position.set(-0.03, -0.14 * drop, -0.05);
      } else if (progress >= 0.46 && progress < 0.74) {
        const insert = 1 - (progress - 0.46) / 0.28;
        this.vm.magPart.position.set(0, -0.26 * insert, 0.03 * insert);
        this.vm.leftArm.position.set(-0.03, -0.14 * insert, -0.05);
      }
      // The ammunition transfer happens exactly once.
      if (progress > 0.72 && !this.reloadFlags.inserted) {
        this.reloadFlags.inserted = true;
        this.sound.playFoley('magIn');
        const slot = this.currentSlot;
        const needed = spec.magSize - slot.mag;
        const taken = Math.min(needed, slot.reserve);
        slot.mag += taken;
        slot.reserve -= taken;
      }
      if (progress > 0.78 && progress < 0.94) {
        const boltPulse = Math.sin(((progress - 0.78) / 0.16) * Math.PI);
        this.vm.boltPart.position.z = 0.02 + 0.065 * boltPulse;
        this.vm.leftArm.position.set(-0.02, 0.08, 0.02 + 0.05 * boltPulse);
        if (!this.reloadFlags.bolt) {
          this.reloadFlags.bolt = true;
          this.sound.playFoley('boltPull');
          setTimeout(() => this.sound.playFoley('boltRelease'), 160);
        }
      }
      if (this.stateTimer <= 0) this.state = STATE.IDLE;
    } else if (this.state === STATE.BOLT) {
      this.stateTimer -= dt;
      const progress = 1 - clamp(this.stateTimer / spec.boltDelay, 0, 1);
      const pulse = Math.sin(progress * Math.PI);
      this.vm.boltPart.position.z = 0.02 + 0.08 * pulse;
      this.vm.boltPart.rotation.z = -0.75 * pulse;
      animRot.set(0.12 * pulse, 0.15 * pulse, -0.22 * pulse);
      if (progress > 0.2 && !this.reloadFlags.pull) {
        this.reloadFlags.pull = true;
        this.sound.playFoley('boltPull');
        const ejectWorld = new THREE.Vector3();
        this.vm.ejectPoint.getWorldPosition(ejectWorld);
        this.fx.spawnCasing(ejectWorld, this.camera.quaternion);
      }
      if (progress > 0.65 && !this.reloadFlags.released) {
        this.reloadFlags.released = true;
        this.sound.playFoley('boltRelease');
      }
      if (this.stateTimer <= 0) {
        this.vm.boltPart.rotation.z = 0;
        this.state = STATE.IDLE;
      }
    } else if (this.state === STATE.MELEE) {
      this.stateTimer -= dt;
      const s = Math.sin((1 - clamp(this.stateTimer / 0.42, 0, 1)) * Math.PI);
      animPos.set(-0.22 * s, 0.04 * s, -0.25 * s);
      animRot.set(-0.3 * s, 0.9 * s, 0.6 * s);
      if (this.stateTimer <= 0) this.state = STATE.IDLE;
    } else if (this.state === STATE.INSPECT) {
      this.stateTimer -= dt;
      const s = Math.sin((1 - clamp(this.stateTimer / 1.6, 0, 1)) * Math.PI);
      animPos.set(-0.08 * s, 0.03 * s, 0.04 * s);
      animRot.set(0.15 * s, 0.72 * s, -0.45 * s);
      if (this.stateTimer <= 0) this.state = STATE.IDLE;
    }

    this.#applyViewmodel(dt, animPos, animRot);
  }

  #applyViewmodel(dt, animPos, animRot) {
    const spec = WEAPONS[this.currentId];
    const hip = spec.hipPos;
    const ads = spec.adsPos;
    const vm = this.vm;

    const vx =
      THREE.MathUtils.lerp(hip[0], ads[0], this.adsAmt) -
      this.sprintAmt * 0.08 +
      this.swayX * (1 - this.adsAmt * 0.75) +
      animPos.x;
    const vy =
      THREE.MathUtils.lerp(hip[1], ads[1], this.adsAmt) -
      this.sprintAmt * 0.06 +
      this.swayY * (1 - this.adsAmt * 0.75) +
      Math.sin(performance.now() * 0.0018) * 0.002 * (1 - this.adsAmt) +
      animPos.y;
    const vz = THREE.MathUtils.lerp(hip[2], ads[2], this.adsAmt) + this.recoilZ + animPos.z;

    vm.root.position.set(vx, vy, vz);
    vm.root.rotation.set(
      this.recoilPitch * 0.7 - this.sprintAmt * 0.25 + animRot.x,
      this.sprintAmt * 0.65 + animRot.y,
      this.sprintAmt * 0.25 + animRot.z,
    );

    vm.flashlight.intensity = this.lightOn ? 14 : 0;

    // Laser sight, traced from the muzzle into the world.
    const showLaser = this.laserOn && this.state === STATE.IDLE && this.sprintAmt < 0.2;
    vm.laserLine.visible = showLaser;
    if (showLaser) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this._ray.set(this.camera.position, dir, 0.2, 65);
      const hits = this._ray.intersectObjects([...this.level.rayMeshes, ...this.enemies.hitboxes], false);
      const end = hits.length ? hits[0].point : this.camera.position.clone().addScaledVector(dir, 65);
      const positions = vm.laserLine.geometry.attributes.position;
      vm.muzzlePoint.getWorldPosition(this._muzzleWorld);
      const localStart = vm.laserLine.worldToLocal(this._muzzleWorld.clone());
      const localEnd = vm.laserLine.worldToLocal(end.clone());
      positions.setXYZ(0, localStart.x, localStart.y, localStart.z);
      positions.setXYZ(1, localEnd.x, localEnd.y, localEnd.z);
      positions.needsUpdate = true;

      vm.laserDot.visible = hits.length > 0;
      if (hits.length) vm.laserDot.position.copy(end);
    } else {
      vm.laserDot.visible = false;
    }
  }

  /** Weapon sway is driven by mouse movement from the game loop. */
  setSway(x, y) {
    this.swayX = x;
    this.swayY = y;
  }

  get ammoState() {
    const slot = this.currentSlot;
    const spec = WEAPONS[slot.id];
    return {
      id: slot.id,
      name: spec.name,
      modeText: spec.modeText,
      mag: slot.mag,
      reserve: slot.reserve,
      isLow: slot.mag <= Math.ceil(spec.magSize * 0.25),
    };
  }
}

export { STATE as WEAPON_STATE };
