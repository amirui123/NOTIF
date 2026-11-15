/**
 * P226 — full-size 9x19 service pistol.
 *
 * A pistol is the hardest viewmodel to fake because the player holds it close
 * and every proportion is familiar. The parts that matter:
 *
 *  - a slide with real longitudinal serrations at the rear and forward
 *    cocking serrations, both as geometry rather than texture
 *  - a frame with a dust cover that ends in a proper accessory rail
 *  - an exposed hammer and a beavertail, which is what makes a P226 read as a
 *    P226 rather than a generic block
 *  - a magazine that visibly enters the grip
 *
 * Real dimensions: overall 0.196 m, slide 0.032 m tall, barrel 112 mm,
 * 15-round magazine, bore 0.034 m over the frame's underside.
 */
import { Assembly, box, tubeZ, rodZ, latheZ, extrude, roundRect, serrations } from '../gunkit.js';

export const DIM = {
  slideLen: 0.196,
  slideH: 0.032,
  slideW: 0.029,
  frameLen: 0.168,
  barrelLen: 0.112,
  opticAxisY: 0.036,
};

export function buildP226() {
  const a = new Assembly('p226');
  const D = DIM;

  /* slide ----------------------------------------------------------------- */
  // The slide is the bore-adjacent mass: everything else hangs off it.
  const slideY = 0.022;
  a.add(box(D.slideW, D.slideH, D.slideLen, 0.0022, 3, 2), 'steel', {
    y: slideY,
    z: -0.004,
  });
  // Slide nose taper, so it is not a plain box from the side.
  a.add(box(D.slideW - 0.002, D.slideH - 0.008, 0.02, 0.002, 3, 2), 'steel', {
    y: slideY,
    z: -0.106,
  });
  // Rear cocking serrations: five per side, real depth.
  a.addMirrored(serrations(0.004, 0.024, 0.0018, 6, 'y'), 'steel', {
    x: D.slideW / 2,
    y: slideY,
    z: 0.062,
    rz: Math.PI / 2,
  });
  // Forward serrations, a P226 Mk25 tell.
  a.addMirrored(serrations(0.004, 0.018, 0.0018, 4, 'y'), 'steel', {
    x: D.slideW / 2,
    y: slideY,
    z: -0.062,
    rz: Math.PI / 2,
  });
  // Ejection port, a real recess on the right.
  a.add(extrude(roundRect(0.036, 0.016, 0.003, 4), 0.002), 'steel', {
    x: D.slideW / 2 - 0.001,
    y: slideY + 0.004,
    z: 0.016,
    rz: Math.PI / 2,
  });
  // Extractor claw.
  a.add(box(0.004, 0.005, 0.018, 0.001, 2, 2), 'steel', {
    x: D.slideW / 2 - 0.001,
    y: slideY + 0.008,
    z: 0.036,
  });

  /* barrel and muzzle ----------------------------------------------------- */
  a.add(tubeZ(0.0074, 0.0036, D.barrelLen, 16, 0.0006), 'steel', {
    y: 0.024,
    z: -D.barrelLen / 2 - 0.012,
  });
  // Crowned muzzle inside the slide's nose.
  a.add(
    latheZ(
      [
        [0, 0.0074],
        [0.0015, 0.0082],
        [0.006, 0.0082],
        [0.008, 0.0074],
      ],
      16,
    ),
    'steel',
    {
      y: 0.024,
      z: -0.108,
    },
  );

  /* sights ---------------------------------------------------------------- */
  const sightY = slideY + D.slideH / 2;
  // Front blade with a green insert.
  a.add(box(0.0035, 0.006, 0.005, 0.0008, 2, 2), 'steel', { y: sightY + 0.002, z: -0.088 });
  a.add(box(0.0022, 0.0032, 0.0016, 0.0004, 1, 1), 'glow', { y: sightY + 0.0032, z: -0.09 });
  // Rear notch: two posts with a real gap between them.
  a.addMirrored(box(0.0042, 0.0062, 0.006, 0.0008, 2, 2), 'steel', {
    x: 0.0052,
    y: sightY + 0.002,
    z: 0.078,
  });
  a.addMirrored(box(0.0018, 0.0026, 0.0016, 0.0004, 1, 1), 'glow', {
    x: 0.0052,
    y: sightY + 0.0032,
    z: 0.0765,
    rz: 0,
  });

  /* frame ----------------------------------------------------------------- */
  const frameY = -0.004;
  // Frame body with a dust cover that stops where the rail begins.
  a.add(box(0.026, 0.022, 0.13, 0.0022, 3, 2), 'polymer', { y: frameY, z: -0.028 });
  // Accessory rail under the dust cover: three teeth.
  for (let i = 0; i < 3; i++) {
    a.add(box(0.02, 0.004, 0.007, 0.001, 2, 2), 'polymer', {
      y: frameY - 0.013,
      z: -0.055 + i * 0.012,
    });
  }
  // Beavertail: the upswept tang that protects the hand from the slide.
  a.add(
    extrude(
      [
        [0, 0],
        [0.03, 0],
        [0.032, 0.008],
        [0.024, 0.014],
        [0, 0.012],
      ],
      0.026,
      { bevel: 0.0012, bevelSegments: 2 },
    ),
    'polymer',
    { x: -0.013, y: frameY + 0.01, z: 0.082, ry: Math.PI / 2 },
  );

  /* grip ------------------------------------------------------------------ */
  // A pistol grip is a quadrilateral in section, not a cylinder: flat front
  // strap, flat back strap, rounded sides.
  const grip = latheZ(
    [
      [0, 0.0128],
      [0.005, 0.0138],
      [0.045, 0.0142],
      [0.082, 0.0136],
      [0.098, 0.0128],
      [0.1, 0],
    ],
    4,
  );
  grip.scale(1.05, 1, 0.92);
  // The lathe's axis runs along its local +Z, so the grip's rake is the X
  // rotation that points +Z down-and-back. 0.22 rad left the grip almost
  // horizontal, sticking out behind the slide like a stock: the bounding box
  // grew to 271 mm and the magazine, placed for a vertical grip, ended up 74 mm
  // below the grip's actual end as a separate floating block. 1.26 rad is a
  // 18-degree rake off vertical, which is what a P226 grip is, and it lands the
  // grip exactly where the hand sockets already expect it.
  a.add(grip, 'polymer', { y: -0.016, z: 0.046, rx: 1.26 });
  // Checkering panels on both sides: the texture a shooter's hand finds.
  // Both checkering panels ride on the grip, so they take its rake and sit
  // about halfway down it.
  // Both panels must run ALONG the grip. The old transform rotated the strip
  // onto the X axis first (rz) and only then applied the rake, which left the
  // 50 mm checkering sticking straight out sideways: the pistol measured 74 mm
  // across, nearly twice a real P226 slide. Rotating the strip onto the grip
  // axis directly is one rotation, not two, and it is the grip's own axis:
  // Rx(2.83) maps +Y to (0, -0.952, +0.307), which is Rx(1.26) applied to +Z.
  a.addMirrored(serrations(0.0035, 0.05, 0.0016, 12, 'y'), 'polymer', {
    x: 0.0125,
    y: -0.052,
    z: 0.057,
    rx: 2.83,
  });
  a.add(serrations(0.016, 0.05, 0.0016, 8, 'y'), 'polymer', {
    y: -0.052,
    z: 0.069,
    rx: 2.83,
  });

  /* trigger guard and trigger --------------------------------------------- */
  a.add(
    extrude(
      [
        [0, 0],
        [0, 0.011],
        [0.032, 0.011],
        [0.032, 0],
        [0.026, 0],
        [0.026, 0.0055],
        [0.006, 0.0055],
        [0.006, 0],
      ],
      0.013,
      { bevel: 0.0007, bevelSegments: 2 },
    ),
    'polymer',
    { x: -0.0065, y: -0.024, z: 0.028, ry: Math.PI / 2 },
  );
  a.add(box(0.0035, 0.017, 0.007, 0.0008, 2, 2), 'steel', { y: -0.026, z: 0.034, rx: -0.22 });

  /* exposed hammer -------------------------------------------------------- */
  // The hammer spur sits behind the slide, and it is the part that says
  // "this is a DA/SA metal-frame pistol".
  a.add(box(0.01, 0.007, 0.016, 0.0015, 2, 2), 'steel', { y: frameY + 0.016, z: 0.09 });
  a.add(rodZ(0.0035, 0.0035, 0.016, 10), 'steel', { x: 0.0, y: frameY + 0.014, z: 0.098, rz: Math.PI / 2 });

  /* magazine: base plate and the seam where it enters the grip ------------- */
  // The magazine lives inside the grip and only its floorplate shows, so it
  // takes the same rake and sits at the grip's far end rather than 70 mm below
  // it. Bore to magazine floor is now 122 mm, which is a real P226's 140 mm
  // overall height once the slide is counted.
  a.add(box(0.024, 0.012, 0.04, 0.002, 3, 2), 'polymer', { y: -0.072, z: 0.064, rx: 1.26 });
  a.add(box(0.027, 0.006, 0.043, 0.0018, 3, 2), 'rubber', { y: -0.083, z: 0.067, rx: 1.26 });
  a.add(box(0.022, 0.008, 0.038, 0.0015, 2, 2), 'steel', { y: -0.063, z: 0.061, rx: 1.26 });

  /* controls -------------------------------------------------------------- */
  // Decocker, slide stop and magazine release, all on the left as on the real
  // gun, plus an ambidextrous release for the Mk25.
  a.add(rodZ(0.004, 0.004, 0.006, 12), 'steel', { x: -0.014, y: 0.006, z: 0.05, rz: Math.PI / 2 });
  a.add(box(0.004, 0.012, 0.006, 0.001, 2, 2), 'steel', { x: -0.016, y: 0.01, z: 0.048, rx: 0.4 });
  a.add(box(0.004, 0.009, 0.024, 0.001, 2, 2), 'steel', { x: -0.0142, y: 0.004, z: 0.022 });
  a.addMirrored(rodZ(0.0032, 0.0032, 0.005, 10), 'steel', { x: 0.0128, y: -0.018, z: 0.05, rz: Math.PI / 2 });
  // Sling loop.
  a.add(box(0.003, 0.014, 0.008, 0.001, 2, 2), 'steel', { x: 0.012, y: -0.012, z: 0.09 });

  const muzzleZ = -0.11;
  a.node('muzzle', 0, 0.024, muzzleZ);
  a.node('eject', D.slideW / 2, slideY + 0.004, 0.016);
  a.node('opticAxis', 0, D.opticAxisY, -0.02);
  a.node('bolt', 0, slideY, 0.0);
  a.node('mag', 0, -0.06, 0.058);
  a.node('laserEmitter', 0, frameY - 0.014, -0.055);
  a.node('flashlight', 0, frameY - 0.014, -0.055);
  a.node('gripRight', 0, -0.062, 0.058);
  a.node('gripLeft', 0, -0.058, 0.03);

  return { ...a.build(), dim: D, muzzleZ, opticY: D.opticAxisY };
}
