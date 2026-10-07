import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const output = new URL('screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8765/game.html?quality=low');
  await page.waitForFunction(() => !document.querySelector('#start-t').disabled, null, {
    timeout: 60000,
  });
  const physicalRoutes = await page.evaluate(() => {
    const results = [];
    for (const team of ['T', 'CT'])
      for (const [spawnIndex, spawn] of __mapInfo.spawns[team].entries())
        for (let site = 0; site < 2; site++) {
          const player = { position: { ...spawn }, vy: 0, grounded: true };
          const route = __test.navigation.path(player.position, __mapInfo.sites[site]);
          let index = 0,
            steps = 0,
            stuck = 0;
          while (index < route.length && steps++ < 12000) {
            const node = route[index];
            const distance = Math.hypot(node.x - player.position.x, node.z - player.position.z);
            if (distance < 0.12) {
              index++;
              continue;
            }
            const before = { ...player.position },
              step = Math.min(distance, 3.7 / 60);
            __test.move(
              player,
              ((node.x - player.position.x) / distance) * step,
              ((node.z - player.position.z) / distance) * step,
              1 / 60,
              node.y - player.position.y > 0.25 && distance < 1.2,
            );
            stuck =
              Math.hypot(player.position.x - before.x, player.position.z - before.z) < 0.001
                ? stuck + 1
                : 0;
            if (stuck > 180) break;
          }
          results.push({
            team,
            spawnIndex,
            site,
            passed: route.length > 0 && index === route.length,
            index,
            length: route.length,
          });
        }
    return results;
  });
  assert.ok(
    physicalRoutes.every((route) => route.passed),
    JSON.stringify(physicalRoutes.filter((route) => !route.passed)),
  );
  await page.locator('#start-t').click();
  await page.waitForFunction(() =>
    __test.avatars.filter((a) => a.visible).every((a) => a.userData.weaponModel),
  );
  await page.evaluate(() => {
    __test.match.players[0].money = 16000; // Isolated purchase/render fixture, not default starting money.
  });
  await page.keyboard.press('b');
  assert.equal(await page.getByRole('button', { name: /M4A4/ }).count(), 0);
  await page.getByRole('button', { name: /AK-47/ }).click();
  await page.keyboard.press('b');
  await page.evaluate(() => advanceTime(11000));
  await page.waitForFunction(() => __test.camera.children[0].children.length > 0);
  const initial = await page.evaluate(() => ({
    x: __test.match.players[0].position.x,
    ammo: __test.match.players[0].weapon.ammo,
  }));
  await page.keyboard.down('a');
  await page.evaluate(() => advanceTime(1000));
  await page.keyboard.up('a');
  await page.mouse.down();
  await page.evaluate(() => advanceTime(250));
  await page.mouse.up();
  const movedAndFired = await page.evaluate(
    (before) => ({
      moved: Math.abs(__test.match.players[0].position.x - before.x) > 0.5,
      fired: __test.match.players[0].weapon.ammo < before.ammo,
    }),
    initial,
  );
  assert.ok(movedAndFired.moved && movedAndFired.fired);
  await page.waitForFunction(() => __test.audioStats.played > 0);
  const audio = await page.evaluate(() => __test.audioStats);
  await page.keyboard.press('r');
  await page.evaluate(() => advanceTime(3500));
  assert.equal(await page.evaluate(() => __test.match.players[0].weapon.ammo), 30);
  await page.screenshot({ path: new URL('gameplay.png', output).pathname });
  await page.keyboard.press('Escape');
  await page.locator('#start-ct').click();
  await page.evaluate(() => advanceTime(160000));
  const rounds = await page.evaluate(() => ({
    round: __test.match.round,
    scores: __test.match.scores,
    kills: __test.match.players.reduce((sum, player) => sum + player.kills, 0),
    players: __test.match.players.length,
  }));
  assert.equal(rounds.players, 10);
  assert.ok(rounds.round >= 2 && rounds.kills > 0);
  const fullMatch = [];
  if (process.env.FULL_MATCH === '1') {
    for (let i = 0; i < 40; i++) {
      const state = await page.evaluate(() => {
        advanceTime(120000);
        return {
          time: __test.match.time,
          round: __test.match.round,
          scores: __test.match.scores,
          phase: __test.match.phase,
          humanTeam: __test.match.players[0].team,
          kills: __test.match.players.reduce((sum, p) => sum + p.kills, 0),
        };
      });
      fullMatch.push(state);
      console.log('SOAK', JSON.stringify(state));
      if (state.phase === 'match') break;
    }
    assert.equal(fullMatch.at(-1).phase, 'match', 'An entire offline match must terminate');
    assert.ok(fullMatch.at(-1).round >= 16);
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#language').click();
  await page.screenshot({ path: new URL('mobile-menu.png', output).pathname });
  assert.deepEqual(errors, []);
  const report = {
    physicalRoutes,
    movedAndFired,
    reload: true,
    rounds,
    audio,
    fullMatch,
    pageErrors: errors,
    caveat:
      'Development smoke tests in software-rendered low-resolution mode. Not a CS:GO parity or presentation-hardware qualification.',
  };
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
