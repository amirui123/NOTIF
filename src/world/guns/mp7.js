/**
 * MP7A2 — compact 4.6x30 personal defence weapon.
 *
 * The visual identity here is the opposite of the rifles: it is short, the
 * receiver is a single polymer shell rather than an upper/lower pair, the
 * magazine lives *in the pistol grip*, and the stock slides on twin rails
 * alongside the receiver instead of behind it.
 *
 * Real dimensions: overall 0.415 m stock collapsed, barrel 180 mm,
 * 40-round magazine, optic axis 0.058 m over the bore.
 */
import {
  Assembly,
  box,
  tubeZ,
  rodZ,
  latheZ,
  extrude,
  roundRect,
  picatinny,
  mlokSlot,
  serrations,
} from '../gunkit.js';

export const DIM = {
  receiverFront: -0.115,
  receiverBack: 0.085,
  receiverH: 0.052,
  receiverW: 0.042,
  barrelLen: 0.18,
  opticAxisY: 0.058,
};

export function buildMp7() {
  const a = new Assembly('mp7');
  const D = DIM;
  const upperLen = D.receiverBack - D.receiverFront;
  const upperZ = (D.receiverBack + D.receiverFront) / 2;

  /* polymer shell --------------------------------------------------------- */
  // One continuous moulding, wider at the top where the bolt rides.
  a.add(box(D.receiverW, D.receiverH, upperLen, 0.004, 3, 2), 'polymer', {
    y: 0.006,
    z: upperZ,
  });
  // Bolt cover plate on the left, a real MP7 tell.
  a.add(box(0.003, 0.03, upperLen * 0.7, 0.001, 3, 2), 'steel', {
    x: -D.receiverW / 2,
    y: 0.01,
    z: upperZ - 0.01,
  });
  // Ejection port on the right.
  a.add(extrude(roundRect(0.042, 0.018, 0.003, 4), 0.0022), 'steel', {
    x: D.receiverW / 2 - 0.001,
    y: 0.012,
    z: -0.04,
    rz: Math.PI / 2,
  });

  /* the pistol grip doubles as the magazine well -------------------------- */
  const grip = latheZ(
    [
      [0, 0.0175],
      [0.004, 0.0186],
      [0.04, 0.019],
      [0.085, 0.0182],
      [0.115, 0.0172],
      [0.12, 0],
    ],
    18,
  );
  grip.scale(1, 1, 0.82);
  a.add(grip, 'polymer', { y: -0.062, z: 0.052, rx: 0.16 });
  // Feed lips and the magazine floorplate poking out of the grip base.
  a.add(box(0.03, 0.012, 0.046, 0.002, 3, 2), 'polymer', { y: -0.174, z: 0.062 });
  a.add(box(0.026, 0.006, 0.042, 0.0018, 3, 2), 'rubber', { y: -0.183, z: 0.062 });
  a.add(serrations(0.034, 0.056, 0.0016, 10, 'y'), 'polymer', {
    y: -0.09,
    z: 0.086,
    rx: 0.16,
  });

  /* trigger guard --------------------------------------------------------- */
  a.add(
    extrude(
      [
        [0, 0],
        [0, 0.012],
        [0.034, 0.012],
        [0.034, 0],
        [0.028, 0],
        [0.028, 0.006],
        [0.006, 0.006],
        [0.006, 0],
      ],
      0.014,
      { bevel: 0.0006, bevelSegments: 2 },
    ),
    'polymer',
    { x: -0.007, y: -0.038, z: 0.028, ry: Math.PI / 2 },
  );

  /* sliding stock on twin rails ------------------------------------------ */
  for (const x of [-0.017, 0.017]) {
    a.add(rodZ(0.0042, 0.0042, 0.115, 10), 'steel', { x, y: 0.012, z: 0.128 });
  }
  a.add(box(0.05, 0.042, 0.014, 0.004, 3, 2), 'polymer', { y: 0.008, z: 0.186 });
  a.add(box(0.048, 0.05, 0.008, 0.003, 3, 2), 'rubber', { y: 0.004, z: 0.194 });

  /* handguard: a short polymer sleeve around the barrel ------------------- */
  const hgZ = D.receiverFront - 0.045;
  a.add(tubeZ(0.0225, 0.0205, 0.085, 10, 0.0015), 'polymer', { z: hgZ });
  // Folding foregrip, stowed flat under the handguard. This is the single most
  // recognisable MP7 feature and it is pure silhouette.
  a.add(box(0.026, 0.012, 0.062, 0.003, 3, 2), 'polymer', { y: -0.026, z: hgZ + 0.005 });
  a.add(rodZ(0.0035, 0.0035, 0.03, 8), 'polymer', { y: -0.02, z: hgZ + 0.028, rx: Math.PI / 2 });
  // Side rails.
  a.add(mlokSlot(0.026, 0.0065, 0.002), 'polymer', { x: -0.021, z: hgZ + 0.01, ry: Math.PI / 2 });
  a.add(mlokSlot(0.026, 0.0065, 0.002), 'polymer', { x: 0.021, z: hgZ + 0.01, ry: Math.PI / 2 });

  /* barrel and muzzle ----------------------------------------------------- */
  const barrelZ = hgZ - 0.045 - D.barrelLen / 2 + 0.045;
  a.add(tubeZ(0.0072, 0.0036, D.barrelLen, 16, 0.0006), 'steel', { z: barrelZ });
  const muzzleZ = barrelZ - D.barrelLen / 2;
  a.add(
    latheZ(
      [
        [0, 0.0092],
        [0.003, 0.0102],
        [0.02, 0.0102],
        [0.025, 0.0094],
        [0.025, 0.004],
        [0.019, 0.004],
        [0.019, 0],
      ],
      16,
    ),
    'steel',
    { z: muzzleZ - 0.012 },
  );

  /* top rail ------------------------------------------------------------- */
  a.add(picatinny(0.2), 'alu', { y: 0.006 + D.receiverH / 2, z: upperZ - 0.005 });

  /* charging handle on the left ------------------------------------------ */
  a.add(box(0.014, 0.01, 0.026, 0.0015, 2, 2), 'steel', {
    x: -0.026,
    y: 0.02,
    z: 0.045,
  });
  a.add(rodZ(0.0035, 0.0035, 0.014, 8), 'steel', { x: -0.024, y: 0.02, z: 0.045, rz: Math.PI / 2 });

  /* reflex sight --------------------------------------------------------- */
  const oy = D.opticAxisY;
  const oz = -0.03;
  a.add(box(0.028, 0.014, 0.05, 0.002, 3, 2), 'alu', { y: oy - 0.022, z: oz });
  // Open-emitter reflex: a U-shaped hood, open at the front.
  a.add(box(0.03, 0.005, 0.036, 0.0015, 2, 2), 'alu', { y: oy + 0.017, z: oz });
  a.addMirrored(box(0.004, 0.03, 0.036, 0.0012, 2, 2), 'alu', { x: 0.013, y: oy + 0.003, z: oz });
  a.add(extrude(roundRect(0.022, 0.018, 0.003, 4), 0.0014), 'lens', { y: oy + 0.002, z: oz + 0.016 });
  a.add(box(0.008, 0.006, 0.008, 0.001, 2, 2), 'polymer', { x: -0.012, y: oy - 0.008, z: oz + 0.014 });

  /* small parts ---------------------------------------------------------- */
  // Ambidextrous magazine release at the top of the grip.
  a.addMirrored(rodZ(0.0035, 0.0035, 0.005, 10), 'steel', { x: 0.021, y: -0.036, z: 0.046, rz: Math.PI / 2 });
  // Sling loop.
  a.add(box(0.003, 0.018, 0.01, 0.001, 2, 2), 'steel', { x: 0.024, y: 0.014, z: 0.16 });

  a.node('muzzle', 0, 0, muzzleZ - 0.024);
  a.node('eject', D.receiverW / 2, 0.012, -0.04);
  a.node('opticAxis', 0, oy, oz);
  a.node('bolt', 0, 0.02, 0.045);
  a.node('mag', 0, -0.062, 0.052);
  a.node('laserEmitter', -0.021, -0.004, hgZ - 0.01);
  a.node('flashlight', -0.021, -0.004, hgZ - 0.01);
  a.node('gripRight', 0, -0.064, 0.054);
  a.node('gripLeft', 0, -0.03, hgZ);

  return { ...a.build(), dim: D, muzzleZ: muzzleZ - 0.024, opticY: oy };
}
