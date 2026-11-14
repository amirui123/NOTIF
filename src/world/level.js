/**
 * SECTOR-7 tactical map: geometry, colliders, walkable floors, spawn/cover
 * nodes, destructible barrels and atmosphere props.
 *
 * Bug fixes vs. the original single-file build:
 *  - colliders now carry a stable `kind` so barrels can be removed/restored
 *    cleanly when they explode or the mission restarts
 *  - the warehouse "walkable" platform no longer blocks the player with a
 *    floating slab (its collider was registered while `walkable` was true)
 *  - instanced meshes are disposed in `dispose()` — switching quality used to
 *    leak geometry forever
 *  - `getFloorHeight` uses a tolerance that matches the character controller,
 *    eliminating the "stuck on the ramp" jitter
 */
import * as THREE from 'three';

export class Level {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../engine/textures.js').TextureFactory} tex
   */
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;

    /** @type {Array<{minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number,matType:string,kind:string,owner?:object}>} */
    this.colliders = [];
    /** @type {Array<object>} */
    this.floors = [];
    /** @type {THREE.Mesh[]} static meshes for raycasting */
    this.rayMeshes = [];
    this.barrels = [];
    this.spawnNodes = [];
    this.coverNodes = [];
    this.compoundLights = [];
    this.beacons = [];
    this.destructibles = [];

    /** @type {Set<THREE.Object3D>} everything created here, for disposal */
    this._owned = new Set();
    this._materials = new Map();
    this._geometries = new Set();
    this._disposables = [];
  }

  // ---------------------------------------------------------------- helpers

  /** Cache a MeshStandardMaterial per (texture, tint, metalness, roughness). */
  makeMaterial(textureKey, tint = 0xffffff, metalness = 0.05, roughness = 1.0) {
    const key = `${textureKey}|${tint}|${metalness}|${roughness}`;
    let mat = this._materials.get(key);
    if (mat) return mat;
    const set = this.tex.cache[textureKey];
    if (!set) throw new Error(`Missing texture set "${textureKey}"`);
    mat = new THREE.MeshStandardMaterial({
      color: tint,
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.roughnessMap,
      metalness,
      roughness,
    });
    this._materials.set(key, mat);
    return mat;
  }

  /** Create a one-off material that is disposed with the level. */
  ownMaterial(params) {
    const mat = new THREE.MeshStandardMaterial(params);
    this._materials.set(`own-${this._materials.size}`, mat);
    return mat;
  }

  #track(mesh) {
    this._owned.add(mesh);
    return mesh;
  }

  #registerCollider(box) {
    const collider = { matType: box.matType || 'concrete', kind: box.kind || 'static', ...box };
    this.colliders.push(collider);
    return collider;
  }

  /** Register an axis-aligned solid box (also used for raycasting). */
  addBox(
    x,
    yCenter,
    z,
    w,
    h,
    d,
    material,
    { matType = 'concrete', walkable = false, solid = true, kind = 'static' } = {},
  ) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this._geometries.add(geo);
    const mesh = this.#track(new THREE.Mesh(geo, material));
    mesh.position.set(x, yCenter, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isWorld: true, matType };
    this.scene.add(mesh);
    this.rayMeshes.push(mesh);

    const minX = x - w / 2;
    const maxX = x + w / 2;
    const minY = yCenter - h / 2;
    const maxY = yCenter + h / 2;
    const minZ = z - d / 2;
    const maxZ = z + d / 2;

    if (solid) this.#registerCollider({ minX, maxX, minY, maxY, minZ, maxZ, matType, kind, mesh });
    if (walkable) this.floors.push({ minX, maxX, minZ, maxZ, y: maxY, surface: matType });
    return mesh;
  }

  /** Sloped walkable ramp (quarter of a rotation) between two heights. */
  addRamp(x0, z0, x1, z1, y0, y1, width, axis, material, { matType = 'wood' } = {}) {
    const len = axis === 'z' ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
    const dy = y1 - y0;
    const hyp = Math.hypot(len, dy);
    const angle = Math.atan2(dy, len);
    const geo = new THREE.BoxGeometry(axis === 'z' ? width : hyp, 0.16, axis === 'z' ? hyp : width);
    this._geometries.add(geo);
    const mesh = this.#track(new THREE.Mesh(geo, material));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 0.06, (z0 + z1) / 2);
    if (axis === 'z') mesh.rotation.x = z1 > z0 ? -angle : angle;
    else mesh.rotation.z = x1 > x0 ? angle : -angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isWorld: true, matType };
    this.scene.add(mesh);
    this.rayMeshes.push(mesh);

    this.floors.push({
      minX: Math.min(x0, x1) - (axis === 'z' ? width / 2 : 0.2),
      maxX: Math.max(x0, x1) + (axis === 'z' ? width / 2 : 0.2),
      minZ: Math.min(z0, z1) - (axis === 'x' ? width / 2 : 0.2),
      maxZ: Math.max(z0, z1) + (axis === 'x' ? width / 2 : 0.2),
      rampAxis: axis,
      start: axis === 'z' ? z0 : x0,
      end: axis === 'z' ? z1 : x1,
      y0,
      y1,
      surface: matType,
    });
  }

  /** Destructible red fuel barrel. */
  addBarrel(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const bodyMat = this.makeMaterial('corrugated', 0xb91c1c, 0.55, 0.42);
    const ringMat = this.makeMaterial('gunmetal', 0x1e293b, 0.7, 0.5);
    const bodyGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16);
    this._geometries.add(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.575;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const ringGeo = new THREE.TorusGeometry(0.425, 0.024, 8, 16);
    this._geometries.add(ringGeo);
    for (const ry of [0.32, 0.82, 1.13]) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      group.add(ring);
    }

    this.scene.add(group);
    this._owned.add(group);

    const barrel = {
      mesh: body,
      group,
      pos: new THREE.Vector3(x, 0.58, z),
      hp: 40,
      maxHp: 40,
      exploded: false,
    };
    body.userData = { isWorld: true, matType: 'metal', barrel };
    this.rayMeshes.push(body);
    barrel.collider = this.#registerCollider({
      minX: x - 0.45,
      maxX: x + 0.45,
      minY: 0,
      maxY: 1.16,
      minZ: z - 0.45,
      maxZ: z + 0.45,
      matType: 'metal',
      kind: 'barrel',
      owner: barrel,
    });
    this.barrels.push(barrel);
    return barrel;
  }

  /** Restore a barrel (mission restart). */
  resetBarrels() {
    for (const barrel of this.barrels) {
      barrel.exploded = false;
      barrel.hp = barrel.maxHp;
      barrel.group.visible = true;
      barrel.collider.maxY = 1.16;
      if (!this.colliders.includes(barrel.collider)) this.colliders.push(barrel.collider);
    }
  }

  /** Permanently blow up a barrel: hide it and disable its collider. */
  destroyBarrel(barrel) {
    if (barrel.exploded) return false;
    barrel.exploded = true;
    barrel.group.visible = false;
    barrel.collider.maxY = -10;
    return true;
  }

  addSandbagWall(cx, cz, count, axis = 'x', tiers = 2) {
    const mat = this.makeMaterial('sandbag', 0xb6a98a, 0.02, 1.0);
    const geo = new THREE.CapsuleGeometry(0.24, 0.55, 4, 8);
    this._geometries.add(geo);
    for (let t = 0; t < tiers; t++) {
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) * 0.5) * 0.88 + (t % 2) * 0.16;
        const bag = this.#track(new THREE.Mesh(geo, mat));
        bag.scale.set(1, 1, 0.68);
        if (axis === 'x') {
          bag.rotation.z = Math.PI / 2;
          bag.position.set(cx + offset, 0.2 + t * 0.36, cz);
        } else {
          bag.rotation.x = Math.PI / 2;
          bag.position.set(cx, 0.2 + t * 0.36, cz + offset);
        }
        bag.castShadow = true;
        bag.receiveShadow = true;
        bag.userData = { isWorld: true, matType: 'dirt' };
        this.scene.add(bag);
        this.rayMeshes.push(bag);
      }
    }
    const span = count * 0.92;
    const height = tiers * 0.42 + 0.15;
    const box =
      axis === 'x'
        ? { minX: cx - span / 2, maxX: cx + span / 2, minY: 0, maxY: height, minZ: cz - 0.4, maxZ: cz + 0.4 }
        : { minX: cx - 0.4, maxX: cx + 0.4, minY: 0, maxY: height, minZ: cz - span / 2, maxZ: cz + span / 2 };
    this.#registerCollider({ ...box, matType: 'dirt' });
  }

  addPickupTruck(tx, tz, rotY) {
    const group = new THREE.Group();
    group.position.set(tx, 0, tz);
    group.rotation.y = rotY;

    const bodyMat = this.makeMaterial('gunmetal', 0x3b444b, 0.62, 0.48);
    const tireMat = this.makeMaterial('gunmetal', 0x16171a, 0.0, 0.9);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.12,
      metalness: 0.85,
      transparent: true,
      opacity: 0.72,
    });

    const chassisGeo = new THREE.BoxGeometry(2.15, 0.72, 5.1);
    const cabGeo = new THREE.BoxGeometry(2.02, 0.82, 1.95);
    this._geometries.add(chassisGeo).add(cabGeo);

    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.set(0, 0.72, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    const cab = new THREE.Mesh(cabGeo, bodyMat);
    cab.position.set(0, 1.44, 0.35);
    cab.castShadow = true;
    cab.receiveShadow = true;

    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.58, 0.08), glassMat);
    windowMesh.position.set(0, 1.46, 1.33);
    windowMesh.rotation.x = -0.22;

    const bullbar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.48, 0.18), tireMat);
    bullbar.position.set(0, 0.78, 2.62);

    group.add(chassis, cab, windowMesh, bullbar);

    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 14);
    this._geometries.add(wheelGeo);
    for (const [wx, wz] of [
      [-1.02, 1.65],
      [1.02, 1.65],
      [-1.02, -1.55],
      [1.02, -1.55],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.45, wz);
      wheel.castShadow = true;
      group.add(wheel);
    }

    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xfff5d6,
      emissive: 0xffd27d,
      emissiveIntensity: 1.4,
    });
    const headlightGeo = new THREE.BoxGeometry(0.28, 0.16, 0.06);
    this._geometries.add(headlightGeo);
    for (const hx of [-0.72, 0.72]) {
      const headlight = new THREE.Mesh(headlightGeo, headlightMat);
      headlight.position.set(hx, 0.84, 2.56);
      group.add(headlight);
    }

    this.scene.add(group);
    this._owned.add(group);

    for (const mesh of [chassis, cab]) {
      mesh.userData = { isWorld: true, matType: 'metal' };
      this.rayMeshes.push(mesh);
    }

    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const halfW = 1.15 * cos + 2.65 * sin;
    const halfD = 1.15 * sin + 2.65 * cos;
    this.#registerCollider({
      minX: tx - halfW,
      maxX: tx + halfW,
      minY: 0,
      maxY: 1.88,
      minZ: tz - halfD,
      maxZ: tz + halfD,
      matType: 'metal',
    });
  }

  // ------------------------------------------------------------------ build

  build() {
    const groundMat = this.makeMaterial('groundWet', 0x7a776e, 0.08, 1.0);
    const roadMat = this.makeMaterial('groundWet', 0x57595d, 0.12, 0.9);
    const concreteMat = this.makeMaterial('concrete', 0xb6b9bc, 0.05, 1.0);
    const darkConcreteMat = this.makeMaterial('concrete', 0x6c7278, 0.08, 1.0);
    const oliveMat = this.makeMaterial('corrugated', 0x4b5848, 0.45, 0.85);
    const blueMat = this.makeMaterial('corrugated', 0x3b5268, 0.48, 0.85);
    const rustMat = this.makeMaterial('corrugated', 0x7c4635, 0.35, 0.92);
    const woodMat = this.makeMaterial('wood', 0xa68967, 0.04, 1.0);

    // Ground + roads ------------------------------------------------------
    const groundGeo = new THREE.PlaneGeometry(150, 150, 16, 16);
    this._geometries.add(groundGeo);
    const ground = this.#track(new THREE.Mesh(groundGeo, groundMat));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData = { isWorld: true, matType: 'dirt' };
    this.scene.add(ground);
    this.rayMeshes.push(ground);

    const roadGeo = new THREE.PlaneGeometry(11, 128);
    const roadXGeo = new THREE.PlaneGeometry(110, 8.5);
    this._geometries.add(roadGeo).add(roadXGeo);
    const road = this.#track(new THREE.Mesh(roadGeo, roadMat));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.015;
    road.receiveShadow = true;
    road.userData = { isWorld: true, matType: 'concrete' };
    const roadX = this.#track(new THREE.Mesh(roadXGeo, roadMat));
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(0, 0.018, 6);
    roadX.receiveShadow = true;
    roadX.userData = { isWorld: true, matType: 'concrete' };
    this.scene.add(road, roadX);
    this.rayMeshes.push(road, roadX);

    // Enterable warehouse --------------------------------------------------
    this.addBox(-15, 0.07, -4, 14.5, 0.14, 20.5, darkConcreteMat, {
      matType: 'concrete',
      walkable: true,
      solid: false,
    });
    this.addBox(-22, 2.3, -9.5, 0.45, 4.6, 9, oliveMat, { matType: 'metal' });
    this.addBox(-22, 2.3, 1.5, 0.45, 4.6, 9, oliveMat, { matType: 'metal' });
    this.addBox(-8, 2.3, -10.5, 0.45, 4.6, 7, oliveMat, { matType: 'metal' });
    this.addBox(-8, 2.3, 2.5, 0.45, 4.6, 7, oliveMat, { matType: 'metal' });
    this.addBox(-19.5, 2.3, -14, 5, 4.6, 0.45, oliveMat, { matType: 'metal' });
    this.addBox(-10.5, 2.3, -14, 5, 4.6, 0.45, oliveMat, { matType: 'metal' });
    this.addBox(-15, 3.85, -14, 4.5, 1.5, 0.45, rustMat, { matType: 'metal' });
    this.addBox(-19.5, 2.3, 6, 5, 4.6, 0.45, oliveMat, { matType: 'metal' });
    this.addBox(-10.5, 2.3, 6, 5, 4.6, 0.45, oliveMat, { matType: 'metal' });
    this.addBox(-15, 3.85, 6, 4.5, 1.5, 0.45, rustMat, { matType: 'metal' });
    // Roof sits above the walkable slab; it must NOT create a floor at 4.9 m.
    this.addBox(-15, 4.75, -4, 15.2, 0.3, 21.2, darkConcreteMat, { matType: 'metal' });
    this.addBox(-17.8, 0.75, -6, 1.6, 1.5, 1.6, woodMat, { matType: 'wood', walkable: true });
    this.addBox(-17.8, 0.65, -4.2, 1.3, 1.3, 1.3, woodMat, { matType: 'wood', walkable: true });
    this.addBox(-11.5, 0.75, 0.5, 1.8, 1.5, 1.5, woodMat, { matType: 'wood', walkable: true });

    // Warehouse lights ------------------------------------------------------
    for (const lz of [-8.5, 0.5]) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe4b5 }),
      );
      bulb.position.set(-15, 4.45, lz);
      this.scene.add(bulb);
      const light = new THREE.PointLight(0xffcf87, 7, 18, 1.5);
      light.position.set(-15, 4.2, lz);
      this.scene.add(light);
      this.compoundLights.push({ light, baseIntensity: 7, flicker: lz < 0 });
    }

    // Watchtower + ramp -----------------------------------------------------
    const tx = 16;
    const tz = -19;
    for (const [px, pz] of [
      [tx - 2, tz - 2],
      [tx + 2, tz - 2],
      [tx - 2, tz + 2],
      [tx + 2, tz + 2],
    ]) {
      this.addBox(px, 2.6, pz, 0.32, 5.2, 0.32, woodMat, { matType: 'wood' });
    }
    this.addBox(tx, 3.1, tz, 4.8, 0.25, 4.8, woodMat, { matType: 'wood', walkable: true, solid: false });
    this.addBox(tx, 3.7, tz + 2.3, 4.8, 1.1, 0.2, woodMat, { matType: 'wood' });
    this.addBox(tx - 2.3, 3.7, tz, 0.2, 1.1, 4.4, woodMat, { matType: 'wood' });
    this.addBox(tx + 2.3, 3.7, tz, 0.2, 1.1, 4.4, woodMat, { matType: 'wood' });
    this.addBox(tx, 5.4, tz, 5.2, 0.2, 5.2, rustMat, { matType: 'metal' });
    this.addRamp(tx, tz - 9.0, tx, tz - 2.4, 0.0, 3.225, 1.8, 'z', woodMat, { matType: 'wood' });

    // Radio mast + beacon ---------------------------------------------------
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.35, 22, 6);
    this._geometries.add(mastGeo);
    const mast = this.#track(new THREE.Mesh(mastGeo, darkConcreteMat));
    mast.position.set(25, 11, -26);
    this.scene.add(mast);
    const beaconMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    beaconMesh.position.set(25, 22.2, -26);
    this.scene.add(beaconMesh);
    const beaconLight = new THREE.PointLight(0xff2222, 6, 22);
    beaconLight.position.set(25, 22.2, -26);
    this.scene.add(beaconLight);
    this.beacons.push({ mesh: beaconMesh, light: beaconLight });

    // Containers, bunkers, shacks ------------------------------------------
    this.addBox(12, 1.4, 2, 2.7, 2.8, 6.4, blueMat, { matType: 'metal', walkable: true });
    this.addBox(15.5, 1.4, -3.5, 6.4, 2.8, 2.7, rustMat, { matType: 'metal', walkable: true });
    this.addBox(22, 1.4, 10, 2.7, 2.8, 6.4, oliveMat, { matType: 'metal', walkable: true });
    this.addBox(25, 1.8, -5, 7, 3.6, 0.35, woodMat, { matType: 'wood' });
    this.addBox(25, 1.8, 1.5, 7, 3.6, 0.35, woodMat, { matType: 'wood' });
    this.addBox(28.4, 1.8, -1.75, 0.35, 3.6, 6.8, woodMat, { matType: 'wood' });
    this.addBox(25, 3.7, -1.75, 7.6, 0.25, 7.2, rustMat, { matType: 'metal' });
    this.addBox(-4, 1.3, -24, 5.5, 2.6, 4.2, concreteMat, { matType: 'concrete', walkable: true });

    // Cover & props ---------------------------------------------------------
    this.addSandbagWall(0, -10, 5, 'x', 2);
    this.addSandbagWall(-6, 12, 4, 'z', 2);
    this.addSandbagWall(8, 14, 4, 'x', 2);
    this.addSandbagWall(-27, -16, 4, 'z', 2);
    this.addSandbagWall(3, 25, 5, 'x', 2);
    this.addPickupTruck(-5.5, 3.5, 0.42);
    this.addPickupTruck(6.2, -16.5, -1.22);
    this.addPickupTruck(2.5, 31.0, 2.85);

    for (const [bx, bz] of [
      [-9.2, -9.2],
      [9.8, 0.4],
      [13.5, -6.2],
      [-2.5, 13.8],
      [19.5, 7.2],
      [-19.5, 12.0],
      [4.5, -22.5],
    ]) {
      this.addBarrel(bx, bz);
    }

    // Perimeter blast walls ------------------------------------------------
    for (let i = -48; i <= 48; i += 6) {
      if (Math.abs(i) > 7) {
        this.addBox(i, 0.85, -50, 5.6, 1.7, 0.8, darkConcreteMat, { matType: 'concrete' });
        this.addBox(i, 0.85, 50, 5.6, 1.7, 0.8, darkConcreteMat, { matType: 'concrete' });
      }
      if (Math.abs(i - 6) > 6) {
        this.addBox(-50, 0.85, i, 0.8, 1.7, 5.6, darkConcreteMat, { matType: 'concrete' });
        this.addBox(50, 0.85, i, 0.8, 1.7, 5.6, darkConcreteMat, { matType: 'concrete' });
      }
    }

    this.#buildBackdrop();
    this.#buildDust();
    this.#buildStreetLights();
    this.#defineNodes();
    return this;
  }

  #buildBackdrop() {
    const dummy = new THREE.Object3D();

    // Mountain ridges.
    const ridgeGeo = new THREE.ConeGeometry(34, 48, 7);
    const ridgeMat = this.ownMaterial({ color: 0x3b444a, roughness: 0.94 });
    const ridges = new THREE.InstancedMesh(ridgeGeo, ridgeMat, 26);
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const radius = 98 + (i % 3) * 26;
      dummy.position.set(Math.cos(angle) * radius, 18 + (i % 4) * 5, Math.sin(angle) * radius);
      dummy.scale.set(1.1 + (i % 3) * 0.45, 0.85 + (i % 5) * 0.25, 1.1 + (i % 2) * 0.4);
      dummy.rotation.set(0, i * 0.8, 0);
      dummy.updateMatrix();
      ridges.setMatrixAt(i, dummy.matrix);
    }
    ridges.instanceMatrix.needsUpdate = true;
    ridges.computeBoundingSphere();
    this.scene.add(ridges);
    this._disposables.push(ridges, ridgeGeo);

    // Valley bridge.
    const deckMat = this.makeMaterial('concrete', 0x6c7278, 0.08, 1.0);
    const deck = this.addBox(-18, 14, -84, 60, 1.6, 5, deckMat, { matType: 'concrete', solid: false });
    deck.castShadow = false;
    const pillarGeo = new THREE.BoxGeometry(3.2, 22, 4.8);
    this._geometries.add(pillarGeo);
    for (let bx = -40; bx <= 4; bx += 14) {
      const pillar = new THREE.Mesh(pillarGeo, deckMat);
      pillar.position.set(bx, 3, -84);
      this.scene.add(pillar);
      this._owned.add(pillar);
    }

    // Pine forest (instanced).
    const treeCount = 135;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 4.5, 6);
    const folGeo = new THREE.ConeGeometry(2.1, 7.5, 7);
    const trunkMat = this.ownMaterial({ color: 0x3a2b1d, roughness: 0.95 });
    const folMat = this.ownMaterial({ color: 0x223626, roughness: 0.88 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliage = new THREE.InstancedMesh(folGeo, folMat, treeCount);
    trunks.castShadow = true;
    foliage.castShadow = true;
    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + (i % 7) * 0.04;
      const dist = 54 + (i % 6) * 5.2;
      const scale = 0.8 + (i % 4) * 0.28;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      dummy.position.set(x, 2.2 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.set(0, i * 1.1, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 6.1 * scale, z);
      dummy.updateMatrix();
      foliage.setMatrixAt(i, dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    trunks.computeBoundingSphere();
    foliage.computeBoundingSphere();
    this.scene.add(trunks, foliage);
    this._disposables.push(trunks, foliage, trunkGeo, folGeo);
  }

  #buildDust() {
    const count = 240;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = 0.4 + Math.random() * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xdbe4ee,
      size: 0.09,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
    this._disposables.push(this.dustPoints, geo, mat);
  }

  #buildStreetLights() {
    const poleMat = this.makeMaterial('concrete', 0x6c7278, 0.08, 1.0);
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.2, 6);
    const lampGeo = new THREE.BoxGeometry(0.6, 0.3, 0.35);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    this._geometries.add(poleGeo).add(lampGeo);
    for (const [lx, lz] of [
      [-12, 10],
      [14, 6],
      [4, -22],
      [-24, -18],
    ]) {
      const pole = this.#track(new THREE.Mesh(poleGeo, poleMat));
      pole.position.set(lx, 3.6, lz);
      this.scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(lx, 7.1, lz);
      this.scene.add(lamp);
      const light = new THREE.PointLight(0xdbeafe, 0, 28, 1.5);
      light.position.set(lx, 6.8, lz);
      this.scene.add(light);
      this.compoundLights.push({ light, baseIntensity: 18, nightOnly: true });
    }
  }

  #defineNodes() {
    this.spawnNodes = [
      new THREE.Vector3(-42, 0, -40),
      new THREE.Vector3(0, 0, -44),
      new THREE.Vector3(41, 0, -38),
      new THREE.Vector3(43, 0, 6),
      new THREE.Vector3(38, 0, 42),
      new THREE.Vector3(-4, 0, 44),
      new THREE.Vector3(-42, 0, 38),
      new THREE.Vector3(-43, 0, -6),
    ];
    this.coverNodes = [
      new THREE.Vector3(0, 0, -11.5),
      new THREE.Vector3(-4.5, 0, 12),
      new THREE.Vector3(8, 0, 15.5),
      new THREE.Vector3(10.2, 0, 2),
      new THREE.Vector3(-6.2, 0, -4),
      new THREE.Vector3(-15, 0, -16),
      new THREE.Vector3(-15, 0, 8),
      new THREE.Vector3(15.5, 0, -5.5),
      new THREE.Vector3(20, 0, 10),
      new THREE.Vector3(6.2, 0, -19),
      new THREE.Vector3(-6.5, 0, 5.5),
      new THREE.Vector3(3, 0, 26.5),
      new THREE.Vector3(-25, 0, -16),
      new THREE.Vector3(16, 3.23, -19),
    ];
  }

  // ------------------------------------------------------------- queries

  /**
   * Highest walkable surface at (x, z) that the character can step onto.
   * @param {number} x
   * @param {number} z
   * @param {number} feetY current feet height (use Infinity to get the tallest)
   */
  getFloorHeight(x, z, feetY = Infinity) {
    const maxStep = 0.62;
    const tolerance = 0.05;
    let best = 0;
    for (let i = 0; i < this.floors.length; i++) {
      const f = this.floors[i];
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      let surfaceY = f.y;
      if (f.rampAxis) {
        const t = Math.max(0, Math.min(1, ((f.rampAxis === 'z' ? z : x) - f.start) / (f.end - f.start)));
        surfaceY = f.y0 + (f.y1 - f.y0) * t;
      }
      if (surfaceY <= feetY + maxStep + tolerance && surfaceY > best) best = surfaceY;
    }
    return best;
  }

  /** Surface material under a position (used for footstep audio). */
  getSurfaceType(x, z) {
    for (const f of this.floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return f.surface;
    }
    return Math.abs(x) < 5.5 ? 'concrete' : 'dirt';
  }

  /** True when a circle of radius `r` at (x, z) overlaps any collider. */
  collides(x, z, y, height = 1.7, radius = 0.4) {
    for (const c of this.colliders) {
      if (c.maxY < y + 0.5 || c.minY > y + height) continue;
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ)
        return true;
    }
    return false;
  }

  // ----------------------------------------------------------- lifecycle

  /** Animate ambient elements (flicker, beacon, dust drift). */
  update(elapsed, dt) {
    for (const item of this.compoundLights) {
      if (item.flicker) {
        item.light.intensity = item.baseIntensity * (Math.sin(elapsed * 31) > 0.85 ? 0.25 : 1.0);
      }
    }
    for (const beacon of this.beacons) {
      const on = Math.sin(elapsed * 3.5) > 0.2;
      beacon.light.intensity = on ? 6 : 0;
      beacon.mesh.visible = on;
    }
    if (this.dustPoints) this.dustPoints.rotation.y += dt * 0.012;
  }

  dispose() {
    for (const obj of this._owned) this.scene.remove(obj);
    for (const geo of this._geometries) geo.dispose();
    for (const entry of this._disposables) entry.dispose?.();
    for (const mat of this._materials.values()) mat.dispose();
    this._owned.clear();
    this._geometries.clear();
    this._materials.clear();
    this.rayMeshes = [];
    this.colliders = [];
    this.barrels = [];
  }
}
