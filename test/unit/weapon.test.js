/**
 * Weapon state-machine tests. These run without three.js by stubbing the
 * viewmodel builder, and lock in the "reload transfers ammo exactly once" and
 * "semi-auto fires once per click" fixes.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { WeaponController, WEAPON_STATE } from '../../src/player/weapon.js';
import { WEAPONS } from '../../src/config.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------
const THREE = await import('three');

const OPERATOR = { primary: 'mk18', meleeDmg: 65 };

function makeViewmodel() {
  const group = () => new THREE.Group();
  const vm = {
    root: group(),
    gun: group(),
    boltPart: group(),
    magPart: group(),
    feedCoverPart: null,
    muzzlePoint: new THREE.Object3D(),
    ejectPoint: new THREE.Object3D(),
    flashGroup: group(),
    flashlight: { intensity: 0 },
    laserLine: {
      visible: false,
      geometry: { attributes: { position: { setXYZ() {}, needsUpdate: false } } },
      worldToLocal: (v) => v,
    },
    laserDot: { visible: false, position: new THREE.Vector3(), removeFromParent() {} },
    leftArm: group(),
    leftRestPos: new THREE.Vector3(),
    leftRestRot: new THREE.Euler(),
    optiY: 0.145,
    dispose() {},
  };
  return vm;
}

function makeController() {
  const calls = { shots: 0, hits: 0, prompts: [], kills: 0 };
  const sound = new Proxy({}, { get: () => () => {} });
  const fx = {
    spawnTracer() {},
    spawnCasing() {},
    spawnSparks() {},
    spawnImpact() {},
    detonate() {},
  };
  const level = { rayMeshes: [], colliders: [], scene: { add() {} } };
  const enemies = { hitboxes: [], damageEnemy: () => ({ killed: false, headshot: false }) };
  const camera = new THREE.PerspectiveCamera();

  const controller = new WeaponController({
    camera,
    tex: { cache: {} },
    sound,
    fx,
    enemies,
    level,
  });
  // Replace the real viewmodel builder (needs canvas textures) with a fake.
  controller.mount = () => {
    controller.vm = makeViewmodel();
    controller.camera.add(controller.vm.root);
  };
  controller.onShot = () => calls.shots++;
  controller.onHit = () => calls.hits++;
  controller.onPrompt = (text) => calls.prompts.push(text);
  controller.onKill = () => calls.kills++;
  return { controller, calls, sound, fx, enemies, camera };
}

// ---------------------------------------------------------------------------

describe('player/weapon', () => {
  let controller;

  beforeEach(() => {
    ({ controller } = makeController());
    controller.equip(OPERATOR);
  });

  it('equips a primary + sidearm loadout', () => {
    assert.equal(controller.currentId, 'mk18');
    assert.equal(controller.slots.length, 2);
    assert.equal(controller.slots[0].mag, WEAPONS.mk18.magSize);
    assert.equal(controller.slots[1].id, 'p226');
  });

  it('consumes one round per shot and respects the RPM cooldown', () => {
    const before = controller.currentSlot.mag;
    controller.tryFire();
    assert.equal(controller.currentSlot.mag, before - 1);
    controller.tryFire(); // still cooling down
    assert.equal(controller.currentSlot.mag, before - 1, 'fireTimer blocks the second shot');
    controller.fireTimer = 0;
    controller.tryFire();
    assert.equal(controller.currentSlot.mag, before - 2);
  });

  it('dry-fires with an empty magazine instead of going negative', () => {
    controller.currentSlot.mag = 0;
    controller.tryFire();
    assert.equal(controller.currentSlot.mag, 0);
    assert.ok(controller.fireTimer > 0);
  });

  it('transfers reserve ammo exactly once per reload', () => {
    const slot = controller.currentSlot;
    slot.mag = 5;
    slot.reserve = 60;
    controller.startReload();
    assert.equal(controller.state, WEAPON_STATE.RELOADING);
    for (let i = 0; i < 200; i++)
      controller.update(1 / 60, { triggerHeld: false, triggerPressed: false, adsAmt: 0 });
    assert.equal(slot.mag, WEAPONS.mk18.magSize, 'magazine is full');
    assert.equal(slot.reserve, 60 - (WEAPONS.mk18.magSize - 5), 'reserve decreased exactly once');
    assert.equal(controller.state, WEAPON_STATE.IDLE);
  });

  it('never overfills the magazine from a partial reserve', () => {
    const slot = controller.currentSlot;
    slot.mag = 0;
    slot.reserve = 7;
    controller.startReload();
    for (let i = 0; i < 200; i++)
      controller.update(1 / 60, { triggerHeld: false, triggerPressed: false, adsAmt: 0 });
    assert.equal(slot.mag, 7);
    assert.equal(slot.reserve, 0);
  });

  it('refuses to reload a full magazine', () => {
    const slot = controller.currentSlot;
    assert.equal(slot.mag, WEAPONS.mk18.magSize);
    controller.startReload();
    assert.equal(controller.state, WEAPON_STATE.IDLE);
  });

  it('fires semi-auto weapons once per trigger press', () => {
    controller.switchSlot(1);
    for (let i = 0; i < 40; i++)
      controller.update(1 / 60, { triggerHeld: false, triggerPressed: false, adsAmt: 0 });
    assert.equal(controller.currentId, 'p226');
    controller.fireTimer = 0;
    const before = controller.currentSlot.mag;
    // Held trigger must NOT auto-fire a semi-auto.
    controller.update(1 / 60, { triggerHeld: true, triggerPressed: false, adsAmt: 0 });
    assert.equal(controller.currentSlot.mag, before, 'held trigger does nothing');
    controller.fireTimer = 0;
    controller.update(1 / 60, { triggerHeld: false, triggerPressed: true, adsAmt: 0 });
    assert.equal(controller.currentSlot.mag, before - 1, 'single press = single shot');
  });

  it('enters the bolt cycle only for bolt-action weapons', () => {
    controller.equip({ primary: 'kar98', meleeDmg: 70 });
    const slot = controller.currentSlot;
    slot.mag = 5;
    controller.tryFire();
    assert.equal(controller.state, WEAPON_STATE.BOLT);
    for (let i = 0; i < 200; i++)
      controller.update(1 / 60, { triggerHeld: false, triggerPressed: false, adsAmt: 0 });
    assert.equal(controller.state, WEAPON_STATE.IDLE);
  });

  it('swaps slots and blocks firing while swapping', () => {
    controller.switchSlot(1);
    assert.equal(controller.currentId, 'p226');
    controller.fireTimer = 0;
    const before = controller.currentSlot.mag;
    controller.tryFire();
    assert.equal(controller.currentSlot.mag, before, 'cannot fire mid-swap');
  });

  it('reports a low-ammo state for the HUD', () => {
    controller.currentSlot.mag = 3;
    assert.equal(controller.ammoState.isLow, true);
    controller.currentSlot.mag = 20;
    assert.equal(controller.ammoState.isLow, false);
  });

  it('cycles back to the primary', () => {
    controller.switchSlot(1);
    for (let i = 0; i < 40; i++)
      controller.update(1 / 60, { triggerHeld: false, triggerPressed: false, adsAmt: 0 });
    controller.cycleSlot();
    assert.equal(controller.currentId, 'mk18');
  });
});
