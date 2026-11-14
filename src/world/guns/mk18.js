/**
 * MK18 MOD-1 — suppressed 5.56 carbine.
 *
 * Authored at real scale in metres, bore on +Y = 0, receiver centred on Z = 0,
 * muzzle toward -Z. Every dimension below is either a real gun dimension or is
 * derived from one:
 *
 *   overall (with suppressor)   0.79 m
 *   barrel                      10.3 in = 0.262 m
 *   receiver height             0.058 m (upper 0.032 + lower 0.026)
 *   optic axis height           0.062 m over the bore
 *   30-round STANAG             ~0.19 m tall, 0.072 m front-to-back
 *   Picatinny rail              21.2 mm across, 10.55 mm pitch
 *
 * The parts are grouped by what they are *made of* rather than by where they
 * are, because the Assembly merges per material and that is what keeps a
 * 6k-triangle rifle inside eight draw calls.
 */
import {
  Assembly,
  box,
  tubeZ,
  rodZ,
  latheZ,
  ringProfile,
  extrude,
  roundRect,
  picatinny,
  mlokSlot,
  serrations,
  mergeAll,
} from '../gunkit.js';

/** Real dimensions, named so the numbers below stay readable. */
export const DIM = {
  boreY: 0,
  receiverFront: -0.135,
  receiverBack: 0.145,
  upperH: 0.033,
  lowerH: 0.027,
  receiverW: 0.036,
  handguardLen: 0.19,
  handguardRadius: 0.024,
  barrelLen: 0.262,
  suppressorLen: 0.165,
  suppressorR: 0.0215,
  opticAxisY: 0.062,
  magLen: 0.19,
  gripLen: 0.105,
};

/**
 * @param {Record<string, import('three').MeshStandardMaterial>} mats
 * @returns {{ meshes: Map<string, import('three').BufferGeometry>, nodes: Map<string, any>, dim: typeof DIM }}
 */
export function buildMk18() {
  const a = new Assembly('mk18');
  const D = DIM;

  /* ---------------------------------------------------------------------- */
  /*  upper receiver                                                        */
  /* ---------------------------------------------------------------------- */
  const upperY = D.upperH / 2 + 0.008;
  const upperLen = D.receiverBack - D.receiverFront;
  const upperZ = (D.receiverBack + D.receiverFront) / 2;

  // Main body. The silhouette of an AR upper is not a rectangle: the top deck
  // is flat and the sides taper in below the bore.
  a.add(box(D.receiverW, D.upperH, upperLen, 0.0016, 3, 2), 'alu', {
    x: 0,
    y: upperY,
    z: upperZ,
  });
  // Forward assist boss, right side, rear quarter.
  a.add(rodZ(0.0072, 0.0072, 0.026, 16), 'alu', {
    x: D.receiverW / 2 - 0.002,
    y: upperY - 0.002,
    z: 0.072,
    rx: Math.PI / 2,
    rz: -Math.PI / 2,
  });
  // Ejection port: a raised lip around a recessed opening on the right.
  a.add(extrude(roundRect(0.056, 0.021, 0.004, 4), 0.0022, { bevel: 0.0005 }), 'alu', {
    x: D.receiverW / 2 - 0.001,
    y: upperY + 0.004,
    z: -0.03,
    rz: Math.PI / 2,
  });
  a.add(extrude(roundRect(0.048, 0.015, 0.003, 4), 0.004), 'steel', {
    x: D.receiverW / 2 - 0.004,
    y: upperY + 0.004,
    z: -0.03,
    rz: Math.PI / 2,
  });

  /* ---------------------------------------------------------------------- */
  /*  lower receiver, magwell and trigger group                              */
  /* ---------------------------------------------------------------------- */
  const lowerY = -D.lowerH / 2 + 0.006;
  a.add(box(D.receiverW - 0.002, D.lowerH, upperLen * 0.82, 0.0016, 3, 2), 'alu', {
    x: 0,
    y: lowerY,
    z: upperZ + 0.012,
  });
  // Magwell: a flared box, wider at the mouth, with a real funnel lip.
  const magwellY = -0.041;
  a.add(
    latheZ(
      [
        [0.001, 0.02],
        [0.002, 0.0195],
        [0.038, 0.0182],
        [0.04, 0.0175],
        [0.04, 0.0174],
        [0.001, 0.0174],
      ],
      4,
    ),
    'alu',
    { x: 0, y: magwellY, z: -0.028 },
  );
  a.add(box(0.04, 0.05, 0.062, 0.002, 3, 2), 'alu', { x: 0, y: magwellY + 0.01, z: -0.028 });
  // Trigger guard: a real loop, not a slab.
  a.add(
    extrude(
      [
        [0.0, 0.0],
        [0.0, 0.013],
        [0.03, 0.013],
        [0.03, 0.0],
        [0.024, 0.0],
        [0.024, 0.007],
        [0.006, 0.007],
        [0.006, 0.0],
      ],
      0.012,
      { bevel: 0.0006, bevelSegments: 2 },
    ),
    'alu',
    { x: -0.006, y: lowerY - 0.016, z: 0.028, ry: Math.PI / 2 },
  );
  // Trigger blade.
  a.add(box(0.004, 0.02, 0.008, 0.0008, 2, 2), 'steel', {
    x: 0,
    y: lowerY - 0.016,
    z: 0.034,
    rx: -0.18,
  });

  /* ---------------------------------------------------------------------- */
  /*  pistol grip                                                            */
  /* ---------------------------------------------------------------------- */
  // A grip is a lathe: it swells at the palm, necks in at the web, and flares
  // at the heel. Modelling it as a rotated box is what makes hands look wrong.
  const grip = latheZ(
    [
      [0, 0.0138],
      [0.004, 0.0146],
      [0.03, 0.0152],
      [0.065, 0.0148],
      [0.09, 0.0136],
      [0.103, 0.0124],
      [0.105, 0],
    ],
    20,
  );
  // Flatten it front-to-back: a real grip is 30 mm across and 26 mm deep.
  grip.scale(1, 1, 0.86);
  a.add(grip, 'polymer', { x: 0, y: -0.088, z: 0.088, rx: 0.28 });
  // Grip texture: serrations on the front strap only, which is where the hand
  // actually contacts it.
  a.add(serrations(0.03, 0.05, 0.0016, 9, 'y'), 'polymer', {
    x: 0,
    y: -0.062,
    z: 0.108,
    rx: 0.28,
  });

  /* ---------------------------------------------------------------------- */
  /*  buffer tube and stock                                                  */
  /* ---------------------------------------------------------------------- */
  a.add(tubeZ(0.0155, 0.0138, 0.125, 20), 'alu', { x: 0, y: 0.008, z: 0.205 });
  // Castle nut: a six-flat nut is both cheaper and more accurate than knurling
  // at this size, and the flats read as wrench marks in silhouette.
  a.add(mergeAll([rodZ(0.0175, 0.0175, 0.012, 6), rodZ(0.0172, 0.0172, 0.0135, 6)]), 'steel', {
    x: 0,
    y: 0.008,
    z: 0.143,
    rx: Math.PI / 2,
  });
  // Collapsible stock body: a tapered shell with a butt pad.
  a.add(
    extrude(
      roundRect(0.058, 0.075, 0.012, 4).map(([x, y]) => [x, y]),
      0.105,
      { bevel: 0.002, bevelSegments: 2 },
    ),
    'polymer',
    { x: 0, y: 0.004, z: 0.275 },
  );
  a.add(box(0.056, 0.088, 0.014, 0.004, 3, 2), 'rubber', { x: 0, y: 0.0, z: 0.331 });
  // Cheek riser.
  a.add(box(0.038, 0.014, 0.062, 0.004, 3, 2), 'polymer', { x: 0, y: 0.042, z: 0.276 });

  /* ---------------------------------------------------------------------- */
  /*  handguard: free-floating M-LOK tube with a hexagonal section           */
  /* ---------------------------------------------------------------------- */
  const hgZ = D.receiverFront - D.handguardLen / 2;
  const hgR = 0.026;
  // Hexagonal shell: a lathe with six segments gives real flats.
  a.add(tubeZ(hgR, hgR - 0.0028, D.handguardLen, 6, 0.0012), 'alu', { x: 0, y: 0, z: hgZ });
  // Barrel nut at the receiver end.
  a.add(
    latheZ(
      [
        [0, 0.024],
        [0.002, 0.0255],
        [0.014, 0.0255],
        [0.016, 0.024],
        [0.016, 0],
      ],
      6,
    ),
    'steel',
    {
      x: 0,
      y: 0,
      z: D.receiverFront - 0.008,
    },
  );
  // M-LOK slots on the sides and bottom, as real recessed pockets.
  for (let i = 0; i < 3; i++) {
    const z = hgZ - 0.05 + i * 0.045;
    a.add(mlokSlot(0.032, 0.0075, 0.0022), 'alu', { x: -hgR + 0.001, y: 0, z, ry: Math.PI / 2 });
    a.add(mlokSlot(0.032, 0.0075, 0.0022), 'alu', { x: hgR - 0.001, y: 0, z, ry: Math.PI / 2 });
    a.add(mlokSlot(0.032, 0.0075, 0.0022), 'alu', { x: 0, y: -hgR + 0.001, z, rx: Math.PI / 2 });
  }
  // Handguard end cap, chamfered.
  a.add(
    latheZ(
      [
        [0, hgR - 0.003],
        [0.002, hgR],
        [0.006, hgR],
        [0.008, hgR - 0.004],
        [0.008, 0],
      ],
      6,
    ),
    'alu',
    {
      x: 0,
      y: 0,
      z: hgZ - D.handguardLen / 2 - 0.003,
    },
  );

  /* ---------------------------------------------------------------------- */
  /*  barrel, gas block, suppressor                                          */
  /* ---------------------------------------------------------------------- */
  // The 10.3" barrel is almost entirely inside the handguard: only ~55 mm
  // protrudes before the suppressor mounts. Placing it mid-handguard would
  // push the muzzle 150 mm past where the real gun ends.
  const handguardMouth = D.receiverFront - D.handguardLen;
  const protrude = 0.055;
  const barrelZ = handguardMouth - protrude + D.barrelLen / 2;
  a.add(tubeZ(0.0091, 0.0045, D.barrelLen, 20, 0.0008), 'steel', { x: 0, y: 0, z: barrelZ });
  // Low-profile gas block under the handguard.
  a.add(box(0.024, 0.028, 0.03, 0.002, 3, 2), 'steel', {
    x: 0,
    y: 0,
    z: handguardMouth + 0.035,
  });
  // Gas tube running back into the receiver.
  a.add(rodZ(0.0022, 0.0022, D.handguardLen * 0.8, 10), 'steel', {
    x: 0,
    y: 0.011,
    z: D.receiverFront - D.handguardLen * 0.5,
  });

  // Suppressor: a lathe profile with a shoulder, a knurled grip band and a
  // crowned muzzle bore. This is the part the player looks at most.
  const supZ = handguardMouth - protrude - D.suppressorLen / 2 + 0.012;
  a.add(
    latheZ(
      [
        [0, D.suppressorR - 0.002],
        [0.004, D.suppressorR],
        [D.suppressorLen - 0.012, D.suppressorR],
        [D.suppressorLen - 0.006, D.suppressorR - 0.0015],
        [D.suppressorLen - 0.004, 0.0125],
        [D.suppressorLen - 0.001, 0.0125],
        [D.suppressorLen, 0.0112],
        [D.suppressorLen, 0.0048],
        [D.suppressorLen - 0.0025, 0.0048],
        [0.004, 0.0048],
        [0, 0.0052],
      ],
      28,
    ),
    'steel',
    { x: 0, y: 0, z: supZ - D.suppressorLen / 2 },
  );
  // Grip band: 24 shallow rings, which is what a suppressor's grip sleeve
  // actually is. Real pyramids cost 56 triangles each and are sub-pixel here.
  a.add(
    (() => {
      const rings = [];
      for (let i = 0; i < 24; i++) {
        // ringProfile is already a lathe about Z, which is the suppressor's
        // axis — so this is a straight translate, with no reorientation.
        // Rotating it here turns the rings end-on and scatters them across
        // the front of the weapon.
        const r = ringProfile(D.suppressorR - 0.0004, 0.0007, 0.0011);
        r.translate(0, 0, -0.048 + i * 0.0042);
        rings.push(r);
      }
      return mergeAll(rings);
    })(),
    'steel',
    { x: 0, y: 0, z: supZ },
  );

  /* ---------------------------------------------------------------------- */
  /*  Picatinny rail                                                         */
  /* ---------------------------------------------------------------------- */
  const railLen = 0.3;
  a.add(picatinny(railLen), 'alu', { x: 0, y: upperY + D.upperH / 2, z: upperZ - 0.02 });

  /* ---------------------------------------------------------------------- */
  /*  charging handle + bolt carrier (animated)                              */
  /* ---------------------------------------------------------------------- */
  a.add(box(0.02, 0.0075, 0.028, 0.0012, 3, 2), 'alu', {
    x: 0,
    y: upperY + D.upperH / 2 + 0.004,
    z: D.receiverBack - 0.012,
  });
  // Latch on the left wing.
  a.add(box(0.016, 0.005, 0.008, 0.001, 2, 2), 'alu', {
    x: -0.016,
    y: upperY + D.upperH / 2 + 0.004,
    z: D.receiverBack - 0.008,
  });

  /* ---------------------------------------------------------------------- */
  /*  magazine (animated on reload)                                          */
  /* ---------------------------------------------------------------------- */
  // STANAG curve: five segments, each rotated a little more than the last.
  const magParts = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const seg = box(0.0265, 0.038, 0.062 - t * 0.004, 0.0018, 3, 2);
    seg.translate(0, -0.019 - i * 0.0375, 0.004 + Math.pow(t, 1.7) * 0.03);
    seg.rotateX(-0.06 * i);
    magParts.push(seg);
  }
  const magBody = mergeAll(magParts);
  // Witness holes down the spine: five, evenly spaced.
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
    hole.translate(-0.0132, -0.03 - i * 0.03, 0.006 + i * 0.006);
    a.add(hole, 'brass');
  }
  // Floorplate.
  const floor = box(0.03, 0.008, 0.066, 0.002, 3, 2);
  floor.translate(0, -0.196, 0.032);
  a.add(magBody, 'polymer');
  a.add(floor, 'polymer');

  /* ---------------------------------------------------------------------- */
  /*  optic: EOTech-style holographic sight                                  */
  /* ---------------------------------------------------------------------- */
  const opticY = D.opticAxisY;
  const opticZ = -0.02;
  // Mounting base clamps onto the rail.
  a.add(box(0.032, 0.016, 0.062, 0.002, 3, 2), 'alu', { x: 0, y: opticY - 0.026, z: opticZ });
  // Hood: a rounded shell, open at the front and back.
  a.add(box(0.036, 0.03, 0.05, 0.004, 3, 3), 'alu', { x: 0, y: opticY + 0.001, z: opticZ });
  // Rear glass, tilted a touch so it catches light.
  a.add(extrude(roundRect(0.03, 0.024, 0.004, 4), 0.0016), 'lens', {
    x: 0,
    y: opticY + 0.001,
    z: opticZ + 0.026,
  });
  a.add(extrude(roundRect(0.03, 0.024, 0.004, 4), 0.0016), 'lens', {
    x: 0,
    y: opticY + 0.001,
    z: opticZ - 0.026,
  });
  // Buttons on the left flank — small, but they break the silhouette.
  for (let i = 0; i < 2; i++) {
    a.add(rodZ(0.0032, 0.0032, 0.005, 12), 'polymer', {
      x: -0.019,
      y: opticY + 0.001,
      z: opticZ - 0.008 + i * 0.014,
      rz: Math.PI / 2,
    });
  }
  // Backup iron sight flipped down on the rail.
  a.add(box(0.008, 0.018, 0.006, 0.0012, 3, 2), 'alu', { x: 0, y: opticY - 0.008, z: 0.075 });

  /* ---------------------------------------------------------------------- */
  /*  accessories: laser / illuminator box on the left rail                  */
  /* ---------------------------------------------------------------------- */
  a.add(box(0.03, 0.019, 0.055, 0.002, 3, 2), 'polymer', { x: 0.033, y: 0.004, z: hgZ + 0.02 });
  a.add(rodZ(0.0038, 0.0038, 0.008, 12), 'alu', { x: 0.033, y: 0.004, z: hgZ - 0.008 });
  a.add(box(0.008, 0.006, 0.008, 0.001, 2, 2), 'polymer', { x: 0.033, y: 0.014, z: hgZ + 0.02 });

  /* ---------------------------------------------------------------------- */
  /*  small parts that sell the scale                                        */
  /* ---------------------------------------------------------------------- */
  // Takedown pins, both sides.
  for (const z of [-0.07, 0.115]) {
    a.addMirrored(rodZ(0.0038, 0.0038, 0.004, 12), 'steel', { x: 0.0176, y: -0.004, z, rz: Math.PI / 2 });
  }
  // Safety selector.
  a.add(rodZ(0.0042, 0.0042, 0.006, 12), 'steel', { x: -0.0176, y: 0.0, z: 0.05, rz: Math.PI / 2 });
  a.add(box(0.004, 0.012, 0.008, 0.001, 2, 2), 'steel', { x: -0.019, y: 0.006, z: 0.05, rz: 0.5 });
  // Bolt catch, left side.
  a.add(box(0.004, 0.014, 0.024, 0.001, 2, 2), 'steel', { x: -0.0176, y: 0.004, z: -0.02 });
  // Mag release.
  a.add(rodZ(0.004, 0.004, 0.005, 10), 'steel', { x: 0.0185, y: -0.008, z: -0.005, rz: Math.PI / 2 });
  // Sling loop on the stock.
  a.add(box(0.004, 0.024, 0.012, 0.001, 2, 2), 'steel', { x: 0.03, y: 0.004, z: 0.3 });

  const muzzleZ = supZ - D.suppressorLen / 2;

  /* ---------------------------------------------------------------------- */
  /*  attachment nodes for the animation rig                                 */
  /* ---------------------------------------------------------------------- */
  a.node('muzzle', 0, 0, muzzleZ);
  a.node('eject', D.receiverW / 2, upperY + 0.004, -0.03);
  a.node('opticAxis', 0, opticY, opticZ);
  a.node('bolt', 0, upperY + D.upperH / 2 + 0.004, D.receiverBack - 0.012);
  a.node('mag', 0, -0.041, -0.028);
  a.node('laserEmitter', 0.033, 0.004, hgZ - 0.012);
  a.node('flashlight', 0.033, 0.004, hgZ - 0.012);
  a.node('gripRight', 0, -0.09, 0.09);
  a.node('gripLeft', 0, 0, -hgZ + 0.02);

  return { ...a.build(), dim: D, muzzleZ, opticY };
}
