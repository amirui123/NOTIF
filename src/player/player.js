/**
 * First-person player controller: movement, collision, camera, vitals.
 *
 * Bug fixes vs. the original:
 *  - diagonal input was faster than forward (the vector was normalised after
 *    scaling, but the old code also added a lateral camera roll from `str`
 *    that jittered) — movement is now direction-normalised and accel-driven
 *  - crouch locked you under the warehouse roof (the controller never checked
 *    headroom before standing up); a ceiling probe now prevents that
 *  - jump was bound to Space but Space also scrolled the page; Space is now
 *    consumed by the input layer
 *  - lean rolled the camera even when the shoulder was inside a wall
 *  - the damage direction was computed in world space and ignored the camera
 *    yaw, so the indicator pointed the wrong way
 *  - footsteps fired on the first frame after a hitch
 */
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { clamp, damp, relativeBearingDeg } from '../core/math.js';

const PLAYER_RADIUS = 0.42;
/** Anything the player can step over without a jump. */
const STEP_HEIGHT = 0.55;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.06;
const WALK_SPEED = 5.0;
const SPRINT_MULT = 1.48;
const CROUCH_MULT = 0.56;
const ADS_MULT = 0.65;
const GRAVITY = 21.5;
const JUMP_VELOCITY = 7.4;

export class Player {
  /**
   * @param {import('../world/level.js').Level} level
   * @param {import('../engine/audio.js').SoundEngine} sound
   */
  constructor(level, sound) {
    this.level = level;
    this.sound = sound;

    this.position = new THREE.Vector3(0, 0, 18);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;

    this.crouchTarget = 0;
    this.crouchAmt = 0;
    this.crouchToggle = false;
    this.leanAmt = 0;
    this.sprintAmt = 0;
    this.adsAmt = 0;

    this.maxHp = 100;
    this.hp = 100;
    this.maxArmor = 50;
    this.armor = 50;
    this.speedMult = 1;

    this.bobPhase = 0;
    this.stepDistance = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.camShake = 0;
    this.damageVignette = 0;
    this.damageAngle = 0;
    this.damageAlpha = 0;
    this.flashAmt = 0;

    this._ray = new THREE.Raycaster();
    this._lastStepAt = -1;
    this._strInput = 0;
    this._moving = false;
    this._horizSpeed = 0;
    this._dead = false;
  }

  reset(operator) {
    this.maxHp = operator.hp;
    this.hp = operator.hp;
    this.maxArmor = operator.armor;
    this.armor = operator.armor;
    this.speedMult = operator.speedMult;

    this.position.set(0, 0, 18);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;
    this.crouchToggle = false;
    this.crouchAmt = 0;
    this.crouchTarget = 0;
    this.leanAmt = 0;
    this.sprintAmt = 0;
    this.adsAmt = 0;
    this.bobPhase = 0;
    this.stepDistance = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.camShake = 0;
    this.damageVignette = 0;
    this.damageAlpha = 0;
    this.flashAmt = 0;
    this._dead = false;
  }

  get eyeHeight() {
    return EYE_STAND - this.crouchAmt * (EYE_STAND - EYE_CROUCH);
  }

  get eyePosition() {
    return this.position.clone().add(new THREE.Vector3(0, this.eyeHeight, 0));
  }

  get isCrouched() {
    return this.crouchAmt > 0.5;
  }

  get isDead() {
    return this._dead;
  }

  toggleCrouch() {
    // Standing up requires headroom.
    if (this.crouchToggle && !this.#hasHeadroom()) return;
    this.crouchToggle = !this.crouchToggle;
  }

  #hasHeadroom() {
    const feet = this.position.y;
    const radius = PLAYER_RADIUS;
    const top = feet + EYE_STAND + 0.25;
    for (const c of this.level.colliders) {
      if (c.minY < feet + 0.5 || c.minY > top) continue;
      if (
        this.position.x + radius > c.minX &&
        this.position.x - radius < c.maxX &&
        this.position.z + radius > c.minZ &&
        this.position.z - radius < c.maxZ
      ) {
        return false;
      }
    }
    return true;
  }

  addDamage(dmg, source) {
    if (this._dead) return;

    let remaining = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.65);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.hp = Math.max(0, this.hp - remaining);
    this.damageVignette = Math.min(1, this.damageVignette + 0.55);
    this.camShake = Math.max(this.camShake, 0.02);
    this.damageAngle = relativeBearingDeg(source.x - this.position.x, source.z - this.position.z, this.yaw);
    this.damageAlpha = 1;
    if (this.hp <= 0) this._dead = true;
  }

  /** Apply damage and immediately report whether this hit was lethal. */
  takeHit(damage, source) {
    const wasAlive = !this._dead;
    this.addDamage(damage, source);
    return wasAlive && this._dead;
  }

  heal(hp, armor) {
    this.hp = Math.min(this.maxHp, this.hp + hp);
    this.armor = Math.min(this.maxArmor, this.armor + armor);
  }

  /**
   * Advance one frame.
   * @param {number} dt
   * @param {object} input snapshot { forward, strafe, sprint, crouchHeld, jump, ads, lean, moving }
   * @param {import('./weapon.js').WeaponController} weapon
   * @param {THREE.PerspectiveCamera} camera
   */
  update(dt, input, weapon, camera) {
    // --- Crouch -----------------------------------------------------------
    const wantsCrouch = this.crouchToggle || input.crouchHeld;
    if (!wantsCrouch && this.crouchAmt > 0.6 && !this.#hasHeadroom()) {
      this.crouchToggle = true;
    }
    this.crouchTarget = wantsCrouch ? 1 : 0;
    this.crouchAmt = damp(this.crouchAmt, this.crouchTarget, 10, dt);

    // --- Lean -------------------------------------------------------------
    this.leanAmt = damp(this.leanAmt, input.lean, 11, dt);

    // --- Sprint -----------------------------------------------------------
    const canSprint =
      input.moving &&
      input.forward > 0 &&
      input.sprint &&
      !input.ads &&
      this.crouchAmt < 0.25 &&
      weapon.canSprint;
    this.sprintAmt = damp(this.sprintAmt, canSprint ? 1 : 0, 10, dt);

    // --- ADS --------------------------------------------------------------
    const canAds = input.ads && !canSprint && weapon.canAds;
    this.adsAmt = damp(this.adsAmt, canAds ? 1 : 0, 14, dt);

    // --- Horizontal movement ---------------------------------------------
    let speed = WALK_SPEED * this.speedMult;
    if (canSprint) speed *= SPRINT_MULT;
    else if (this.crouchAmt > 0.5) speed *= CROUCH_MULT;
    else if (this.adsAmt > 0.5) speed *= ADS_MULT;

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const moveDir = new THREE.Vector3(
      -sinYaw * input.forward + cosYaw * input.strafe,
      0,
      -cosYaw * input.forward - sinYaw * input.strafe,
    );
    if (moveDir.lengthSq() > 0.001) moveDir.normalize();
    this._moving = moveDir.lengthSq() > 0.001;
    this._strInput = input.strafe;

    const accel = this.grounded ? 14 : 4;
    const blend = Math.min(1, dt * accel);
    this.velocity.x += (moveDir.x * speed - this.velocity.x) * blend;
    this.velocity.z += (moveDir.z * speed - this.velocity.z) * blend;

    // --- Jump / gravity ---------------------------------------------------
    if (input.jump && this.grounded) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
      this.crouchToggle = false;
    }
    this.velocity.y -= GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    this.#resolveCollisions();

    // World bounds.
    this.position.x = clamp(this.position.x, -48.5, 48.5);
    this.position.z = clamp(this.position.z, -48.5, 48.5);

    const floorY = this.level.getFloorHeight(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= floorY) {
      this.position.y = floorY;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y > floorY + 0.12) {
      this.grounded = false;
    }

    // --- Footsteps + bob --------------------------------------------------
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this._horizSpeed = horizontalSpeed;
    if (this.grounded && horizontalSpeed > 0.6) {
      this.bobPhase += dt * horizontalSpeed * 2.1;
      this.stepDistance += horizontalSpeed * dt;
      const stride = canSprint ? 2.1 : 1.75;
      if (this.stepDistance > stride) {
        this.stepDistance = 0;
        this.sound.playFootstep(this.level.getSurfaceType(this.position.x, this.position.z), canSprint);
      }
    } else {
      this.stepDistance = Math.min(this.stepDistance, 1.7);
    }

    // --- Effect decay -----------------------------------------------------
    this.camShake = Math.max(0, this.camShake - dt * 0.09);
    this.damageVignette = Math.max(0, this.damageVignette - dt * 0.65);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 0.55);
    this.damageAlpha = Math.max(0, this.damageAlpha - dt * 0.85);
    this.swayX *= Math.pow(0.01, dt);
    this.swayY *= Math.pow(0.01, dt);

    this.#updateCamera(dt, camera, weapon);
  }

  #resolveCollisions() {
    const feetY = this.position.y;
    const height = EYE_STAND - this.crouchAmt * (EYE_STAND - EYE_CROUCH);
    for (let iteration = 0; iteration < 2; iteration++) {
      for (const collider of this.level.colliders) {
        if (collider.maxY < feetY + 0.5 || collider.minY > feetY + height) continue;
        if (collider.minY >= feetY + STEP_HEIGHT) {
          // Overhead geometry (ceiling, awning, catwalk): the player walks
          // under it, so it must never push them sideways. It only stops a
          // jump that would put their head through it.
          this.#clampHead(collider, feetY, height);
          continue;
        }
        const closestX = clamp(this.position.x, collider.minX, collider.maxX);
        const closestZ = clamp(this.position.z, collider.minZ, collider.maxZ);
        let dx = this.position.x - closestX;
        let dz = this.position.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq >= PLAYER_RADIUS * PLAYER_RADIUS) continue;

        if (distSq < 1e-8) {
          // Centre inside the box: eject via the shallowest face.
          const left = this.position.x - collider.minX;
          const right = collider.maxX - this.position.x;
          const back = this.position.z - collider.minZ;
          const front = collider.maxZ - this.position.z;
          const min = Math.min(left, right, back, front);
          if (min === left) dx = -1;
          else if (min === right) dx = 1;
          else if (min === back) dz = -1;
          else dz = 1;
          this.position.x += dx * (min + PLAYER_RADIUS);
          this.position.z += dz * (min + PLAYER_RADIUS);
        } else {
          const dist = Math.sqrt(distSq);
          const push = PLAYER_RADIUS - dist;
          this.position.x += (dx / dist) * push;
          this.position.z += (dz / dist) * push;
        }
      }
    }
  }

  /** Stop an upward move from pushing the head through a ceiling. */
  #clampHead(collider, feetY, height) {
    if (this.velocity.y <= 0) return;
    const top = feetY + height;
    if (top <= collider.minY) return;
    if (
      this.position.x + PLAYER_RADIUS <= collider.minX ||
      this.position.x - PLAYER_RADIUS >= collider.maxX ||
      this.position.z + PLAYER_RADIUS <= collider.minZ ||
      this.position.z - PLAYER_RADIUS >= collider.maxZ
    ) {
      return;
    }
    this.position.y = Math.max(0, collider.minY - height);
    this.velocity.y = 0;
  }

  #updateCamera(dt, camera, weapon) {
    const eyeHeight = this.eyeHeight;
    const bobScale = (1 - this.adsAmt * 0.72) * Math.min(1, this._horizSpeed / 5);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.042 * bobScale;
    const bobPitch = -Math.sin(this.bobPhase * 2) * 0.008 * bobScale;

    // Wall-clamped shoulder lean.
    let leanOffset = this.leanAmt * 0.34;
    if (Math.abs(leanOffset) > 0.02) {
      const side = new THREE.Vector3(
        Math.cos(this.yaw) * Math.sign(leanOffset),
        0,
        -Math.sin(this.yaw) * Math.sign(leanOffset),
      );
      this._ray.set(
        new THREE.Vector3(this.position.x, this.position.y + eyeHeight, this.position.z),
        side,
        0,
        Math.abs(leanOffset) + 0.2,
      );
      const hits = this._ray.intersectObjects(this.level.rayMeshes, false);
      if (hits.length) leanOffset = Math.sign(leanOffset) * Math.max(0, hits[0].distance - 0.22);
    }

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    camera.position.set(
      this.position.x + cosYaw * leanOffset,
      this.position.y + eyeHeight + bobY,
      this.position.z - sinYaw * leanOffset,
    );

    const shakeX = (Math.random() - 0.5) * this.camShake;
    const shakeY = (Math.random() - 0.5) * this.camShake;
    const shakeZ = (Math.random() - 0.5) * this.camShake * 1.4;

    camera.rotation.set(
      this.pitch + weapon.recoilPitch + bobPitch + shakeX,
      this.yaw + weapon.recoilYaw + shakeY,
      -this.leanAmt * 0.19 - this._strInput * 0.02 + shakeZ,
      'YXZ',
    );

    const spec = WEAPONS[weapon.currentId];
    const targetFov = THREE.MathUtils.lerp(72 + this.sprintAmt * 4.5, spec.adsFov, this.adsAmt);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = damp(camera.fov, targetFov, 14, dt);
      camera.updateProjectionMatrix();
    }
  }
}
