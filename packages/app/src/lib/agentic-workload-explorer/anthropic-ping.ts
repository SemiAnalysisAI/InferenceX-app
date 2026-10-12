// Mirror of `packages/proxy/src/lib/anthropic-ping.ts`. Kept duplicated rather
// than shared so a future tweak to the proxy detector doesn't accidentally
// change ingest-side filtering behavior (or vice versa). Both paths should
// match the same Claude Code `Anthropic.ping()` shape — if they ever drift,
// the dashboard-side filter is the last line of defense for traces posted by
// stale or third-party proxies that bypass the proxy's own filter.
//
// See PR #369 for the original detector; this version is intentionally
// byte-identical to that file modulo this header.

interface MaybePingBody {
  model?: unknown;
  max_tokens?: unknown;
  system?: unknown;
  tools?: unknown;
  messages?: unknown;
}

// Content can be `null`, `""`, `"test"`, or any other small string — the SDK
// has used several variants over time and there's no legitimate use for a
// degenerate Haiku call with max_tokens=1 and no tools/system regardless of
// what's in the message body.
export function isAnthropicHealthPing(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const b = body as MaybePingBody;

  if (typeof b.model !== 'string' || !b.model.includes('haiku')) return false;
  if (b.max_tokens !== 1) return false;

  if (Array.isArray(b.tools) && b.tools.length > 0) return false;
  if (b.system !== undefined && b.system !== null) {
    if (typeof b.system === 'string' && b.system.length > 0) return false;
    if (Array.isArray(b.system) && b.system.length > 0) return false;
  }

  if (!Array.isArray(b.messages) || b.messages.length !== 1) return false;
  const msg = b.messages[0];
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return false;
  const message = msg as { role?: unknown; content?: unknown };
  return message.role === 'user';
}
