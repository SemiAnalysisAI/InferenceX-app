import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, RULES } from './match.mjs';
import { WEAPONS } from './weapons.mjs';
import { Navigation } from './navigation.mjs';
test('one human and nine bots are split into two teams', () => {
  const m = new Match({ team: 'CT' });
  assert.equal(m.players.filter((p) => p.human).length, 1);
  assert.equal(m.players.filter((p) => !p.human).length, 9);
  assert.equal(m.players.filter((p) => p.team === 'CT').length, 5);
  assert.equal(m.players[0].team, 'CT');
});
test('34 weapon meshes have playable definitions plus knife', () => {
  assert.equal(Object.keys(WEAPONS).length, 35);
  for (const w of Object.values(WEAPONS)) {
    assert.ok(w.mag > 0);
    assert.ok(w.rpm > 0);
  }
});
test('team restrictions, budget and buy zone are enforced', () => {
  const m = new Match(),
    p = m.players[0];
  p.money = 16000;
  assert.equal(m.buy(p, 'm4a4'), false);
  assert.equal(m.buy(p, 'ak-47'), true);
  assert.equal(p.money, 13300);
  p.position.z = 80;
  assert.equal(m.buy(p, 'armor'), false);
  p.position.z = 0;
  p.money = 0;
  assert.equal(m.buy(p, 'armor'), false);
});
test('ammo is spent only when live and rate limits apply', () => {
  const m = new Match(),
    p = m.players[0];
  assert.equal(m.fire(p), false);
  m.tick(RULES.freeze + 1);
  assert.equal(m.fire(p), true);
  assert.equal(p.weapon.ammo, 19);
  assert.equal(m.fire(p), false);
  m.tick(0.2);
  assert.equal(m.fire(p), true);
});
test('switching weapons cancels reload without creating ammunition', () => {
  const m = new Match(),
    p = m.players[0],
    w = p.weapon;
  w.ammo = 0;
  w.reserve = 7;
  assert.equal(m.reload(p), true);
  m.switchWeapon(
    p,
    p.inventory.find((item) => item.id === 'knife'),
  );
  m.tick(3);
  assert.equal(w.ammo, 0);
  assert.equal(w.reserve, 7);
  m.switchWeapon(p, w);
  m.reload(p);
  m.tick(3);
  assert.equal(w.ammo, 7);
  assert.equal(w.reserve, 0);
});
test('weapon pickup preserves ammo and respects slots, distance, height and cooldown', () => {
  const m = new Match(),
    p = m.players[0];
  p.money = 16000;
  m.buy(p, 'ak-47');
  p.weapon.ammo = 11;
  m.dropWeapon(p);
  assert.equal(m.pickupWeapon(p), false);
  m.tick(0.8);
  p.position.y = 2;
  assert.equal(m.pickupWeapon(p), false);
  p.position.y = 0;
  assert.equal(
    m.pickupWeapon(p, false, () => false),
    false,
  );
  assert.equal(m.pickupWeapon(p), true);
  assert.equal(p.weapon.id, 'ak-47');
  assert.equal(p.weapon.ammo, 11);
  assert.equal(p.inventory.filter((w) => w.id === 'ak-47').length, 1);
  m.dropWeapon(p);
  m.buy(p, 'galil_ar');
  m.tick(0.8);
  assert.equal(m.pickupWeapon(p), false);
  assert.equal(m.pickupWeapon(p, true), true);
  assert.equal(p.weapon.id, 'ak-47');
});
test('plant requires a live carrier inside a site and cancels when released', () => {
  const m = new Match(),
    p = m.players[0];
  m.tick(11);
  p.position = { ...m.sites[0] };
  m.interact(p, 1, true);
  assert.equal(m.bomb.progress, 1);
  m.interact(p, 0.1, false);
  assert.equal(m.bomb.progress, 0);
  m.interact(p, RULES.plant, true);
  assert.equal(m.bomb.state, 'planted');
  assert.equal(m.bomb.timer, 40);
});
test('a planted bomb prevents a CT elimination win and can be defused', () => {
  const m = new Match(),
    p = m.players[0];
  m.tick(11);
  p.position = { ...m.sites[0] };
  m.interact(p, 4, true);
  for (const t of m.players.filter((player) => player.team === 'T')) t.alive = false;
  m.tick(0.1);
  assert.equal(m.phase, 'live');
  const ct = m.players.find((player) => player.team === 'CT');
  ct.position = { ...m.bomb.position };
  ct.kit = true;
  m.interact(ct, 4.9, true);
  assert.equal(m.phase, 'live');
  m.interact(ct, 0.1, true);
  assert.equal(m.winner, 'CT');
});
test('carrier death drops the bomb and another T can pick it up', () => {
  const m = new Match(),
    p = m.players[0];
  m.tick(11);
  m.damage(p, 1000, m.players[5]);
  assert.equal(m.bomb.state, 'dropped');
  const other = m.players[1];
  other.position = { ...m.bomb.position };
  m.interact(other, 0.01, false);
  assert.equal(m.bomb.carrier, 1);
});
test('timeout, explosion and rewards are resolved once', () => {
  const m = new Match();
  m.tick(11);
  m.tick(116);
  assert.equal(m.winner, 'CT');
  const money = m.players[0].money;
  m.endRound('T', 'duplicate');
  assert.equal(m.scores.T, 0);
  assert.equal(m.players[0].money, money);
  const n = new Match();
  n.tick(11);
  n.bomb.state = 'planted';
  n.bomb.timer = 0.1;
  n.tick(0.2);
  assert.equal(n.winner, 'T');
});
test('layered navigation avoids walls and rejects unreachable paths', () => {
  const n = new Navigation(1);
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) n.add(x, z, 0);
  n.connect(
    (a, b) =>
      !(((a.ix === 1 && b.ix === 2) || (a.ix === 2 && b.ix === 1)) && Math.max(a.iz, b.iz) < 4),
  );
  const path = n.path({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
  assert.ok(path.some((p) => p.z === 4));
  assert.ok(path.length > 5);
  n.add(9, 9, 10);
  assert.deepEqual(n.path({ x: 0, y: 0, z: 0 }, { x: 9, y: 10, z: 9 }), []);
});
