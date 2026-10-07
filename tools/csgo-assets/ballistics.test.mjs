import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, weaponState } from './weapons.mjs';
import { WEAPON_REFERENCE, REFERENCE } from './weapon-reference.mjs';
import { parseKeyValues, resolvePrefab, extractWeapons } from './import-weapon-reference.mjs';
import {
  SOURCE_UNIT,
  bulletDamage,
  shotAccuracy,
  maxMoveSpeed,
  recoverWeapon,
  recoilKick,
  spreadOffset,
  verticalFov,
} from './ballistics.mjs';
import { Match } from './match.mjs';
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('all 34 firearms use the pinned numeric schema with valid inherited attributes', () => {
  assert.equal(Object.keys(WEAPON_REFERENCE).length, 34);
  assert.equal(REFERENCE.commit, '108f1682bf7eeb1420caaf2357da88b614a7e1b0');
  for (const [id, { attributes: a }] of Object.entries(WEAPON_REFERENCE)) {
    const w = WEAPONS[id];
    assert.equal(w.damage, a.damage);
    close(w.rpm, 60 / a.cycletime);
    assert.equal(w.mag, a['primary clip size']);
    assert.equal(w.reserve, a['primary reserve ammo max']);
    assert.equal(w.pellets, a.bullets);
    assert.equal(w.armorRatio, a['armor ratio']);
    assert.equal(w.price, a['in game price']);
    for (const value of Object.values(w.accuracy)) assert.ok(Number.isFinite(value) && value >= 0);
    assert.ok(w.maxSpeed > 0 && w.recovery > 0 && w.zoomLevels >= 0);
  }
  assert.equal(WEAPONS.nova.automatic, false);
  assert.equal(WEAPONS.xm1014.automatic, true);
  assert.deepEqual(
    ['nova', 'xm1014', 'mag-7', 'sawed-off'].map((id) => WEAPONS[id].pellets),
    [9, 6, 8, 8],
  );
  assert.equal(WEAPONS.m4a1_s.headMultiplier, 3.475);
});
test('KeyValues preserves repeated object sections, quoted URLs and prefab overrides', () => {
  const value = parseKeyValues(
    '"items" { "a" "1" } // comment\n "items" { "b" "2" } "url" "https://test/path"',
  );
  assert.equal(value.items.a, '1');
  assert.equal(value.items.b, '2');
  assert.equal(value.url, 'https://test/path');
  const prefabs = {
    base: { attributes: { damage: '42', bullets: '1' } },
    child: { prefab: 'base', attributes: { damage: '36' } },
  };
  const result = resolvePrefab({ prefab: 'child', attributes: { bullets: '9' } }, prefabs);
  assert.equal(result.attributes.damage, '36');
  assert.equal(result.attributes.bullets, '9');
  assert.throws(() => resolvePrefab({ prefab: 'loop' }, { loop: { prefab: 'loop' } }));
  assert.throws(() => parseKeyValues('"a" { "b" "1"'));
  assert.throws(() => extractWeapons(Buffer.from('untrusted data')), /SHA-256/);
});
test('AK headshots penetrate helmets, AWP body shots kill, M4A1-S helmet shots do not', () => {
  close(bulletDamage(WEAPONS['ak-47'], 0, 'head', 100, true).health, 111.6);
  assert.ok(bulletDamage(WEAPONS.awp, 0, 'chest', 100, true).health > 100);
  assert.ok(bulletDamage(WEAPONS.m4a1_s, 0, 'head', 100, true).health < 100);
  close(bulletDamage(WEAPONS['ak-47'], 0, 'head', 100, false).health, 144);
});
test('range decay uses Source units, stomach has its own multiplier, legs ignore armor', () => {
  const ak = WEAPONS['ak-47'];
  close(bulletDamage(ak, 500 * SOURCE_UNIT, 'chest').health, 36 * 0.98);
  close(bulletDamage(ak, 1000 * SOURCE_UNIT, 'chest').health, 36 * 0.98 ** 2);
  close(bulletDamage(ak, 0, 'stomach').health, 45);
  assert.deepEqual(bulletDamage(ak, 0, 'leg', 100, true), { health: 27, armor: 0 });
});
test('insufficient armor is consumed without over-absorbing damage', () => {
  const d = bulletDamage(WEAPONS['ak-47'], 0, 'chest', 1, true);
  close(d.armor, 1);
  close(d.health, 34);
});
test('moving, jumping and sustained fire reduce accuracy, recovery restores it', () => {
  const w = WEAPONS['ak-47'],
    state = weaponState(w.id),
    player = { grounded: true, speed: 0 };
  const still = shotAccuracy(w, state, player);
  assert.ok(shotAccuracy(w, state, { ...player, crouch: true }).inaccuracy < still.inaccuracy);
  assert.ok(
    shotAccuracy(w, state, { ...player, speed: maxMoveSpeed(w) }).inaccuracy > still.inaccuracy * 5,
  );
  assert.ok(shotAccuracy(w, state, { ...player, grounded: false }).inaccuracy > still.inaccuracy);
  state.accuracyPenalty = 0.05;
  state.recoilIndex = 8;
  state.lastShot = 0;
  assert.ok(shotAccuracy(w, state, player).inaccuracy > still.inaccuracy);
  recoverWeapon(state, w, 2, 2, false);
  assert.ok(state.accuracyPenalty < 0.00001);
  assert.equal(state.recoilIndex, 0);
});
test('weapon weight, scope, walk and crouch set distinct movement caps', () => {
  close(maxMoveSpeed(WEAPONS['ak-47']), 215 * SOURCE_UNIT);
  close(maxMoveSpeed(WEAPONS.awp, { scoped: true }), 100 * SOURCE_UNIT);
  close(maxMoveSpeed(WEAPONS.knife), 250 * SOURCE_UNIT);
  assert.ok(
    maxMoveSpeed(WEAPONS['ak-47'], { crouch: true }) <
      maxMoveSpeed(WEAPONS['ak-47'], { walking: true }),
  );
  assert.ok(verticalFov(10) < verticalFov(40));
  close(verticalFov(90), 73.73979529168804);
});
test('recoil is repeatable and spread emits distinct bounded pellet offsets', () => {
  assert.deepEqual(recoilKick(WEAPONS['ak-47'], 10), recoilKick(WEAPONS['ak-47'], 10));
  assert.ok(recoilKick(WEAPONS['ak-47'], 1).pitch > 0);
  assert.notDeepEqual(recoilKick(WEAPONS['ak-47'], 10), recoilKick(WEAPONS.m4a4, 10));
  let seed = 42;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pellets = Array.from({ length: 9 }, () =>
    spreadOffset({ spread: 0.04, inaccuracy: 0.01 }, random),
  );
  assert.equal(new Set(pellets.map((p) => JSON.stringify(p))).size, 9);
  assert.ok(pellets.every((p) => Math.hypot(p.x, p.y) <= 0.05));
});
test('match applies bullet armor once, awards weapon-specific rewards and resets fire state', () => {
  const m = new Match();
  m.tick(11);
  const p = m.players[0],
    v = m.players[5];
  m.equip(p, 'awp');
  v.armor = 100;
  v.helmet = true;
  const money = p.money;
  m.bulletHit(v, p, 0, 'chest');
  assert.equal(v.alive, false);
  assert.equal(p.money - money, WEAPONS.awp.killAward);
  m.fire(p);
  assert.ok(p.weapon.accuracyPenalty > 0);
  m.newRound();
  assert.equal(p.weapon.accuracyPenalty, 0);
  assert.equal(p.weapon.recoilIndex, 0);
  m.tick(11);
  m.equip(p, 'sg_553');
  p.scoped = true;
  assert.equal(m.fire(p), true);
  close(p.weapon.accuracyPenalty, WEAPONS.sg_553.scopedAccuracy.fire);
});
