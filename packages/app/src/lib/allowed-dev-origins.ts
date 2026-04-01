/** Comma-separated hostnames or IPs (e.g. `10.112.9.49,192.168.1.10`). Only used in dev. */
export function allowedDevOriginsFromEnv(raw = process.env.NEXT_DEV_ALLOWED_ORIGINS): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
