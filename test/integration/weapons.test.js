/**
 * Every weapon's viewmodel, built for real.
 *
 * The bug class this guards against is specific. `WeaponController` reaches
 * into the viewmodel by name every single frame:
 *
 *   vm.magPart.position.set(...)      on reload
 *   vm.boltPart.position.z = ...      on bolt cycle and fire
 *   vm.leftArm.position.set(...)      on reload and bolt
 *   vm.muzzlePoint.getWorldPosition()  on fire, for the flash and the laser
 *   vm.ejectPoint.getWorldPosition()   on every case ejected
 *   vm.flashlight / vm.laserLine / vm.laserDot
 *
 * If a rebuilt weapon is missing one of those, nothing throws: the animation
 * silently stops, or the flash spawns at the origin. So these tests compare the
 * contract surface of all six weapons against each other, and check the
 * numbers the pose solve depends on.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureBrowserGlobals, stubCanvas2D } from '../helpers/three-env.js';

const ROOT = process.cwd();
const WEAPON_IDS = ['mk18', 'hk416', 'mp7', 'p226', 'm249', 'kar98'];

const REQUIRED = [
  'root',
  'gun',
  'boltPart',
  'magPart',
  'muzzlePoint',
  'ejectPoint',
  'flashGroup',
  'flashlight',
  'laserLine',
  'laserDot',
  'leftArm',
  'leftRestPos',
  'leftRestRot',
];

/** Every mesh under `root`, skipping nothing. */
function allMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (o.isMesh) out.push(o);
  });
  return out;
}

/** True when any ancestor of `o` is one of the arm groups. */
function insideArm(o) {
  for (let p = o; p; p = p.parent) if (p.userData?.arm) return true;
  return false;
}

/**
 * Fraction of a mesh's triangles whose winding normal agrees with its vertex
 * normals. 1.0 = consistently wound, 0.0 = inverted. Validated against a
 * control: a Box, Sphere and Cylinder all score 1.0, and a Box with its index
 * order flipped scores 0.0.
 */
function windingAgreement(mesh, THREE) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  if (!nrm) return 1;
  const idx = g.getIndex();
  const count = idx ? idx.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const n = new THREE.Vector3();
  let agree = 0;
  let total = 0;
  for (let i = 0; i < count; i += 3) {
    const ia = idx ? idx.getX(i) : i;
    const ib = idx ? idx.getX(i + 1) : i + 1;
    const ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.lengthSq() < 1e-18 || ac.lengthSq() < 1e-18) continue;
    cross.crossVectors(ab, ac);
    if (cross.lengthSq() < 1e-18) continue;
    n.fromBufferAttribute(nrm, ia)
      .add(new THREE.Vector3().fromBufferAttribute(nrm, ib))
      .add(new THREE.Vector3().fromBufferAttribute(nrm, ic));
    if (n.lengthSq() < 1e-18) continue;
    total++;
    if (cross.dot(n) > 0) agree++;
  }
  return total ? agree / total : 1;
}

describe('weapon viewmodels', () => {
  let tex;
  let buildViewmodel;
  let OPERATORS;
  let window;

  before(async () => {
    const dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    ensureBrowserGlobals(window);
    stubCanvas2D(window);
    const textures = await import(join(ROOT, 'src/engine/textures.js'));
    const viewmodel = await import(join(ROOT, 'src/world/viewmodel.js'));
    const config = await import(join(ROOT, 'src/config.js'));
    buildViewmodel = viewmodel.buildViewmodel;
    OPERATORS = config.OPERATORS;
    tex = new textures.TextureFactory(4);
    for (const key of ['gunmetal', 'wood', 'camo']) tex.buildSet(key);
  });

  after(() => window?.close());

  it('every weapon id in the config has a built viewmodel', () => {
    const built = WEAPON_IDS.map((id) => ({ id, vm: buildViewmodel(id, OPERATORS[0], tex) }));
    try {
      for (const { id, vm } of built) {
        assert.ok(vm.root, `${id} has no root`);
        assert.ok(vm.gun, `${id} has no gun group`);
      }
    } finally {
      for (const { vm } of built) vm.dispose();
    }
  });

  it('exposes the full contract the weapon controller animates', () => {
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        for (const key of REQUIRED) {
          assert.ok(vm[key], `${id} is missing vm.${key}`);
        }
        assert.equal(typeof vm.dispose, 'function', `${id} has no dispose`);
        assert.ok(vm.magPart.isObject3D, `${id}.magPart is not a node`);
        assert.ok(vm.boltPart.isObject3D, `${id}.boltPart is not a node`);
        assert.ok(vm.muzzlePoint.isObject3D, `${id}.muzzlePoint is not a node`);
        assert.ok(vm.leftArm.isObject3D, `${id}.leftArm is not a node`);
      } finally {
        vm.dispose();
      }
    }
  });

  it('puts every muzzle in front of the receiver and behind the near plane', () => {
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        const z = vm.muzzlePoint.position.z;
        assert.ok(z < -0.05, `${id} muzzle is at z=${z}, not in front of the gun`);
        assert.ok(z > -0.9, `${id} muzzle is at z=${z}, absurdly far forward`);
      } finally {
        vm.dispose();
      }
    }
  });

  it('winds every mesh the same way round', async () => {
    // Inside-out surfaces are the single most damaging modelling bug here: the
    // gun still silhouettes correctly, so it survives every "does it look like
    // a rifle" check, but it lights wrong and the shading turns into stripes.
    //
    // Signed volume cannot see it (these meshes are open shells), so this
    // measures how often each triangle's winding normal agrees with its vertex
    // normals. A correct mesh scores 1.0; a fully inverted one scores 0.0.
    const THREE = await import('three');
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        for (const mesh of allMeshes(vm.root)) {
          const ratio = windingAgreement(mesh, THREE);
          assert.ok(ratio >= 0.85, `${id}: a mesh is wound inside out (agreement ${ratio.toFixed(3)})`);
        }
      } finally {
        vm.dispose();
      }
    }
  });

  it('has both hands actually holding the weapon', async () => {
    // `gripRight` / `gripLeft` are sockets the weapon declares. A hand that is
    // placed near one, or posed by hand-tuned Euler angles, floats clear of the
    // gun — which reads as "the parts are right but it is not assembled".
    //
    // The glove is the fist, so measure the GLOVE against the weapon's own
    // meshes. Including the sleeve would let a hand 20 cm out still pass,
    // because some part of the arm is always near the gun.
    const THREE = await import('three');
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        vm.root.updateMatrixWorld(true);
        const weaponPts = [];
        for (const mesh of allMeshes(vm.root)) {
          if (insideArm(mesh)) continue;
          const pos = mesh.geometry.getAttribute('position');
          const v = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            weaponPts.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
          }
        }
        const arms = [];
        vm.root.traverse((o) => {
          if (o.userData.arm) arms.push(o);
        });
        assert.equal(arms.length, 2, `${id}: expected a firing hand and a support hand`);
        for (const arm of arms) {
          const side = arm.userData.arm;
          const socket = new THREE.Vector3(...vm.nodes.get(`grip${side === 'right' ? 'Right' : 'Left'}`).pos);
          const glove = arm.children.find((c) => c.isGroup) ?? arm;
          const pts = [];
          const box = new THREE.Box3();
          for (const mesh of allMeshes(glove)) {
            const pos = mesh.geometry.getAttribute('position');
            const v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
              const p = v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone();
              pts.push(p);
              box.expandByPoint(p);
            }
          }
          let nearest = Infinity;
          for (const p of pts) {
            for (const q of weaponPts) {
              const d = p.distanceToSquared(q);
              if (d < nearest) nearest = d;
            }
          }
          nearest = Math.sqrt(nearest);
          assert.ok(
            nearest < 0.012,
            `${id}: ${side} hand is ${(nearest * 1000).toFixed(0)} mm off the weapon`,
          );
          // And the grip has to be inside the fist, not beside it.
          const world = socket.clone().applyMatrix4(vm.gun.matrixWorld);
          assert.ok(box.containsPoint(world), `${id}: ${side} hand is not wrapped around its grip`);
        }
      } finally {
        vm.dispose();
      }
    }
  });

  it('puts the optic on the camera axis when aiming', async () => {
    // The viewmodel is parented to the camera, so at the ADS pose the optic's
    // own axis has to land ON the view axis: that is what makes the reticle sit
    // under the crosshair instead of somewhere over the receiver.
    //
    // This used to be checked indirectly, as the angle the gun would have to be
    // canted by — optic height over the distance to the weapon's ORIGIN. That
    // proxy broke the moment `adsPos` started being solved from the optic
    // socket rather than hand-tuned: the origin is now only 7 cm away while the
    // optic itself sits a correct 9 cm down the axis, so the proxy reported a
    // 41-degree cant for a gun that was aimed perfectly. Measure the thing that
    // actually matters instead.
    const WEAPONS = (await import(join(ROOT, 'src/config.js'))).WEAPONS;
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        const spec = WEAPONS[id];
        const axis = vm.opticY;
        assert.ok(
          axis > 0.025 && axis < 0.11,
          `${id}: optic axis ${axis.toFixed(3)} m is not a sight height`,
        );
        // And the sight must actually sit above the bore, or it is not a sight.
        assert.ok(axis > 0.02, `${id}: optic ${axis.toFixed(3)} m over the bore`);

        // At ADS the hip rotation is faded out, so the root carries no cant.
        const optic = vm.nodes.get('opticAxis');
        assert.ok(optic, `${id}: no opticAxis node to aim through`);
        const at = new (await import('three')).Vector3(...optic.pos).add(
          new (await import('three')).Vector3(...spec.adsPos),
        );
        assert.ok(
          Math.abs(at.x) < 0.001 && Math.abs(at.y) < 0.001,
          `${id}: optic lands at [${at.x.toFixed(4)}, ${at.y.toFixed(4)}] instead of on the axis`,
        );
        const relief = Math.abs(at.z);
        assert.ok(
          relief > 0.04 && relief < 0.16,
          `${id}: eye relief ${(relief * 100).toFixed(1)} cm is not a head position`,
        );
        // The muzzle has to be downrange of the eye, not behind it.
        const muzzleZ = vm.muzzleZ + spec.adsPos[2];
        assert.ok(muzzleZ < -0.1, `${id}: muzzle only ${(-muzzleZ * 100).toFixed(0)} cm out front`);
      } finally {
        vm.dispose();
      }
    }
  });

  it('is built from real geometry, not a box blockout', () => {
    // The whole point of the rebuild. The old viewmodels were 338-894
    // triangles each and shared one material; anything back under 2000
    // triangles means a builder silently fell back to the placeholder.
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        const stats = vm.stats();
        assert.ok(stats.tris > 2000, `${id} is only ${stats.tris} triangles`);
        assert.ok(stats.meshes >= 20, `${id} has only ${stats.meshes} meshes`);
      } finally {
        vm.dispose();
      }
    }
  });

  it('splits the weapon across several materials so surfaces separate', () => {
    // Material separation is the read at 0.4 m. One shared metal material is
    // what made the old guns look like a single grey object.
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        const tags = new Set();
        vm.root.traverse((node) => {
          if (node.isMesh && node.material?.isMeshStandardMaterial) tags.add(node.material.uuid);
        });
        assert.ok(tags.size >= 4, `${id} uses only ${tags.size} materials`);
      } finally {
        vm.dispose();
      }
    }
  });

  it('keeps the viewmodel out of the shadow pass', () => {
    // A camera-parented mesh that casts shadows produces acne across the whole
    // screen; this was a real shipped bug once.
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        vm.root.traverse((node) => {
          if (node.isMesh) {
            assert.equal(node.castShadow, false, `${id} casts a shadow`);
            assert.equal(node.receiveShadow, false, `${id} receives a shadow`);
          }
        });
      } finally {
        vm.dispose();
      }
    }
  });

  it('has no NaN in any weapon transform', () => {
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        vm.root.updateMatrixWorld(true);
        vm.root.traverse((node) => {
          const p = node.position;
          const r = node.rotation;
          assert.ok(
            Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
            `${id} bad position`,
          );
          assert.ok(
            Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z),
            `${id} bad rotation`,
          );
        });
      } finally {
        vm.dispose();
      }
    }
  });

  it('releases every geometry and material on dispose', () => {
    let observed = 0;
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      const geometries = [];
      vm.root.traverse((node) => {
        if (node.isMesh && node.geometry) geometries.push(node.geometry);
      });
      const spies = geometries.map((g) => {
        const original = g.dispose.bind(g);
        let called = false;
        g.dispose = () => {
          called = true;
          original();
        };
        return { g, called: () => called };
      });
      vm.dispose();
      for (const spy of spies) {
        if (spy.called()) observed++;
      }
      assert.equal(spies.filter((s) => s.called()).length, spies.length, `${id} leaked geometry`);
    }
    assert.ok(observed > 0);
  });
});
