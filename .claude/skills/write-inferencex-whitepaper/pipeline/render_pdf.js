// Render paper.html to a Letter PDF and report per-page overflow.
// Usage: NODE_PATH=$(npm root -g) node render_pdf.js <out_dir>
// Prints one JSON object per .page: bodyH must equal bodyBox (868.8px for the
// 1.0in/0.95in content box). bodyH > bodyBox means the page overflowed and text
// was clipped; cut copy or shrink a figure until they match.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outDir = path.resolve(process.argv[2] || '.');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${path.join(outDir, 'paper.html')}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: path.join(outDir, 'paper.pdf'),
    format: 'Letter',
    printBackground: true,
    preferCSSPageSize: true,
  });
  const info = await page.evaluate(() =>
    [...document.querySelectorAll('.page')].map((pg) => {
      const body = pg.querySelector('.content') || pg;
      return {
        pageH: pg.getBoundingClientRect().height,
        bodyH: body.scrollHeight,
        bodyBox: body.getBoundingClientRect().height,
      };
    }),
  );
  console.log(JSON.stringify(info));
  await browser.close();
})();
