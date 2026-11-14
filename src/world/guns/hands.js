/**
 * First-person arms and hands.
 *
 * The old version was one tapered cylinder for the forearm, a box for the hand
 * and a second box for "fingers". At the size a viewmodel is on screen that is
 * a grey sausage, and the support hand in particular presents its whole dorsal
 * side straight at the camera — which is exactly where a single box reads worst.
 *
 * Two things fix it, and neither is expensive:
 *
 *  1. FINGERS. Four separate fingers, each with three tapered segments and a
 *     knuckle lump, curled to the grip. They do not need to be anatomically
 *     perfect; they need to *separate*, because at ~40 px across the hand the
 *     only thing distinguishing four fingers from a paddle is the gap between
 *     them.
 *  2. THE TAPER. A hand is ~88 mm across the knuckles and ~72 mm across the
 *     wrist. Building the palm as two overlapping blocks with that taper is
 *     the difference between a hand silhouette and a brick.
 *
 * Anatomy used, in metres: 190 mm wrist-to-fingertip, 88 mm across the
 * knuckles, 32 mm thick, index finger 75 mm, pinky 60 mm.
 *
 * Hand-local space: -Z along the fingers, +Y out of the back of the hand,
 * +X toward the thumb (right hand; the left is mirrored by scale.x = -1).
 */
import { box, blob, tubeZ, latheZ, dome, mergeAll } from '../gunkit.js';

const PALM_W = 0.088;
const PALM_H = 0.031;
const PALM_LEN = 0.098;

/** Finger lengths and radii for index..pinky, in metres. */
const FINGERS = [
  { len: [0.042, 0.026, 0.021], r: [0.0092, 0.0084, 0.0076, 0.0066], x: 0.0295 },
  { len: [0.046, 0.029, 0.022], r: [0.0094, 0.0086, 0.0077, 0.0067], x: 0.0098 },
  { len: [0.043, 0.027, 0.021], r: [0.0088, 0.0081, 0.0073, 0.0063], x: -0.0098 },
  { len: [0.034, 0.021, 0.018], r: [0.0078, 0.0072, 0.0065, 0.0057], x: -0.0272 },
];

/** One tapered finger segment: a lathe with a knuckle swell at the root. */
function segment(len, r0, r1) {
  const g = latheZ(
    [
      [0, 0],
      [0, r0 * 0.74],
      [len * 0.18, r0],
      [len * 0.72, r0 * 0.97],
      [len - r1 * 0.5, r1 * 1.06],
      [len, r1 * 0.82],
      [len, r1 * 0.5],
      [len + 0.0008, 0],
    ],
    8,
  );
  // Fingers are wider than they are deep.
  g.scale(1, 0.9, 1);
  return g;
}

/**
 * Build one finger as three nested groups so it can curl.
 * @returns {{ root: import('three').Object3D, joints: import('three').Object3D[] }}
 */
function buildFinger(mats, spec, curl = [0.1, 0.35, 0.45]) {
  const THREE = mats._three;
  const root = new THREE.Object3D();
  const joints = [];
  let parent = root;
  let z = 0;
  for (let i = 0; i < 3; i++) {
    const joint = new THREE.Object3D();
    joint.position.z = z;
    joint.rotation.x = -curl[i];
    parent.add(joint);
    const mesh = new THREE.Mesh(segment(spec.len[i], spec.r[i], spec.r[i + 1]), mats.glove);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    joint.add(mesh);
    // Knuckle pad on the back of the first two segments. Small, but it is what
    // gives the finger a direction.
    if (i < 2) {
      const pad = new THREE.Mesh(
        blob(spec.r[i] * 1.5, spec.r[i] * 0.5, spec.len[i] * 0.7, spec.r[i] * 0.22, 2, 2),
        mats.glovePad,
      );
      pad.position.set(0, spec.r[i] * 0.72, -spec.len[i] * 0.42);
      joint.add(pad);
    }
    joints.push(joint);
    z = -spec.len[i];
    parent = joint;
  }
  return { root, joints };
}

/**
 * A glove: palm, thumb, knuckle plates, wrist and cuff.
 * @param {Record<string, import('three').Material>} mats
 * @param {object} opts
 */
export function buildGlove(mats, opts = {}) {
  const THREE = mats._three;
  const scale = opts.scale ?? 1;
  const root = new THREE.Group();
  const w = PALM_W * scale;
  const h = PALM_H * scale;
  const len = PALM_LEN * scale;

  const shell = [];
  // Palm: two blocks with a real taper from knuckles to wrist.
  const palm = blob(w, h, len * 0.6, 0.011 * scale, 3, 3);
  palm.translate(0, 0, -len * 0.62);
  shell.push(palm);
  const wrist = blob(w * 0.82, h * 0.95, len * 0.5, 0.011 * scale, 3, 3);
  wrist.translate(0, -h * 0.01, -len * 0.22);
  shell.push(wrist);
  // Thenar (thumb muscle) — the single most recognisable part of a palm.
  const thenar = blob(w * 0.4, h * 0.9, len * 0.55, 0.013 * scale, 3, 3);
  thenar.translate(w * 0.29, -h * 0.05, -len * 0.3);
  shell.push(thenar);
  // Knuckle row: four bumps, not one slab.
  for (let i = 0; i < 4; i++) {
    const kx = w * (0.33 - i * 0.22);
    const k = dome(0.0071 * scale, 8, 0.6);
    k.rotateX(-Math.PI / 2);
    k.translate(kx, h * 0.4, -len * 0.93);
    shell.push(k);
  }
  const gloveMesh = new THREE.Mesh(mergeAll(shell), mats.glove);
  root.add(gloveMesh);

  // Fingers, curled to grip. The curl is what makes them read as *holding*
  // something rather than pointing at it.
  const fingers = [];
  FINGERS.forEach((spec) => {
    const curl = opts.grip ? [0.35, 0.6, 0.45] : [0.28, 0.62, 0.55];
    const f = buildFinger(mats, spec, curl);
    f.root.position.set(spec.x * scale, -h * 0.06, -len * 0.95);
    root.add(f.root);
    fingers.push(f);
  });

  // Thumb: two segments, opposed across the palm.
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(w * 0.38, -h * 0.3, -len * 0.34);
  // Wrapped across, not sticking out: a thumb at 0.85 rad of yaw puts the tip
  // 60 mm off the palm and doubles the hand's apparent width on screen.
  thumbRoot.rotation.set(0, 0.32, -0.62);
  const t0 = new THREE.Mesh(segment(0.042 * scale, 0.0112 * scale, 0.0098 * scale), mats.glove);
  thumbRoot.add(t0);
  const t1 = new THREE.Group();
  t1.position.z = -0.042 * scale;
  t1.rotation.x = -0.5;
  t1.add(new THREE.Mesh(segment(0.033 * scale, 0.0098 * scale, 0.0082 * scale), mats.glove));
  thumbRoot.add(t1);
  root.add(thumbRoot);

  // Wrist strap and cuff: a real band, so the arm does not just stop.
  const strap = box(w * 0.92, h * 1.02, 0.012 * scale, 0.003 * scale, 2, 2);
  strap.translate(0, -h * 0.02, 0.002);
  root.add(new THREE.Mesh(strap, mats.cuff));

  return { root, fingers };
}

/**
 * A forearm sleeve with real fold rings, ending in a rolled cuff.
 *
 * The taper runs the correct way — 56 mm at the elbow, 44 mm at the wrist —
 * and the fold rings are what stop a cylinder from looking like a pipe.
 */
export function buildForearm(mats, opts = {}) {
  const THREE = mats._three;
  const seg = opts.segments ?? 14;
  const profile = [];
  const len = opts.length ?? 0.34;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const z = t * len;
    // 46 mm at the elbow, 34 mm at the wrist. The 56/44 of a bare forearm is
    // anatomically right but it is the biggest thing on screen after the
    // weapon, and a viewmodel arm is always seen through a sleeve that is
    // bunched up and therefore narrower than the limb inside it.
    let r = 0.046 - t * 0.012;
    // Three fold rings, decreasing toward the wrist.
    for (const [at, amp] of [
      [0.18, 0.0028],
      [0.42, 0.0022],
      [0.68, 0.0016],
    ]) {
      const d = (t - at) / 0.055;
      r += amp * Math.exp(-d * d);
    }
    profile.push([z, r]);
  }
  const sleeve = new THREE.Mesh(latheZ(profile, 12), mats.sleeve);
  return sleeve;
}

/** A rolled fabric cuff, built as a torus-ish lathe. */
export function buildCuff(mats) {
  const THREE = mats._three;
  const g = latheZ(
    [
      [0, 0.044],
      [0.004, 0.049],
      [0.012, 0.05],
      [0.02, 0.047],
      [0.024, 0.043],
      [0.024, 0.038],
      [0, 0.038],
    ],
    14,
  );
  return new THREE.Mesh(g, mats.cuff);
}

/** A shoulder-to-wrist arm assembled from the parts above. */
export function buildArm(mats, opts = {}) {
  const THREE = mats._three;
  const arm = new THREE.Group();
  const forearm = buildForearm(mats, opts);
  /**
   * The sleeve is a lathe authored 0..len along +Z, wide end first. In an arm
   * group whose origin is the wrist, it has to occupy z = 0 .. +len, narrowing
   * toward z = 0. `buildForearm` already narrows as t rises, so the geometry
   * only needs to be flipped in Z — and flipping Z alone (scale.z = -1) is
   * what keeps it on the camera's axis instead of spinning it out sideways.
   * Rotating by PI about Y here would also negate X, which is the bug that put
   * a slab across the weapon.
   */
  forearm.scale.z = -1;
  forearm.position.z = 0;
  arm.add(forearm);
  const cuff = buildCuff(mats);
  cuff.position.z = 0.008;
  arm.add(cuff);
  const glove = buildGlove(mats, { scale: opts.scale ?? 1, grip: opts.grip });
  glove.root.position.z = -0.01;
  arm.add(glove.root);
  return { arm, glove, forearm };
}

export { tubeZ };
