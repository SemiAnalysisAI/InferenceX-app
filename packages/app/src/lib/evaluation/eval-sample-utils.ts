export interface Demonstration {
  question: string;
  answer: string;
}

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

  if (messages.length === 1 && messages[0].role === 'user') {
    const text = messages[0].content;
    const chunks = text.split(/\n\nQuestion:\s?/u);
    if (chunks.length >= 2) {
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
