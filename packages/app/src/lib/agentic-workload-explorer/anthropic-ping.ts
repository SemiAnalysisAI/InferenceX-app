interface MaybePingBody {
  model?: unknown;
  max_tokens?: unknown;
  system?: unknown;
  tools?: unknown;
  messages?: unknown;
}

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
