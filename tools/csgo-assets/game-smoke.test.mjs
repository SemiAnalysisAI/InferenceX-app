import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Navigation } from './navigation.mjs';
const root = new URL('assets/map/', import.meta.url);
const position = (text) => {
  const [x, y, z] = text.split(' ').map(Number);
  return { x: x * 0.01905, y: z * 0.01905, z: -y * 0.01905 };
};
const present = existsSync(new URL('navigation.json', root));
test(
  'every source spawn reaches both bombsites in the baked navigation graph',
  { skip: !present },
  () => {
    const data = JSON.parse(readFileSync(new URL('navigation.json', root)));
    const entities = JSON.parse(readFileSync(new URL('entities.json', root)));
    const nav = new Navigation(data.cell);
    nav.nodes = data.nodes;
    const sites = entities
      .filter((e) => e.classname === 'func_bomb_target')
      .map((e) => position(e.origin));
    const spawns = entities.filter((e) =>
      ['info_player_terrorist', 'info_player_counterterrorist'].includes(e.classname),
    );
    assert.equal(sites.length, 2);
    assert.ok(spawns.length >= 10);
    for (const spawn of spawns)
      for (const site of sites) {
        const route = nav.path(position(spawn.origin), site);
        assert.ok(route.length > 0, `${spawn.origin} could not reach ${JSON.stringify(site)}`);
        assert.ok(Math.hypot(route.at(-1).x - site.x, route.at(-1).z - site.z) < 4);
      }
    for (const n of nav.nodes) {
      assert.ok([n.x, n.y, n.z].every(Number.isFinite));
      assert.ok(n.edges.every((i) => i >= 0 && i < nav.nodes.length));
    }
  },
);
