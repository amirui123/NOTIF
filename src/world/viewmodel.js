/**
 * First-person viewmodel: the weapon, optics, arms and gadget meshes that are
 * parented to the camera and animated by the weapon controller.
 *
 * Fixes vs. the original:
 *  - materials and geometries for the viewmodel are tracked and disposed on
 *    weapon swap (each swap used to leak ~40 objects and textures)
 *  - the laser line now starts at the weapon's emitter and is aimed from the
 *    actual muzzle instead of a hard-coded local offset
 *  - arm/glove materials are reused instead of rebuilt per mount
 */
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { makeReticleTexture } from '../engine/textures.js';

/**
 * @param {string} weaponId
 * @param {import('../config.js').OPERATORS[number]} operator
 * @param {import('../engine/textures.js').TextureFactory} tex
 */
export function buildViewmodel(weaponId, operator, tex) {
  const spec = WEAPONS[weaponId];
  if (!spec) throw new Error(`Unknown weapon "${weaponId}"`);

  const meshes = [];
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  const track = (obj) => {
    obj.traverse?.((node) => {
      if (node.isMesh) {
        meshes.push(node);
        if (node.geometry) geometries.add(node.geometry);
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of mats) if (m) materials.add(m);
      }
    });
    return obj;
  };

  const root = new THREE.Group();
  const gun = new THREE.Group();
  root.add(gun);

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x262a30,
    metalness: 0.85,
    roughness: 0.3,
    normalMap: tex.cache.gunmetal.normalMap,
    roughnessMap: tex.cache.gunmetal.roughnessMap,
  });
  const polyMat = new THREE.MeshStandardMaterial({
    color: 0x16181c,
    metalness: 0.12,
    roughness: 0.72,
    normalMap: tex.cache.gunmetal.normalMap,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6b442a,
    roughness: 0.65,
    map: tex.cache.wood.map,
    normalMap: tex.cache.wood.normalMap,
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a438, metalness: 0.92, roughness: 0.22 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.2,
    roughness: 0.05,
    transparent: true,
    opacity: 0.22,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

  const isPistol = weaponId === 'p226';
  const isSniper = weaponId === 'kar98';
  const isLmg = weaponId === 'm249';
  const isMp7 = weaponId === 'mp7';

  const boltPart = new THREE.Group();
  const magPart = new THREE.Group();
  let feedCoverPart = null;
  let opticY = 0.145;
  let muzzleZ = -0.52;

  if (isPistol) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, 0.18), polyMat);
    frame.position.set(0, 0.068, -0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.095, 0.042), polyMat);
    grip.position.set(0, 0.015, 0.045);
    grip.rotation.x = 0.24;
    gun.add(frame, grip);

    boltPart.position.set(0, 0.092, -0.02);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.19), metalMat);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.006), glowMat);
    frontSight.position.set(0, 0.018, -0.085);
    const rearLeft = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.008, 0.006), metalMat);
    rearLeft.position.set(-0.006, 0.018, 0.082);
    const rearRight = rearLeft.clone();
    rearRight.position.x = 0.006;
    boltPart.add(slide, frontSight, rearLeft, rearRight);
    gun.add(boltPart);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 10), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.09, -0.04);
    gun.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.095, 0.032), metalMat);
    mag.position.set(0, 0.01, 0.048);
    mag.rotation.x = 0.24;
    magPart.add(mag);
    gun.add(magPart);

    opticY = 0.118;
    muzzleZ = -0.14;
  } else {
    const receiverLength = isMp7 ? 0.24 : isLmg ? 0.34 : 0.28;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.052, receiverLength), metalMat);
    upper.position.set(0, 0.082, 0);
    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.038, receiverLength * 0.85),
      isSniper ? woodMat : polyMat,
    );
    lower.position.set(0, 0.048, 0.015);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.105, 0.042), isSniper ? woodMat : polyMat);
    grip.position.set(0, -0.005, 0.085);
    grip.rotation.x = 0.28;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.085, 0.22), isSniper ? woodMat : polyMat);
    stock.position.set(0, 0.058, 0.21);
    gun.add(upper, lower, grip, stock);

    for (let rz = -receiverLength * 0.45; rz < receiverLength * 0.45; rz += 0.018) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.007, 0.01), metalMat);
      rail.position.set(0, 0.111, rz);
      gun.add(rail);
    }

    const handguardLength = isMp7 ? 0.12 : isSniper ? 0.38 : 0.26;
    const handguard = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.048, handguardLength),
      isSniper ? woodMat : isLmg ? polyMat : metalMat,
    );
    handguard.position.set(0, 0.08, -receiverLength * 0.5 - handguardLength * 0.46);
    gun.add(handguard);

    const barrelLength = isMp7 ? 0.18 : isSniper ? 0.62 : 0.42;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, barrelLength, 12), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.084, -receiverLength * 0.5 - barrelLength * 0.45);
    gun.add(barrel);
    muzzleZ = -receiverLength * 0.5 - barrelLength * 0.92;

    if (spec.suppressed) {
      const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 14), polyMat);
      suppressor.rotation.x = Math.PI / 2;
      suppressor.position.set(0, 0.084, muzzleZ - 0.04);
      gun.add(suppressor);
      muzzleZ -= 0.12;
    } else {
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.055, 10), metalMat);
      brake.rotation.x = Math.PI / 2;
      brake.position.set(0, 0.084, muzzleZ);
      gun.add(brake);
      muzzleZ -= 0.03;
    }

    boltPart.position.set(0, 0.095, 0.02);
    if (isSniper) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 10), metalMat);
      rod.rotation.x = Math.PI / 2;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.055, 8), metalMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0.028, 0, 0.02);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), metalMat);
      knob.position.set(0.055, -0.004, 0.02);
      boltPart.add(rod, handle, knob);
    } else {
      const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.024), metalMat);
      chargingHandle.position.set(0.015, 0, 0.09);
      boltPart.add(chargingHandle);
    }
    gun.add(boltPart);

    if (isLmg) {
      const ammoBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.12, 0.11),
        new THREE.MeshStandardMaterial({ color: 0x3b4832, roughness: 0.7 }),
      );
      ammoBox.position.set(-0.015, -0.035, -0.06);
      magPart.add(ammoBox);
      for (let i = 0; i < 6; i++) {
        const round = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.038, 6), brassMat);
        round.rotation.x = Math.PI / 2;
        round.position.set(-0.045 + i * 0.008, 0.04 + Math.sin(i * 0.4) * 0.025, -0.05);
        magPart.add(round);
      }
      feedCoverPart = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.018, 0.16), metalMat);
      feedCoverPart.position.set(0, 0.116, -0.03);
      gun.add(feedCoverPart);
    } else if (!isSniper) {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.145, 0.055), polyMat);
      mag.position.set(0, -0.035, -0.055);
      mag.rotation.x = -0.14;
      const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 6), brassMat);
      bullet.rotation.x = Math.PI / 2;
      bullet.position.set(0, 0.038, -0.045);
      magPart.add(mag, bullet);
    } else {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.06, 0.05), brassMat);
      clip.position.set(0, 0.025, -0.03);
      magPart.add(clip);
    }
    gun.add(magPart);

    // Optics -------------------------------------------------------------
    const reticle = makeReticleTexture(spec.opticType);
    textures.add(reticle);

    if (spec.opticType === 'holo' || spec.opticType === 'reflex') {
      opticY = isLmg ? 0.155 : isMp7 ? 0.142 : 0.145;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.066), metalMat);
      base.position.set(0, opticY - 0.022, -0.02);
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.038, 0.062), metalMat);
      leftWall.position.set(-0.02, opticY, -0.02);
      const rightWall = leftWall.clone();
      rightWall.position.x = 0.02;
      const topWall = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.062), metalMat);
      topWall.position.set(0, opticY + 0.02, -0.02);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), lensMat);
      lens.position.set(0, opticY, -0.032);
      const ret = new THREE.Mesh(
        new THREE.PlaneGeometry(0.026, 0.026),
        new THREE.MeshBasicMaterial({
          map: reticle,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ret.position.set(0, opticY, -0.025);
      gun.add(base, leftWall, rightWall, topWall, lens, ret);
    } else {
      opticY = isSniper ? 0.146 : 0.148;
      const scopeLength = isSniper ? 0.24 : 0.13;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, scopeLength, 16, 1, true),
        metalMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, opticY, -0.02);
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.028, 0.06), metalMat);
      mount.position.set(0, opticY - 0.024, -0.02);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), lensMat);
      lens.position.set(0, opticY, -0.02 + scopeLength * 0.45);
      const ret = new THREE.Mesh(
        new THREE.CircleGeometry(0.019, 16),
        new THREE.MeshBasicMaterial({ map: reticle, transparent: true, depthWrite: false }),
      );
      ret.position.set(0, opticY, -0.02 + scopeLength * 0.42);
      gun.add(ring, mount, lens, ret);
      if (spec.opticType === 'acog') {
        const fiber = new THREE.Mesh(
          new THREE.CylinderGeometry(0.003, 0.003, 0.07, 8),
          new THREE.MeshBasicMaterial({ color: 0xff4500 }),
        );
        fiber.rotation.x = Math.PI / 2;
        fiber.position.set(0, opticY + 0.024, -0.02);
        gun.add(fiber);
      }
    }

    const peq = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.022, 0.065), polyMat);
    peq.position.set(0.035, 0.086, -receiverLength * 0.5 - handguardLength * 0.65);
    gun.add(peq);
  }

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.086, muzzleZ);
  gun.add(muzzlePoint);

  const ejectPoint = new THREE.Object3D();
  ejectPoint.position.set(0.028, 0.095, -0.01);
  gun.add(ejectPoint);

  // Muzzle flash: crossed quads so it reads from every angle.
  const flashGroup = new THREE.Group();
  flashGroup.position.copy(muzzlePoint.position);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), flashMat);
    plane.rotation.z = (i * Math.PI) / 3;
    flashGroup.add(plane);
  }
  flashGroup.visible = false;
  gun.add(flashGroup);

  const flashlight = new THREE.SpotLight(0xeef6ff, 0, 46, Math.PI / 6.2, 0.48, 1.3);
  flashlight.position.set(0.03, 0.07, muzzleZ + 0.12);
  flashlight.target.position.set(0.03, 0.07, muzzleZ - 14);
  gun.add(flashlight, flashlight.target);

  // Laser: the geometry is refreshed every frame from the real aim point.
  const laserGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.038, 0.088, muzzleZ + 0.15),
    new THREE.Vector3(0, 0.088, -30),
  ]);
  const laserLine = new THREE.Line(
    laserGeometry,
    new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45 }),
  );
  laserLine.visible = false;
  laserLine.frustumCulled = false;
  gun.add(laserLine);

  const laserDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
  );
  laserDot.visible = false;

  // Arms -----------------------------------------------------------------
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: operator.sleeveColor,
    roughness: 0.85,
    map: tex.cache.camo.map,
    normalMap: tex.cache.camo.normalMap,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: operator.gloveColor,
    roughness: 0.7,
    metalness: 0.12,
    normalMap: tex.cache.gunmetal.normalMap,
  });
  const cuffMat = new THREE.MeshStandardMaterial({ color: operator.cuffAccent, roughness: 0.78 });

  const makeArm = (isLeft) => {
    const arm = new THREE.Group();
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.056, 0.36, 10), sleeveMat);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.z = 0.21;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.035, 10), cuffMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.055;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.044, 0.075), gloveMat);
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.032, 0.042), gloveMat);
    finger.position.set(isLeft ? 0.015 : -0.015, -0.014, -0.032);
    arm.add(forearm, cuff, hand, finger);
    return arm;
  };

  const rightArm = makeArm(false);
  rightArm.position.set(0.035, -0.025, 0.11);
  rightArm.rotation.set(0.18, -0.22, -0.15);
  gun.add(rightArm);

  const leftArm = makeArm(true);
  const leftRestPos = isPistol
    ? new THREE.Vector3(-0.025, -0.03, 0.05)
    : new THREE.Vector3(-0.026, 0.038, -0.24);
  const leftRestRot = isPistol ? new THREE.Euler(0.15, 0.45, 0.2) : new THREE.Euler(0.12, 0.42, 0.35);
  leftArm.position.copy(leftRestPos);
  leftArm.rotation.copy(leftRestRot);
  gun.add(leftArm);

  track(root);

  // Shadow-free viewmodel: it is lit by the scene, but must never self-shadow
  // the player camera (the original enabled castShadow on gun meshes, which
  // produced enormous shadow acne across the screen).
  for (const mesh of meshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  return {
    root,
    gun,
    boltPart,
    magPart,
    feedCoverPart,
    muzzlePoint,
    ejectPoint,
    flashGroup,
    flashlight,
    laserLine,
    laserDot,
    leftArm,
    leftRestPos,
    leftRestRot,
    opticY,
    muzzleZ,
    /** Release GPU resources owned by this viewmodel. */
    dispose() {
      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
      for (const texture of textures) texture.dispose();
      root.removeFromParent();
    },
  };
}
