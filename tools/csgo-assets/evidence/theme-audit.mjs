const { default: fs } = await import('node:fs/promises');
const { default: assert } = await import('node:assert/strict');

const asset =
  /\/decorative\/(?:minecraft|csgo|gta|kart)\/|\/games\/csgo(?:\/|\?)|minecraft-click\.mp3|youtube\.com|ytimg\.com|perplexity\.ai\/computer\/a\//;
const code =
  /THREE\.WebGLRenderer|LOS SANTOS 3D|minecraft-click\.mp3|ender-dragon\.mp3|Loading Luigi Circuit|csgo_game_opened|\.csgo-scene|\.gta-scene|\.mc-dragon-flyacross|\.kart-scene|font-family:\s*["']?(?:Monocraft|Pricedown|ChaletComprime)/i;
const seo = () => [
  document.title,
  document.querySelector('meta[name="description"]')?.getAttribute('content'),
  document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
  ...[...document.querySelectorAll('link[hreflang],script[type="application/ld+json"]')].map(
    (n) => n.outerHTML,
  ),
  ...[...document.querySelectorAll('h1,h2')].map((n) => n.textContent),
];
async function ready(page) {
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="theme-toggle"]')
      ?.getAttribute('aria-label')
      ?.includes('currently'),
  );
}
export async function run(
  browser,
  { origin = 'http://127.0.0.1:3000', out = '/tmp/inferencex-theme-audit' } = {},
) {
  await fs.mkdir(out, { recursive: true });
  const results = { cold: [], embeds: [], launchers: [], switching: [], crawlers: [] };
  const bodies = new Map();
  for (const [theme, route, width] of [
    ['light', '/', 1440],
    ['dark', '/', 390],
    ['light', '/zh', 390],
    ['dark', '/zh', 1440],
    ['system', '/', 1440],
    ['fresh', '/zh', 390],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await ctx.addInitScript(
      (t) => (t === 'fresh' ? localStorage.removeItem('theme') : localStorage.setItem('theme', t)),
      theme,
    );
    const page = await ctx.newPage();
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(origin + route);
    await ready(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((r) => ({ name: r.name, bytes: r.encodedBodySize })),
    );
    assert.equal(requests.filter((n) => asset.test(n)).length, 0, `${theme} optional assets`);
    assert.equal(
      await page
        .locator(
          '[data-testid$="-theme-banner"],[data-testid="csgo-game-launch"],.mc-dragon-flyacross',
        )
        .count(),
      0,
    );
    let chunks = 0;
    for (const r of resources.filter(
      (entry) => /\.(?:js|css)(?:\?|$)/.test(entry.name) && entry.name.startsWith(origin),
    )) {
      if (!bodies.has(r.name)) {
        const response = await page.request.get(r.name);
        bodies.set(r.name, await response.text());
      }
      assert.equal(code.test(bodies.get(r.name)), false, `${r.name} optional code`);
      chunks++;
    }
    const fonts = await page.evaluate(
      () => [...document.fonts].filter((f) => /monocraft|pricedown|chalet/i.test(f.family)).length,
    );
    assert.equal(fonts, 0);
    await page.screenshot({ path: `${out}/theme-${theme}-${width}.png` });
    results.cold.push({
      theme,
      route,
      width,
      optionalRequests: 0,
      optionalCodeChunks: 0,
      checkedChunks: chunks,
      optionalFonts: fonts,
      encodedResourceBytes: resources.reduce((n, r) => n + r.bytes, 0),
    });
    await ctx.close();
  }
  for (const theme of ['minecraft', 'csgo', 'gta', 'kart']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const page = await ctx.newPage(),
      requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(`${origin}/embed/model/deepseek-r1?theme=dark`);
    await page.waitForFunction(() =>
      Object.hasOwn(document.documentElement.dataset, 'inferencexEmbed'),
    );
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    assert.equal(requests.filter((n) => asset.test(n)).length, 0);
    assert.equal(
      await page
        .locator('[data-testid$="-theme-banner"],[data-testid="csgo-game-launch"],audio')
        .count(),
      0,
    );
    results.embeds.push({ savedTheme: theme, optionalRequests: 0 });
    await ctx.close();
  }
  for (const [route, width, label] of [
    ['/', 1440, 'Play CS:GO'],
    ['/zh', 390, '试玩 CS:GO'],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
    const page = await ctx.newPage(),
      requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(origin + route);
    await ready(page);
    const before = await page.evaluate(seo);
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-csgo').click();
    const link = page.getByTestId('csgo-game-launch');
    await link.waitFor();
    assert.equal(await link.textContent(), label);
    await link.hover();
    await link.focus();
    assert.equal(
      requests.filter((n) => /\/games\/csgo(?:\/|\?)|\/csgo-assets\/|game\.html/.test(n)).length,
      0,
    );
    assert.deepEqual(await page.evaluate(seo), before);
    assert.equal(await page.locator('iframe,canvas,audio,video').count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${out}/csgo-landing-${width}.png` });
    // Navigation stays on this origin; full game loading has a separate real-asset test.
    const destination = await link.getAttribute('href');
    let opened = false;
    await ctx.route(`${origin}/games/csgo?*`, (r) => {
      opened = true;
      return r.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<title>Explicit navigation captured</title>',
      });
    });
    await link.click();
    await page.waitForURL(origin + destination);
    assert.equal(page.url(), origin + destination);
    assert.equal(opened, true);
    assert.equal(ctx.pages().length, 1);
    await page.goto(origin + route);
    await ready(page);
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-dark').click();
    await link.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(seo), before);
    results.launchers.push({
      route,
      width,
      hoverGameRequests: 0,
      sameOriginNavigation: true,
      seoUnchanged: true,
      noHorizontalOverflow: true,
      destination,
    });
    await ctx.close();
  }
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('minecraft-music', 'false');
    localStorage.setItem('minecraft-sound', 'false');
  });
  const page = await ctx.newPage();
  await page.goto(`${origin}/about`);
  await ready(page);
  const before = await page.evaluate(seo);
  for (const theme of ['csgo', 'gta', 'minecraft', 'kart']) {
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId(`theme-option-${theme}`).click();
    await page
      .locator(theme === 'minecraft' ? 'canvas' : `[data-testid="${theme}-theme-banner"]`)
      .first()
      .waitFor();
    assert.deepEqual(await page.evaluate(seo), before);
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-dark').click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          'canvas,audio,iframe,[data-testid$="-theme-banner"],.mc-dragon-flyacross',
        ),
    );
    assert.deepEqual(await page.evaluate(seo), before);
    results.switching.push({ theme, unmounted: true, seoUnchanged: true });
  }
  for (const route of ['/', '/zh']) {
    const response = await page.request.get(origin + route, {
      headers: { 'User-Agent': 'Googlebot' },
    });
    const body = await response.text();
    const checks = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        title: Boolean(d.title),
        description: Boolean(d.querySelector('meta[name="description"]')?.getAttribute('content')),
        canonical: Boolean(d.querySelector('link[rel="canonical"]')),
        hreflang: Boolean(d.querySelector('link[hreflang="zh-CN"]')),
        jsonld: Boolean(d.querySelector('script[type="application/ld+json"]')),
        headings: Boolean(d.querySelector('h1,h2')),
        noGame: !d.querySelector('[data-testid="csgo-game-launch"],[data-testid$="-theme-banner"]'),
      };
    }, body);
    assert.equal(Object.values(checks).every(Boolean), true);
    results.crawlers.push({ route, ...checks });
  }
  await ctx.close();
  await fs.writeFile(`${out}/theme-audit-results.json`, `${JSON.stringify(results, null, 2)}\n`);
  return results;
}
