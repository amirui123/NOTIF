/**
 * HK416A5 — piston-driven 5.56 carbine with an ACOG.
 *
 * Distinct from the MK18 in the ways a player can actually see at 0.4 m:
 *  - the handguard is a slim octagon with a full-length top rail instead of a
 *    fat hexagonal M-LOK tube, and it is longer
 *  - it is a piston gun, so the gas block sits proud on the barrel instead of
 *    hiding under the handguard, and there is no suppressor
 *  - the ACOG is a tapered, cast housing with a fibre-optic light pipe on top
 *  - the stock is a heavier telescoping pattern with a battery compartment
 *
 * Real dimensions: 14.5" barrel = 0.368 m, overall 0.885 m with the stock at
 * position 3, receiver height 0.058 m, optic axis 0.074 m over the bore.
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
  mergeAll,
} from '../gunkit.js';

export const DIM = {
  receiverFront: -0.135,
  receiverBack: 0.15,
  upperH: 0.033,
  receiverW: 0.037,
  handguardLen: 0.235,
  barrelLen: 0.368,
  opticAxisY: 0.074,
  recoilLugY: 0.0,
};

export function buildHk416() {
  const a = new Assembly('hk416');
  const D = DIM;
  const upperY = D.upperH / 2 + 0.008;
  const upperLen = D.receiverBack - D.receiverFront;
  const upperZ = (D.receiverBack + D.receiverFront) / 2;

  /* upper and lower ------------------------------------------------------- */
  a.add(box(D.receiverW, D.upperH, upperLen, 0.0016, 3, 2), 'alu', { y: upperY, z: upperZ });
  a.add(box(D.receiverW - 0.002, 0.027, upperLen * 0.86, 0.0016, 3, 2), 'alu', {
    y: -0.008,
    z: upperZ + 0.014,
  });
  // Piston guns have a distinctive raised rail spine along the top of the
  // receiver, which the direct-impingement MK18 does not.
  a.add(box(0.02, 0.006, upperLen * 0.9, 0.0015, 3, 2), 'alu', {
    y: upperY + D.upperH / 2 + 0.003,
    z: upperZ,
  });

  /* magwell --------------------------------------------------------------- */
  a.add(box(0.041, 0.052, 0.064, 0.002, 3, 2), 'alu', { y: -0.043, z: -0.03 });
  a.add(
    latheZ(
      [
        [0.001, 0.0205],
        [0.003, 0.0198],
        [0.036, 0.0182],
        [0.038, 0.0175],
        [0.001, 0.0175],
      ],
      4,
    ),
    'alu',
    {
      y: -0.044,
      z: -0.03,
    },
  );

  /* trigger group and guard ---------------------------------------------- */
  a.add(
    extrude(
      [
        [0, 0],
        [0, 0.013],
        [0.03, 0.013],
        [0.03, 0],
        [0.024, 0],
        [0.024, 0.007],
        [0.006, 0.007],
        [0.006, 0],
      ],
      0.013,
      { bevel: 0.0006, bevelSegments: 2 },
    ),
    'alu',
    { x: -0.0065, y: -0.024, z: 0.03, ry: Math.PI / 2 },
  );
  a.add(box(0.004, 0.021, 0.008, 0.0008, 2, 2), 'steel', { y: -0.024, z: 0.036, rx: -0.18 });

  /* pistol grip ----------------------------------------------------------- */
  const grip = latheZ(
    [
      [0, 0.0142],
      [0.004, 0.015],
      [0.032, 0.0156],
      [0.068, 0.0152],
      [0.093, 0.014],
      [0.107, 0.0126],
      [0.109, 0],
    ],
    20,
  );
  grip.scale(1, 1, 0.84);
  a.add(grip, 'polymer', { y: -0.091, z: 0.092, rx: 0.3 });
  a.add(serrations(0.031, 0.052, 0.0016, 10, 'y'), 'polymer', {
    y: -0.064,
    z: 0.112,
    rx: 0.3,
  });

  /* buffer tube and stock ------------------------------------------------- */
  // The 416 stock is a heavier shell with a visible battery compartment.
  a.add(tubeZ(0.016, 0.0142, 0.13, 20), 'alu', { y: 0.008, z: 0.212 });
  a.add(rodZ(0.018, 0.018, 0.013, 6), 'steel', { y: 0.008, z: 0.15, rx: Math.PI / 2 });
  a.add(extrude(roundRect(0.062, 0.082, 0.014, 4), 0.115, { bevel: 0.0025, bevelSegments: 2 }), 'polymer', {
    y: 0.002,
    z: 0.288,
  });
  a.add(box(0.06, 0.094, 0.016, 0.004, 3, 2), 'rubber', { y: -0.002, z: 0.35 });
  a.add(box(0.04, 0.015, 0.068, 0.004, 3, 2), 'polymer', { y: 0.045, z: 0.288 });
  // Battery compartment cap, the detail that identifies this stock.
  a.add(box(0.042, 0.03, 0.012, 0.003, 3, 2), 'rubber', { y: -0.028, z: 0.29 });

  /* slim octagonal handguard --------------------------------------------- */
  const hgZ = D.receiverFront - D.handguardLen / 2;
  const hgR = 0.0265;
  a.add(tubeZ(hgR, hgR - 0.0026, D.handguardLen, 8, 0.0012), 'alu', { z: hgZ });
  a.add(
    latheZ(
      [
        [0, 0.0245],
        [0.002, 0.026],
        [0.015, 0.026],
        [0.017, 0.0245],
        [0.017, 0],
      ],
      8,
    ),
    'steel',
    {
      z: D.receiverFront - 0.009,
    },
  );
  // Full-length top rail on the handguard, continuous with the receiver's.
  a.add(picatinny(D.handguardLen - 0.01), 'alu', { y: hgR, z: hgZ + 0.005 });
  // M-LOK pockets on the three user faces.
  for (let i = 0; i < 4; i++) {
    const z = hgZ - 0.068 + i * 0.044;
    a.add(mlokSlot(0.03, 0.0072, 0.0022), 'alu', { x: -hgR * 0.94, z, ry: Math.PI / 2 });
    a.add(mlokSlot(0.03, 0.0072, 0.0022), 'alu', { x: hgR * 0.94, z, ry: Math.PI / 2 });
    a.add(mlokSlot(0.03, 0.0072, 0.0022), 'alu', { y: -hgR * 0.94, z, rx: Math.PI / 2 });
  }

  /* barrel and the proud gas block --------------------------------------- */
  const handguardMouth = D.receiverFront - D.handguardLen;
  const barrelZ = handguardMouth - 0.05 + D.barrelLen / 2;
  a.add(tubeZ(0.009, 0.0045, D.barrelLen, 20, 0.0008), 'steel', { z: barrelZ });
  // Piston gas block: a chunky, visible block on top of the barrel, which is
  // the silhouette cue that separates a 416 from an M4.
  a.add(box(0.026, 0.034, 0.034, 0.002, 3, 2), 'steel', { y: 0.004, z: handguardMouth - 0.03 });
  a.add(rodZ(0.0035, 0.0035, 0.055, 12), 'steel', { y: 0.016, z: handguardMouth + 0.005 });
  // Muzzle device: a three-prong flash hider, so the prongs are real geometry.
  const muzzleZ = barrelZ - D.barrelLen / 2;
  a.add(
    latheZ(
      [
        [0, 0.0128],
        [0.003, 0.0136],
        [0.016, 0.0136],
        [0.02, 0.0126],
        [0.02, 0.005],
      ],
      20,
    ),
    'steel',
    {
      z: muzzleZ - 0.02,
    },
  );
  for (let i = 0; i < 3; i++) {
    const prong = box(0.004, 0.012, 0.014, 0.001, 2, 2);
    prong.rotateZ((i / 3) * Math.PI * 2);
    prong.translate(Math.cos((i / 3) * Math.PI * 2) * 0.008, Math.sin((i / 3) * Math.PI * 2) * 0.008, 0);
    a.add(prong, 'steel', { z: muzzleZ - 0.032 });
  }

  /* rail ---------------------------------------------------------------- */
  a.add(picatinny(0.31), 'alu', { y: upperY + D.upperH / 2, z: upperZ - 0.02 });

  /* charging handle ------------------------------------------------------ */
  a.add(box(0.021, 0.008, 0.03, 0.0012, 3, 2), 'alu', {
    y: upperY + D.upperH / 2 + 0.005,
    z: D.receiverBack - 0.012,
  });
  a.add(box(0.017, 0.005, 0.009, 0.001, 2, 2), 'alu', {
    x: -0.0168,
    y: upperY + D.upperH / 2 + 0.005,
    z: D.receiverBack - 0.008,
  });

  /* magazine (curved STANAG) --------------------------------------------- */
  const magParts = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const seg = box(0.0272, 0.038, 0.063 - t * 0.004, 0.0018, 3, 2);
    seg.translate(0, -0.019 - i * 0.0375, 0.004 + Math.pow(t, 1.7) * 0.03);
    seg.rotateX(-0.06 * i);
    magParts.push(seg);
  }
  a.add(mergeAll(magParts), 'polymer');
  for (let i = 0; i < 5; i++) {
    const hole = latheZ(
      [
        [0, 0.0022],
        [0.0016, 0.0022],
        [0.0018, 0],
      ],
      8,
    );
    hole.rotateZ(Math.PI / 2);
    hole.translate(-0.0135, -0.03 - i * 0.03, 0.006 + i * 0.006);
    a.add(hole, 'brass');
  }
  a.add(box(0.031, 0.008, 0.067, 0.002, 3, 2), 'polymer', { y: -0.196, z: 0.033 });

  /* ACOG ---------------------------------------------------------------- */
  const oy = D.opticAxisY;
  const oz = -0.03;
  a.add(box(0.032, 0.018, 0.058, 0.002, 3, 2), 'alu', { y: oy - 0.028, z: oz });
  // Tapered cast housing: wider at the objective, narrower at the ocular. A
  // straight cylinder is the giveaway of a placeholder optic.
  a.add(
    latheZ(
      [
        [0, 0.0138],
        [0.006, 0.0152],
        [0.028, 0.0172],
        [0.05, 0.0198],
        [0.06, 0.0202],
        [0.062, 0.0138],
        [0.062, 0.0112],
        [0, 0.0112],
      ],
      20,
    ),
    'alu',
    { y: oy, z: oz - 0.031 },
  );
  // Fibre-optic light pipe on top: makes the ACOG's amber glow readable.
  a.add(rodZ(0.0022, 0.0022, 0.05, 8), 'glowAmber', { y: oy + 0.021, z: oz + 0.002, rx: Math.PI / 2 });
  a.add(extrude(roundRect(0.03, 0.024, 0.004, 4), 0.0016), 'lens', { y: oy, z: oz - 0.062 });
  a.add(extrude(roundRect(0.026, 0.02, 0.004, 4), 0.0016), 'lens', { y: oy, z: oz + 0.031 });
  // Backup sights.
  a.add(box(0.009, 0.02, 0.007, 0.0012, 3, 2), 'alu', { y: oy - 0.016, z: 0.082 });
  a.add(box(0.007, 0.016, 0.006, 0.001, 3, 2), 'alu', { y: oy - 0.02, z: -0.15 });

  /* accessories --------------------------------------------------------- */
  // Angular foregrip, which is the 416A5's signature furniture.
  a.add(
    latheZ(
      [
        [0, 0.0138],
        [0.006, 0.0152],
        [0.05, 0.0148],
        [0.07, 0.0142],
        [0.074, 0],
      ],
      14,
    ),
    'polymer',
    { y: -0.03, z: hgZ - 0.06, rx: -0.32 },
  );
  a.add(box(0.028, 0.018, 0.05, 0.002, 3, 2), 'polymer', { x: 0.031, y: 0.0, z: hgZ + 0.03 });
  a.add(rodZ(0.0036, 0.0036, 0.008, 10), 'alu', { x: 0.031, y: 0.0, z: hgZ + 0.002 });

  /* small parts --------------------------------------------------------- */
  for (const z of [-0.07, 0.108]) {
    a.addMirrored(rodZ(0.0038, 0.0038, 0.004, 12), 'steel', { x: 0.018, y: -0.004, z, rz: Math.PI / 2 });
  }
  a.add(rodZ(0.0042, 0.0042, 0.006, 12), 'steel', { x: -0.018, y: 0.0, z: 0.052, rz: Math.PI / 2 });
  a.add(box(0.004, 0.012, 0.008, 0.001, 2, 2), 'steel', { x: -0.02, y: 0.006, z: 0.052, rz: 0.5 });
  a.add(box(0.004, 0.014, 0.024, 0.001, 2, 2), 'steel', { x: -0.018, y: 0.004, z: -0.022 });

  a.node('muzzle', 0, 0, muzzleZ - 0.04);
  a.node('eject', D.receiverW / 2, upperY + 0.004, -0.03);
  a.node('opticAxis', 0, oy, oz);
  a.node('bolt', 0, upperY + D.upperH / 2 + 0.005, D.receiverBack - 0.012);
  a.node('mag', 0, -0.043, -0.03);
  a.node('laserEmitter', 0.031, 0.0, hgZ + 0.002);
  a.node('flashlight', 0.031, 0.0, hgZ + 0.002);
  a.node('gripRight', 0, -0.093, 0.094);
  a.node('gripLeft', 0, -0.03, hgZ - 0.06);

  return { ...a.build(), dim: D, muzzleZ: muzzleZ - 0.04, opticY: oy };
}
