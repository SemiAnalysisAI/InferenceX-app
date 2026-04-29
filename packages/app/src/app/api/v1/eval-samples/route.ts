import { type NextRequest, NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import { getEvalSamples } from '@semianalysisai/inferencex-db/queries/eval-samples';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const ALLOWED_FILTERS = new Set(['all', 'passed', 'failed']);
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

interface Demonstration {
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
function extractDemonstrations(argumentsData: unknown): Demonstration[] | null {
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
    const chunks = text.split(/\n\nQuestion:\s?/);
    if (chunks.length >= 2) {
      // First chunk starts with `Question: ` rather than the split delimiter.
      chunks[0] = chunks[0].replace(/^Question:\s?/, '');
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

const getCachedEvalSamples = cachedQuery(
  (evalResultId: number, filter: 'all' | 'passed' | 'failed', offset: number, limit: number) => {
    if (JSON_MODE) {
      // JSON dump mode has no eval_samples — return an empty result so the UI
      // renders cleanly when run against a static build.
      return Promise.resolve({ samples: [], total: 0, passedTotal: 0, failedTotal: 0 });
    }
    return getEvalSamples(getDb(), evalResultId, filter, offset, limit);
  },
  'eval-samples',
);

/**
 * GET /api/v1/eval-samples?eval_result_id=N&filter=all|passed|failed&offset=0&limit=200
 *
 * Returns a paginated slice of per-prompt samples for one `eval_results` row,
 * plus passed/failed totals for the filter-chip badges. Drawer use only —
 * agg metrics live on `/api/v1/evaluations`.
 *
 * For unofficial / un-ingested runs the live-fetch fallback (TODO) will be
 * added in a follow-up; this v1 covers the DB path only.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const evalResultId = Number(params.get('eval_result_id'));
  const filterParam = params.get('filter') ?? 'all';
  const offset = Math.max(0, Math.trunc(Number(params.get('offset') ?? '0')));
  const requestedLimit = Math.trunc(Number(params.get('limit') ?? String(DEFAULT_LIMIT)));
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit || DEFAULT_LIMIT));

  if (!evalResultId || !Number.isFinite(evalResultId) || evalResultId <= 0) {
    return NextResponse.json(
      { error: 'eval_result_id is required and must be a positive integer' },
      { status: 400 },
    );
  }
  if (!ALLOWED_FILTERS.has(filterParam)) {
    return NextResponse.json(
      { error: `filter must be one of: ${[...ALLOWED_FILTERS].join(', ')}` },
      { status: 400 },
    );
  }
  const filter = filterParam as 'all' | 'passed' | 'failed';

  try {
    const result = await getCachedEvalSamples(evalResultId, filter, offset, limit);

    return cachedJson({
      samples: result.samples.map((s) => ({
        docId: s.doc_id,
        prompt: s.prompt,
        target: s.target,
        response: s.response,
        rawResponse: s.raw_response,
        demonstrations: extractDemonstrations(s.arguments_data),
        passed: s.passed,
        score: s.score === null ? null : Number(s.score),
        metrics: s.metrics ?? {},
      })),
      total: result.total,
      passedTotal: result.passedTotal,
      failedTotal: result.failedTotal,
      source: 'db' as const,
    });
  } catch (error) {
    console.error('Error fetching eval samples:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
