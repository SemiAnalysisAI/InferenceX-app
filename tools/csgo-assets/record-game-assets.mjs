import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from './weapons.mjs';
const root = fileURLToPath(new URL('assets/', import.meta.url));
const digest = (path) => {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const paths = [
  'map/dust2.glb',
  'map/entities.json',
  'map/navigation.json',
  'characters/t.glb',
  'characters/ct.glb',
];
for (const id of Object.keys(WEAPONS))
  if (id !== 'knife') paths.push(`viewmodels/${id}.glb`, `worldmodels/${id}.glb`);
const files = paths.map((path) => ({ path, ...digest(join(root, path)) }));
const sources = [
  ['3068466810', 'Dust II community port'],
  ['1239501421', 'Assault rifle models'],
  ['1236324520', 'Pistol models'],
  ['1233135884', 'Machine gun models'],
  ['1241988706', 'Shotgun models'],
  ['1212279803', 'SMG models'],
  ['1244760503', 'Sniper rifle models'],
  ['481358078', 'Counter-Terrorist character port'],
  ['481607813', 'Terrorist character port'],
].map(([id, purpose]) => {
  const source = {
    workshopId: id,
    purpose,
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
  };
  if (process.argv[2]) {
    const directory = join(process.argv[2], id);
    source.archives = readdirSync(directory)
      .filter((name) => statSync(join(directory, name)).isFile())
      .map((name) => ({ name, ...digest(join(directory, name)) }));
  }
  return source;
});
writeFileSync(
  new URL('game-assets-lock.json', import.meta.url),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      capturedAt: '2026-10-06',
      state: 'converted-development-assets-not-parity-approved',
      converter: {
        blender: '5.0.1',
        sourceioCommit: '472e81542a6750cf3c282daac41af96a2f5d4fd3',
        maxMapTextureSize: 512,
      },
      characterMotion: {
        url: 'https://github.com/robotboy655/gmod-animations',
        commit: '9a588af0cb1a2d53de35496ba1737305a877e50c',
        attribution: 'Maxime Lebled, Facepunch Studios LTD / Valve Software',
        status: 'Retargeted GMod locomotion, not original CS:GO character animation',
      },
      sources,
      files,
    },
    null,
    2,
  )}\n`,
);
console.log(`Recorded ${files.length} converted asset hashes.`);
