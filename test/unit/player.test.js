/**
 * Player controller: movement, collision, crouch headroom and damage model.
 * Uses a hand-built level stub so the physics maths is what is under test.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Player } from '../../src/player/player.js';

/** A wall to the east of the spawn and a low beam overhead to the south. */
const WALL = { minX: 2, maxX: 3, minY: 0, maxY: 3, minZ: 10, maxZ: 26, matType: 'concrete', kind: 'static' };
const BEAM = { minX: -2, maxX: 2, minY: 1.35, maxY: 3, minZ: 16, maxZ: 20, matType: 'metal', kind: 'static' };

function makeLevel(colliders = []) {
  return {
    rayMeshes: [],
    colliders: colliders.map((c) => ({ ...c })),
    getFloorHeight: () => 0,
    getSurfaceType: () => 'dirt',
  };
}

const openLevel = () => makeLevel([]);
const soundStub = () => new Proxy({}, { get: () => () => {} });

const weaponStub = () => ({
  canSprint: true,
  canAds: true,
  currentId: 'mk18',
  recoilPitch: 0,
  recoilYaw: 0,
  adsAmt: 0,
});

const baseInput = (over = {}) => ({
  forward: 0,
  strafe: 0,
  sprint: false,
  crouchHeld: false,
  jump: false,
  ads: false,
  lean: 0,
  moving: false,
  ...over,
});

const OPERATOR = { hp: 100, armor: 50, speedMult: 1 };

describe('player/player', () => {
  let player;
  let camera;
  let weapon;

  beforeEach(() => {
    player = new Player(openLevel(), soundStub());
    player.reset(OPERATOR);
    camera = new THREE.PerspectiveCamera();
    weapon = weaponStub();
  });

  it('walks forward along -Z', () => {
    const input = baseInput({ forward: 1, moving: true });
    for (let i = 0; i < 60; i++) player.update(1 / 60, input, weapon, camera);
    assert.ok(player.position.z < 14, `moved forward (z=${player.position.z.toFixed(2)})`);
    assert.ok(Math.abs(player.position.x) < 0.01, 'no sideways drift');
  });

  it('normalises diagonal movement (no diagonal speed boost)', () => {
    const straight = new Player(openLevel(), soundStub());
    straight.reset(OPERATOR);
    const diag = new Player(openLevel(), soundStub());
    diag.reset(OPERATOR);

    const camA = new THREE.PerspectiveCamera();
    const camB = new THREE.PerspectiveCamera();
    for (let i = 0; i < 60; i++) {
      straight.update(1 / 60, baseInput({ forward: 1, moving: true }), weaponStub(), camA);
      diag.update(1 / 60, baseInput({ forward: 1, strafe: 1, moving: true }), weaponStub(), camB);
    }
    const dStraight = Math.hypot(straight.position.x, straight.position.z - 18);
    const dDiag = Math.hypot(diag.position.x, diag.position.z - 18);
    assert.ok(dStraight > 3, `straight moved ${dStraight.toFixed(2)}`);
    assert.ok(
      Math.abs(dStraight - dDiag) < 0.9,
      `diagonal ${dDiag.toFixed(2)} vs straight ${dStraight.toFixed(2)}`,
    );
  });

  it('stops at a wall instead of passing through it', () => {
    player = new Player(makeLevel([WALL]), soundStub());
    player.reset(OPERATOR);
    const input = baseInput({ strafe: 1, moving: true });
    for (let i = 0; i < 300; i++) player.update(1 / 60, input, weapon, camera);
    assert.ok(player.position.x < 2, `blocked by the wall (x=${player.position.x.toFixed(2)})`);
    assert.ok(
      player.position.x > 1.4,
      `stopped against the wall, not far from it (x=${player.position.x.toFixed(2)})`,
    );
  });

  it('sprints faster than walking', () => {
    const walker = new Player(openLevel(), soundStub());
    walker.reset(OPERATOR);
    const sprinter = new Player(openLevel(), soundStub());
    sprinter.reset(OPERATOR);
    const cam = new THREE.PerspectiveCamera();
    for (let i = 0; i < 120; i++) {
      walker.update(1 / 60, baseInput({ forward: 1, moving: true }), weaponStub(), cam);
      sprinter.update(1 / 60, baseInput({ forward: 1, sprint: true, moving: true }), weaponStub(), cam);
    }
    const walkDist = Math.abs(walker.position.z - 18);
    const sprintDist = Math.abs(sprinter.position.z - 18);
    assert.ok(sprintDist > walkDist * 1.2, `sprint ${sprintDist.toFixed(2)} > walk ${walkDist.toFixed(2)}`);
  });

  it('crouches under a low ceiling and refuses to stand up', () => {
    player = new Player(makeLevel([BEAM]), soundStub());
    player.reset(OPERATOR);
    player.position.set(0, 0, 18);
    player.toggleCrouch();
    for (let i = 0; i < 40; i++) player.update(1 / 60, baseInput({ crouchHeld: true }), weapon, camera);
    assert.ok(player.crouchAmt > 0.85, `crouched (${player.crouchAmt.toFixed(2)})`);

    player.toggleCrouch(); // try to stand under the beam
    assert.equal(player.crouchToggle, true, 'stays crouched under the ceiling');

    // ...and can stand again once clear of it.
    player.position.set(0, 0, 6);
    player.toggleCrouch();
    assert.equal(player.crouchToggle, false, 'stands up in the open');
  });

  it('does not let overhead geometry shove the player sideways', () => {
    player = new Player(makeLevel([BEAM]), soundStub());
    player.reset(OPERATOR);
    player.position.set(-1.2, 0, 18); // under the beam, walking east
    const input = baseInput({ strafe: 1, moving: true });
    for (let i = 0; i < 90; i++) player.update(1 / 60, input, weapon, camera);
    assert.ok(player.position.x > 2.5, `walked under the beam (x=${player.position.x.toFixed(2)})`);
    assert.ok(Math.abs(player.position.z - 18) < 0.05, 'no sideways push from the ceiling');
  });

  it('applies armour before health', () => {
    player.addDamage(20, new THREE.Vector3(0, 0, 0));
    assert.ok(player.armor < 50, 'armour absorbed part of the hit');
    assert.ok(player.hp > 80, 'health only lost the remainder');
  });

  it('flags a lethal hit immediately', () => {
    player.armor = 0;
    player.hp = 10;
    const lethal = player.takeHit(50, new THREE.Vector3(0, 0, 0));
    assert.equal(lethal, true);
    assert.equal(player.isDead, true);
    assert.equal(player.takeHit(10, new THREE.Vector3()), false, 'no double-death');
  });

  it('clears all combat state on reset', () => {
    player.addDamage(30, new THREE.Vector3(2, 0, 2));
    player.reset(OPERATOR);
    assert.equal(player.hp, 100);
    assert.equal(player.armor, 50);
    assert.equal(player.damageAlpha, 0);
    assert.equal(player.isDead, false);
    assert.deepEqual(player.position.toArray(), [0, 0, 18]);
  });

  it('heals without exceeding the caps', () => {
    player.hp = 90;
    player.armor = 45;
    player.heal(35, 25);
    assert.equal(player.hp, 100);
    assert.equal(player.armor, 50);
  });
});
