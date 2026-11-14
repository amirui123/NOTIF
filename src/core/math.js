/**
 * Small, dependency-free math helpers shared by gameplay systems.
 * Everything here is pure so it can be covered by unit tests.
 */

/** Clamp `v` into the inclusive range [min, max]. */
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Linear interpolation between `a` and `b`. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** 0..1 progress of `value` inside [start, end], safe when start === end. */
export const inverseLerp = (start, end, value) =>
  start === end ? 0 : clamp((value - start) / (end - start), 0, 1);

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is roughly "how fast": bigger reacts quicker (e.g. 10 = snappy).
 */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Shortest signed difference `b - a` between two angles in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Wrap an angle (radians) into [-PI, PI). */
export function wrapAngle(a) {
  const twoPi = Math.PI * 2;
  const wrapped = (((a + Math.PI) % twoPi) + twoPi) % twoPi;
  return wrapped - Math.PI;
}

/** Positive modulo (JavaScript's % keeps the sign of the dividend). */
export const mod = (value, m) => ((value % m) + m) % m;

/**
 * Compass heading in degrees (0 = north, 90 = east) for a camera yaw.
 * The world's north is -Z and yaw = 0 looks north.
 */
export const compassDegrees = (yaw) => mod(-yaw * (180 / Math.PI), 360);

/** 8-wind compass label for a heading in degrees. */
export const compassLabel = (deg) =>
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(mod(deg, 360) / 45) % 8];

/** Format a heading as "042° NE". */
export function formatBearing(yaw) {
  const deg = Math.round(compassDegrees(yaw));
  return `${String(deg).padStart(3, '0')}° ${compassLabel(deg)}`;
}

/**
 * Bearing of a world-space point relative to where the player is looking.
 * Positive values mean "to the right", negative "to the left" (degrees).
 */
export function relativeBearingDeg(dx, dz, yaw) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Camera forward (-Z rotated by yaw) and right (+X rotated by yaw).
  const fwdX = -sin;
  const fwdZ = -cos;
  const rightX = cos;
  const rightZ = -sin;
  const forwardDot = dx * fwdX + dz * fwdZ;
  const rightDot = dx * rightX + dz * rightZ;
  return (Math.atan2(rightDot, forwardDot) * 180) / Math.PI;
}

/**
 * Resolve a circle against an axis-aligned box on the XZ plane.
 * @param {number} x circle centre X
 * @param {number} z circle centre Z
 * @param {number} radius circle radius
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} box
 * @returns {{x:number,z:number,hit:boolean}} corrected centre
 */
export function resolveCircleVsBox(x, z, radius, box) {
  // Fast reject when fully outside.
  if (x + radius < box.minX || x - radius > box.maxX || z + radius < box.minZ || z - radius > box.maxZ) {
    return { x, z, hit: false };
  }
  const closestX = clamp(x, box.minX, box.maxX);
  const closestZ = clamp(z, box.minZ, box.maxZ);
  let dx = x - closestX;
  let dz = z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq > radius * radius) return { x, z, hit: false };

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    return { x: x + (dx / dist) * push, z: z + (dz / dist) * push, hit: true };
  }

  // Centre is inside the box: push out through the closest face.
  const left = x - box.minX;
  const right = box.maxX - x;
  const back = z - box.minZ;
  const front = box.maxZ - z;
  const min = Math.min(left, right, back, front);
  if (min === left) dx = -1;
  else if (min === right) dx = 1;
  else if (min === back) dz = -1;
  else dz = 1;
  return { x: x + dx * (min + radius), z: z + dz * (min + radius), hit: true };
}

/** Random float in [min, max). */
export const randRange = (min, max) => min + Math.random() * (max - min);

/** Random integer in [min, max]. */
export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

/** Random sign, -1 or 1. */
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);

/** Clamp to [0, 1]. */
export const saturate = (v) => clamp(v, 0, 1);
