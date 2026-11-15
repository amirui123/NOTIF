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
    // A hand around a grip is a FIST, not a relaxed hand. The first pass used
    // 0.35/0.6/0.45 rad, which leaves the tip 58 mm downrange of the knuckle —
    // fingers pointing straight out over the barrel. Wrapping a ~32 mm grip
    // needs roughly 75/80/70 degrees at the three joints, and at that point the
    // tip curls back past z = 0 and the hand reads as closed.
    const curl = opts.grip ? [1.3, 1.4, 1.2] : [0.45, 0.85, 0.7];
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
 * Authored **wrist-first**: z = 0 is the wrist and z = +length is the elbow,
 * with the section widening as it goes. That matters because the arm group's
 * origin is the hand, so the sleeve has to reach back toward the camera — and
 * the first version got this backwards and then "fixed" it with
 * `scale.z = -1`, which mirrors the mesh, inverts every normal and flips the
 * winding. The result was an inside-out tube that rendered as a zigzag of
 * alternating light and dark triangles across the whole frame.
 *
 * Authored correctly there is nothing to mirror.
 */
export function buildForearm(mats, opts = {}) {
  const THREE = mats._three;
  const seg = opts.segments ?? 16;
  const len = opts.length ?? 0.34;
  const rWrist = opts.rWrist ?? 0.034;
  const rElbow = opts.rElbow ?? 0.046;
  const profile = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const z = t * len;
    let r = rWrist + t * (rElbow - rWrist);
    // Three fold rings, decreasing toward the wrist.
    for (const [at, amp] of [
      [0.2, 0.0026],
      [0.45, 0.002],
      [0.7, 0.0014],
    ]) {
      const d = (t - at) / 0.055;
      r += amp * Math.exp(-d * d);
    }
    profile.push([z, r]);
  }
  // Open-ended: no cap at the elbow, because it is off screen anyway.
  return new THREE.Mesh(latheZ(profile, 14), mats.sleeve);
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

/**
 * Point a hand at a grip, from the two directions that actually matter.
 *
 * The glove is authored with fixed local axes: fingers along -Z, the back of
 * the hand along +Y, the thumb along +X. Posing it with three hand-tuned Euler
 * angles cannot keep those axes meaningful — a small change to any one angle
 * swings the fingers off the grip and the hand ends up splayed above the
 * receiver, which is exactly what "the gun looks scrambled" was.
 *
 * Instead take the two directions a human would describe — where the fingers
 * point, and which way the back of the hand faces — build an orthonormal basis
 * from them, and hand that to the group. The result is exact and, unlike
 * Euler triples, readable: a reviewer can check `forward` against the grip.
 *
 * @param {import('three').Object3D} arm     the arm group to orient
 * @param {number[]} forward   direction the fingers travel, weapon-local
 * @param {number[]} backOfHand direction the back of the hand faces
 * @param {number[]} [at]      wrist position, weapon-local
 */
/**
 * Where a closed fist's grip hole sits, in glove-local space.
 *
 * Not the palm centre: with the fingers curled to a fist the knuckle row is at
 * z = -0.093 and the fingertips at z = -0.080, so the cylinder a grip passes
 * through runs roughly through z = -0.087, y = -0.028. Placing the palm on the
 * socket instead offsets the whole hand by half a fist length and the fingers
 * never reach around anything — which is what "the parts are right but it is
 * not assembled" looked like.
 */
export const FIST_CENTRE = [0, -0.028, -0.0865];

/**
 * Point a hand at a grip and put its fist on it.
 *
 * The wrist is the arm group's origin, so if the fist centre must land on the
 * socket then the wrist position is fixed once the orientation is known:
 *
 *     wrist = socket - R * FIST_CENTRE
 *
 * Solving that rather than eyeballing a wrist offset is what makes the grip
 * actually sit inside the hand.
 *
 * @param {import('three').Object3D} arm       arm group (origin at the wrist)
 * @param {number[]} forward   direction the fingers travel
 * @param {number[]} backOfHand direction the back of the hand faces
 * @param {number[]} socket    grip position the fist should close around
 * @param {boolean}  mirror    flip the hand (left glove is a mirrored right)
 */
export function poseHand(arm, forward, backOfHand, socket = null, mirror = false) {
  const THREE = arm.userData._three;
  const f = new THREE.Vector3(...forward).normalize();
  const y = new THREE.Vector3(...backOfHand).normalize();
  const z = f.clone().negate(); // glove -Z is the finger direction
  // The two inputs must be *roughly* perpendicular: they are the two axes of a
  // hand, and a hand is not flat. If they are nearly parallel the
  // orthogonalisation below returns a near-zero vector and the whole glove
  // collapses to a smear — a silent, very confusing failure. Say so loudly.
  const dot = y.dot(z);
  if (Math.abs(dot) > 0.92) {
    throw new Error(
      `poseHand: "forward" and "backOfHand" are nearly parallel (dot=${dot.toFixed(3)}). ` +
        'They describe perpendicular axes of a hand; check the caller.',
    );
  }
  y.addScaledVector(z, -dot).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  // A right hand is a mirrored left: build one chirality and flip it. The
  // groups below are mirrored about their own X, which the renderer handles
  // correctly because the winding was never mirrored at the geometry level.
  arm.scale.set(mirror ? -1 : 1, 1, 1);
  if (socket) {
    const local = new THREE.Vector3(...FIST_CENTRE);
    local.x *= mirror ? -1 : 1;
    arm.position.copy(new THREE.Vector3(...socket)).sub(local.applyQuaternion(arm.quaternion));
  }
  return arm;
}

/** A shoulder-to-wrist arm assembled from the parts above. */
export function buildArm(mats, opts = {}) {
  const THREE = mats._three;
  const arm = new THREE.Group();
  // Wrist-first, so z = 0 is the hand and the sleeve runs back along +Z.
  const forearm = buildForearm(mats, opts);
  arm.add(forearm);
  const cuff = buildCuff(mats);
  cuff.position.z = 0.004;
  arm.add(cuff);
  const glove = buildGlove(mats, { scale: opts.scale ?? 1, grip: opts.grip });
  glove.root.position.z = -0.012;
  arm.add(glove.root);
  return { arm, glove, forearm };
}

export { tubeZ };
