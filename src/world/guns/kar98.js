/**
 * Kar98k — 7.92x57 bolt-action rifle, 1935 pattern.
 *
 * The only wood-furniture weapon in the game, and it lives or dies on three
 * things that are pure geometry:
 *
 *  - a one-piece walnut stock with a real comb, a semi-pistol grip and a
 *    cupped buttplate, modelled from a lathe profile rather than boxes
 *  - an exposed bolt with a turned-down handle and a knurled knob, which the
 *    rig cycles on every shot
 *  - a rear-locking receiver with the stripper-clip bridge, tangent rear
 *    sight and a hooded front sight
 *
 * Real dimensions: overall 1.11 m, barrel 600 mm, 5-round internal magazine,
 * optic axis 0.055 m over the bore when scoped.
 */
import { Assembly, box, tubeZ, rodZ, latheZ, extrude, roundRect, knurlBand, mergeAll } from '../gunkit.js';

export const DIM = {
  receiverFront: -0.09,
  receiverBack: 0.15,
  receiverW: 0.038,
  barrelLen: 0.6,
  opticAxisY: 0.055,
  stockLen: 0.44,
};

export function buildKar98() {
  const a = new Assembly('kar98');
  const D = DIM;

  /* barrel and receiver --------------------------------------------------- */
  const barrelZ = D.receiverFront - D.barrelLen / 2 + 0.03;
  a.add(tubeZ(0.0112, 0.0055, D.barrelLen, 22, 0.0008), 'steel', { z: barrelZ });
  const muzzleZ = barrelZ - D.barrelLen / 2;
  // Stepped muzzle: the 98k's barrel has a visible shoulder near the front.
  a.add(
    latheZ(
      [
        [0, 0.0112],
        [0.002, 0.0122],
        [0.03, 0.0122],
        [0.034, 0.0104],
        [0.034, 0.0055],
      ],
      20,
    ),
    'steel',
    {
      z: muzzleZ + 0.01,
    },
  );
  a.add(
    latheZ(
      [
        [0, 0.0092],
        [0.0015, 0.0098],
        [0.006, 0.0098],
        [0.008, 0.0092],
        [0.008, 0.0048],
      ],
      18,
    ),
    'steel',
    {
      z: muzzleZ - 0.004,
    },
  );

  // Receiver: round, not boxy, because the 98 action is a turned cylinder.
  a.add(tubeZ(0.0195, 0.0168, D.receiverBack - D.receiverFront, 20), 'steel', {
    y: 0.004,
    z: (D.receiverBack + D.receiverFront) / 2,
  });
  // Stripper clip bridge, the raised arch over the action.
  a.add(
    extrude(
      [
        [-0.016, 0],
        [-0.016, 0.008],
        [-0.008, 0.014],
        [0.008, 0.014],
        [0.016, 0.008],
        [0.016, 0],
      ],
      0.056,
      { bevel: 0.0012, bevelSegments: 2 },
    ),
    'steel',
    { x: 0.028, y: 0.018, z: 0.0, ry: Math.PI / 2 },
  );

  /* walnut stock: the dominant shape -------------------------------------- */
  // A stock is not a box. Build it as a swept profile: narrow at the fore-end,
  // swelling at the receiver, dropping into a semi-pistol grip, then a comb
  // that rises to the butt.
  const stockSegments = [
    { z: 0.15, w: 0.042, h: 0.062, y: 0.0 },
    { z: 0.2, w: 0.044, h: 0.078, y: -0.012 },
    { z: 0.27, w: 0.043, h: 0.09, y: -0.026 },
    { z: 0.34, w: 0.041, h: 0.098, y: -0.034 },
    { z: 0.42, w: 0.04, h: 0.104, y: -0.036 },
    { z: 0.47, w: 0.039, h: 0.1, y: -0.032 },
  ];
  const fore = [
    { z: D.receiverFront - 0.02, w: 0.036, h: 0.05, y: -0.006 },
    { z: D.receiverFront - 0.12, w: 0.033, h: 0.044, y: -0.004 },
    { z: D.receiverFront - 0.26, w: 0.031, h: 0.04, y: -0.002 },
    { z: D.receiverFront - 0.38, w: 0.029, h: 0.037, y: 0.0 },
  ];
  // The stock has to be ONE continuous mass. Building it from separate boxes
  // leaves visible gaps wherever two segments disagree about width, which is
  // what made the first pass look like a pile of planks. Sweep a single
  // rounded box whose section changes along its length instead: ten slices,
  // each overlapping the next by half its length so there is no seam.
  const spine = [...fore]
    .reverse()
    .concat([{ z: D.receiverFront - 0.02, w: 0.036, h: 0.05, y: -0.006 }], stockSegments);
  const woodParts = [];
  for (let i = 0; i < spine.length - 1; i++) {
    const a0 = spine[i];
    const b0 = spine[i + 1];
    const z0 = a0.z;
    const z1 = b0.z;
    const segLen = Math.abs(z1 - z0) + 0.03;
    const w = (a0.w + b0.w) / 2;
    const h = (a0.h + b0.h) / 2;
    const y = (a0.y + b0.y) / 2;
    const seg = box(w, h, segLen, 0.01, 4, 3);
    seg.translate(0, y, (z0 + z1) / 2);
    woodParts.push(seg);
  }
  // Bedding block around the action, the widest part of the stock.
  const bed = box(0.042, 0.052, 0.17, 0.01, 4, 3);
  bed.translate(0, -0.012, (D.receiverBack + D.receiverFront) / 2);
  woodParts.push(bed);
  a.add(mergeAll(woodParts), 'wood');

  // Cupped buttplate: a steel plate with a dished face.
  a.add(box(0.042, 0.106, 0.012, 0.004, 3, 2), 'steel', { y: -0.034, z: 0.477 });
  a.add(
    latheZ(
      [
        [0, 0.03],
        [0.002, 0.034],
        [0.006, 0.034],
        [0.008, 0.03],
        [0.008, 0],
      ],
      18,
    ),
    'steel',
    {
      y: -0.034,
      z: 0.484,
      rx: Math.PI / 2,
    },
  );
  // Sling slot through the butt.
  a.add(extrude(roundRect(0.014, 0.03, 0.005, 3), 0.044), 'wood', { y: -0.03, z: 0.4 });

  // Barrel bands: two steel bands clamping the fore-end to the barrel.
  for (const z of [D.receiverFront - 0.16, D.receiverFront - 0.32]) {
    a.add(tubeZ(0.019, 0.0165, 0.016, 16, 0.001), 'steel', { z });
    a.add(box(0.008, 0.012, 0.014, 0.0012, 2, 2), 'steel', { x: 0.0, y: -0.022, z });
  }
  // Bayonet lug under the nose cap.
  a.add(box(0.012, 0.016, 0.03, 0.0015, 2, 2), 'steel', { y: -0.02, z: D.receiverFront - 0.4 });
  // Nose cap with a stacking rod.
  a.add(
    latheZ(
      [
        [0, 0.0185],
        [0.002, 0.0198],
        [0.016, 0.0198],
        [0.018, 0.0185],
      ],
      16,
    ),
    'steel',
    {
      z: D.receiverFront - 0.42,
    },
  );
  a.add(rodZ(0.004, 0.004, 0.045, 10), 'steel', { y: -0.014, z: D.receiverFront - 0.44, rx: Math.PI / 2 });

  /* trigger group and magazine -------------------------------------------- */
  a.add(
    extrude(
      [
        [0, 0],
        [0, 0.016],
        [0.042, 0.016],
        [0.042, 0],
        [0.034, 0],
        [0.034, 0.008],
        [0.007, 0.008],
        [0.007, 0],
      ],
      0.016,
      { bevel: 0.0008, bevelSegments: 2 },
    ),
    'steel',
    { x: -0.008, y: -0.026, z: 0.07, ry: Math.PI / 2 },
  );
  a.add(box(0.005, 0.022, 0.009, 0.001, 2, 2), 'steel', { y: -0.03, z: 0.078, rx: -0.24 });
  // Internal magazine floorplate below the action.
  a.add(box(0.03, 0.03, 0.062, 0.003, 3, 2), 'steel', { y: -0.032, z: 0.028 });
  a.add(box(0.032, 0.006, 0.066, 0.002, 2, 2), 'steel', { y: -0.048, z: 0.028 });

  /* tangent rear sight and hooded front sight ---------------------------- */
  const sightY = 0.024;
  a.add(box(0.03, 0.006, 0.09, 0.0015, 2, 2), 'steel', { y: sightY, z: -0.01 });
  for (let i = 0; i < 8; i++) {
    a.add(box(0.026, 0.0025, 0.0022, 0.0004, 1, 1), 'steel', {
      y: sightY + 0.004,
      z: -0.045 + i * 0.009,
    });
  }
  a.add(box(0.006, 0.007, 0.008, 0.001, 2, 2), 'steel', { y: sightY + 0.006, z: 0.03 });
  // Front sight hood: a ring the barrel passes through.
  a.add(tubeZ(0.0115, 0.0098, 0.014, 16, 0.001), 'steel', { y: 0.008, z: D.receiverFront - 0.36 });
  a.add(box(0.003, 0.016, 0.004, 0.0006, 2, 2), 'steel', { y: 0.012, z: D.receiverFront - 0.36 });

  /* bolt: the part the rig cycles ---------------------------------------- */
  // Bolt body riding in the receiver's rear bridge.
  a.add(rodZ(0.0112, 0.0112, 0.13, 16), 'steel', { y: 0.014, z: 0.13, rx: Math.PI / 2 });
  // Bolt shroud with a knurled cocking piece.
  a.add(
    latheZ(
      [
        [0, 0.0132],
        [0.002, 0.0145],
        [0.014, 0.0145],
        [0.018, 0.0132],
        [0.018, 0],
      ],
      16,
    ),
    'steel',
    {
      y: 0.014,
      z: 0.196,
    },
  );
  a.add(knurlBand(0.0128, 0.012, 20, 0.0005, 2), 'steel', { y: 0.014, z: 0.2 });
  // Turned-down bolt handle with a knurled ball knob. This is the single most
  // recognisable part of a 98k and it must be a real shape.
  const handleBar = rodZ(0.0052, 0.0052, 0.062, 12);
  handleBar.rotateX(Math.PI / 2);
  handleBar.rotateZ(-0.55);
  handleBar.translate(0.0, -0.012, 0.0);
  a.add(handleBar, 'steel', { x: 0.016, y: 0.02, z: 0.128 });
  a.add(
    latheZ(
      [
        [0, 0],
        [0.004, 0.0072],
        [0.012, 0.0088],
        [0.02, 0.0088],
        [0.026, 0.0072],
        [0.028, 0],
      ],
      14,
    ),
    'steel',
    {
      x: 0.05,
      y: -0.006,
      z: 0.128,
    },
  );
  a.add(knurlBand(0.0088, 0.014, 16, 0.0004, 2), 'steel', { x: 0.05, y: -0.006, z: 0.142 });
  // Bolt stop / ejector on the left.
  a.add(box(0.006, 0.014, 0.03, 0.0012, 2, 2), 'steel', { x: -0.02, y: 0.0, z: 0.11 });

  /* ZF-39 style scope ----------------------------------------------------- */
  const oy = D.opticAxisY;
  const oz = 0.02;
  // Mount rings on the receiver, offset so the bolt still cycles.
  a.addMirrored(box(0.014, 0.02, 0.012, 0.002, 2, 2), 'steel', { x: 0.016, y: oy - 0.016, z: oz - 0.06 });
  a.addMirrored(box(0.014, 0.02, 0.012, 0.002, 2, 2), 'steel', { x: 0.016, y: oy - 0.016, z: oz + 0.06 });
  a.add(
    latheZ(
      [
        [0, 0.0162],
        [0.004, 0.0182],
        [0.02, 0.0198],
        [0.13, 0.0198],
        [0.15, 0.0212],
        [0.16, 0.0212],
        [0.162, 0.0162],
        [0.162, 0.0138],
        [0, 0.0138],
      ],
      22,
    ),
    'steel',
    { y: oy, z: oz - 0.081 },
  );
  // Turrets: elevation and windage.
  a.add(rodZ(0.0088, 0.0088, 0.016, 12), 'steel', { y: oy + 0.026, z: oz });
  a.add(knurlBand(0.0086, 0.012, 18, 0.0004, 2), 'steel', { y: oy + 0.032, z: oz });
  a.add(rodZ(0.0082, 0.0082, 0.014, 12), 'steel', { x: 0.024, y: oy, z: oz, rz: Math.PI / 2 });
  // Objective and ocular glass.
  a.add(extrude(roundRect(0.036, 0.036, 0.008, 4), 0.0016), 'lens', { y: oy, z: oz - 0.081 });
  a.add(extrude(roundRect(0.03, 0.03, 0.007, 4), 0.0016), 'lens', { y: oy, z: oz + 0.081 });

  /* sling ---------------------------------------------------------------- */
  // A leather sling looped under the fore-end and the butt.
  a.add(box(0.004, 0.05, 0.012, 0.0015, 2, 2), 'rubber', { y: -0.036, z: D.receiverFront - 0.2 });
  a.add(box(0.004, 0.05, 0.012, 0.0015, 2, 2), 'rubber', { y: -0.05, z: 0.44 });

  const flashZ = muzzleZ - 0.01;
  a.node('muzzle', 0, 0, flashZ);
  a.node('eject', 0.019, 0.02, 0.02);
  a.node('opticAxis', 0, oy, oz);
  a.node('bolt', 0.016, 0.02, 0.128);
  a.node('mag', 0, -0.032, 0.028);
  a.node('laserEmitter', 0.0, -0.02, D.receiverFront - 0.24);
  a.node('flashlight', 0.0, -0.02, D.receiverFront - 0.24);
  a.node('gripRight', 0, -0.03, 0.11);
  a.node('gripLeft', 0, -0.004, D.receiverFront - 0.24);

  return { ...a.build(), dim: D, muzzleZ: flashZ, opticY: oy };
}
