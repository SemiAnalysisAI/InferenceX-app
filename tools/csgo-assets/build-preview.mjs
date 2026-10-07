import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = import.meta.dirname;
const output = resolve(process.argv[2] || join(root, 'dist'));
if (output === root || root.startsWith(`${output}/`))
  throw new Error('Choose a separate output directory');
await mkdir(output, { recursive: true });
for (const entry of ['game', 'viewer']) {
  await build({
    entryPoints: [join(root, `${entry}.mjs`)],
    outfile: join(output, `${entry}.bundle.mjs`),
    bundle: true,
    format: 'esm',
    minify: true,
    legalComments: 'linked',
    plugins: [
      {
        name: 'hosted-preview-input',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/mouse-capture\.mjs$/ }, () => ({
            path: join(root, 'mouse-preview.mjs'),
          }));
        },
      },
    ],
  });
  const file = entry === 'game' ? 'game.html' : 'index.html';
  const source = await readFile(join(root, file), 'utf8');
  const html = source
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace(`${entry}.mjs`, `${entry}.bundle.mjs`);
  await writeFile(join(output, file), html);
}
for (const file of [
  'game.css',
  'style.css',
  'assets-lock.json',
  'game-assets-lock.json',
  'GAME.md',
  'WEAPON-FIDELITY.md',
  'README.md',
  'favicon.svg',
])
  await cp(join(root, file), join(output, file));
await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
console.log(`Built local-engine preview: ${output}`);
