// oxlint-disable-next-line no-control-regex -- terminal logs intentionally contain ANSI controls
const ANSI_OSC_PATTERN = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gu;
// oxlint-disable-next-line no-control-regex -- terminal logs intentionally contain ANSI controls
const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/gu;

export function readableLogText(value: string): string {
  return value
    .replace(ANSI_OSC_PATTERN, '')
    .replace(ANSI_CSI_PATTERN, '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n');
}

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

export type LogSeverity = 'error' | 'warn' | 'debug' | 'info';

export interface LogLinePiece {
  text: string;
  highlighted: boolean;
}

export interface LogLine {
  text: string;
  pieces: LogLinePiece[];
  severity: LogSeverity;
}

const SEVERITY_SCAN_LENGTH = 200;
const ERROR_PATTERN = /\b(?:ERROR|FATAL|CRITICAL|PANIC)\b|^Traceback \(most recent call last\)/;
const WARN_PATTERN = /\b(?:WARNING|WARN)\b/;
const DEBUG_PATTERN = /\b(?:DEBUG|TRACE)\b/;

export function logLineSeverity(line: string): LogSeverity {
  const head = line.length > SEVERITY_SCAN_LENGTH ? line.slice(0, SEVERITY_SCAN_LENGTH) : line;
  if (ERROR_PATTERN.test(head)) return 'error';
  if (WARN_PATTERN.test(head)) return 'warn';
  if (DEBUG_PATTERN.test(head)) return 'debug';
  return 'info';
}

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
      if (part !== '' || segment.highlighted) {
        pieces.push({ text: part, highlighted: segment.highlighted });
        plainText += part;
      }
    }
  }
  endLine();

  if (lines.length > 1 && lines.at(-1)?.pieces.length === 0) lines.pop();
  return lines;
}
