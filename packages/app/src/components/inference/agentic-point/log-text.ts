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
