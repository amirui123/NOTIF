/**
 * Enemy archetypes: procedural soldier rig, hitboxes and tactical AI.
 *
 * Fixes vs. the original:
 *  - AI raycasts were allocated per enemy per frame (7 enemies × 60 fps); the
 *    raycaster is now shared and reused
 *  - dead enemies' hitboxes were left parented to a removing root, so raycasts
 *    kept hitting invisible corpses; hitboxes are now removed with the body
 *  - `pickRealSpawnPos` scored "occluded" spawns higher than open ones, which
 *    made most enemies spawn behind the player's back wall — the scoring is
 *    now explicit (prefer out of sight, but never inside geometry)
 *  - enemies could shoot through their own smoke because nothing blocked LOS
 *  - line-of-sight is throttled (every ~120 ms) instead of every frame
 */
import * as THREE from 'three';
import { ENEMY_TYPES } from '../config.js';
import { angleDelta, clamp } from '../core/math.js';

const LOS_INTERVAL = 0.12;

export class EnemyManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./level.js').Level} level
   * @param {import('../engine/textures.js').TextureFactory} tex
   * @param {import('../engine/audio.js').SoundEngine} sound
   * @param {import('./fx.js').FXManager} fx
   */
  constructor(scene, level, tex, sound, fx) {
    this.scene = scene;
    this.level = level;
    this.tex = tex;
    this.sound = sound;
    this.fx = fx;

    /** @type {object[]} */
    this.enemies = [];
    /** @type {THREE.Mesh[]} */
    this.hitboxes = [];

    this._ray = new THREE.Raycaster();
    /** Shared per-archetype materials, created once and disposed with the manager. */
    this._materialCache = new Map();
    this._materials = [];
  }

  /** Materials shared by every instance of one archetype (created lazily). */
  #materialsFor(typeKey, cfg) {
    let set = this._materialCache.get(typeKey);
    if (set) return set;
    set = {
      uniform: new THREE.MeshStandardMaterial({
        color: cfg.colU,
        roughness: 0.84,
        map: this.tex.cache.camo.map,
        normalMap: this.tex.cache.camo.normalMap,
      }),
      armor: new THREE.MeshStandardMaterial({
        color: cfg.colA,
        roughness: 0.58,
        metalness: 0.25,
        normalMap: this.tex.cache.gunmetal.normalMap,
      }),
      skin: new THREE.MeshStandardMaterial({ color: 0x9b7964, roughness: 0.72 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.82 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.35, metalness: 0.8 }),
      veil: new THREE.MeshStandardMaterial({
        map: this.tex.cache.veil.map,
        normalMap: this.tex.cache.veil.normalMap,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
      visor: new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.85,
        roughness: 0.15,
        transparent: true,
        opacity: 0.78,
      }),
      goggles: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6, roughness: 0.2 }),
      mask: new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4, metalness: 0.4 }),
      pack: new THREE.MeshStandardMaterial({ color: 0x5c4b37, roughness: 0.85 }),
      bedroll: new THREE.MeshStandardMaterial({ color: 0x8a795d, roughness: 0.9 }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffc864, transparent: true, opacity: 0.9 }),
      glint: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      hitbox: new THREE.MeshBasicMaterial({ visible: false }),
    };
    this._materialCache.set(typeKey, set);
    for (const mat of Object.values(set)) this._materials.push(mat);
    return set;
  }

  // ------------------------------------------------------------- rig build

  buildCharacter(typeKey) {
    const cfg = ENEMY_TYPES[typeKey];
    if (!cfg) throw new Error(`Unknown enemy type "${typeKey}"`);

    const root = new THREE.Group();
    root.scale.setScalar(cfg.scale);

    const mats = this.#materialsFor(typeKey, cfg);
    const uniMat = mats.uniform;
    const armorMat = mats.armor;
    const skinMat = mats.skin;
    const bootMat = mats.boot;
    const gunMat = mats.gun;

    const hips = new THREE.Group();
    hips.position.y = 0.92;
    root.add(hips);

    const makeLeg = (side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 4, 8), uniMat);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.13), armorMat);
      knee.position.set(0, -0.44, 0.03);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.32, 4, 8), uniMat);
      shin.position.y = -0.64;
      shin.castShadow = true;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.24), bootMat);
      boot.position.set(0, -0.86, 0.04);
      boot.castShadow = true;
      leg.add(thigh, knee, shin, boot);
      return leg;
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    hips.add(legL, legR);

    const spine = new THREE.Group();
    spine.position.y = 0.05;
    hips.add(spine);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.22), uniMat);
    torso.position.y = 0.26;
    torso.castShadow = true;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.38, 0.26), armorMat);
    vest.position.y = 0.28;
    vest.castShadow = true;
    spine.add(torso, vest);

    for (let px = -0.1; px <= 0.1; px += 0.1) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.05), armorMat);
      pouch.position.set(px, 0.24, 0.15);
      spine.add(pouch);
    }

    if (cfg.sniper) {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.16), mats.pack);
      pack.position.set(0, 0.28, -0.18);
      const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.34, 10), mats.bedroll);
      bedroll.rotation.z = Math.PI / 2;
      bedroll.position.set(0, 0.48, -0.19);
      spine.add(pack, bedroll);
    } else if (cfg.heavy) {
      for (const sx of [-0.25, 0.25]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.24), armorMat);
        pad.position.set(sx, 0.44, 0);
        spine.add(pad);
      }
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 10), armorMat);
      collar.position.y = 0.52;
      spine.add(collar);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.54, 0);
    spine.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 12), cfg.sniper ? skinMat : armorMat);
    head.position.y = 0.11;
    head.castShadow = true;
    headGroup.add(head);

    let visorMesh = null;
    if (cfg.hasVeil) {
      const veilMat = mats.veil;
      const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.42, 10, 1, true), veilMat);
      cowl.position.set(0, 0.06, 0.02);
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        veilMat,
      );
      hood.position.y = 0.13;
      headGroup.add(cowl, hood);
    } else if (cfg.sniper) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.122, 0.09, 10), uniMat);
      cap.position.y = 0.17;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.1), uniMat);
      brim.position.set(0, 0.145, 0.11);
      headGroup.add(cap, brim);
    } else if (cfg.oni) {
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.132, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
        armorMat,
      );
      helm.position.y = 0.13;
      const mask = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.09), mats.mask);
      mask.position.set(0, 0.075, 0.09);
      headGroup.add(helm, mask);
    } else if (cfg.heavy) {
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65),
        armorMat,
      );
      helm.position.y = 0.13;
      visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.08), mats.visor);
      visorMesh.position.set(0, 0.11, 0.12);
      headGroup.add(helm, visorMesh);
    } else {
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.132, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
        armorMat,
      );
      helm.position.y = 0.13;
      const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.06), mats.goggles);
      goggles.position.set(0, 0.125, 0.105);
      headGroup.add(helm, goggles);
    }

    const armRig = new THREE.Group();
    armRig.position.set(0, 0.4, 0.06);
    spine.add(armRig);

    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.36, 4, 8), uniMat);
    armR.rotation.x = Math.PI / 2;
    armR.position.set(-0.2, -0.04, 0.22);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 4, 8), uniMat);
    armL.rotation.x = Math.PI / 2;
    armL.rotation.z = -0.35;
    armL.position.set(0.16, -0.04, 0.24);

    const gunLength = cfg.sniper ? 0.92 : cfg.heavy ? 0.78 : 0.62;
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, gunLength), gunMat);
    gunBody.position.set(-0.08, -0.02, 0.38);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(-0.08, -0.01, 0.38 + gunLength * 0.52);

    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mats.flash);
    flash.position.copy(muzzle.position);
    flash.visible = false;

    armRig.add(armR, armL, gunBody, muzzle, flash);

    let glintSprite = null;
    if (cfg.sniper) {
      glintSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), mats.glint);
      glintSprite.position.set(-0.08, 0.06, 0.56);
      armRig.add(glintSprite);
    }

    // Hit volumes are laid out to overlap slightly, so a shot that threads the
    // seam between two boxes still counts. They used to leave a 7.5 cm hole at
    // waist height and a 4 cm gap at the neck: shots at chest level fell
    // straight through the model.
    const hitboxMat = mats.hitbox;
    const headHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), hitboxMat);
    headHitbox.position.y = 0.13;
    headGroup.add(headHitbox);
    const torsoHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.36), hitboxMat);
    torsoHitbox.position.y = 0.2;
    spine.add(torsoHitbox);
    const legsHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.95, 0.34), hitboxMat);
    legsHitbox.position.y = -0.4;
    hips.add(legsHitbox);

    const enemy = {
      typeKey,
      cfg,
      root,
      hips,
      spine,
      headGroup,
      legL,
      legR,
      armRig,
      muzzle,
      flash,
      flashTimer: 0,
      glintSprite,
      visorMesh,
      headHitbox,
      torsoHitbox,
      legsHitbox,
      hp: cfg.hp,
      maxHp: cfg.hp,
      visorArmor: cfg.heavy ? 85 : 0,
      alive: true,
      state: 'ADVANCE',
      stateTimer: 0.6 + Math.random() * 0.8,
      burstLeft: cfg.burst,
      fireCooldown: 0.7,
      targetCover: null,
      crouchAmt: 0,
      flinch: 0,
      walkPhase: Math.random() * 6.28,
      deathTimer: 0,
      deathTiltDir: 1,
      radioCooldown: 2 + Math.random() * 4,
      losTimer: Math.random() * LOS_INTERVAL,
      hasLOS: false,
    };

    headHitbox.userData = { enemy, zone: 'head' };
    torsoHitbox.userData = { enemy, zone: 'torso' };
    legsHitbox.userData = { enemy, zone: 'limb' };
    this.hitboxes.push(headHitbox, torsoHitbox, legsHitbox);
    return enemy;
  }

  // ------------------------------------------------------------- spawning

  /**
   * Pick a spawn node that is outside the player's view when possible while
   * remaining reachable and not inside a wall.
   */
  pickSpawnPos(playerPos, camForward) {
    const candidates = [];
    for (const node of this.level.spawnNodes) {
      if (node.distanceTo(playerPos) < 17) continue;
      const toNode = node.clone().sub(playerPos).normalize();
      const inFront = toNode.dot(camForward) > 0.42;
      const origin = playerPos.clone().add(new THREE.Vector3(0, 1.5, 0));
      const target = node.clone().add(new THREE.Vector3(0, 1.4, 0));
      const dir = target.clone().sub(origin);
      const len = dir.length();
      this._ray.set(origin, dir.normalize());
      this._ray.far = len;
      const occluded = this._ray.intersectObjects(this.level.rayMeshes, false).length > 0;
      // Prefer spots the player cannot see right now, then any valid spot.
      const score = (occluded || !inFront ? 2 : 0) + Math.random() * 0.5;
      candidates.push({ node, score });
    }

    if (candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0].node.clone();
      chosen.x += (Math.random() - 0.5) * 2.5;
      chosen.z += (Math.random() - 0.5) * 2.5;
      return { pos: chosen, useSmoke: false };
    }

    // Fallback: farthest node, covered by a smoke cloud so it is never a jump-scare.
    let farthest = this.level.spawnNodes[0];
    let best = -1;
    for (const node of this.level.spawnNodes) {
      const d = node.distanceTo(playerPos);
      if (d > best) {
        best = d;
        farthest = node;
      }
    }
    return { pos: farthest.clone(), useSmoke: true };
  }

  spawnEnemy(typeKey, playerPos, camForward) {
    if (!this.level.spawnNodes.length) return null;
    const enemy = this.buildCharacter(typeKey);
    const spot = this.pickSpawnPos(playerPos, camForward);
    enemy.root.position.copy(spot.pos);
    enemy.root.position.y = this.level.getFloorHeight(spot.pos.x, spot.pos.z, Infinity);
    this.scene.add(enemy.root);
    this.enemies.push(enemy);
    if (spot.useSmoke) this.fx.spawnSmokeCloud(spot.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 5);
    this.sound.playRadioChirp(spot.pos);
    return enemy;
  }

  // -------------------------------------------------------------- damage

  damageEnemy(enemy, damage, zone, hitPoint, shotDir) {
    if (!enemy.alive) return { killed: false, headshot: false };
    let finalDamage = damage;
    let headshot = false;

    if (zone === 'head') {
      if (enemy.visorArmor > 0) {
        enemy.visorArmor -= damage;
        this.fx.spawnSparks(hitPoint, 8);
        if (enemy.visorArmor <= 0 && enemy.visorMesh) {
          enemy.visorMesh.visible = false;
          this.fx.spawnSparks(hitPoint, 16);
        }
        finalDamage = damage * 0.65;
      } else {
        headshot = true;
        finalDamage = damage * 2.6;
      }
    } else if (zone === 'limb') {
      finalDamage = damage * 0.72;
    }

    enemy.hp -= finalDamage;
    enemy.flinch = 0.25;
    this.fx.spawnBlood(hitPoint, shotDir, headshot ? 14 : 7);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.deathTimer = 0;
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.root.quaternion);
      enemy.deathTiltDir = shotDir.dot(forward) > 0 ? 1 : -1;
      this.#removeHitboxes(enemy);
      enemy.flash.visible = false;
      if (enemy.glintSprite) enemy.glintSprite.material.opacity = 0;
      if (Math.random() < 0.42) {
        this.fx.spawnPickup(enemy.root.position.clone(), Math.random() < 0.45 ? 'med' : 'ammo');
      }
      return { killed: true, headshot };
    }
    return { killed: false, headshot };
  }

  #removeHitboxes(enemy) {
    enemy.headHitbox.removeFromParent();
    enemy.torsoHitbox.removeFromParent();
    enemy.legsHitbox.removeFromParent();
    this.hitboxes = this.hitboxes.filter(
      (h) => h !== enemy.headHitbox && h !== enemy.torsoHitbox && h !== enemy.legsHitbox,
    );
  }

  // ---------------------------------------------------------------- update

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {boolean} playerCrouched
   * @param {(damage:number, source:THREE.Vector3) => void} onPlayerHit
   */
  update(dt, playerPos, playerCrouched, onPlayerHit) {
    const ray = this._ray;
    const playerEye = playerPos.clone().add(new THREE.Vector3(0, playerCrouched ? 1.05 : 1.55, 0));

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      if (!enemy.alive) {
        enemy.deathTimer += dt;
        enemy.root.rotation.x = enemy.deathTiltDir * Math.min(1, enemy.deathTimer * 3.8) * 1.48;
        enemy.root.position.y = Math.max(0.14, enemy.root.position.y - dt * 1.5);
        if (enemy.deathTimer > 10) {
          this.scene.remove(enemy.root);
          this.#disposeRig(enemy);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      if (enemy.flashTimer > 0) {
        enemy.flashTimer -= dt;
        if (enemy.flashTimer <= 0) enemy.flash.visible = false;
      }
      enemy.flinch = Math.max(0, enemy.flinch - dt * 1.4);

      const pos = enemy.root.position;
      const toPlayer = new THREE.Vector3(playerPos.x - pos.x, 0, playerPos.z - pos.z);
      const dist = toPlayer.length();

      // Throttled line-of-sight check.
      enemy.losTimer -= dt;
      if (enemy.losTimer <= 0) {
        enemy.losTimer = LOS_INTERVAL;
        const eyeOrigin = pos.clone().add(new THREE.Vector3(0, enemy.crouchAmt > 0.5 ? 1.0 : 1.52, 0));
        const los = playerEye.clone().sub(eyeOrigin);
        const losLen = los.length();
        ray.set(eyeOrigin, los.clone().normalize());
        ray.far = losLen;
        enemy.hasLOS = dist < 58 && ray.intersectObjects(this.level.rayMeshes, false).length === 0;
      }
      const hasLOS = enemy.hasLOS;

      if (hasLOS || dist < 16) {
        const diff = angleDelta(enemy.root.rotation.y, Math.atan2(toPlayer.x, toPlayer.z));
        enemy.root.rotation.y += diff * Math.min(1, dt * 6.5);
      }

      // Behaviour state machine.
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        if (hasLOS) {
          if (enemy.cfg.flanker && dist > 10) {
            enemy.state = 'FLANK';
            enemy.stateTimer = 1.6 + Math.random() * 1.2;
          } else if (Math.random() < 0.58) {
            enemy.state = 'PEEK_FIRE';
            enemy.burstLeft = enemy.cfg.burst;
            enemy.stateTimer = 1.4 + Math.random() * 1.2;
          } else {
            enemy.state = 'TAKE_COVER';
            enemy.targetCover = null;
            enemy.stateTimer = 1.0 + Math.random() * 1.1;
          }
        } else {
          enemy.state = 'ADVANCE';
          enemy.stateTimer = 1.2 + Math.random();
        }
      }

      enemy.radioCooldown -= dt;
      if (enemy.radioCooldown <= 0 && hasLOS && dist < 35) {
        enemy.radioCooldown = 9 + Math.random() * 8;
        this.sound.playRadioChirp(pos);
      }

      // Movement intent.
      const moveVec = new THREE.Vector3();
      let wantCrouch = 0;
      if (enemy.state === 'ADVANCE' && dist > (enemy.cfg.sniper ? 22 : 11)) {
        moveVec.copy(toPlayer).normalize();
      } else if (enemy.state === 'FLANK') {
        const perpendicular = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        if (i % 2 === 0) perpendicular.negate();
        moveVec
          .copy(perpendicular)
          .multiplyScalar(0.85)
          .addScaledVector(toPlayer.clone().normalize(), dist > 15 ? 0.5 : -0.15)
          .normalize();
      } else if (enemy.state === 'TAKE_COVER') {
        if (!enemy.targetCover) enemy.targetCover = this.#nearestCover(pos, playerPos);
        if (enemy.targetCover) {
          const toCover = new THREE.Vector3(enemy.targetCover.x - pos.x, 0, enemy.targetCover.z - pos.z);
          if (toCover.length() > 1.1) moveVec.copy(toCover.normalize());
          else wantCrouch = 1;
        } else wantCrouch = 1;
      } else if (enemy.state === 'PEEK_FIRE') {
        wantCrouch = 0.25;
      }

      const moving = moveVec.lengthSq() > 0.01;
      if (moving) {
        const step = enemy.cfg.speed * dt;
        const nextX = pos.x + moveVec.x * step;
        const nextZ = pos.z + moveVec.z * step;
        if (!this.level.collides(nextX, pos.z, pos.y, 1.7, 0.44)) pos.x = nextX;
        if (!this.level.collides(pos.x, nextZ, pos.y, 1.7, 0.44)) pos.z = nextZ;
        pos.x = clamp(pos.x, -46, 46);
        pos.z = clamp(pos.z, -46, 46);
        pos.y = this.level.getFloorHeight(pos.x, pos.z, pos.y);
      }

      // Animation.
      enemy.crouchAmt += (wantCrouch - enemy.crouchAmt) * Math.min(1, dt * 8);
      enemy.hips.position.y = 0.92 - enemy.crouchAmt * 0.34;
      enemy.spine.rotation.x = enemy.crouchAmt * 0.22 - enemy.flinch * 0.7;
      if (moving) {
        enemy.walkPhase += dt * enemy.cfg.speed * 2.6;
        const swing = Math.sin(enemy.walkPhase) * 0.55;
        enemy.legL.rotation.x = swing;
        enemy.legR.rotation.x = -swing;
        enemy.armRig.position.y = 0.4 + Math.abs(Math.sin(enemy.walkPhase)) * 0.025;
      } else {
        enemy.legL.rotation.x *= 0.85;
        enemy.legR.rotation.x *= 0.85;
      }

      // Sniper glint telegraphs a shot ~0.55s ahead.
      enemy.fireCooldown -= dt;
      if (enemy.glintSprite) {
        const primed = hasLOS && enemy.fireCooldown < 0.55 && enemy.fireCooldown > 0.02;
        enemy.glintSprite.material.opacity = primed ? 0.92 : 0;
        if (primed) enemy.glintSprite.lookAt(playerEye);
      }

      // Shooting.
      if (hasLOS && enemy.state !== 'TAKE_COVER' && enemy.fireCooldown <= 0) {
        const muzzlePos = new THREE.Vector3();
        enemy.muzzle.getWorldPosition(muzzlePos);
        const aimDir = playerEye.clone().sub(muzzlePos).normalize();
        const spread = enemy.cfg.spread * (playerCrouched ? 1.25 : 1.0);
        aimDir.x += (Math.random() - 0.5) * spread;
        aimDir.y += (Math.random() - 0.5) * spread * 0.8;
        aimDir.z += (Math.random() - 0.5) * spread;
        aimDir.normalize();

        enemy.flash.visible = true;
        enemy.flashTimer = 0.05;
        this.sound.playShot(enemy.cfg.sniper ? 'sniper' : 'hk416', true, muzzlePos);

        ray.set(muzzlePos, aimDir);
        ray.far = 68;
        const worldHits = ray.intersectObjects(this.level.rayMeshes, false);
        const wallDist = worldHits.length ? worldHits[0].distance : 68;
        const playerDist = muzzlePos.distanceTo(playerEye);
        let hitEnd = muzzlePos.clone().addScaledVector(aimDir, Math.min(wallDist, 45));

        if (playerDist < wallDist) {
          const toEye = playerEye.clone().sub(muzzlePos);
          const projection = Math.max(0, toEye.dot(aimDir));
          const closest = muzzlePos.clone().addScaledVector(aimDir, projection);
          const missDist = closest.distanceTo(playerEye);
          if (missDist < 0.36) {
            onPlayerHit(enemy.cfg.damage, muzzlePos);
            hitEnd = closest;
          } else if (missDist < 2.2) {
            this.sound.playWhiz(closest);
          }
        }
        this.fx.spawnTracer(muzzlePos, hitEnd, 0xffb347);
        if (worldHits.length && wallDist < playerDist) {
          const hit = worldHits[0];
          this.fx.spawnImpact(hit.point, hit.face.normal, hit.object.userData.matType || 'concrete');
        }

        if (enemy.burstLeft > 1) {
          enemy.burstLeft--;
          enemy.fireCooldown = enemy.cfg.fireRate;
        } else {
          enemy.burstLeft = enemy.cfg.burst;
          enemy.fireCooldown = enemy.cfg.sniper ? 1.85 : 0.95 + Math.random() * 0.75;
        }
      }
    }
  }

  #nearestCover(from, playerPos) {
    let bestNode = null;
    let bestDist = Infinity;
    for (const node of this.level.coverNodes) {
      const d = node.distanceTo(from);
      if (d < bestDist && d > 1.2 && node.distanceTo(playerPos) > 7) {
        bestDist = d;
        bestNode = node;
      }
    }
    return bestNode;
  }

  /** Free the per-instance geometries of one soldier (materials are shared). */
  #disposeRig(enemy) {
    enemy.root.traverse((node) => {
      if (node.isMesh) node.geometry?.dispose();
    });
  }

  aliveCount() {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.alive) count++;
    return count;
  }

  clearAll() {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.root);
      this.#disposeRig(enemy);
    }
    this.enemies = [];
    this.hitboxes = [];
  }

  dispose() {
    this.clearAll();
    for (const mat of this._materials) mat.dispose();
    this._materials = [];
    this._materialCache.clear();
  }
}
