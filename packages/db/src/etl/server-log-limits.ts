/**
 * Size limits for server-log text stored in PostgreSQL.
 *
 * PostgreSQL rejects any single protocol message or text value larger than
 * 1 GB and closes the connection, which postgres.js surfaces as
 * `CONNECTION_CLOSED`. Verbose multinode decode workers can exceed that (for
 * example, about 1.4 GiB per `*_decode_w*.out` file at conc 12288). Very large
 * single statements through the Neon pooler are also fragile well below 1 GB,
 * so each stored file is capped to a configurable budget, keeping the head and
 * tail. The complete file remains in the GitHub artifact and GCS backup.
 */

const MIB = 1024 * 1024;

/** Default per-file budget for stored log text (UTF-8 bytes). */
export const DEFAULT_MAX_SERVER_LOG_FILE_BYTES = 128 * MIB;

/** Smallest budget accepted from the environment, so the marker always fits. */
const MIN_MAX_SERVER_LOG_FILE_BYTES = 64 * 1024;

/** Lines are kept whole when a newline is found within this many characters of a cut. */
const LINE_SNAP_WINDOW = 64 * 1024;

/**
 * Resolve the per-file budget. `SERVER_LOG_MAX_FILE_BYTES` overrides the
 * default; invalid or too-small values fall back to the default.
 */
export function maxServerLogFileBytes(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = env.SERVER_LOG_MAX_FILE_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_SERVER_LOG_FILE_BYTES;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_MAX_SERVER_LOG_FILE_BYTES) {
    return DEFAULT_MAX_SERVER_LOG_FILE_BYTES;
  }
  return parsed;
}

export interface CappedServerLogText {
  text: string;
  truncated: boolean;
  originalBytes: number;
  storedBytes: number;
}

function formatMiB(bytes: number): string {
  return `${(bytes / MIB).toFixed(1)} MiB`;
}

/** Longest prefix of `text` whose UTF-8 encoding fits in `budget` bytes. */
function headWithinBytes(text: string, budget: number): string {
  let chars = Math.min(text.length, budget);
  let head = text.slice(0, chars);
  let bytes = Buffer.byteLength(head, 'utf8');
  while (bytes > budget && chars > 0) {
    chars = Math.max(0, Math.floor((chars * budget) / bytes) - 1);
    head = text.slice(0, chars);
    bytes = Buffer.byteLength(head, 'utf8');
  }
  const newline = head.lastIndexOf('\n');
  return newline !== -1 && head.length - newline <= LINE_SNAP_WINDOW
    ? head.slice(0, newline + 1)
    : head;
}

/** Longest suffix of `text` whose UTF-8 encoding fits in `budget` bytes. */
function tailWithinBytes(text: string, budget: number): string {
  let chars = Math.min(text.length, budget);
  let tail = text.slice(text.length - chars);
  let bytes = Buffer.byteLength(tail, 'utf8');
  while (bytes > budget && chars > 0) {
    chars = Math.max(0, Math.floor((chars * budget) / bytes) - 1);
    tail = text.slice(text.length - chars);
    bytes = Buffer.byteLength(tail, 'utf8');
  }
  const newline = tail.indexOf('\n');
  return newline !== -1 && newline < LINE_SNAP_WINDOW ? tail.slice(newline + 1) : tail;
}

/**
 * Cap `text` to `maxBytes` UTF-8 bytes. Oversized text keeps its first and last
 * halves, cut at line boundaries when possible, around a marker that records
 * the original size. Text within budget is returned unchanged.
 */
export function capServerLogText(text: string, maxBytes: number): CappedServerLogText {
  // Every UTF-16 code unit encodes to at most 3 UTF-8 bytes, so short strings
  // skip the byte count entirely.
  if (text.length * 3 <= maxBytes) {
    return { text, truncated: false, originalBytes: -1, storedBytes: -1 };
  }
  const originalBytes = Buffer.byteLength(text, 'utf8');
  if (originalBytes <= maxBytes) {
    return { text, truncated: false, originalBytes, storedBytes: originalBytes };
  }

  // Size the marker for the worst case before choosing head/tail budgets.
  const markerFor = (keptHead: number, keptTail: number) =>
    `\n\n[InferenceX ingest truncated this log: original ${formatMiB(originalBytes)} ` +
    `(${originalBytes} bytes) exceeds the ${formatMiB(maxBytes)} storage limit. ` +
    `Kept the first ${formatMiB(keptHead)} and last ${formatMiB(keptTail)}. ` +
    `The complete file is in the run's server-log artifact.]\n\n`;
  const markerBudget = Buffer.byteLength(markerFor(originalBytes, originalBytes), 'utf8');
  const contentBudget = Math.max(0, maxBytes - markerBudget);
  const headBudget = Math.floor(contentBudget / 2);
  const tailBudget = contentBudget - headBudget;

  const head = headWithinBytes(text, headBudget);
  const tail = tailWithinBytes(text, tailBudget);
  const headBytes = Buffer.byteLength(head, 'utf8');
  const tailBytes = Buffer.byteLength(tail, 'utf8');
  const capped = head + markerFor(headBytes, tailBytes) + tail;
  return {
    text: capped,
    truncated: true,
    originalBytes,
    storedBytes: Buffer.byteLength(capped, 'utf8'),
  };
}
