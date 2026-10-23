import * as d3 from 'd3';

import {
  formatParamCount,
  sharedExpertCount,
  type ModelArchitecture,
} from '@/lib/catalog/model-architectures';
import type { Locale } from '@/lib/i18n/i18n';

/** Keep words and numeric runs together; count CJK glyphs at double Latin width. */
function wrapText(text: string, capacity: number): string[] {
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (const token of text.match(/[\p{Script=Latin}\d.,]+|./gu) ?? []) {
    const units = [...token].reduce(
      (sum, char) => sum + ((char.codePointAt(0) ?? 0) > 255 ? 2 : 1),
      0,
    );
    if (line && used + units > capacity) {
      lines.push(line.trim());
      line = '';
      used = 0;
    }
    line += token;
    used += units;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/** Causal encoder/decoder flow with a shared global KV branch from encoder states. */
export function renderCausalEncoderDecoder(
  svgEl: SVGSVGElement,
  arch: ModelArchitecture,
  isDark: boolean,
  expandedBlocks: ReadonlySet<string>,
  onBlockClick: (blockId: string) => void,
  locale: Locale,
) {
  if (!arch.encoderDecoder) return;
  const zh = locale === 'zh';
  const { encoderLayers, decoderLayers, encoderSlidingOnlyLayers, decoderAttention } =
    arch.encoderDecoder;
  const attentionDetail = {
    'joint-local-swa-and-shared-global-kv': {
      en: 'Over local SWA + shared global KV',
      zh: '共同关注局部 SWA 与共享全局 KV',
    },
  }[decoderAttention][locale];
  const width = Math.min(svgEl.clientWidth || svgEl.parentElement?.clientWidth || 600, 640);
  const x = 28;
  const boxWidth = width - x * 2;
  const cx = width / 2;
  const fg = isDark ? '#eaebec' : '#131416';
  const muted = isDark ? '#cbd5e1' : '#475569';
  const lineColor = isDark ? '#94a3b8' : '#64748b';
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  // Scoped marker IDs allow multiple diagrams on the same page.
  const markerId = `ced-arrow-${Math.random().toString(36).slice(2)}`;
  svg
    .append('defs')
    .append('marker')
    .attr('id', markerId)
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 8)
    .attr('markerWidth', 7)
    .attr('markerHeight', 7)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', lineColor);
  const edges = svg.append('g').attr('fill', 'none');
  const nodes = svg.append('g');

  function arrow(path: string, edge?: string) {
    edges
      .append('path')
      .attr('d', path)
      .attr('stroke', lineColor)
      .attr('stroke-width', 1.5)
      .attr('marker-end', `url(#${markerId})`)
      .attr('data-edge', edge ?? null);
  }

  function box(
    top: number,
    title: string,
    detail: string,
    kind: 'embedding' | 'attention' | 'moe' | 'output' | 'cache',
    left = x,
    nodeWidth = boxWidth,
    testId?: string,
  ) {
    const colors = {
      embedding: [isDark ? '#1e3a5f' : '#dbeafe', '#3b82f6'],
      attention: [isDark ? '#422006' : '#fef3c7', '#d97706'],
      moe: [isDark ? '#3b0764' : '#f3e8ff', '#9333ea'],
      output: [isDark ? '#1e1b4b' : '#e0e7ff', '#6366f1'],
      cache: [isDark ? '#064e3b' : '#d1fae5', '#059669'],
    };
    const capacity = Math.max(12, Math.floor((nodeWidth - 24) / 7));
    const titleLines = wrapText(title, capacity);
    const detailLines = detail ? wrapText(detail, capacity) : [];
    const height = 24 + (titleLines.length + detailLines.length) * 18;
    const group = nodes
      .append('g')
      .attr('data-testid', testId ?? null)
      .attr('aria-label', `${title}${detail ? `: ${detail}` : ''}`);
    group
      .append('rect')
      .attr('x', left)
      .attr('y', top)
      .attr('width', nodeWidth)
      .attr('height', height)
      .attr('rx', 8)
      .attr('fill', colors[kind][0])
      .attr('stroke', colors[kind][1]);
    [...titleLines, ...detailLines].forEach((text, index) => {
      group
        .append('text')
        .attr('x', left + nodeWidth / 2)
        .attr('y', top + 24 + index * 18)
        .attr('text-anchor', 'middle')
        .attr('class', index < titleLines.length ? 'text-xs font-semibold' : 'text-xs')
        .attr('fill', index < titleLines.length ? fg : muted)
        .text(text);
    });
    return { top, bottom: top + height, center: top + height / 2 };
  }

  const shared = sharedExpertCount(arch);
  const routed = (arch.numExperts ?? 0) - shared;
  const moeDetail = zh
    ? `${routed} 个路由 expert 中选 top-${arch.activeExperts}，另有 ${shared} 个共享 expert`
    : `Top-${arch.activeExperts} of ${routed} routed + ${shared} shared experts`;
  const streams = zh
    ? `mHC：${arch.hyperConnections} 路残差流`
    : `mHC: ${arch.hyperConnections} residual streams`;
  const window = `${arch.slidingWindow}-token SWA`;

  function stack(top: number, encoder: boolean) {
    const id = encoder ? 'cedEncoder' : 'cedDecoder';
    const expanded = expandedBlocks.has(id);
    const count = encoder ? encoderLayers : decoderLayers;
    const label = encoder
      ? zh
        ? `${count} 层因果编码器`
        : `${count}-layer causal encoder`
      : zh
        ? `${count} 层解码器`
        : `${count}-layer decoder`;
    const header = box(top, `${expanded ? '−' : '+'} ${label}`, streams, 'attention');
    const toggle = nodes
      .append('rect')
      .attr('x', x)
      .attr('y', top)
      .attr('width', boxWidth)
      .attr('height', header.bottom - top)
      .attr('rx', 8)
      .attr('fill', 'transparent')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', label)
      .attr('aria-expanded', String(expanded))
      .attr('data-testid', `${expanded ? 'collapse' : 'expand'}-${id}`)
      .style('cursor', 'pointer')
      .on('click', () => onBlockClick(id));
    toggle.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onBlockClick(id);
      }
    });
    let bottom = header.bottom;
    let attentionCenter = header.center;
    if (expanded) {
      const query = box(
        bottom + 24,
        encoder
          ? zh
            ? '因果注意力'
            : 'Causal attention'
          : zh
            ? 'Query 与逐层局部 KV'
            : 'Queries + layer-local KV',
        encoder
          ? zh
            ? `${arch.attentionLabel} + ${window}；前 ${encoderSlidingOnlyLayers} 层仅用 SWA`
            : `${arch.attentionLabel} + ${window}; first ${encoderSlidingOnlyLayers} layers SWA only`
          : window,
        'attention',
      );
      arrow(`M${cx},${bottom}V${query.top}`);
      bottom = query.bottom;
      if (!encoder) {
        const attention = box(
          bottom + 24,
          zh ? '单次稀疏注意力' : 'One sparse attention',
          attentionDetail,
          'attention',
          x,
          boxWidth,
          'ced-decoder-attention',
        );
        arrow(`M${cx},${bottom}V${attention.top}`);
        bottom = attention.bottom;
        attentionCenter = attention.center;
      }
      const moe = box(bottom + 24, 'MoE FFN', moeDetail, 'moe');
      arrow(`M${cx},${bottom}V${moe.top}`);
      bottom = moe.bottom;
    }
    nodes
      .insert('rect', ':first-child')
      .attr('x', x - 8)
      .attr('y', top - 8)
      .attr('width', boxWidth + 16)
      .attr('height', bottom - top + 16)
      .attr('rx', 12)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-dasharray', '6,3');
    return { top, bottom, attentionCenter };
  }

  const header = box(
    12,
    zh
      ? `${formatParamCount(arch.totalParams)} 主干参数`
      : `${formatParamCount(arch.totalParams)} backbone`,
    zh
      ? `另有 ${formatParamCount(arch.conditionalMemoryParams ?? 0)} ${arch.conditionalMemoryName} 条件记忆`
      : `Separate ${formatParamCount(arch.conditionalMemoryParams ?? 0)} ${arch.conditionalMemoryName} memory`,
    'embedding',
  );
  const embedding = box(
    header.bottom + 16,
    zh ? 'Token 嵌入' : 'Token embedding',
    zh ? '文本与投影后的视觉表示' : 'Text + projected vision',
    'embedding',
  );
  const encoder = stack(embedding.bottom + 28, true);
  arrow(`M${cx},${embedding.bottom}V${encoder.top}`);
  const states = box(
    encoder.bottom + 28,
    zh ? '编码器最终隐藏状态' : 'Final encoder hidden states',
    '',
    'embedding',
  );
  arrow(`M${cx},${encoder.bottom}V${states.top}`);
  // Indented KV branch; the main hidden-state stream bypasses it on the left.
  const cache = box(
    states.bottom + 28,
    zh ? '全局 KV 投影与缓存' : 'Global KV projection / cache',
    zh ? '由编码器最终隐藏状态生成，供解码器共享' : 'From final encoder states; shared by decoder',
    'cache',
    x + 16,
    boxWidth - 16,
    'ced-global-kv',
  );
  arrow(`M${cx},${states.bottom}V${cache.top}`, 'encoder-to-global-kv');
  const decoder = stack(cache.bottom + 36, false);
  arrow(`M${x},${states.center}H10V${decoder.top - 14}H${cx}V${decoder.top}`, 'encoder-to-decoder');
  arrow(
    `M${width - x},${cache.center}H${width - 10}V${decoder.attentionCenter}H${width - x}`,
    'global-kv-to-decoder-attention',
  );
  const output = box(
    decoder.bottom + 28,
    zh ? '最终归一化与 LM Head' : 'Final norm + LM Head',
    zh ? '文本输出' : 'Text output',
    'output',
  );
  arrow(`M${cx},${decoder.bottom}V${output.top}`);
  const caption = box(
    output.bottom + 20,
    zh ? '架构激活参数量' : 'Architectural active parameters',
    `Prefill ${formatParamCount(arch.activeParamsPrefill ?? arch.activeParams)} · decode ${formatParamCount(arch.activeParams)}`,
    'embedding',
  );
  svg
    .attr('viewBox', `0 0 ${width} ${caption.bottom + 16}`)
    .attr('height', caption.bottom + 16)
    .attr('role', 'group')
    .attr('aria-label', zh ? '因果编码器与解码器架构' : 'Causal encoder-decoder architecture');
}
