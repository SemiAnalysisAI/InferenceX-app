import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.argv[2] || 'http://127.0.0.1:3003';
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const out = new URL('screenshots/site/', import.meta.url);
await mkdir(out, { recursive: true });
const results = [];
try {
  for (const [locale, width] of [
    ['en', 1280],
    ['zh', 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'light');
    });
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on('pageerror', (error) => {
      const detail = { message: error.message, stack: error.stack, url: page.url() };
      errors.push(detail);
      console.error('PAGE_ERROR', JSON.stringify(detail));
    });
    page.on('request', (request) => requests.push(request.url()));
    const landing = locale === 'en' ? '/' : '/zh';
    console.log('LANDING', locale);
    await page.goto(origin + landing);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="theme-toggle"]')
        ?.getAttribute('aria-label')
        ?.includes('currently'),
    );
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-csgo').click();
    const launch = page.getByTestId('csgo-game-launch');
    await launch.hover();
    await launch.focus();
    assert.equal(
      requests.some((url) => /\/games\/csgo/.test(url)),
      false,
    );
    assert.equal(await launch.getAttribute('target'), null);
    await page.screenshot({ path: new URL(`landing-${locale}.png`, out).pathname });
    await launch.click();
    console.log('GAME', locale);
    await page.waitForURL(`${origin}/games/csgo?lang=${locale}`);
    assert.equal(context.pages().length, 1);
    await page.waitForFunction(() => !document.querySelector('#start-t').disabled, null, {
      timeout: 90000,
    });
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.equal(
      await page.locator('meta[name="robots"]').getAttribute('content'),
      'noindex,nofollow',
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const response = await page.request.get(page.url());
    const headers = response.headers();
    assert.equal(headers['x-robots-tag'], 'noindex, nofollow');
    const lighting = await page.evaluate(() => __test.lighting);
    assert.equal(lighting.surfaces, 2773);
    assert.ok(lighting.materialGroups >= 40);
    await page.screenshot({ path: new URL(`game-menu-${locale}.png`, out).pathname });
    if (locale === 'en') {
      await page.locator('#start-t').click();
      await page.evaluate(() => advanceTime(11000));
      const start = await page.evaluate(() => ({ ...__test.match.players[0].position }));
      await page.keyboard.down('a');
      await page.evaluate(() => advanceTime(500));
      await page.keyboard.up('a');
      await page.mouse.move(width / 2, 422);
      await page.mouse.down();
      await page.evaluate(() => advanceTime(100));
      await page.mouse.up();
      const state = await page.evaluate(() => ({
        players: __test.match.players.length,
        human: __test.match.players.filter((p) => p.human).length,
        position: __test.match.players[0].position,
        ammo: __test.match.players[0].weapon.ammo,
      }));
      assert.equal(state.players, 10);
      assert.equal(state.human, 1);
      assert.ok(Math.hypot(state.position.x - start.x, state.position.z - start.z) > 0.1);
      assert.ok(state.ammo < 20);
      await page.screenshot({ path: new URL('gameplay.png', out).pathname });
      await page.keyboard.press('Escape');
    }
    assert.equal(
      requests.some((url) => /perplexity\.ai/.test(url)),
      false,
    );
    const assets = requests.filter((url) => /\/games\/csgo\/(?:assets|lighting)\//.test(url));
    for (const file of [
      '/assets/map/dust2.glb',
      '/assets/map/navigation.json',
      '/lighting/world.json',
      '/lighting/world.bin.gz',
      '/lighting/atlas.rgbe.gz',
    ]) {
      assert.ok(
        assets.some((url) => new URL(url).pathname.endsWith(file)),
        file,
      );
    }
    assert.ok(assets.every((url) => new URL(url).origin === origin));
    await page.locator('#return-site').click();
    console.log('RETURN', locale);
    await page.waitForURL(origin + landing);
    await page.getByTestId('csgo-game-launch').waitFor();
    assert.equal(await page.evaluate(() => typeof window.__test), 'undefined');
    assert.deepEqual(errors, []);
    results.push({
      locale,
      width,
      sameOrigin: true,
      assetRequests: assets.length,
      returned: true,
      lighting,
      pageErrors: errors,
    });
    await context.close();
  }
  await writeFile(new URL('result.json', out), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
