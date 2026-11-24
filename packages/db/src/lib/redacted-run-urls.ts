import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** One run whose `html_url` is about to be cleared because its repository is not public. */
export interface RedactedRunUrl {
  github_run_id: string;
  run_attempt: number;
  html_url: string;
}

/** `--url-map <path>`, else `~/.inferencex/redacted-run-urls/<time>-<pid>.jsonl`. */
export function redactedRunUrlsPath(argv: readonly string[] = process.argv): string {
  const index = argv.indexOf('--url-map');
  if (index !== -1) {
    const file = argv[index + 1];
    if (!file || file.startsWith('--')) throw new Error('--url-map requires a file path');
    return path.resolve(file);
  }
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(
    os.homedir(),
    '.inferencex',
    'redacted-run-urls',
    `${stamp}-${process.pid}.jsonl`,
  );
}

/**
 * Append the URLs about to be cleared to `file`, one JSON object per line, before clearing them:
 * it is the only record of which repository those runs came from, which later admin backfills need.
 * The directory is created owner-only (700) and the file owner-read/write (600). Callers print the
 * path, never the contents, and the file must not be committed or uploaded from CI.
 */
export function recordRedactedRunUrls(file: string, runs: readonly RedactedRunUrl[]): void {
  if (runs.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, runs.map((run) => `${JSON.stringify(run)}\n`).join(''), { mode: 0o600 });
}
