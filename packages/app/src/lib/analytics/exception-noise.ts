import type { CaptureResult } from 'posthog-js';

// Browser, extension, and third-party errors the app cannot act on (PostHog, Nov 2026).
const NOISE_PATTERNS = [
  /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/,
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+/,
  /^(?:AbortError|InvalidStateError): (?:Skipping view transition|Transition was (?:aborted|skipped))/,
  /^Script error\.?$/,
  /\bwindow\.ethereum\b/,
  /^PostHog request timed out after \d+ms$/,
  // Safari 26.5 internal, not in our code or bundles.
  /^Can't find variable: EmptyRanges$/,
];

interface ExceptionEntry {
  type?: unknown;
  value?: unknown;
  stacktrace?: { frames?: { filename?: unknown }[] };
}

function frameFilenames(exception: ExceptionEntry): string[] | null {
  const frames = exception.stacktrace?.frames;
  if (!frames?.length) return null;
  const filenames = frames.map(({ filename }) => filename);
  return filenames.every((filename) => typeof filename === 'string')
    ? (filenames as string[])
    : null;
}

// Our scripts all load from /_next/; a frame in the HTML document itself is a script injected by the browser (Chrome iOS).
function isDocumentFrame(filename: string, origin: string): boolean {
  if (!URL.canParse(filename)) return false;
  const url = new URL(filename);
  return url.origin === origin && !url.pathname.startsWith('/_next/');
}

function isNoise(exception: ExceptionEntry, origin: string | null): boolean {
  const { type, value } = exception;
  if (typeof value === 'string' && NOISE_PATTERNS.some((pattern) => pattern.test(value)))
    return true;
  const filenames = frameFilenames(exception);
  if (!filenames) return false;
  // Safari hides extension script URLs behind this scheme.
  if (filenames.every((filename) => filename.startsWith('webkit-masked-url://'))) return true;
  return (
    origin !== null &&
    type === 'RangeError' &&
    typeof value === 'string' &&
    value.startsWith('Maximum call stack size exceeded') &&
    filenames.every((filename) => isDocumentFrame(filename, origin))
  );
}

/** posthog-js `before_send` hook that drops `$exception` events made only of known noise. */
export function dropNoiseExceptions(event: CaptureResult | null): CaptureResult | null {
  if (event?.event !== '$exception') return event;
  const list: unknown = event.properties.$exception_list;
  if (!Array.isArray(list) || list.length === 0) return event;
  const currentUrl: unknown = event.properties.$current_url;
  const origin =
    typeof currentUrl === 'string' && URL.canParse(currentUrl) ? new URL(currentUrl).origin : null;
  return list.every((exception: ExceptionEntry) => isNoise(exception, origin)) ? null : event;
}
