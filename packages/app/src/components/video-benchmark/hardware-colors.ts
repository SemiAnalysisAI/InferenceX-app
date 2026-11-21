/**
 * The quality guide's hardware colours, which it also sets text in. The results dashboard
 * uses the site palette instead.
 *
 * Light values sit on the white card and dark values on the dark card, each at 3:1 or
 * more, the WCAG floor for graphics.
 */
const VIDEO_HARDWARE_COLORS: Record<string, { light: string; dark: string }> = {
  b200: { light: '#5f9e45', dark: '#7fc45f' },
  b300: { light: '#6d28d9', dark: '#a78bfa' },
  mi355x: { light: '#c2410c', dark: '#f07a3e' },
  h200: { light: '#1d6fb8', dark: '#5aa9ec' },
  h100: { light: '#0b5c3c', dark: '#2fb58a' },
};

/** The guide's colour of a hardware key, or null. */
export function videoHardwareColor(hardwareKey: string, theme: 'light' | 'dark'): string | null {
  return VIDEO_HARDWARE_COLORS[hardwareKey]?.[theme] ?? null;
}
