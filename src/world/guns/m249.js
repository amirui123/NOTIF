/**
 * M249 SAW — 5.56 belt-fed light machine gun.
 *
 * The heaviest silhouette in the game, and every one of its identifying
 * features is a shape rather than a texture:
 *
 *  - a squat, boxy receiver with the feed cover on top and a 200-round
 *    ammunition pouch hanging under it
 *  - a heat shield shroud over the barrel: six long slots you can see through
 *  - a folding bipod under the gas block
 *  - a carry handle that doubles as the barrel-change latch
 *  - a sliding, tubular stock
 *
 * Real dimensions: overall 1.041 m, barrel 465 mm, receiver 0.075 m tall.
 */
import { Assembly, box, tubeZ, rodZ, latheZ, extrude, roundRect, picatinny, serrations } from '../gunkit.js';

export const DIM = {
  receiverFront: -0.16,
  receiverBack: 0.15,
  receiverH: 0.075,
  receiverW: 0.058,
  shroudLen: 0.3,
  barrelLen: 0.465,
  opticAxisY: 0.082,
};

export function buildM249() {
  const a = new Assembly('m249');
  const D = DIM;
  const upperLen = D.receiverBack - D.receiverFront;
  const upperZ = (D.receiverBack + D.receiverFront) / 2;

  /* receiver: one big stamped box ----------------------------------------- */
  a.add(box(D.receiverW, D.receiverH, upperLen, 0.003, 3, 2), 'alu', {
    y: 0.012,
    z: upperZ,
  });
  // Feed cover on top, hinged at the front. The rig opens this on reload.
  a.add(box(0.05, 0.016, 0.13, 0.003, 3, 2), 'alu', { y: 0.012 + D.receiverH / 2, z: 0.0 });
  a.add(box(0.048, 0.006, 0.126, 0.002, 2, 2), 'steel', { y: 0.012 + D.receiverH / 2 + 0.011, z: 0.0 });
  // Feed tray lips, where the belt actually enters.
  a.addMirrored(box(0.006, 0.008, 0.05, 0.0012, 2, 2), 'steel', {
    x: 0.018,
    y: 0.012 + D.receiverH / 2 + 0.008,
    z: 0.032,
  });

  /* ammunition pouch ------------------------------------------------------ */
  // A soft pouch, so it gets a rounded box and a fabric material rather than
  // the hard-surface treatment.
  a.add(box(0.1, 0.115, 0.115, 0.012, 3, 3), 'polymer', { x: -0.012, y: -0.058, z: -0.05 });
  a.add(box(0.098, 0.012, 0.108, 0.005, 3, 3), 'rubber', { x: -0.012, y: -0.118, z: -0.05 });
  // Belt of linked rounds feeding up into the tray: eight visible links.
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const link = box(0.006, 0.012, 0.038, 0.0012, 2, 2);
    link.rotateX(-0.4 + t * 0.9);
    link.translate(-0.012 + (i % 2) * 0.004, -0.004 + t * 0.03, -0.024 + t * 0.012);
    a.add(link, 'brass');
  }

  /* pistol grip and trigger group ---------------------------------------- */
  const grip = latheZ(
    [
      [0, 0.0152],
      [0.004, 0.016],
      [0.035, 0.0166],
      [0.075, 0.016],
      [0.1, 0.0146],
      [0.104, 0],
    ],
    18,
  );
  grip.scale(1, 1, 0.86);
  a.add(grip, 'polymer', { y: -0.08, z: 0.086, rx: 0.26 });
  a.add(serrations(0.033, 0.05, 0.0016, 10, 'y'), 'polymer', {
    y: -0.052,
    z: 0.106,
    rx: 0.26,
  });
  a.add(
    extrude(
      [
        [0, 0],
        [0, 0.014],
        [0.036, 0.014],
        [0.036, 0],
        [0.03, 0],
        [0.03, 0.007],
        [0.006, 0.007],
        [0.006, 0],
      ],
      0.015,
      { bevel: 0.0007, bevelSegments: 2 },
    ),
    'alu',
    { x: -0.0075, y: -0.026, z: 0.026, ry: Math.PI / 2 },
  );

  /* tubular sliding stock ------------------------------------------------- */
  a.add(rodZ(0.0165, 0.0165, 0.19, 18), 'alu', { y: 0.012, z: 0.245 });
  a.add(rodZ(0.0185, 0.0185, 0.012, 6), 'steel', { y: 0.012, z: 0.155, rx: Math.PI / 2 });
  // Shoulder piece: flat, tall, and mounted on the tube end.
  a.add(box(0.062, 0.085, 0.02, 0.005, 3, 2), 'polymer', { y: 0.004, z: 0.336 });
  a.add(box(0.058, 0.078, 0.01, 0.004, 3, 2), 'rubber', { y: 0.0, z: 0.347 });
  // Carry handle on the receiver.
  a.add(box(0.012, 0.008, 0.11, 0.002, 2, 2), 'polymer', { y: 0.012 + D.receiverH / 2 + 0.026, z: 0.03 });
  a.addMirrored(box(0.008, 0.024, 0.008, 0.0015, 2, 2), 'polymer', {
    x: 0.0,
    y: 0.012 + D.receiverH / 2 + 0.014,
    z: -0.022,
    rz: 0.0,
  });

  /* heat-shield shroud over the barrel ------------------------------------ */
  const shroudZ = D.receiverFront - D.shroudLen / 2;
  const shroudR = 0.033;
  // Six slots: build the shroud as six long ribs around the barrel instead of
  // a tube with holes cut in it. Same silhouette, a tenth of the triangles.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const rib = box(0.014, 0.004, D.shroudLen, 0.0012, 3, 2);
    rib.rotateZ(ang);
    rib.translate(Math.cos(ang) * shroudR, Math.sin(ang) * shroudR, 0);
    a.add(rib, 'alu', { z: shroudZ });
  }
  // Front and rear collars joining the ribs.
  a.add(
    latheZ(
      [
        [0, shroudR - 0.002],
        [0.002, shroudR + 0.002],
        [0.012, shroudR + 0.002],
        [0.014, shroudR - 0.002],
        [0.014, 0],
      ],
      6,
    ),
    'alu',
    {
      z: shroudZ + D.shroudLen / 2 - 0.007,
    },
  );
  a.add(
    latheZ(
      [
        [0, shroudR - 0.002],
        [0.002, shroudR + 0.002],
        [0.014, shroudR + 0.002],
        [0.016, shroudR - 0.002],
        [0.016, 0],
      ],
      6,
    ),
    'alu',
    {
      z: shroudZ - D.shroudLen / 2 + 0.008,
    },
  );

  /* barrel and gas block -------------------------------------------------- */
  const barrelZ = D.receiverFront - 0.04 + D.barrelLen / 2;
  a.add(tubeZ(0.0105, 0.005, D.barrelLen, 20, 0.0008), 'steel', { z: barrelZ });
  // Gas block, proud of the shroud near the muzzle.
  a.add(box(0.03, 0.036, 0.038, 0.002, 3, 2), 'steel', { y: 0.006, z: D.receiverFront - D.shroudLen - 0.05 });
  // Bipod: two legs folded back along the barrel. Pure silhouette.
  for (const sx of [-1, 1]) {
    // A folded bipod leg lies along the bore, offset to its side and angled
    // down. Build it along Z, tilt it, then push it out to its side.
    const leg = rodZ(0.0052, 0.0052, 0.16, 8);
    leg.rotateX(sx * 0.0);
    leg.rotateZ(0);
    leg.translate(sx * 0.016, -0.01, 0);
    a.add(leg, 'steel', { z: D.receiverFront - D.shroudLen - 0.02 });
    // Foot.
    a.add(rodZ(0.007, 0.007, 0.012, 8), 'rubber', {
      x: sx * 0.045,
      y: -0.014,
      z: D.receiverFront - D.shroudLen - 0.09,
      rz: Math.PI / 2,
    });
  }
  // Muzzle: a slotted flash hider.
  const muzzleZ = barrelZ - D.barrelLen / 2;
  a.add(
    latheZ(
      [
        [0, 0.0145],
        [0.003, 0.0155],
        [0.022, 0.0155],
        [0.028, 0.0145],
        [0.028, 0.005],
      ],
      18,
    ),
    'steel',
    {
      z: muzzleZ - 0.016,
    },
  );
  for (let i = 0; i < 4; i++) {
    // Order matters: the slot is cut at the rim, so it is positioned on the
    // circle first and then rotated about the bore. Rotating first and
    // translating second puts the slot wherever the rotation left it.
    const ang = (i / 4) * Math.PI * 2;
    const slot = box(0.004, 0.006, 0.016, 0.0008, 2, 2);
    slot.translate(0, 0.0132, 0);
    slot.rotateZ(ang);
    a.add(slot, 'steel', { z: muzzleZ - 0.02 });
  }

  /* top rail and optic ---------------------------------------------------- */
  a.add(picatinny(0.26), 'alu', { y: 0.012 + D.receiverH / 2, z: upperZ - 0.02 });
  const oy = D.opticAxisY;
  const oz = -0.02;
  a.add(box(0.032, 0.016, 0.062, 0.002, 3, 2), 'alu', { y: oy - 0.028, z: oz });
  a.add(box(0.036, 0.03, 0.05, 0.004, 3, 3), 'alu', { y: oy, z: oz });
  a.add(extrude(roundRect(0.03, 0.024, 0.004, 4), 0.0016), 'lens', { y: oy, z: oz + 0.026 });
  a.add(extrude(roundRect(0.03, 0.024, 0.004, 4), 0.0016), 'lens', { y: oy, z: oz - 0.026 });

  /* small parts ----------------------------------------------------------- */
  // Barrel change handle on the right of the shroud.
  a.add(box(0.006, 0.02, 0.05, 0.0015, 2, 2), 'steel', {
    x: D.receiverW / 2 + 0.006,
    y: 0.016,
    z: D.receiverFront - 0.05,
  });
  // Sling swivels.
  a.add(rodZ(0.004, 0.004, 0.008, 10), 'steel', { x: -0.031, y: 0.0, z: 0.02, rz: Math.PI / 2 });
  for (const z of [-0.09, 0.1]) {
    a.addMirrored(rodZ(0.0042, 0.0042, 0.004, 10), 'steel', { x: 0.029, y: -0.01, z, rz: Math.PI / 2 });
  }

  const flashZ = muzzleZ - 0.03;
  a.node('muzzle', 0, 0, flashZ);
  a.node('eject', D.receiverW / 2, 0.02, -0.04);
  a.node('opticAxis', 0, oy, oz);
  a.node('bolt', 0, 0.02 + D.receiverH / 2, 0.06);
  a.node('mag', 0, -0.058, -0.05);
  a.node('laserEmitter', 0.031, 0.0, shroudZ + 0.02);
  a.node('flashlight', 0.031, 0.0, shroudZ + 0.02);
  a.node('gripRight', 0, -0.082, 0.088);
  a.node('gripLeft', 0, -0.016, shroudZ + 0.04);

  return { ...a.build(), dim: D, muzzleZ: flashZ, opticY: oy };
}
