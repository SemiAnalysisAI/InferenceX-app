'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useSession, type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';
import {
  useSessionReplay,
  ReplayControls,
} from '@/components/agentic-workload-explorer/session-replay';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

// ── Strings ─────────────────────────────────────────────────────

const STRINGS = {
  en: {
    hiddenFullMode: 'Hash radix tree is hidden for full-mode sessions.',
    hiddenFullModeDetail: (
      <>
        Hash blocks are still stored — query the <code>hash_ids</code> column directly for
        debugging.
      </>
    ),
    noHashIds: 'No hash IDs in this session.',
    noHashIdsDetail: 'Hash chains are generated on requests through /proxy/v1/messages.',
    renderingTree: 'Rendering tree...',
    root: 'Root',
    leafNode: 'Leaf node',
    block: (n: number) => `${n} block${n === 1 ? '' : 's'}`,
    request: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    branch: (n: number) => `${n} branch${n === 1 ? '' : 'es'}`,
    req: (n: number) => `${n} req${n === 1 ? '' : 's'}`,
    requestsStat: 'Requests',
    uniqueHashes: 'Unique Hashes',
    totalBlocks: 'Total Blocks',
    blockReuse: 'Block Reuse',
    treeNodes: 'Tree Nodes',
    maxDepth: 'Max Depth',
    radixTree: 'Radix Tree',
    list: 'List',
    graph: 'Graph',
    compact: 'Compact',
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
    summary: (reqs: number, branches: number) =>
      `${reqs} requests · ${branches} top-level branches`,
    exitReplay: '⏹ Exit Replay',
    replay: '▶ Replay',
    inLabel: 'in',
    outLabel: 'out',
    blocksLabel: 'blocks',
  },
  zh: {
    hiddenFullMode: '此会话为 full 模式，哈希 Radix Tree 已隐藏。',
    hiddenFullModeDetail: (
      <>
        哈希块仍有存储，可直接查询 <code>hash_ids</code> 列进行调试。
      </>
    ),
    noHashIds: '此会话无 hash ID。',
    noHashIdsDetail: '哈希链由 /proxy/v1/messages 请求生成。',
    renderingTree: '正在渲染树...',
    root: '根节点',
    leafNode: '叶节点',
    block: (n: number) => `${n} 个块`,
    request: (n: number) => `${n} 个请求`,
    branch: (n: number) => `${n} 个分支`,
    req: (n: number) => `${n} 请求`,
    requestsStat: '请求数',
    uniqueHashes: '唯一哈希数',
    totalBlocks: '块总数',
    blockReuse: '块复用率',
    treeNodes: '树节点数',
    maxDepth: '最大深度',
    radixTree: 'Radix Tree',
    list: '列表',
    graph: '图形',
    compact: '紧凑',
    expandAll: '全部展开',
    collapseAll: '全部折叠',
    summary: (reqs: number, branches: number) => `${reqs} 个请求 · ${branches} 个顶层分支`,
    exitReplay: '⏹ 退出回放',
    replay: '▶ 回放',
    inLabel: '输入',
    outLabel: '输出',
    blocksLabel: '块',
  },
} as const;

type T = (typeof STRINGS)[keyof typeof STRINGS];

// ── Types ────────────────────────────────────────────────────────

interface RadixNode {
  segment: string[];
  leaves: SessionRequest[];
  children: Map<string, RadixNode>;
  totalLeaves: number;
}

// ── Radix tree builder ──────────────────────────────────────────

function buildRadixTree(requests: SessionRequest[]): RadixNode {
  const root: RadixNode = { segment: [], leaves: [], children: new Map(), totalLeaves: 0 };
  for (const req of requests) {
    if (!req.hashIds || req.hashIds.length === 0) continue;
    insertChain(root, req, 0);
  }
  compressTree(root);
  computeTotals(root);
  return root;
}

function insertChain(root: RadixNode, req: SessionRequest, _depth: number) {
  const hashes = req.hashIds!;
  let node = root;
  for (let i = _depth; i < hashes.length; i++) {
    const key = hashes[i];
    let child = node.children.get(key);
    if (!child) {
      child = { segment: [key], leaves: [], children: new Map(), totalLeaves: 0 };
      node.children.set(key, child);
    }
    node = child;
  }
  node.leaves.push(req);
}

function compressTree(root: RadixNode) {
  // Post-order iterative: collect all nodes, process leaves first
  const stack: RadixNode[] = [root];
  const order: RadixNode[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    order.push(node);
    for (const child of node.children.values()) {
      stack.push(child);
    }
  }
  // Process in reverse (children before parents)
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    for (const [key, child] of node.children) {
      if (child.children.size === 1 && child.leaves.length === 0) {
        const [, grandchild] = [...child.children.entries()][0];
        grandchild.segment = [...child.segment, ...grandchild.segment];
        node.children.delete(key);
        node.children.set(child.segment[0], grandchild);
      }
    }
  }
}

function computeTotals(root: RadixNode) {
  // Post-order iterative
  const stack: RadixNode[] = [root];
  const order: RadixNode[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    order.push(node);
    for (const child of node.children.values()) {
      stack.push(child);
    }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    let total = node.leaves.length;
    for (const child of node.children.values()) {
      total += child.totalLeaves;
    }
    node.totalLeaves = total;
  }
}

// ── Formatting ──────────────────────────────────────────────────

function truncHash(h: string) {
  return h.slice(0, 8);
}

function formatTokens(n: number | null) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Colors ──────────────────────────────────────────────────────

const DEPTH_COLORS = [
  'text-cyan-400 border-cyan-500/30 bg-cyan-500/8',
  'text-emerald-400 border-emerald-500/30 bg-emerald-500/8',
  'text-violet-400 border-violet-500/30 bg-violet-500/8',
  'text-amber-400 border-amber-500/30 bg-amber-500/8',
  'text-sky-400 border-sky-500/30 bg-sky-500/8',
  'text-rose-400 border-rose-500/30 bg-rose-500/8',
  'text-orange-400 border-orange-500/30 bg-orange-500/8',
];

function depthColor(depth: number) {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length];
}

const DEPTH_LINE_COLORS = [
  'border-cyan-500/20',
  'border-emerald-500/20',
  'border-violet-500/20',
  'border-amber-500/20',
  'border-sky-500/20',
  'border-rose-500/20',
  'border-orange-500/20',
];

function depthLineColor(depth: number) {
  return DEPTH_LINE_COLORS[depth % DEPTH_LINE_COLORS.length];
}

const DEPTH_SVG_COLORS = [
  '#22d3ee',
  '#34d399',
  '#a78bfa',
  '#fbbf24',
  '#38bdf8',
  '#fb7185',
  '#fb923c',
];

function depthSvgColor(depth: number) {
  return DEPTH_SVG_COLORS[depth % DEPTH_SVG_COLORS.length];
}

// ── Chronological ordering ──────────────────────────────────────

/** Build a map of RadixNode -> chronological index, sorted by earliest request timestamp */
function buildChronoMap(root: RadixNode): Map<RadixNode, number> {
  // Collect all nodes with their earliest timestamp
  const entries: { node: RadixNode; ts: number }[] = [];
  const stack: RadixNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    entries.push({ node, ts: earliestTimestamp(node) });
    for (const child of node.children.values()) stack.push(child);
  }
  // Sort by timestamp (chronological order)
  entries.sort((a, b) => a.ts - b.ts);
  const map = new Map<RadixNode, number>();
  for (let i = 0; i < entries.length; i++) {
    map.set(entries[i].node, i);
  }
  return map;
}

/** Build sorted timestamps array matching chronological node order */
function buildChronoTimestamps(root: RadixNode): number[] {
  const entries: { ts: number }[] = [];
  const stack: RadixNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    entries.push({ ts: earliestTimestamp(node) });
    for (const child of node.children.values()) stack.push(child);
  }
  entries.sort((a, b) => a.ts - b.ts);
  return entries.map((e) => e.ts);
}

// ── D3 types + iterative converter ──────────────────────────────

interface D3TreeNode {
  label: string;
  fullLabel: string;
  blocks: number;
  reqs: number;
  branches: number;
  chronoIndex: number;
  children?: D3TreeNode[];
}

function radixToD3(
  root: RadixNode,
  compact: boolean,
  chronoMap: Map<RadixNode, number>,
): D3TreeNode {
  const map = new Map<RadixNode, D3TreeNode>();
  const stack: RadixNode[] = [root];
  const order: RadixNode[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    order.push(node);
    for (const child of node.children.values()) stack.push(child);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    const blocks = node.segment.length;
    const label = compact
      ? blocks > 0
        ? `${blocks}b`
        : `${node.totalLeaves}r`
      : blocks > 0
        ? node.segment.map((h) => h.slice(0, 6)).join('→')
        : 'root';
    const branchCount = node.children.size;
    const lines = [
      blocks > 0 ? `Blocks: ${blocks}` : 'Root node',
      `Requests: ${node.totalLeaves}`,
      branchCount > 0 ? `Branches: ${branchCount}` : 'Leaf node',
    ];
    if (blocks > 0 && !compact) {
      lines.push(`Hashes: ${node.segment.map((h) => h.slice(0, 8)).join(' → ')}`);
    }
    const fullLabel = lines.join('\n');
    const kids = [...node.children.values()]
      .toSorted((a, b) => b.totalLeaves - a.totalLeaves)
      .map((child) => map.get(child)!)
      .filter(Boolean);
    map.set(node, {
      label,
      fullLabel,
      blocks,
      reqs: node.totalLeaves,
      branches: branchCount,
      chronoIndex: chronoMap.get(node) ?? 0,
      children: kids.length > 0 ? kids : undefined,
    });
  }
  return map.get(root)!;
}

// ── D3 Tree Visualization ───────────────────────────────────────

function D3Tree({
  tree,
  compact,
  visibleCount,
  chronoMap,
  t,
}: {
  tree: RadixNode;
  compact: boolean;
  visibleCount?: number;
  chronoMap: Map<RadixNode, number>;
  t: T;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const layoutRef = useRef<d3.HierarchyPointNode<D3TreeNode> | null>(null);
  const [rendered, setRendered] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: D3TreeNode } | null>(null);

  const isReplay = visibleCount !== undefined;
  const d3Data = useMemo(() => radixToD3(tree, compact, chronoMap), [tree, compact, chronoMap]);

  // Full render — lays out the tree and draws all elements
  const render = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const viewWidth = container.clientWidth;
    const viewHeight = 500;
    const root = d3.hierarchy(d3Data);
    const leaves = root.leaves().length;

    const layoutWidth = Math.max(leaves * 50, 400);
    const layoutHeight = Math.max((root.height + 1) * 80, 300);
    const pointRoot = d3.tree<D3TreeNode>().size([layoutWidth, layoutHeight])(root);
    layoutRef.current = pointRoot;

    d3.select(svg).selectAll('*').remove();
    d3.select(svg).attr('width', viewWidth).attr('height', viewHeight);
    const g = d3.select(svg).append('g');
    gRef.current = g;

    const nodeCount = root.descendants().length;
    const baseR = nodeCount > 500 ? 6 : nodeCount > 100 ? 10 : 16;
    const maxR = nodeCount > 500 ? 14 : nodeCount > 100 ? 20 : 32;
    const maxReqs = Math.max(...root.descendants().map((d) => d.data.reqs));
    const rScale = d3
      .scaleSqrt()
      .domain([1, Math.max(maxReqs, 1)])
      .range([baseR, maxR]);

    // Links
    g.selectAll('.link')
      .data(root.links())
      .join('path')
      .attr('class', 'tree-link')
      .attr('fill', 'none')
      .attr('stroke', (d) => depthSvgColor(d.source.depth))
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1.5)
      .attr(
        'd',
        d3
          .linkVertical<d3.HierarchyLink<D3TreeNode>, d3.HierarchyPointNode<D3TreeNode>>()
          .x((d) => d.x!)
          .y((d) => d.y!) as never,
      );

    // Nodes
    const nodeGroups = g
      .selectAll('.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'tree-node')
      .attr('transform', (d) => `translate(${d.x},${d.y})`);

    nodeGroups
      .append('circle')
      .attr('r', (d) => rScale(d.data.reqs))
      .attr('fill', (d) => depthSvgColor(d.depth))
      .attr('fill-opacity', 0.85)
      .attr('stroke', (d) => depthSvgColor(d.depth))
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer');

    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#fff')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('font-size', (d) => {
        const r = rScale(d.data.reqs);
        return r < 10 ? '6px' : r < 16 ? '8px' : '10px';
      })
      .text((d) => (d.data.blocks > 0 ? String(d.data.blocks) : 'R'))
      .style('pointer-events', 'none');

    // Hover tooltip via mouse events
    nodeGroups
      .on('mouseenter', (event, d) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          data: d.data,
        });
      })
      .on('mousemove', (event) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setTooltip((prev) =>
          prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null,
        );
      })
      .on('mouseleave', () => setTooltip(null));

    // Zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => g.attr('transform', event.transform));
    d3.select(svg).call(zoom);
    zoomRef.current = zoom;

    // Initial zoom to fit
    const gNode = g.node();
    if (gNode) {
      const bounds = gNode.getBBox();
      const pad = 40;
      const scale = Math.min(
        viewWidth / (bounds.width + pad * 2),
        viewHeight / (bounds.height + pad * 2),
        1,
      );
      const tx = (viewWidth - bounds.width * scale) / 2 - bounds.x * scale;
      const ty = (viewHeight - bounds.height * scale) / 2 - bounds.y * scale;
      d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
    setRendered(true);
  }, [d3Data, compact]);

  // Initial render
  useEffect(() => {
    setRendered(false);
    const frame = requestAnimationFrame(() => render());
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [render]);

  // Replay: update visibility and auto-zoom to latest visible node
  useEffect(() => {
    const g = gRef.current;
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    const root = layoutRef.current;
    if (!g || !svg || !root) return;

    if (!isReplay) {
      // Show everything
      g.selectAll<SVGGElement, d3.HierarchyPointNode<D3TreeNode>>('.tree-node').attr('opacity', 1);
      g.selectAll<SVGPathElement, d3.HierarchyLink<D3TreeNode>>('.tree-link').attr('opacity', 1);
      return;
    }

    const vc = visibleCount!;

    // Fade nodes by visibility
    g.selectAll<SVGGElement, d3.HierarchyPointNode<D3TreeNode>>('.tree-node').attr(
      'opacity',
      (d) => (d.data.chronoIndex < vc ? 1 : 0.08),
    );

    // Fade links — visible only if both source and target are visible
    g.selectAll<SVGPathElement, d3.HierarchyLink<D3TreeNode>>('.tree-link').attr('opacity', (d) =>
      d.source.data.chronoIndex < vc && d.target.data.chronoIndex < vc ? 1 : 0.08,
    );

    // Auto-zoom to the latest revealed node
    if (zoom && vc > 0) {
      const allNodes = root.descendants();
      let latest: d3.HierarchyPointNode<D3TreeNode> | null = null;
      for (const n of allNodes) {
        if (
          n.data.chronoIndex < vc &&
          (latest === null || n.data.chronoIndex > latest.data.chronoIndex)
        ) {
          latest = n;
        }
      }
      if (latest) {
        const viewWidth = svg.clientWidth || 500;
        const viewHeight = 500;
        const scale = 1.5;
        const tx = viewWidth / 2 - latest.x! * scale;
        const ty = viewHeight / 2 - latest.y! * scale;
        d3.select(svg)
          .transition()
          .duration(300)
          .call(zoom.transform as never, d3.zoomIdentity.translate(tx, ty).scale(scale));
      }
    }
  }, [visibleCount, isReplay]);

  return (
    <div
      ref={containerRef}
      className="rounded-md border border-border bg-surface overflow-hidden relative"
      style={{ height: 500 }}
    >
      {!rendered && (
        <div className="flex items-center justify-center py-16 gap-2">
          <span className="h-4 w-4 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
          <span className="text-2xs font-mono text-subtle">{t.renderingTree}</span>
        </div>
      )}
      <svg ref={svgRef} className={`min-w-full ${rendered ? '' : 'h-0 overflow-hidden'}`} />
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none rounded-md border border-border bg-background shadow-lg px-3 py-2 text-2xs font-mono space-y-1"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 500) - 200),
            top: tooltip.y > 350 ? tooltip.y - 80 : tooltip.y + 12,
          }}
        >
          <div className="font-bold text-foreground">
            {tooltip.data.blocks > 0 ? t.block(tooltip.data.blocks) : t.root}
          </div>
          <div className="text-muted-foreground">{t.request(tooltip.data.reqs)}</div>
          {tooltip.data.branches > 0 && (
            <div className="text-muted-foreground">{t.branch(tooltip.data.branches)}</div>
          )}
          {tooltip.data.branches === 0 && <div className="text-subtle">{t.leafNode}</div>}
        </div>
      )}
    </div>
  );
}

// ── Iterative tree utilities ────────────────────────────────────

function iterativeCountNodes(root: RadixNode): number {
  let total = 0;
  const stack: RadixNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    total++;
    for (const child of node.children.values()) stack.push(child);
  }
  return total;
}

function iterativeMaxDepth(root: RadixNode): number {
  let max = 0;
  const stack: { node: RadixNode; depth: number }[] = [{ node: root, depth: root.segment.length }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > max) max = depth;
    for (const child of node.children.values()) {
      stack.push({ node: child, depth: depth + child.segment.length });
    }
  }
  return max;
}

/** Get the earliest request timestamp in a subtree (iterative) */
function earliestTimestamp(root: RadixNode): number {
  let min = Infinity;
  const stack: RadixNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const req of node.leaves) {
      const t = new Date(req.timestamp).getTime();
      if (t < min) min = t;
    }
    for (const child of node.children.values()) {
      stack.push(child);
    }
  }
  return min;
}

// ── Tree node component ─────────────────────────────────────────

function TreeNode({
  node,
  depth,
  defaultOpen,
  compact,
  forceOpen,
  chronoMap,
  visibleCount,
  t,
}: {
  node: RadixNode;
  depth: number;
  defaultOpen: boolean;
  compact: boolean;
  forceOpen?: boolean;
  chronoMap?: Map<RadixNode, number>;
  visibleCount?: number;
  t: T;
}) {
  const isReplay = visibleCount !== undefined && chronoMap !== undefined;
  const myIndex = isReplay ? (chronoMap.get(node) ?? Infinity) : 0;
  const visible = !isReplay || myIndex < visibleCount;

  const [open, setOpen] = useState(forceOpen ?? defaultOpen);
  const shouldOpen = isReplay ? true : open;
  const hasChildren = node.children.size > 0;
  const sortedChildren = useMemo(
    () => [...node.children.values()].toSorted((a, b) => b.totalLeaves - a.totalLeaves),
    [node.children],
  );

  if (!visible) return null;

  return (
    <div className={depth > 0 ? `ml-4 pl-3 border-l ${depthLineColor(depth)}` : ''}>
      <div className="flex items-start gap-2 py-0.5">
        {!isReplay && (hasChildren || node.leaves.length > 0) ? (
          <button
            type="button"
            onClick={() => {
              setOpen(!open);
              track('agentic_workload_radix_node_toggled', { open: !open, depth });
            }}
            className="mt-0.5 w-4 h-4 flex items-center justify-center text-3xs text-subtle hover:text-foreground transition-colors shrink-0"
          >
            {shouldOpen ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {node.segment.length > 0 && (
          <span
            className={`text-2xs font-mono px-1.5 py-0.5 rounded border ${depthColor(depth)} cursor-pointer`}
            onClick={() => !isReplay && setOpen(!open)}
            title={node.segment.join(' → ')}
          >
            {compact ? (
              <>{t.block(node.segment.length)}</>
            ) : (
              <>
                {node.segment.map(truncHash).join(' → ')}
                {node.segment.length > 1 && (
                  <span className="text-muted-foreground ml-1">
                    ({t.block(node.segment.length)})
                  </span>
                )}
              </>
            )}
          </span>
        )}

        <span className="text-3xs font-mono text-muted-foreground mt-0.5">
          {t.req(node.totalLeaves)}
          {node.children.size > 0 && (
            <span className="text-subtle ml-1.5">{t.branch(node.children.size)}</span>
          )}
        </span>
      </div>

      {shouldOpen && (
        <>
          {node.leaves.length > 0 && (
            <div className="ml-7 mt-1 mb-1 space-y-0.5">
              {node.leaves.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-2 text-3xs font-mono text-muted-foreground"
                >
                  <span className="text-subtle">{'●'}</span>
                  <span>{req.model?.replace('claude-', '') || '—'}</span>
                  <span>
                    {formatTokens(req.inputTokens)} {t.inLabel} / {formatTokens(req.outputTokens)}{' '}
                    {t.outLabel}
                  </span>
                  <span>
                    {req.hashIds?.length || 0} {t.blocksLabel}
                  </span>
                  {req.costUsd !== null && req.costUsd !== undefined && (
                    <span className="text-emerald-400/70">${req.costUsd.toFixed(4)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {sortedChildren.map((child) => (
            <TreeNode
              key={child.segment[0]}
              node={child}
              depth={depth + 1}
              defaultOpen={depth < 1 && child.totalLeaves > 1}
              compact={compact}
              forceOpen={forceOpen}
              chronoMap={chronoMap}
              visibleCount={visibleCount}
              t={t}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────

export default function RadixTreePage() {
  const { session, requests } = useSession();
  const [compact, setCompact] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [listForceOpen, setListForceOpen] = useState<boolean | undefined>(undefined);
  const [listKey, setListKey] = useState(0);
  const [replayMode, setReplayMode] = useState(false);
  const t = STRINGS[useLocale()];

  const hashRequests = useMemo(
    () => requests.filter((r) => r.hashIds && r.hashIds.length > 0),
    [requests],
  );

  const tree = useMemo(() => buildRadixTree(hashRequests), [hashRequests]);

  const chronoMap = useMemo(() => buildChronoMap(tree), [tree]);
  const totalNodes = chronoMap.size;

  const timestamps = useMemo(() => buildChronoTimestamps(tree), [tree]);

  const replay = useSessionReplay(totalNodes, timestamps);
  const lastNodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (replayMode && replay.isPlaying && lastNodeRef.current) {
      lastNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [replayMode, replay.isPlaying, replay.currentIndex]);

  const stats = useMemo(() => {
    const uniqueHashes = new Set(hashRequests.flatMap((r) => r.hashIds!));
    const totalBlocks = hashRequests.reduce((s, r) => s + r.hashIds!.length, 0);
    const treeNodes = iterativeCountNodes(tree);
    const maxDepthVal = iterativeMaxDepth(tree);

    return {
      requests: hashRequests.length,
      uniqueHashes: uniqueHashes.size,
      totalBlocks,
      compressionRatio: uniqueHashes.size > 0 ? (totalBlocks / uniqueHashes.size).toFixed(1) : '—',
      treeNodes,
      maxDepth: maxDepthVal,
    };
  }, [hashRequests, tree]);

  // Full-mode sessions still carry hashIds (kept for SQL-side debugging) but
  // the radix tree UI is meant for anon traces — hide the whole view.
  if (session.privacyMode === 'full') {
    return (
      <div className="text-center py-16 space-y-1">
        <p className="text-sm font-mono text-muted-foreground">{t.hiddenFullMode}</p>
        <p className="text-xs font-mono text-subtle">{t.hiddenFullModeDetail}</p>
      </div>
    );
  }

  if (hashRequests.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm font-mono text-muted-foreground">{t.noHashIds}</p>
        <p className="text-xs font-mono text-subtle mt-1">{t.noHashIdsDetail}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: t.requestsStat, value: stats.requests },
          { label: t.uniqueHashes, value: stats.uniqueHashes },
          { label: t.totalBlocks, value: stats.totalBlocks },
          { label: t.blockReuse, value: `${stats.compressionRatio}×` },
          { label: t.treeNodes, value: stats.treeNodes },
          { label: t.maxDepth, value: stats.maxDepth },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-surface p-3">
            <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground mb-1.5">
              {item.label}
            </div>
            <div className="text-lg font-mono font-bold tracking-tight">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Tree */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.radixTree}
          </span>
          <span className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-border rounded-md p-0.5">
              <button
                type="button"
                onClick={() => {
                  setViewMode('list');
                  track('agentic_workload_radix_view_changed', { view: 'list' });
                }}
                className={`px-2 py-0.5 text-3xs font-mono rounded-sm transition-colors ${
                  viewMode === 'list'
                    ? 'bg-surface-hover text-foreground'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                {t.list}
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('graph');
                  track('agentic_workload_radix_view_changed', { view: 'graph' });
                }}
                className={`px-2 py-0.5 text-3xs font-mono rounded-sm transition-colors ${
                  viewMode === 'graph'
                    ? 'bg-surface-hover text-foreground'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                {t.graph}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setCompact(!compact);
                track('agentic_workload_radix_compact_toggled', { compact: !compact });
              }}
              className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
                compact
                  ? 'bg-cyan-500/8 border-cyan-500/30 text-cyan-400'
                  : 'border-border text-subtle hover:text-foreground'
              }`}
            >
              {t.compact}
            </button>
            {viewMode === 'list' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setListForceOpen(true);
                    setListKey((k) => k + 1);
                    track('agentic_workload_radix_expand_all');
                  }}
                  className="px-2 py-0.5 text-3xs font-mono rounded border border-border text-subtle hover:text-foreground transition-colors"
                >
                  {t.expandAll}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setListForceOpen(false);
                    setListKey((k) => k + 1);
                    track('agentic_workload_radix_collapse_all');
                  }}
                  className="px-2 py-0.5 text-3xs font-mono rounded border border-border text-subtle hover:text-foreground transition-colors"
                >
                  {t.collapseAll}
                </button>
              </div>
            )}
            <span className="text-3xs font-mono text-subtle">
              {t.summary(tree.totalLeaves, tree.children.size)}
            </span>
          </div>
        </div>

        {/* Replay controls (shared across views) */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => {
              if (replayMode) {
                replay.reset();
                setReplayMode(false);
              } else {
                setReplayMode(true);
              }
              track('agentic_workload_radix_replay_toggled', { active: !replayMode });
            }}
            type="button"
            className={`flex items-center gap-1.5 px-2 py-1 text-2xs font-mono border rounded-md transition-colors ${
              replayMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                : 'bg-surface hover:bg-surface-hover border-border text-subtle hover:text-foreground'
            }`}
          >
            {replayMode ? t.exitReplay : t.replay}
          </button>
        </div>
        {replayMode && totalNodes > 0 && (
          <div className="mb-3">
            <ReplayControls
              isPlaying={replay.isPlaying}
              currentIndex={replay.currentIndex}
              total={totalNodes}
              speed={replay.speed}
              onToggle={replay.toggle}
              onSpeedChange={replay.setSpeed}
              onSeek={replay.seekTo}
              onReset={replay.reset}
            />
          </div>
        )}

        {viewMode === 'graph' ? (
          <D3Tree
            tree={tree}
            compact={compact}
            visibleCount={replayMode ? replay.currentIndex : undefined}
            chronoMap={chronoMap}
            t={t}
          />
        ) : (
          <div
            key={replayMode ? `replay-${listKey}` : `list-${listKey}`}
            className="rounded-md border border-border bg-surface p-4 overflow-x-auto"
          >
            {[...tree.children.values()]
              .toSorted((a, b) => b.totalLeaves - a.totalLeaves)
              .map((child) => (
                <TreeNode
                  key={child.segment[0]}
                  node={child}
                  depth={0}
                  defaultOpen={child.totalLeaves > 1}
                  compact={compact}
                  forceOpen={replayMode ? true : listForceOpen}
                  chronoMap={replayMode ? chronoMap : undefined}
                  visibleCount={replayMode ? replay.currentIndex : undefined}
                  t={t}
                />
              ))}
            <div ref={lastNodeRef} />
          </div>
        )}
      </div>
    </div>
  );
}
