import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const out = new URL('screenshots/lighting/', import.meta.url);
await mkdir(out, { recursive: true });
const errors = [],
  views = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:3004/games/csgo?quality=low');
  await page.waitForFunction(() => !document.querySelector('#tour').disabled, null, {
    timeout: 90000,
  });
  await page.locator('#tour').click();
  const positions = await page.evaluate(() => {
    const nav = __test.navigation;
    const route = nav.path(__mapInfo.spawns.T[0], __mapInfo.sites[1]);
    const points = [
      nav.nearest(__mapInfo.sites[0]),
      nav.nearest(__mapInfo.sites[1]),
      route[Math.floor(route.length * 0.55)],
    ];
    return points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  });
  for (const [index, position] of positions.entries()) {
    // Staged camera coverage only; physical route traversal is tested separately.
    await page.evaluate((p) => {
      Object.assign(__test.match.players[0].position, p);
      __test.match.players[0].vy = 0;
      advanceTime(20);
    }, position);
    for (let angle = 0; angle < 2; angle++) {
      await page.keyboard.down('ArrowLeft');
      await page.evaluate(() => advanceTime(700));
      await page.keyboard.up('ArrowLeft');
      const stats = await page.evaluate(() => __test.renderStats);
      assert.ok(stats.calls > 0 && stats.triangles > 1000);
      const file = `view-${index}-${angle}.png`;
      await page.screenshot({ path: new URL(file, out).pathname });
      views.push({ file, position, stats });
    }
  }
  assert.deepEqual(errors, []);
  const result = {
    purpose: 'Staged visual inspection of both sites and a B-route point, not reference parity',
    lighting: await page.evaluate(() => __test.lighting),
    views,
    pageErrors: errors,
  };
  await writeFile(new URL('result.json', out), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
