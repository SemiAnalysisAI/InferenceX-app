function toCamel(s: string): string {
  return s.replaceAll(/_(?<ch>[a-z])/gu, (_, c) => c.toUpperCase());
}

// Raw upstream API payloads (Anthropic/OpenAI request and response bodies).
// Their keys are renamed but their contents keep the provider's snake_case
// names (`stop_reason`, `max_tokens`, ...), which the session views read.
const OPAQUE_KEYS = new Set(['request_body', 'response_body']);

/**
 * Recursively convert all snake_case keys in an object/array to camelCase,
 * leaving the contents of raw payload fields untouched.
 */
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

/** Response.json() with camelCase key conversion. */
export function jsonCamel(data: unknown, init?: ResponseInit): Response {
  return Response.json(camelKeys(data), init);
}
