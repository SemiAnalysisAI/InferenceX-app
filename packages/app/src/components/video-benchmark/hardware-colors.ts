/**
 * VideoGenX's own hardware colours. The site palette shades every NVIDIA chip green, so
 * H100 and H200 read alike on a chart with only four GPUs; here each has its own hue.
 * Chart lines, points, legend, end-of-line pills, clip stage and compare row all read
 * this map through the dashboard's `colorFor`. Other dashboards keep the site palette.
 *
 * Light values sit on the white card and dark values on the dark card, each at 3:1 or
 * more, the WCAG floor for graphics.
 */
const VIDEO_HARDWARE_COLORS: Record<string, { light: string; dark: string }> = {
  b200: { light: '#5f9e45', dark: '#7fc45f' },
  mi355x: { light: '#c2410c', dark: '#f07a3e' },
  h200: { light: '#1d6fb8', dark: '#5aa9ec' },
  h100: { light: '#0b5c3c', dark: '#2fb58a' },
};

/** The VideoGenX colour of a hardware key; null leaves it to the site palette. */
export function videoHardwareColor(hardwareKey: string, theme: 'light' | 'dark'): string | null {
  return VIDEO_HARDWARE_COLORS[hardwareKey]?.[theme] ?? null;
}
