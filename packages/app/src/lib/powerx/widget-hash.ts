/**
 * URL-hash state for the tutorial widgets. Each widget owns one namespace (`pb`, `rc`, `vd`, `ch`)
 * and the hash holds `key=value` pairs joined by `&`, e.g. `#pb=b200_fixed_single_600&vd=1_8_0.1`.
 * A bare heading anchor (`#reading-the-charts`) carries no pairs and is left alone on read; it is
 * dropped on the first write, because by then the reader has scrolled past it.
 */

const PAIR = /^(?<key>[a-z]+)=(?<value>[^&]*)$/u;

export function parseWidgetHash(hash: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const token of hash.replace(/^#/u, '').split('&')) {
    const match = PAIR.exec(token);
    if (match?.groups) pairs.set(match.groups.key, decodeURIComponent(match.groups.value));
  }
  return pairs;
}

export function readWidgetHash(hash: string, key: string): string | null {
  return parseWidgetHash(hash).get(key) ?? null;
}

/** Returns the new hash (without `#`) with `key` set to `value`; other widget pairs survive. */
export function writeWidgetHash(hash: string, key: string, value: string): string {
  const pairs = parseWidgetHash(hash);
  pairs.set(key, value);
  return [...pairs].map(([name, encoded]) => `${name}=${encodeURIComponent(encoded)}`).join('&');
}

/** Picks `value` when it is one of `allowed`, otherwise `fallback`. */
export function snapTo<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Parses a finite number clamped to `[min, max]`, otherwise `fallback`. */
export function snapNumber(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
