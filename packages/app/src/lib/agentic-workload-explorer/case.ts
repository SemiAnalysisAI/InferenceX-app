function toCamel(s: string): string {
  return s.replaceAll(/_(?<ch>[a-z])/gu, (_, c) => c.toUpperCase());
}

const OPAQUE_KEYS = new Set(['request_body', 'response_body']);

export function camelKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        toCamel(k),
        OPAQUE_KEYS.has(k) ? v : camelKeys(v),
      ]),
    );
  }
  return obj;
}

export function jsonCamel(data: unknown, init?: ResponseInit): Response {
  return Response.json(camelKeys(data), init);
}
