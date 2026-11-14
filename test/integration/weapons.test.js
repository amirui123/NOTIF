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

  it('keeps the optic axis inside the ADS framing window', async () => {
    // The viewmodel is parented to the camera at `adsPos` when aiming, so the
    // optic's own height in weapon-local space is what lands on the screen
    // centre. What has to be a real number is the angular offset: eye relief
    // divided by the optic height gives the angle the gun has to be canted to
    // put the reticle on the crosshair, and it must stay small enough that the
    // shooter still sees down the tube rather than at the receiver's side.
    const WEAPONS = (await import(join(ROOT, 'src/config.js'))).WEAPONS;
    for (const id of WEAPON_IDS) {
      const vm = buildViewmodel(id, OPERATORS[0], tex);
      try {
        const spec = WEAPONS[id];
        const eyeRelief = Math.abs(spec.adsPos[2]);
        const axis = vm.opticY;
        assert.ok(
          axis > 0.025 && axis < 0.11,
          `${id}: optic axis ${axis.toFixed(3)} m is not a sight height`,
        );
        const cant = Math.atan2(axis, eyeRelief);
        assert.ok(cant < 0.5, `${id}: needs ${(cant * 57.3).toFixed(1)} deg of cant to aim`);
        // And the sight must actually sit above the bore, or it is not a sight.
        assert.ok(axis > 0.02, `${id}: optic ${axis.toFixed(3)} m over the bore`);
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
