// Encode web playback renditions of stored H3 MP4s. Originals stay sealed. The rendition MP4
// is uploaded before its receipt, and a receipt exists only for a validated upload, so a rerun
// after a crash redoes exactly the unfinished clips. Usage:
//   bun packages/app/scripts/video-renditions.ts [--run <id>] [--limit <n>] [--dry-run | --out-dir <dir>]
// --dry-run lists the work; --out-dir encodes and validates locally. Neither writes to Blob.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  immutable,
  readStoredArtifact,
  renditionMediaPath,
  renditionPreviews,
  renditionReceiptPath,
  storedArtifacts,
  videoStorageEnabled,
} from '@/lib/video/video-storage';
import { storedIndexes } from '@/lib/video/video-history-store';
import {
  mp4TopLevelBoxes,
  RENDITION_ARGS,
  RENDITION_PROFILE,
  renditionPlan,
  renditionProblems,
  renditionReceipt,
  type RenditionReceipt,
  type RenditionSource,
} from '@/lib/video/video-renditions';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'out-dir': { type: 'string' },
    run: { type: 'string' },
    limit: { type: 'string' },
  },
});
const dryRun = values['dry-run'];
const outDir = values['out-dir'] ? resolve(values['out-dir']) : null;
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (dryRun && outDir) throw new Error('--dry-run and --out-dir are exclusive');
if (values.run !== undefined && !/^[1-9]\d*$/u.test(values.run))
  throw new Error('--run must be a CI run ID');
if (!(limit > 0) || (limit !== Infinity && !Number.isSafeInteger(limit)))
  throw new Error('--limit must be a positive integer');
if (!videoStorageEnabled()) throw new Error('BLOB_READ_WRITE_TOKEN is not set');

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const mb = (bytes: number) => (bytes / 1024 ** 2).toFixed(2);
const command = (file: string, args: string[]) =>
  execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const probeDuration = (file: string) =>
  Number(
    command('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ]).trim(),
  );
/** `-v error` prints decode errors to stderr, also when ffmpeg exits 0. */
function decodeError(file: string) {
  const result = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const log = `${result.error?.message ?? ''}${result.stderr ?? ''}`.trim();
  return log || (result.status === 0 ? null : `ffmpeg exited with status ${result.status}`);
}

const run = values.run;
const indexes = run
  ? await storedArtifacts(run).then((items) => items.map((artifact) => ({ runId: run, artifact })))
  : await storedIndexes();
// One unreadable artifact must not stop a backfill of the others; it fails the job at the end.
let unreadable = 0;
const saved = await Promise.all(
  indexes.map(({ runId, artifact }) =>
    readStoredArtifact(runId, artifact).catch((error: unknown) => {
      unreadable++;
      console.error(
        `unreadable run ${runId} artifact ${artifact.id}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }),
  ),
);
const artifacts = saved.flatMap((item) => (item ? [item] : []));
const done = await renditionPreviews();
const plan = renditionPlan(artifacts, new Set(done.keys()));
const work = plan.pending.slice(0, limit);
console.log(
  `${artifacts.length} stored artifacts (${unreadable} unreadable), ` +
    `${plan.pending.length + plan.existing} sealed MP4s: ` +
    `${plan.existing} with a ${RENDITION_PROFILE} receipt, ${plan.pending.length} pending, ` +
    `${work.length} selected`,
);
if (dryRun) {
  for (const clip of work) console.log(`pending ${clip.sha256} ${clip.path}`);
  process.exit(unreadable > 0 ? 1 : 0);
}

const ffmpeg = command('ffmpeg', ['-version']).split('\n')[0];
const scratch = await mkdtemp(join(tmpdir(), 'video-renditions-'));
if (outDir) await mkdir(outDir, { recursive: true });

/** Upload the MP4 first; the receipt that follows is what marks the clip done. */
async function publish(
  clip: RenditionSource,
  encoded: Uint8Array<ArrayBuffer>,
  output: Omit<RenditionReceipt['output'], 'url'>,
) {
  if (outDir) {
    const file = join(outDir, `${clip.sha256}.${RENDITION_PROFILE}.mp4`);
    await writeFile(file, encoded);
    const receipt = renditionReceipt(
      clip.sha256,
      { ...output, url: pathToFileURL(file).href },
      ffmpeg,
    );
    await writeFile(`${file.slice(0, -4)}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
    return;
  }
  const signal = AbortSignal.timeout(300_000);
  const media = await immutable(
    renditionMediaPath(output.sha256),
    new Blob([encoded], { type: 'video/mp4' }),
    'video/mp4',
    signal,
  );
  const receipt = renditionReceipt(clip.sha256, { ...output, url: media.url }, ffmpeg);
  await immutable(
    renditionReceiptPath(clip.sha256, output.sha256),
    JSON.stringify(receipt),
    'application/json',
    signal,
  );
}

let failed = 0;
let sourceBytes = 0;
let outputBytes = 0;
try {
  for (const clip of work) {
    try {
      const started = performance.now();
      const response = await fetch(clip.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`original download returned HTTP ${response.status}`);
      const source = new Uint8Array(await response.arrayBuffer());
      const downloaded = performance.now();
      const input = join(scratch, `${clip.sha256}.mp4`);
      const output = join(scratch, `${clip.sha256}.${RENDITION_PROFILE}.mp4`);
      await writeFile(input, source);
      command('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', input, ...RENDITION_ARGS, output]);
      const encodedAt = performance.now();
      const encoded = new Uint8Array(await readFile(output));
      const outputDurationSeconds = probeDuration(output);
      const problems = renditionProblems({
        expectedSha256: clip.sha256,
        sourceSha256: sha256(source),
        sourceDurationSeconds: probeDuration(input),
        outputDurationSeconds,
        outputBoxes: mp4TopLevelBoxes(encoded),
        decodeError: decodeError(output),
      });
      if (problems.length > 0) throw new Error(problems.join('; '));
      await publish(clip, encoded, {
        sha256: sha256(encoded),
        bytes: encoded.byteLength,
        durationSeconds: outputDurationSeconds,
      });
      sourceBytes += source.byteLength;
      outputBytes += encoded.byteLength;
      console.log(
        `${clip.sha256.slice(0, 12)} ${mb(source.byteLength)} MB -> ${mb(encoded.byteLength)} MB ` +
          `(${((encoded.byteLength / source.byteLength) * 100).toFixed(0)}%) ` +
          `download ${((downloaded - started) / 1000).toFixed(1)} s, ` +
          `encode ${((encodedAt - downloaded) / 1000).toFixed(1)} s, ` +
          `total ${((performance.now() - started) / 1000).toFixed(1)} s`,
      );
      await rm(input);
      await rm(output);
    } catch (error) {
      failed++;
      console.error(
        `failed ${clip.sha256} ${clip.path}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
console.log(
  `${work.length - failed} renditions ${outDir ? `written to ${outDir}` : 'published'}, ${failed} failed; ` +
    `${mb(sourceBytes)} MB originals -> ${mb(outputBytes)} MB renditions`,
);
if (failed > 0 || unreadable > 0) process.exitCode = 1;
