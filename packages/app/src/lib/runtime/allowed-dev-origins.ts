/** Comma-separated dev hostnames (e.g. `dev-a.local,dev-b.local`). */
export function allowedDevOriginsFromEnv(raw = process.env.NEXT_DEV_ALLOWED_ORIGINS): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
