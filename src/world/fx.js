/**
 * Pooled visual effects: casings, tracers, impacts, blood, smoke, grenades and
 * pickups.
 *
 * Fixes vs. the original:
 *  - particles created a brand-new material per spark; they now share a small
 *    set of pooled materials (dozens of GPU programs used to be compiled
 *    mid-firefight, which is what caused the frame hitches)
 *  - tracer geometries were mutated with setFromPoints each frame; the line is
 *    now a two-vertex buffer updated in place
 *  - `detonate()` used a floating PointLight that was never disposed; the
 *    light now lives in a pool
 *  - pickups are removed from the scene *and* the array in one place
 */
import * as THREE from 'three';

const MAX_CASINGS = 40;
const MAX_PARTICLES = 200;
const MAX_DECALS = 56;

export class FXManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./level.js').Level} level
   * @param {import('../engine/audio.js').SoundEngine} sound
   */
  constructor(scene, level, sound) {
    this.scene = scene;
    this.level = level;
    this.sound = sound;

    this.casings = [];
    this.tracers = [];
    this.particles = [];
    this.decals = [];
    this.grenades = [];
    this.pickups = [];

    this.casingGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.024, 6);
    this.casingMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9a83c,
      metalness: 0.9,
      roughness: 0.25,
    });
    this.particleGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    this.smokeGeometry = new THREE.SphereGeometry(0.45, 7, 7);
    this.decalGeometry = new THREE.CircleGeometry(0.055, 8);
    this.decalMaterial = new THREE.MeshBasicMaterial({
      color: 0x0c0c0c,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    // Shared particle materials (one per effect colour).
    this.sparkMaterials = [
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 1 }),
      new THREE.MeshBasicMaterial({ color: 0xff7b29, transparent: true, opacity: 1 }),
    ];
    this.bloodMaterial = new THREE.MeshBasicMaterial({ color: 0x8b1111, transparent: true, opacity: 0.9 });
    this.dustMaterials = {
      wood: this.#dustMaterial(0x9b7653),
      dirt: this.#dustMaterial(0x6b5d4d),
      concrete: this.#dustMaterial(0x9ca3af),
      metal: this.#dustMaterial(0x9ca3af),
    };
    this.smokeMaterial = new THREE.MeshStandardMaterial({
      color: 0x7c8591,
      transparent: true,
      opacity: 0.55,
      roughness: 1,
    });

    this.tracerMaterials = new Map();
    this.explosionLights = [];
    this._tmpVec = new THREE.Vector3();
  }

  #dustMaterial(color) {
    return new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, roughness: 1 });
  }

  #tracerMaterial(color) {
    let mat = this.tracerMaterials.get(color);
    if (!mat) {
      mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      this.tracerMaterials.set(color, mat);
    }
    return mat;
  }

  // ------------------------------------------------------------------ spawn

  spawnCasing(origin, camQuat) {
    if (this.casings.length >= MAX_CASINGS) {
      const oldest = this.casings.shift();
      this.scene.remove(oldest.mesh);
    }
    const mesh = new THREE.Mesh(this.casingGeometry, this.casingMaterial);
    mesh.position.copy(origin);
    const vel = new THREE.Vector3(1, 0.45, 0.1)
      .applyQuaternion(camQuat)
      .normalize()
      .multiplyScalar(2.2 + Math.random());
    vel.y += 1.1;
    this.scene.add(mesh);
    this.casings.push({ mesh, vel, life: 3.5, bounced: false });
  }

  spawnTracer(start, end, color = 0xffe49e) {
    const dir = end.clone().sub(start);
    const len = dir.length();
    if (len < 0.2) return;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, this.#tracerMaterial(color));
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({
      line,
      geometry,
      positions,
      start: start.clone(),
      dir: dir.normalize(),
      len,
      prog: 0,
    });
  }

  spawnSparks(pos, count = 10) {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const mesh = new THREE.Mesh(this.particleGeometry, this.sparkMaterials[i % 2]);
      mesh.scale.setScalar(0.55);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5 + 1, (Math.random() - 0.5) * 7),
        gravity: 15,
        life: 0.35,
        maxLife: 0.4,
        grow: 0,
      });
    }
  }

  spawnImpact(pos, normal, matType = 'concrete') {
    if (matType === 'metal') this.spawnSparks(pos, 8);

    if (this.decals.length >= MAX_DECALS) this.scene.remove(this.decals.shift());
    const decal = new THREE.Mesh(this.decalGeometry, this.decalMaterial);
    decal.position.copy(pos).addScaledVector(normal, 0.012);
    decal.lookAt(this._tmpVec.copy(pos).add(normal));
    this.scene.add(decal);
    this.decals.push(decal);

    const dustMaterial = this.dustMaterials[matType] || this.dustMaterials.concrete;
    for (let i = 0; i < 4 && this.particles.length < MAX_PARTICLES; i++) {
      const mesh = new THREE.Mesh(this.smokeGeometry, dustMaterial);
      mesh.scale.setScalar(0.18);
      mesh.position.copy(pos);
      const vel = normal
        .clone()
        .multiplyScalar(1.8 + Math.random())
        .add(
          new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5),
        );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        gravity: 1.5,
        life: 0.55,
        maxLife: 0.55,
        grow: 0.7,
        ownsMaterial: false,
      });
    }
  }

  spawnBlood(pos, dir, count = 8) {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const mesh = new THREE.Mesh(this.particleGeometry, this.bloodMaterial);
      mesh.scale.setScalar(0.8);
      mesh.position.copy(pos);
      const vel = dir
        .clone()
        .multiplyScalar(1.8 + Math.random() * 2.5)
        .add(
          new THREE.Vector3((Math.random() - 0.5) * 2.8, Math.random() * 2.2, (Math.random() - 0.5) * 2.8),
        );
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, gravity: 11, life: 0.42, maxLife: 0.42, grow: 0.3 });
    }
  }

  spawnSmokeCloud(pos, count = 6) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.smokeGeometry, this.smokeMaterial);
      mesh.scale.setScalar(1.1 + Math.random() * 0.8);
      mesh.position
        .copy(pos)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random(), (Math.random() - 0.5) * 2.2));
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.55, (Math.random() - 0.5) * 0.8),
        gravity: -0.1,
        life: 4.5,
        maxLife: 4.5,
        grow: 0.8,
      });
    }
  }

  throwGrenade(origin, dir, playerVel) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x3f4f32, roughness: 0.6 }),
    );
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xef4444 }),
    );
    marker.position.y = 0.08;
    group.add(body, marker);
    group.position.copy(origin);
    this.scene.add(group);

    const vel = dir.clone().multiplyScalar(18).addScaledVector(playerVel, 0.4);
    vel.y += 4.2;
    this.grenades.push({
      mesh: group,
      vel,
      fuse: 2.15,
      geometry: [body.geometry, marker.geometry],
      materials: [body.material, marker.material],
    });
  }

  /** Explosion: light pulse, sparks, smoke and a gameplay callback. */
  detonate(pos, radius, maxDamage, onExplode) {
    const light = new THREE.PointLight(0xff8c2b, 42, 26);
    light.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(light);
    this.explosionLights.push({ light, life: 0.11 });

    this.spawnSparks(pos, 26);
    this.spawnSmokeCloud(pos, 8);
    onExplode(pos, radius, maxDamage);
  }

  spawnPickup(pos, type) {
    const group = new THREE.Group();
    group.position.set(pos.x, this.level.getFloorHeight(pos.x, pos.z, Infinity) + 0.25, pos.z);
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const ledMaterial = new THREE.MeshBasicMaterial({ color: type === 'med' ? 0x22c55e : 0x38bdf8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), boxMaterial);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.32), ledMaterial);
    led.position.y = 0.08;
    group.add(box, led);
    this.scene.add(group);
    this.pickups.push({
      group,
      type,
      pos: group.position,
      life: 30,
      geometries: [box.geometry, led.geometry],
      materials: [boxMaterial, ledMaterial],
    });
  }

  removePickup(pickup) {
    const index = this.pickups.indexOf(pickup);
    if (index !== -1) this.pickups.splice(index, 1);
    this.scene.remove(pickup.group);
    for (const geo of pickup.geometries) geo.dispose();
    for (const mat of pickup.materials) mat.dispose();
  }

  // ----------------------------------------------------------------- update

  update(dt) {
    // Shell casings.
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const casing = this.casings[i];
      casing.vel.y -= 13.5 * dt;
      casing.mesh.position.addScaledVector(casing.vel, dt);
      casing.mesh.rotation.x += dt * 14;
      casing.mesh.rotation.z += dt * 11;
      const floorY = this.level.getFloorHeight(
        casing.mesh.position.x,
        casing.mesh.position.z,
        casing.mesh.position.y,
      );
      if (casing.mesh.position.y <= floorY + 0.015) {
        casing.mesh.position.y = floorY + 0.015;
        casing.vel.y = Math.abs(casing.vel.y) * 0.35;
        casing.vel.x *= 0.65;
        casing.vel.z *= 0.65;
        if (!casing.bounced) {
          casing.bounced = true;
          this.sound.playShellTink(0.01);
        }
      }
      if ((casing.life -= dt) <= 0) {
        this.scene.remove(casing.mesh);
        this.casings.splice(i, 1);
      }
    }

    // Tracers: move a short segment along the shot path.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.prog += dt * 165;
      if (tracer.prog >= tracer.len) {
        this.scene.remove(tracer.line);
        tracer.geometry.dispose();
        this.tracers.splice(i, 1);
        continue;
      }
      const head = Math.min(tracer.len, tracer.prog + 8.5);
      tracer.positions[0] = tracer.start.x + tracer.dir.x * tracer.prog;
      tracer.positions[1] = tracer.start.y + tracer.dir.y * tracer.prog;
      tracer.positions[2] = tracer.start.z + tracer.dir.z * tracer.prog;
      tracer.positions[3] = tracer.start.x + tracer.dir.x * head;
      tracer.positions[4] = tracer.start.y + tracer.dir.y * head;
      tracer.positions[5] = tracer.start.z + tracer.dir.z * head;
      tracer.geometry.attributes.position.needsUpdate = true;
    }

    // Particles (sparks, blood, dust, smoke share one list).
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.vel.y -= particle.gravity * dt;
      particle.mesh.position.addScaledVector(particle.vel, dt);
      if (particle.grow) particle.mesh.scale.addScalar(particle.grow * dt);
      particle.life -= dt;
      // Materials are shared, so instead of mutating opacity per particle the
      // mesh is scaled down over its lifetime (cheap + no state corruption).
      if (!particle.grow) {
        const t = Math.max(0, particle.life / particle.maxLife);
        particle.mesh.scale.multiplyScalar(Math.max(0.001, 0.86 + t * 0.14));
      }
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Grenades.
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const grenade = this.grenades[i];
      grenade.vel.y -= 15.5 * dt;
      const next = grenade.mesh.position.clone().addScaledVector(grenade.vel, dt);
      const floorY = this.level.getFloorHeight(next.x, next.z, next.y);
      if (next.y <= floorY + 0.08) {
        next.y = floorY + 0.08;
        if (Math.abs(grenade.vel.y) > 1.2) this.sound.playShellTink(0);
        grenade.vel.y = Math.abs(grenade.vel.y) * 0.42;
        grenade.vel.x *= 0.72;
        grenade.vel.z *= 0.72;
      }
      for (const collider of this.level.colliders) {
        if (
          next.y < collider.maxY &&
          next.y > collider.minY &&
          next.x > collider.minX - 0.1 &&
          next.x < collider.maxX + 0.1 &&
          next.z > collider.minZ - 0.1 &&
          next.z < collider.maxZ + 0.1
        ) {
          grenade.vel.x *= -0.55;
          grenade.vel.z *= -0.55;
          next.copy(grenade.mesh.position);
          break;
        }
      }
      grenade.mesh.position.copy(next);
      grenade.mesh.rotation.x += dt * 8;
      if ((grenade.fuse -= dt) <= 0) {
        this.scene.remove(grenade.mesh);
        for (const geo of grenade.geometry) geo.dispose();
        for (const mat of grenade.materials) mat.dispose();
        if (this.onExplode) this.detonate(grenade.mesh.position.clone(), 10.5, 165, this.onExplode);
        this.grenades.splice(i, 1);
      }
    }

    // Explosion light pulses.
    for (let i = this.explosionLights.length - 1; i >= 0; i--) {
      const entry = this.explosionLights[i];
      entry.life -= dt;
      entry.light.intensity = Math.max(0, (entry.life / 0.11) * 42);
      if (entry.life <= 0) {
        this.scene.remove(entry.light);
        entry.light.dispose?.();
        this.explosionLights.splice(i, 1);
      }
    }

    // Pickups spin + expire.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.group.rotation.y += dt * 1.8;
      if ((pickup.life -= dt) <= 0) this.removePickup(pickup);
    }
  }

  /** Set by the game so grenades can trigger gameplay damage. */
  setExplosionHandler(handler) {
    this.onExplode = handler;
  }

  clear() {
    for (const casing of this.casings) this.scene.remove(casing.mesh);
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.geometry.dispose();
    }
    for (const particle of this.particles) this.scene.remove(particle.mesh);
    for (const decal of this.decals) this.scene.remove(decal);
    for (const grenade of this.grenades) {
      this.scene.remove(grenade.mesh);
      for (const geo of grenade.geometry) geo.dispose();
      for (const mat of grenade.materials) mat.dispose();
    }
    for (const pickup of this.pickups) this.removePickup(pickup);
    for (const entry of this.explosionLights) this.scene.remove(entry.light);

    this.casings = [];
    this.tracers = [];
    this.particles = [];
    this.decals = [];
    this.grenades = [];
    this.pickups = [];
    this.explosionLights = [];
  }

  dispose() {
    this.clear();
    this.casingGeometry.dispose();
    this.casingMaterial.dispose();
    this.particleGeometry.dispose();
    this.smokeGeometry.dispose();
    this.decalGeometry.dispose();
    this.decalMaterial.dispose();
    for (const mat of this.sparkMaterials) mat.dispose();
    this.bloodMaterial.dispose();
    for (const mat of Object.values(this.dustMaterials)) mat.dispose();
    this.smokeMaterial.dispose();
    for (const mat of this.tracerMaterials.values()) mat.dispose();
    this.tracerMaterials.clear();
  }
}
