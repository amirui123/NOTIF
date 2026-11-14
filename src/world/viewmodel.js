/**
 * First-person viewmodel.
 *
 * Builds the weapon the player sees, plus the arms, optics, muzzle flash,
 * flashlight and laser, and hands it to `WeaponController` as one `root` group
 * parented to the camera.
 *
 * ## What changed and why
 *
 * The previous build was assembled from `BoxGeometry` and `CylinderGeometry`
 * with no edge treatment: every rifle came out under 900 triangles, all of them
 * sharing one metal material. Two consequences, both visible in play:
 *
 *  - Every edge met its neighbour at a mathematically perfect 90 degrees. Real
 *    machined edges are 0.3-1.5 mm fillets, and those fillets are where the
 *    specular highlight rolls. Without them the gun has no highlight structure
 *    at all and reads as a flat grey block.
 *  - Receiver, rail, barrel, optic and magazine all shared one albedo and one
 *    metalness, so nothing on the gun separated from anything else.
 *
 * The geometry now comes from `gunkit.js` (chamfered boxes, crowned tubes,
 * real Picatinny rail, M-LOK pockets, lathed grips) and is assembled per
 * weapon in `guns/`. Materials come from `gunmaterials.js` and split the gun
 * into anodised aluminium / phosphate steel / polymer / rubber / wear / brass /
 * glass. Both are procedural: no new assets, no network, no new dependency.
 *
 * ## Contract this module must keep
 *
 * `WeaponController` drives the following by name every frame, so they must
 * exist on every weapon or the animation silently stops:
 *
 *   root, gun, boltPart, magPart, feedCoverPart (or null), muzzlePoint,
 *   ejectPoint, flashGroup, flashlight, laserLine, laserDot, leftArm,
 *   leftRestPos, leftRestRot, opticY, muzzleZ, dispose()
 */
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { makeReticleTexture } from '../engine/textures.js';
import { buildWeaponMaterials } from './gunmaterials.js';
import { buildMk18 } from './guns/mk18.js';
import { buildHk416 } from './guns/hk416.js';
import { buildMp7 } from './guns/mp7.js';
import { buildP226 } from './guns/p226.js';
import { buildM249 } from './guns/m249.js';
import { buildKar98 } from './guns/kar98.js';
import { buildArm } from './guns/hands.js';
import { Assembly, box, tubeZ, rodZ, latheZ, mergeAll } from './gunkit.js';

/** Scale an sRGB hex colour toward black, for viewmodel use. */
function darken(hex, factor) {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Placeholder until a weapon has its own builder: a clear, obvious blockout. */
function buildPlaceholder() {
  const a = new Assembly('placeholder');
  a.add(box(0.044, 0.052, 0.29, 0.002, 3, 2), 'alu', { y: 0.025 });
  a.add(tubeZ(0.0091, 0.0045, 0.3, 16), 'steel', { z: -0.29 });
  a.add(box(0.03, 0.105, 0.042, 0.004, 3, 2), 'polymer', { y: -0.06, z: 0.085, rx: 0.28 });
  a.add(box(0.026, 0.145, 0.055, 0.003, 3, 2), 'polymer', { y: -0.09, z: -0.055 });
  return a.build();
}

/** Per-weapon builder. Anything not listed yet falls back to the placeholder. */
const BUILDERS = {
  mk18: buildMk18,
  hk416: buildHk416,
  mp7: buildMp7,
  p226: buildP226,
  m249: buildM249,
  kar98: buildKar98,
};

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

  const root = new THREE.Group();
  const gun = new THREE.Group();
  root.add(gun);

  // ---------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------
  const mats = buildWeaponMaterials(tex, {
    // The operator's sleeve colour is chosen for the third-person avatar and
    // is a mid olive drab. On a viewmodel that fills a third of the frame it
    // becomes the brightest thing on screen and swallows the weapon, so it is
    // darkened toward the glove and kept desaturated.
    sleeveColor: darken(operator.sleeveColor, 0.42),
    // Likewise the glove: operators ship with an olive glove colour that is
    // correct on a 1.8 m avatar and reads as bright sage on a hand that is
    // 200 px from the lens. Tactical gloves are near-black anyway.
    gloveColor: darken(operator.gloveColor, 0.34),
    cuffColor: darken(operator.cuffAccent, 0.5),
    woodFurniture: weaponId === 'kar98',
  });
  mats._three = THREE;
  for (const value of Object.values(mats)) {
    if (value && value.isMaterial) materials.add(value);
  }

  // ---------------------------------------------------------------------------
  // Weapon geometry
  // ---------------------------------------------------------------------------
  const builder = BUILDERS[weaponId] ?? ((m) => ({ ...buildPlaceholder(m), dim: null }));
  const built = builder(mats, tex);
  const dim = built.dim ?? {};
  // Builders return `{ meshes, nodes, dim, muzzleZ, opticY }`: the three
  // scalars are top-level so a builder never has to mutate its own DIM.
  if (built.muzzleZ !== undefined) dim.muzzleZ = built.muzzleZ;
  if (built.opticY !== undefined) dim.opticAxisY = built.opticY;

  for (const [matKey, geo] of built.meshes) {
    const mat = mats[matKey];
    if (!mat) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    gun.add(mesh);
    meshes.push(mesh);
    geometries.add(geo);
  }

  // ---------------------------------------------------------------------------
  // Animated sub-parts
  // ---------------------------------------------------------------------------
  // The rig moves `boltPart` and `magPart` by their local positions, so each is
  // an empty group parked at the point the part rotates around; the geometry
  // that belongs to it is a child offset from that pivot.
  const boltPart = new THREE.Group();
  const magPart = new THREE.Group();
  const feedCoverPart = null;
  const opticY = dim.opticAxisY ?? 0.062;
  const muzzleZ = dim.muzzleZ ?? -0.5;

  const nodes = built.nodes ?? new Map();
  const nodePos = (name, fallback) => {
    const n = nodes.get(name);
    return n ? new THREE.Vector3(...n.pos) : fallback;
  };

  /**
   * The magazine and bolt are *moving* parts, so they cannot be merged into the
   * static buckets: the reload animation translates and rotates them. They are
   * built as separate small meshes parented to a pivot group at the socket.
   *
   * The pivot carries the socket position; the mesh inside it is authored at
   * the origin, so `magPart.position.set(0, 0, 0)` really is "seated" and the
   * reload's `-0.26 * drop` moves it straight down out of the magwell.
   */
  const magPivot = nodePos('mag', new THREE.Vector3(0, -0.09, -0.02));
  magPart.position.set(0, 0, 0);
  gun.add(magPart);
  const boltPivot = nodePos('bolt', new THREE.Vector3(0, 0.03, 0.12));
  boltPart.position.set(0, 0, 0);
  gun.add(boltPart);

  // Magazine geometry: a curved body plus a floorplate, authored around the
  // group origin and then parked at the socket.
  {
    const wspec = WEAPONS[weaponId];
    const isLmg = weaponId === 'm249';
    const isSniper = weaponId === 'kar98';
    const magSpec = isLmg
      ? { w: 0.095, h: 0.12, d: 0.11, seg: 1 }
      : isSniper
        ? { w: 0.018, h: 0.06, d: 0.05, seg: 1 }
        : { w: 0.027, h: Math.min(0.19, 0.022 + wspec.magSize * 0.0028), d: 0.062, seg: 5 };
    const parts = [];
    for (let i = 0; i < magSpec.seg; i++) {
      const t = magSpec.seg === 1 ? 0 : i / magSpec.seg;
      const h = magSpec.h / magSpec.seg;
      const segGeo = box(magSpec.w, h * 1.02, magSpec.d - t * 0.004, 0.0018, 2, 2);
      segGeo.translate(0, -h * (i + 0.5), Math.pow(t, 1.7) * 0.03);
      if (magSpec.seg > 1) segGeo.rotateX(-0.06 * i);
      parts.push(segGeo);
    }
    const body = mergeAll(parts);
    const floor = box(magSpec.w * 1.12, 0.008, magSpec.d * 1.06, 0.002, 2, 2);
    floor.translate(0, -magSpec.h, Math.pow(1, 1.7) * 0.03);
    const merged = mergeAll([body, floor]);
    const mesh = new THREE.Mesh(merged, mats.polymer);
    mesh.frustumCulled = false;
    magPart.add(mesh);
    magPart.position.copy(magPivot);
    geometries.add(merged);
    meshes.push(mesh);
  }

  // Bolt / charging handle: a small block that cycles visibly.
  {
    const isSniper = weaponId === 'kar98';
    const geo = isSniper
      ? mergeAll([
          rodZ(0.0052, 0.0052, 0.09, 10).rotateX(Math.PI / 2),
          latheZ(
            [
              [0, 0],
              [0.004, 0.0072],
              [0.012, 0.0088],
              [0.02, 0.0088],
              [0.026, 0.0072],
              [0.028, 0],
            ],
            12,
          ).rotateZ(Math.PI / 2),
        ])
      : box(0.018, 0.01, 0.03, 0.0012, 2, 2);
    const mesh = new THREE.Mesh(geo, mats.steel);
    mesh.frustumCulled = false;
    boltPart.add(mesh);
    boltPart.position.copy(boltPivot);
    geometries.add(geo);
    meshes.push(mesh);
  }

  // ---------------------------------------------------------------------------
  // Muzzle, eject and flash
  // ---------------------------------------------------------------------------
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.copy(nodePos('muzzle', new THREE.Vector3(0, 0, muzzleZ)));
  gun.add(muzzlePoint);

  const ejectPoint = new THREE.Object3D();
  ejectPoint.position.copy(nodePos('eject', new THREE.Vector3(0.018, 0.03, -0.03)));
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
  materials.add(flashMat);
  for (let i = 0; i < 3; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), flashMat);
    plane.rotation.z = (i * Math.PI) / 3;
    flashGroup.add(plane);
    geometries.add(plane.geometry);
  }
  flashGroup.visible = false;
  gun.add(flashGroup);

  // ---------------------------------------------------------------------------
  // Flashlight
  // ---------------------------------------------------------------------------
  const flashPos = nodePos('flashlight', new THREE.Vector3(0.03, 0.02, muzzleZ + 0.12));
  const flashlight = new THREE.SpotLight(0xeef6ff, 0, 46, Math.PI / 6.2, 0.48, 1.3);
  flashlight.position.copy(flashPos);
  flashlight.target.position.set(flashPos.x, flashPos.y, flashPos.z - 14);
  gun.add(flashlight, flashlight.target);

  // ---------------------------------------------------------------------------
  // Laser
  // ---------------------------------------------------------------------------
  const laserPos = nodePos('laserEmitter', flashPos);
  const laserGeometry = new THREE.BufferGeometry().setFromPoints([
    laserPos.clone(),
    new THREE.Vector3(0, 0, -30),
  ]);
  geometries.add(laserGeometry);
  const laserLine = new THREE.Line(
    laserGeometry,
    new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45 }),
  );
  materials.add(laserLine.material);
  laserLine.visible = false;
  laserLine.frustumCulled = false;
  gun.add(laserLine);

  // World-space impact dot: deliberately NOT parented to the gun, otherwise it
  // inherits the viewmodel transform and floats in front of the camera.
  const laserDotGeo = new THREE.SphereGeometry(0.025, 8, 8);
  geometries.add(laserDotGeo);
  const laserDot = new THREE.Mesh(laserDotGeo, new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
  materials.add(laserDot.material);
  laserDot.visible = false;
  laserDot.matrixAutoUpdate = true;

  // ---------------------------------------------------------------------------
  // Arms
  // ---------------------------------------------------------------------------
  const isPistol = weaponId === 'p226';
  const isSniper = weaponId === 'kar98';

  /**
   * Sleeve length is a framing decision, not an anatomical one.
   *
   * A real forearm is 300-340 mm and that is what the first pass used, on
   * every weapon. On a rifle it is fine — the arm runs back toward the camera
   * and the receiver hides most of it. On a 196 mm pistol the arm is longer
   * than the gun, so it fills the frame and you cannot see the weapon at all.
   * Every shipped viewmodel shortens the arm on small weapons for exactly
   * this reason.
   */
  // A pistol sits 0.27-0.29 m from the eye, so an arm running back toward the
  // camera passes through the near plane within ~90 mm. Anything longer turns
  // into a green cylinder across the whole frame.
  const rightLen = isPistol ? 0.09 : 0.32;
  const leftLen = isPistol ? 0.08 : 0.28;
  const right = buildArm(mats, { length: rightLen, grip: true });
  const left = buildArm(mats, { length: leftLen, grip: true });

  // Right hand wraps the pistol grip; left hand supports the handguard.
  const gripRight = nodePos('gripRight', new THREE.Vector3(0, -0.09, 0.09));
  right.arm.position.copy(gripRight);
  /**
   * Hand orientation, solved rather than guessed.
   *
   * The glove is authored with -Z along the fingers and +Y out of the back of
   * the hand. To wrap a pistol grip the palm has to face inboard (-X) and the
   * fingers have to point forward-and-in, which is a rotation of about
   * (+, 0, -) — not the identity, and not a flat quarter turn. The previous
   * value of (0.16, 0.1, -0.12) left the hand lying palm-down on top of the
   * slide, which is what showed up as "a hand growing out of the top of the
   * gun".
   */
  if (isPistol) {
    right.arm.position.set(-0.012, -0.075, 0.062);
    right.arm.rotation.set(1.55, 0.55, -1.25);
  } else {
    right.arm.rotation.set(1.15, 0.1, -0.12);
  }
  gun.add(right.arm);

  const leftRestPos = isPistol
    ? new THREE.Vector3(-0.042, -0.085, 0.045)
    : isSniper
      ? new THREE.Vector3(-0.012, -0.058, -0.17)
      : new THREE.Vector3(-0.014, -0.048, -0.2);
  const leftRestRot = isPistol
    ? new THREE.Euler(Math.PI / 2 - 0.1, -0.35, 0.1)
    : new THREE.Euler(1.05, 0.32, 0.45);
  left.arm.position.copy(leftRestPos);
  left.arm.rotation.copy(leftRestRot);
  gun.add(left.arm);

  const leftArm = left.arm;

  // ---------------------------------------------------------------------------
  // Optic reticle
  // ---------------------------------------------------------------------------
  const reticle = makeReticleTexture(spec.opticType);
  const reticleMat = new THREE.MeshBasicMaterial({
    map: reticle,
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
  });
  materials.add(reticleMat);
  if (spec.opticType !== 'iron') {
    const retGeo = new THREE.PlaneGeometry(0.024, 0.024);
    geometries.add(retGeo);
    const ret = new THREE.Mesh(retGeo, reticleMat);
    const axis = nodePos('opticAxis', new THREE.Vector3(0, opticY, -0.02));
    ret.position.set(0, axis.y, axis.z + 0.024);
    gun.add(ret);
  }

  // ---------------------------------------------------------------------------
  // Bookkeeping
  // ---------------------------------------------------------------------------
  root.traverse((node) => {
    if (!node.isMesh) return;
    // The viewmodel is lit by the scene but must never cast into it: an
    // enabled shadow on a camera-parented mesh produces screen-wide acne.
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = false;
    if (node.geometry) geometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of list) if (m) materials.add(m);
  });

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
    /** Handy for tests and for the debug overlay. */
    nodes,
    materials: mats,
    stats: () => {
      let tris = 0;
      let count = 0;
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        count++;
        const g = o.geometry;
        tris += g.getIndex() ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
      });
      return { tris: Math.round(tris), meshes: count };
    },
    /** Release GPU resources owned by this viewmodel. */
    dispose() {
      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
      reticle.dispose?.();
      root.removeFromParent();
    },
  };
}
