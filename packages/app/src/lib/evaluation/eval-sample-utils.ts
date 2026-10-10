/**
 * Shared helpers for the per-sample eval drawer (both DB-backed and live GHA-backed).
 *
 * The per-sample drawer has two backends — `/api/v1/eval-samples` (reads from
 * the `eval_samples` table) and `/api/v1/eval-samples-live` (downloads the
 * matching workflow artifact on the fly). Both need to surface few-shot
 * demonstrations parsed out of lm-eval's `arguments` payload, which is why this
 * lives in a shared lib rather than inside one route.
 */

export interface Demonstration {
  question: string;
  answer: string;
}

/**
 * Pull the lm-eval prompt payload out of `data.arguments` and parse it into a
 * list of few-shot demonstrations to display in the drawer.
 *
 * Two shapes appear in our ingested data — both for the same GSM8K 5-shot eval
 * — depending on the framework version that produced the artifact:
 *
 * 1. **Multi-turn chat array** — `arg_0[0]` is a stringified JSON array of
 *    `[{role, content}, …]` with N user/assistant pairs followed by a trailing
 *    user message (the actual question). We pair adjacent user/assistant turns
 *    up to but not including the final user turn.
 *
 * 2. **Pre-concatenated single message** — `arg_0[0]` is a stringified JSON
 *    array containing one user message whose `content` has all N demos already
 *    rolled into text using the literal `Question: …\nAnswer: …\n\n` separator.
 *    We split on `\n\nQuestion:` and pair the Q/A halves of each chunk.
 *
 * Returns `null` for non-chat-format tasks (no `gen_args_0`) or anything that
 * doesn't match either shape — the bare `prompt` column already covers those.
 */
export function extractDemonstrations(argumentsData: unknown): Demonstration[] | null {
  if (!argumentsData || typeof argumentsData !== 'object' || Array.isArray(argumentsData)) {
    return null;
  }
  const obj = argumentsData as Record<string, unknown>;
  const genArgs = obj.gen_args_0;
  if (!genArgs || typeof genArgs !== 'object') return null;
  const argSlot = (genArgs as Record<string, unknown>).arg_0;
  let serialized: string | null = null;
  if (typeof argSlot === 'string') serialized = argSlot;
  else if (Array.isArray(argSlot) && typeof argSlot[0] === 'string') serialized = argSlot[0];
  if (!serialized) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const messages: { role: string; content: string }[] = [];
  for (const m of parsed) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if (typeof role !== 'string' || typeof content !== 'string') continue;
    messages.push({ role, content });
  }
  if (messages.length === 0) return null;

  // Shape 1: multi-turn — pair user→assistant turns *before* the final user question.
  if (messages.length >= 3) {
    const out: Demonstration[] = [];
    for (let i = 0; i + 1 < messages.length - 1; i += 2) {
      const q = messages[i];
      const a = messages[i + 1];
      if (q.role === 'user' && a.role === 'assistant') {
        out.push({ question: q.content, answer: a.content });
      }
    }
    if (out.length > 0) return out;
  }

  // Shape 2: pre-concatenated — one user message containing N demos as text.
  // Split on the first `Question:` plus subsequent `\n\nQuestion:` separators.
  // Each chunk has form `<problem>…\nAnswer: <answer>` except the final chunk
  // (the actual question) which ends with a bare `Answer:`.
  if (messages.length === 1 && messages[0].role === 'user') {
    const text = messages[0].content;
    const chunks = text.split(/\n\nQuestion:\s?/u);
    if (chunks.length >= 2) {
      // First chunk starts with `Question: ` rather than the split delimiter.
      chunks[0] = chunks[0].replace(/^Question:\s?/u, '');
      const out: Demonstration[] = [];
      for (let i = 0; i < chunks.length - 1; i++) {
        const c = chunks[i];
        const idx = c.lastIndexOf('\nAnswer:');
        if (idx === -1) continue;
        const question = c.slice(0, idx).trim();
        const answer = c.slice(idx + '\nAnswer:'.length).trim();
        if (question && answer) out.push({ question, answer });
      }
      if (out.length > 0) return out;
    }
  }

  return null;
}
