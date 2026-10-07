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
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const out = new URL('screenshots/combat/', import.meta.url);
await mkdir(out, { recursive: true });
const evidence = {
  fixture: 'Controlled target and test funding; not a competitive bot qualification',
  scenarios: [],
};
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8767/game.html?quality=low');
  await page.waitForFunction(() => !document.querySelector('#start-t').disabled, null, {
    timeout: 60000,
  });
  await page.locator('#start-t').click();
  await page.evaluate(() => {
    __test.match.players[0].money = 16000;
  });
  await page.keyboard.press('b');
  await page.getByRole('button', { name: /^NOVA/ }).click();
  await page.keyboard.press('b');
  await page.waitForFunction(() => __test.weaponModel.id === 'nova' && __test.weaponModel.ready);
  await page.evaluate(() => {
    const m = __test.match,
      p = m.players[0];
    m.phase = 'live';
    m.timer = 115;
    // Bots stay visible but do not move/fire during the input/damage fixture.
    for (const bot of m.players.filter((a) => !a.human)) bot.blindedUntil = m.time + 1000;
    const target = m.players[5];
    target.position = { x: p.position.x, y: p.position.y, z: p.position.z - 4 };
    target.health = 1000;
    target.armor = 100;
    target.helmet = true;
    advanceTime(20);
  });
  const ammo = await page.evaluate(() => __test.match.players[0].weapon.ammo);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.evaluate(() => advanceTime(1000));
  await page.mouse.up();
  const shotgun = await page.evaluate(() => ({
    ammo: __test.match.players[0].weapon.ammo,
    trace: __test.match.players[0].lastShotTrace,
    targetHealth: __test.match.players[5].health,
  }));
  assert.equal(shotgun.ammo, ammo - 1, 'pump shotgun must not auto-fire while held');
  assert.equal(shotgun.trace.pellets.length, 9);
  assert.ok(shotgun.trace.pellets.some((p) => p.victim === 5));
  assert.ok(shotgun.targetHealth < 1000);
  evidence.scenarios.push({ name: 'nova-nine-pellets-and-semi-auto', ...shotgun });
  await page.screenshot({ path: new URL('nova-pellets.png', out).pathname });

  await page.keyboard.press('b');
  await page.getByRole('button', { name: /^AK-47/ }).click();
  await page.keyboard.press('b');
  await page.waitForFunction(() => __test.weaponModel.id === 'ak-47' && __test.weaponModel.ready);
  const before = await page.evaluate(() => ({
    gap: parseFloat(document.querySelector('#crosshair').style.getPropertyValue('--gap')),
    ammo: __test.match.players[0].weapon.ammo,
  }));
  await page.mouse.down();
  await page.evaluate(() => advanceTime(550));
  await page.mouse.up();
  const spray = await page.evaluate(() => ({
    ammo: __test.match.players[0].weapon.ammo,
    penalty: __test.match.players[0].weapon.accuracyPenalty,
    punch: __test.match.players[0].punchPitch,
    gap: parseFloat(document.querySelector('#crosshair').style.getPropertyValue('--gap')),
  }));
  assert.ok(spray.ammo <= before.ammo - 5);
  assert.ok(spray.penalty > 0 && spray.punch > 0 && spray.gap > before.gap);
  await page.screenshot({ path: new URL('ak-recoil.png', out).pathname });
  await page.evaluate(() => advanceTime(1800));
  const recovered = await page.evaluate(() => ({
    penalty: __test.match.players[0].weapon.accuracyPenalty,
    punch: __test.match.players[0].punchPitch,
  }));
  assert.ok(recovered.penalty < spray.penalty / 10);
  assert.ok(recovered.punch < spray.punch / 10);
  await page.keyboard.press('r');
  await page.evaluate(() => advanceTime(3500));
  assert.equal(await page.evaluate(() => __test.match.players[0].weapon.ammo), 30);
  evidence.scenarios.push({ name: 'automatic-recoil-and-recovery', before, spray, recovered });

  await page.keyboard.press('b');
  await page.getByRole('button', { name: /^AWP/ }).click();
  await page.keyboard.press('b');
  await page.waitForFunction(() => __test.weaponModel.id === 'awp' && __test.weaponModel.ready);
  await page.mouse.click(640, 400, { button: 'right' });
  await page.evaluate(() => advanceTime(20));
  const firstZoom = await page.evaluate(() => __test.camera.fov);
  await page.mouse.click(640, 400, { button: 'right' });
  await page.evaluate(() => advanceTime(20));
  const secondZoom = await page.evaluate(() => __test.camera.fov);
  assert.ok(secondZoom < firstZoom && firstZoom < 40);
  assert.equal(
    await page.evaluate(() => {
      const scopeLayer = Number(getComputedStyle(document.querySelector('#scope')).zIndex);
      return ['#round', '#radar', '#feed'].every(
        (selector) =>
          Number(getComputedStyle(document.querySelector(selector)).zIndex) > scopeLayer,
      );
    }),
    true,
    'scope mask must stay below the match HUD',
  );
  await page.screenshot({ path: new URL('awp-scope.png', out).pathname });
  await page.mouse.click(640, 400, { button: 'right' });
  await page.evaluate(() => advanceTime(20));
  assert.ok(await page.evaluate(() => __test.camera.fov > 70));
  const beforeMove = await page.evaluate(() => ({ ...__test.match.players[0].position }));
  await page.keyboard.down('a');
  await page.evaluate(() => advanceTime(500));
  await page.keyboard.up('a');
  const motion = await page.evaluate((start) => {
    const p = __test.match.players[0];
    return { distance: Math.hypot(p.position.x - start.x, p.position.z - start.z), speed: p.speed };
  }, beforeMove);
  assert.ok(motion.distance > 0.1 && motion.distance <= 2.1);
  evidence.scenarios.push({
    name: 'awp-two-stage-scope-and-movement',
    firstZoom,
    secondZoom,
    motion,
  });
  await page.keyboard.press('3');
  await page.evaluate(() => advanceTime(20));
  await page.keyboard.press('1');
  await page.evaluate(() => advanceTime(20));
  const warmedMemory = await page.evaluate(() => __test.rendererMemory);
  for (let cycle = 0; cycle < 10; cycle++) {
    await page.keyboard.press('3');
    await page.evaluate(() => advanceTime(20));
    await page.keyboard.press('1');
    await page.evaluate(() => advanceTime(20));
  }
  const finalMemory = await page.evaluate(() => __test.rendererMemory);
  assert.ok(finalMemory.geometries <= warmedMemory.geometries + 1);
  assert.ok(finalMemory.textures <= warmedMemory.textures + 1);
  evidence.scenarios.push({
    name: 'viewmodel-switch-resource-stability',
    warmedMemory,
    finalMemory,
  });
  await page.mouse.click(640, 400, { button: 'right' });
  await page.evaluate(() => {
    __test.match.damage(__test.match.players[0], 1000, __test.match.players[5]);
    advanceTime(20);
  });
  assert.equal(await page.locator('#scope').isHidden(), true);
  assert.ok(await page.evaluate(() => __test.camera.fov > 70));
  evidence.scenarios.push({ name: 'death-clears-sniper-scope', passed: true });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => JSON.parse(render_game_to_text()).paused), true);
  await page.locator('#resume').click();
  assert.equal(await page.evaluate(() => JSON.parse(render_game_to_text()).paused), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape');
  await page.locator('#language').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'mobile menu must not overflow horizontally',
  );
  await page.screenshot({ path: new URL('mobile-menu.png', out).pathname });
  assert.deepEqual(errors, []);
  evidence.pageErrors = errors;
  await writeFile(new URL('result.json', out), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
