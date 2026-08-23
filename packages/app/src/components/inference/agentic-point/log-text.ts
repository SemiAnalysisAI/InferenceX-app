// oxlint-disable-next-line no-control-regex -- terminal logs intentionally contain ANSI controls
const ANSI_OSC_PATTERN = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gu;
// oxlint-disable-next-line no-control-regex -- terminal logs intentionally contain ANSI controls
const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/gu;

/** Remove terminal control sequences while preserving the original log text. */
export function readableLogText(value: string): string {
  return value
    .replace(ANSI_OSC_PATTERN, '')
    .replace(ANSI_CSI_PATTERN, '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n');
}

/** Convert a PostgreSQL character offset to a JavaScript UTF-16 string index. */
export function utf16IndexAtCodePointOffset(value: string, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0) return null;
  let codePointOffset = 0;
  let utf16Index = 0;
  while (utf16Index < value.length && codePointOffset < offset) {
    const codePoint = value.codePointAt(utf16Index);
    utf16Index += codePoint !== undefined && codePoint > 65_535 ? 2 : 1;
    codePointOffset++;
  }
  return codePointOffset === offset ? utf16Index : null;
}

/** Only user-driven vertical scrolling should request the next log chunk. */
export function isNearLogBottom({
  scrollTop,
  clientHeight,
  scrollHeight,
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): boolean {
  return scrollTop > 0 && scrollTop + clientHeight >= scrollHeight - 160;
}

/** Conventional log levels we tint in the viewer gutter and line background. */
export type LogSeverity = 'error' | 'warn' | 'debug' | 'info';

/** One run of characters inside a rendered line; `highlighted` marks a search hit. */
export interface LogLinePiece {
  text: string;
  highlighted: boolean;
}

export interface LogLine {
  /** The whole line as plain text — the concatenation of `pieces`. */
  text: string;
  pieces: LogLinePiece[];
  severity: LogSeverity;
}

// Only the head of a line is scanned so a long INFO line that happens to quote
// the word ERROR further along is not mis-tinted (and so severity stays O(1)).
const SEVERITY_SCAN_LENGTH = 200;
const ERROR_PATTERN = /\b(?:ERROR|FATAL|CRITICAL|PANIC)\b|^Traceback \(most recent call last\)/;
const WARN_PATTERN = /\b(?:WARNING|WARN)\b/;
const DEBUG_PATTERN = /\b(?:DEBUG|TRACE)\b/;

/** Classify a log line by its conventional uppercase level token. */
export function logLineSeverity(line: string): LogSeverity {
  const head = line.length > SEVERITY_SCAN_LENGTH ? line.slice(0, SEVERITY_SCAN_LENGTH) : line;
  if (ERROR_PATTERN.test(head)) return 'error';
  if (WARN_PATTERN.test(head)) return 'warn';
  if (DEBUG_PATTERN.test(head)) return 'debug';
  return 'info';
}

/**
 * Split ordered text runs into rendered lines, preserving which runs are search
 * highlights. Runs are split rather than the joined string so a highlight that
 * starts mid-line stays a single `<mark>` inside that one line.
 */
export function buildLogLines(segments: readonly LogLinePiece[]): LogLine[] {
  const lines: LogLine[] = [];
  let pieces: LogLinePiece[] = [];
  let plainText = '';

  const endLine = () => {
    lines.push({ text: plainText, pieces, severity: logLineSeverity(plainText) });
    pieces = [];
    plainText = '';
  };

  for (const segment of segments) {
    const parts = segment.text.split('\n');
    for (const [index, part] of parts.entries()) {
      if (index > 0) endLine();
      // Empty highlighted runs are kept so the jump target always has a `<mark>`.
      if (part !== '' || segment.highlighted) {
        pieces.push({ text: part, highlighted: segment.highlighted });
        plainText += part;
      }
    }
  }
  endLine();

  // A trailing newline ends the last line rather than starting an empty one.
  if (lines.length > 1 && lines.at(-1)?.pieces.length === 0) lines.pop();
  return lines;
}
