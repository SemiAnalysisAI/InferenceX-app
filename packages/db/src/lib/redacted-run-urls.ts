import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** One run whose `html_url` is about to be cleared because its repository is not public. */
export interface RedactedRunUrl {
  github_run_id: string;
  run_attempt: number;
  html_url: string;
}

/** Where URL maps are written by default, and where admin backfills look for them. */
export const REDACTED_RUN_URLS_DIR = path.join(os.homedir(), '.inferencex', 'redacted-run-urls');

/** `--url-map <path>`, else `<REDACTED_RUN_URLS_DIR>/<time>-<pid>.jsonl`. */
export function redactedRunUrlsPath(argv: readonly string[] = process.argv): string {
  const index = argv.indexOf('--url-map');
  if (index !== -1) {
    const file = argv[index + 1];
    if (!file || file.startsWith('--')) throw new Error('--url-map requires a file path');
    return path.resolve(file);
  }
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(REDACTED_RUN_URLS_DIR, `${stamp}-${process.pid}.jsonl`);
}

/**
 * Append the URLs about to be cleared to `file`, one JSON object per line, before clearing them:
 * it is the only record of which repository those runs came from, which later admin backfills need.
 * The directory is created owner-only (700), and the file is owner-read/write (600) afterwards even
 * when it already existed with wider permissions. Callers print the path, never the contents, and
 * the file must not be committed or uploaded from CI.
 */
export function recordRedactedRunUrls(file: string, runs: readonly RedactedRunUrl[]): void {
  if (runs.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, runs.map((run) => `${JSON.stringify(run)}\n`).join(''), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/**
 * `github_run_id` → recorded `html_url`, from every `*.jsonl` URL map in `dir`. Empty when the
 * directory does not exist, as on a machine that never ran the redaction.
 */
export function loadRedactedRunUrls(dir: string = REDACTED_RUN_URLS_DIR): Map<string, string> {
  const urls = new Map<string, string>();
  if (!fs.existsSync(dir)) return urls;
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      const run: unknown = JSON.parse(line);
      if (
        typeof run !== 'object' ||
        run === null ||
        !('github_run_id' in run) ||
        !('html_url' in run) ||
        typeof run.html_url !== 'string'
      ) {
        throw new Error(`${name} holds a line that is not a recorded run URL`);
      }
      urls.set(String(run.github_run_id), run.html_url);
    }
  }
  return urls;
}
