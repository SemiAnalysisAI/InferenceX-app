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
