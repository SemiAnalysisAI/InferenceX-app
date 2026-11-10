// Encode the derived media of stored H3 MP4s: a first-frame poster JPEG and a web playback
// rendition per sealed original. Originals stay sealed. Each output is uploaded before its
// receipt, and a receipt exists only for a validated upload, so a rerun after a crash redoes
// exactly the unfinished clip and profile pairs. Usage:
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
  derivedMedia,
  derivedMediaPath,
  derivedReceiptPath,
  immutable,
  readPublishedArtifact,
  storedArtifacts,
  videoStorageEnabled,
} from '@/lib/video/video-storage';
import { storedIndexes } from '@/lib/video/video-history-store';
import {
  MEDIA_PROFILE_IDS,
  MEDIA_PROFILES,
  mp4TopLevelBoxes,
  POSTER_ARGS,
  POSTER_PROFILE,
  posterProblems,
  posterReceipt,
  RENDITION_ARGS,
  RENDITION_PROFILE,
  renditionPlan,
  renditionProblems,
  renditionReceipt,
  type MediaProfile,
  type PosterReceipt,
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
const kb = (bytes: number) => (bytes / 1024).toFixed(1);
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
/** Codec, size and decoded frame count of the first video stream. */
function probeStream(file: string, countFrames = false) {
  const json = JSON.parse(
    command('ffprobe', [
      '-v',
      'error',
      ...(countFrames ? ['-count_frames'] : []),
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height,nb_read_frames',
      '-of',
      'json',
      file,
    ]),
  ) as {
    streams?: { codec_name?: string; width?: number; height?: number; nb_read_frames?: string }[];
  };
  const stream = json.streams?.[0];
  return {
    codec: stream?.codec_name ?? 'none',
    width: stream?.width ?? 0,
    height: stream?.height ?? 0,
    frames: Number(stream?.nb_read_frames ?? 0),
  };
}
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
    readPublishedArtifact(runId, artifact).then(
      (published) => {
        // Its candidate clips still encode; the reference clips wait for a readable attachment.
        if (!published.complete) {
          unreadable++;
          console.error(`unreadable quality for run ${runId} artifact ${artifact.id}`);
        }
        return published.saved;
      },
      (error: unknown) => {
        unreadable++;
        console.error(
          `unreadable run ${runId} artifact ${artifact.id}: ${error instanceof Error ? error.message : error}`,
        );
        return null;
      },
    ),
  ),
);
const artifacts = saved.flatMap((item) => (item ? [item] : []));
const plan = renditionPlan(artifacts, await derivedMedia());
const work = plan.pending.slice(0, limit);
const pendingOf = (profile: MediaProfile) =>
  plan.pending.filter((clip) => clip.profiles.includes(profile)).length;
const profileCounts = MEDIA_PROFILE_IDS.map(
  (profile) => `${profile} ${plan.existing[profile]} with a receipt, ${pendingOf(profile)} pending`,
).join('; ');
console.log(
  `${artifacts.length} stored artifacts (${unreadable} unreadable), ${plan.sources} sealed MP4s: ` +
    `${profileCounts}; ${plan.pending.length} pending, ${work.length} selected`,
);
if (dryRun) {
  for (const clip of work)
    console.log(`pending ${clip.sha256} ${clip.path} (${clip.profiles.join(', ')})`);
  process.exit(unreadable > 0 ? 1 : 0);
}

const ffmpeg = command('ffmpeg', ['-version']).split('\n')[0];
const scratch = await mkdtemp(join(tmpdir(), 'video-renditions-'));
if (outDir) await mkdir(outDir, { recursive: true });

type Receipt = RenditionReceipt | PosterReceipt;

/** Upload the media first; the receipt that follows is what marks the clip and profile done. */
async function publish(
  clip: RenditionSource,
  profile: MediaProfile,
  encoded: Uint8Array<ArrayBuffer>,
  receiptFor: (url: string) => Receipt,
) {
  const { contentType, extension } = MEDIA_PROFILES[profile];
  if (outDir) {
    const file = join(outDir, `${clip.sha256}.${profile}.${extension}`);
    await writeFile(file, encoded);
    const receipt = receiptFor(pathToFileURL(file).href);
    await writeFile(
      `${file.slice(0, -extension.length - 1)}.json`,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    return;
  }
  const signal = AbortSignal.timeout(300_000);
  const media = await immutable(
    derivedMediaPath(profile, sha256(encoded)),
    new Blob([encoded], { type: contentType }),
    contentType,
    signal,
  );
  const receipt = receiptFor(media.url);
  await immutable(
    derivedReceiptPath(profile, clip.sha256, receipt.output.sha256),
    JSON.stringify(receipt),
    'application/json',
    signal,
  );
}

/** Encode, validate and publish one profile of a downloaded, verified original. */
async function encodeProfile(
  clip: RenditionSource,
  profile: MediaProfile,
  input: string,
  sourceSha256: string,
): Promise<number> {
  const { extension } = MEDIA_PROFILES[profile];
  const output = join(scratch, `${clip.sha256}.${profile}.${extension}`);
  try {
    if (profile === POSTER_PROFILE) {
      command('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', input, ...POSTER_ARGS, output]);
      const encoded = new Uint8Array(await readFile(output));
      const source = probeStream(input);
      const poster = probeStream(output, true);
      const problems = posterProblems({
        expectedSha256: clip.sha256,
        sourceSha256,
        sourceWidth: source.width,
        sourceHeight: source.height,
        ...poster,
      });
      if (problems.length > 0) throw new Error(problems.join('; '));
      const out = { sha256: sha256(encoded), bytes: encoded.byteLength };
      await publish(clip, profile, encoded, (url) =>
        posterReceipt(
          clip.sha256,
          { ...out, url, width: poster.width, height: poster.height },
          ffmpeg,
        ),
      );
      return encoded.byteLength;
    }
    command('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', input, ...RENDITION_ARGS, output]);
    const encoded = new Uint8Array(await readFile(output));
    const outputDurationSeconds = probeDuration(output);
    const problems = renditionProblems({
      expectedSha256: clip.sha256,
      sourceSha256,
      sourceDurationSeconds: probeDuration(input),
      outputDurationSeconds,
      outputBoxes: mp4TopLevelBoxes(encoded),
      decodeError: decodeError(output),
    });
    if (problems.length > 0) throw new Error(problems.join('; '));
    const out = {
      sha256: sha256(encoded),
      bytes: encoded.byteLength,
      durationSeconds: outputDurationSeconds,
    };
    await publish(clip, profile, encoded, (url) =>
      renditionReceipt(clip.sha256, { ...out, url }, ffmpeg),
    );
    return encoded.byteLength;
  } finally {
    await rm(output, { force: true });
  }
}

let failed = 0;
let sourceBytes = 0;
const outputBytes = Object.fromEntries(MEDIA_PROFILE_IDS.map((profile) => [profile, 0])) as Record<
  MediaProfile,
  number
>;
const written = Object.fromEntries(MEDIA_PROFILE_IDS.map((profile) => [profile, 0])) as Record<
  MediaProfile,
  number
>;
try {
  for (const clip of work) {
    const input = join(scratch, `${clip.sha256}.mp4`);
    try {
      const started = performance.now();
      const response = await fetch(clip.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`original download returned HTTP ${response.status}`);
      const source = new Uint8Array(await response.arrayBuffer());
      const downloaded = performance.now();
      const sourceSha256 = sha256(source);
      // Every profile checks this too; stopping here avoids encoding bytes that cannot publish.
      if (sourceSha256 !== clip.sha256)
        throw new Error('downloaded original does not match its recorded SHA256');
      await writeFile(input, source);
      sourceBytes += source.byteLength;
      const timings: string[] = [];
      for (const profile of clip.profiles) {
        const encodeStarted = performance.now();
        try {
          const bytes = await encodeProfile(clip, profile, input, sourceSha256);
          outputBytes[profile] += bytes;
          written[profile]++;
          timings.push(
            `${profile} ${profile === POSTER_PROFILE ? `${kb(bytes)} KB` : `${mb(bytes)} MB`} ` +
              `in ${((performance.now() - encodeStarted) / 1000).toFixed(1)} s`,
          );
        } catch (error) {
          failed++;
          console.error(
            `failed ${clip.sha256} ${clip.path} ${profile}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      const encodes = timings.map((timing) => `, ${timing}`).join('');
      console.log(
        `${clip.sha256.slice(0, 12)} ${mb(source.byteLength)} MB original, ` +
          `download ${((downloaded - started) / 1000).toFixed(1)} s${encodes}, ` +
          `total ${((performance.now() - started) / 1000).toFixed(1)} s`,
      );
    } catch (error) {
      failed += clip.profiles.length;
      console.error(
        `failed ${clip.sha256} ${clip.path}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      await rm(input, { force: true });
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
console.log(
  `${MEDIA_PROFILE_IDS.map((profile) => `${written[profile]} ${profile}`).join(', ')} ` +
    `${outDir ? `written to ${outDir}` : 'published'}, ${failed} failed; ` +
    `${mb(sourceBytes)} MB originals -> ${mb(outputBytes[RENDITION_PROFILE])} MB renditions, ` +
    `${kb(outputBytes[POSTER_PROFILE])} KB posters`,
);
if (failed > 0 || unreadable > 0) process.exitCode = 1;
