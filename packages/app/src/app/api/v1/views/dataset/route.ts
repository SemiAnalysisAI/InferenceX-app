import type { NextRequest } from 'next/server';
import { GET as detail } from '@/app/api/v1/datasets/[slug]/route';
import { GET as conversations } from '@/app/api/v1/datasets/[slug]/conversations/route';
import { GET as conversation } from '@/app/api/v1/datasets/[slug]/conversations/[convId]/route';
import {
  buildRowOverlaps,
  buildVisibleRows,
  computeBraceLayout,
  resolveDeepLinkTarget,
} from '@/components/datasets/trace-flamegraph-model';
import type { ConversationDetail, ConversationList, DatasetDetail } from '@/hooks/api/use-datasets';
import { cachedJson } from '@/lib/api-cache';
import { integerParam, requiredText } from '@/lib/views-api/detail-params';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { parseEnumParam, validateParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return runViewsRoute('dataset', async () => {
    const search = request.nextUrl.searchParams;
    validateParams(search, VIEW_QUERY_PARAMS.dataset);
    const slug = requiredText(search, 'slug');
    const convId = search.has('convId') ? requiredText(search, 'convId') : null;
    const sort = parseEnumParam(
      search.get('sort'),
      'sort',
      ['tokens', 'turns', 'subagents', 'id'],
      'tokens',
    );
    const limit = integerParam(search, 'limit', 50, 1, 200);
    const offset = integerParam(search, 'offset', 0);
    const query = search.get('search')?.trim() ?? '';
    if (query.length > 512)
      throw new ViewsApiParamError('search', 'search is limited to 512 characters');
    const expandedInput = search.get('expanded') ?? '';
    if (expandedInput !== 'all' && expandedInput !== '' && !/^\d+(?:,\d+)*$/u.test(expandedInput)) {
      throw new ViewsApiParamError('expanded', 'Use all or comma-separated structure node indices');
    }
    const indices =
      expandedInput === 'all' || !expandedInput ? [] : expandedInput.split(',').map(Number);
    if (indices.length > 200 || indices.some((n) => !Number.isSafeInteger(n))) {
      throw new ViewsApiParamError('expanded', 'At most 200 safe node indices are supported');
    }
    const highlight = {
      turn: search.has('turn') ? integerParam(search, 'turn') : null,
      raw: search.has('raw') ? integerParam(search, 'raw') : null,
      inner: search.has('inner') ? integerParam(search, 'inner') : null,
      agent: search.get('sa'),
    };
    if (!convId && ['expanded', 'turn', 'raw', 'inner', 'sa'].some((key) => search.has(key))) {
      throw new ViewsApiParamError('convId', 'convId is required for flamegraph controls');
    }
    const context = { params: Promise.resolve({ slug }) };
    const dataset = await readResponse<DatasetDetail>(await detail(request, context));
    const index = await readResponse<ConversationList>(
      await conversations(
        sourceRequest(request, '/api/v1/datasets/selected/conversations', {
          search: query,
          sort,
          limit: String(limit),
          offset: String(offset),
        }),
        context,
      ),
    );
    let flamegraph = null;
    if (convId) {
      const selected = await readResponse<ConversationDetail>(
        await conversation(request, {
          params: Promise.resolve({ slug, convId }),
        }),
      );
      const nodes = selected.structure.nodes;
      const groups = nodes.flatMap((node, i) => (node.kind === 'subagent' ? [i] : []));
      if (indices.some((i) => !groups.includes(i))) {
        throw new ViewsApiParamError('expanded', 'Every index must identify a subagent group');
      }
      const target = resolveDeepLinkTarget(nodes, highlight);
      const expanded = new Set(expandedInput === 'all' ? groups : indices);
      if (target?.expandGroup !== null && target?.expandGroup !== undefined)
        expanded.add(target.expandGroup);
      const rows = buildVisibleRows(nodes, expanded, buildRowOverlaps(nodes));
      flamegraph = {
        conversation: selected,
        rows,
        brackets: computeBraceLayout(rows),
        target,
        expanded: [...expanded].sort((a, b) => a - b),
        maxTokens: rows.reduce((max, row) => (row.isGroup ? max : Math.max(max, row.total)), 1),
        maxGroupTokens: rows.reduce(
          (max, row) => (row.isGroup ? Math.max(max, row.total) : max),
          1,
        ),
      };
    }
    return cachedJson({
      view: 'dataset',
      apiVersion: 'v1',
      params: {
        slug,
        convId,
        search: query,
        sort,
        limit,
        offset,
        expanded: flamegraph?.expanded ?? [],
        turn: highlight.turn,
        raw: highlight.raw,
        inner: highlight.inner,
        sa: highlight.agent,
      },
      dataset,
      conversations: index,
      flamegraph,
      pagination: {
        returned: index.items.length,
        total: index.total,
        hasMore: offset + index.items.length < index.total,
      },
    });
  });
}
