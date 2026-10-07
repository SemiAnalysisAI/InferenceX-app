import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, link, copyFile, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { restoreSiteAssets } from './site-asset-loader.mjs';
import { safePath, verify } from './asset-io.mjs';

const root = import.meta.dirname;
const output = resolve(root, '../../packages/app/public/games/csgo');
const config = JSON.parse(await readFile(join(root, 'site-assets.json')));
const parts = JSON.parse(await readFile(join(root, 'site-asset-parts.json'))).parts;
const audio = JSON.parse(await readFile(join(root, 'assets-lock.json')));
const models = JSON.parse(await readFile(join(root, 'game-assets-lock.json')));
const entries = [
  ...models.files,
  ...audio.files.filter((entry) => entry.path.startsWith('sound/')),
];
const source = await restoreSiteAssets(
  process.env.CSGO_ASSET_ROOT || join(root, 'assets'),
  join(root, '.cache/site'),
  config,
  parts,
  entries,
);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [join(root, 'game.mjs')],
  outfile: join(output, 'game.bundle.mjs'),
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'linked',
});
const sourceHtml = await readFile(join(root, 'game.html'), 'utf8');
const html = sourceHtml
  .replace('<head>', '<head>\n    <base href="/games/csgo/">')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('game.mjs', 'game.bundle.mjs')
  .replace(/<a href="index.html">Weapon asset inspector<\/a>\s*·/, '');
await writeFile(join(output, 'index.html'), html);
for (const file of [
  'game.css',
  'favicon.svg',
  'assets-lock.json',
  'GAME.md',
  'WEAPON-FIDELITY.md',
  'LIGHTING.md',
]) {
  await copyFile(join(root, file), join(output, file));
}
const lighting = JSON.parse(await readFile(join(root, 'lighting/world.json')));
for (const path of ['world.bin.gz', 'atlas.rgbe.gz']) {
  verify(await readFile(join(root, 'lighting', path)), { path, ...lighting[path] });
}
await cp(join(root, 'lighting'), join(output, 'lighting'), { recursive: true });
for (const entry of entries) {
  const target = safePath(join(output, 'assets'), entry.path);
  await mkdir(dirname(target), { recursive: true });
  // Immutable, verified assets can share storage locally; cross-device builds copy.
  await link(safePath(source, entry.path), target).catch(async (error) => {
    if (error.code !== 'EXDEV') throw error;
    await copyFile(safePath(source, entry.path), target);
  });
}
console.log(`Built same-origin /games/csgo with ${entries.length} verified assets.`);
