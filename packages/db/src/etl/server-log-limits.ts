const MIB = 1024 * 1024;

export const DEFAULT_MAX_SERVER_LOG_FILE_BYTES = 128 * MIB;

const MIN_MAX_SERVER_LOG_FILE_BYTES = 64 * 1024;

const LINE_SNAP_WINDOW = 64 * 1024;

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

export function capServerLogText(text: string, maxBytes: number): CappedServerLogText {
  if (text.length * 3 <= maxBytes) {
    return { text, truncated: false, originalBytes: -1, storedBytes: -1 };
  }
  const originalBytes = Buffer.byteLength(text, 'utf8');
  if (originalBytes <= maxBytes) {
    return { text, truncated: false, originalBytes, storedBytes: originalBytes };
  }

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
