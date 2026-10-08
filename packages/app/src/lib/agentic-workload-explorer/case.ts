function toCamel(s: string): string {
  return s.replaceAll(/_(?<ch>[a-z])/gu, (_, c) => c.toUpperCase());
}

/** Recursively convert all snake_case keys in an object/array to camelCase. */
export function camelKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [toCamel(k), camelKeys(v)]),
    );
  }
  return obj;
}

/** Response.json() with camelCase key conversion. */
export function jsonCamel(data: unknown, init?: ResponseInit): Response {
  return Response.json(camelKeys(data), init);
}
