import * as d3 from 'd3';
import type { Locale } from '@/lib/i18n/i18n';

import {
  type ArchSubBlock,
  type SubBlockFlow,
  type ModelArchitecture,
  formatContextWindow,
  formatParamCount,
  expertRouterSummary,
  architectureAttentionLabel,
  getAttentionSubBlocks,
  getFFNSubBlocks,
  denseLayerAttentionLabel,
  ffnVariantLabel,
  getHybridAttentionSubBlocks,
  sharedExpertCount,
} from '@/lib/catalog/model-architectures';

const ARCHITECTURE_TEXT_ZH: Record<string, string> = {
  'Token Embedding': 'Token 嵌入',
  'Dense Transformer Block': '稠密 Transformer 块',
  'MoE Transformer Block': 'MoE Transformer 块',
  'Transformer Block': 'Transformer 块',
  'Output Head (LM Head)': '输出头（LM Head）',
  Type: '类型',
  Layers: '层数',
  Attention: '注意力',
  Context: '上下文',
  Experts: '专家',
  Dense: '稠密',
  'Dense Feed-Forward': '稠密前馈网络',
  'Dense FFN': '稠密 FFN',
  'Feed-Forward Network': '前馈网络',
  'MoE Router': 'MoE 路由器',
  'Hash Router': 'Hash 路由器',
  'Hash-Routed MoE': 'Hash 路由 MoE',
  'Multi-Head Attention': '多头注意力',
  'Grouped Query Attention': '分组查询注意力',
  'Multi-head Latent Attention': '多头潜在注意力',
  'Linear Attention': '线性注意力',
  'Hybrid Attention': '混合注意力',
  'Alternating Sink/Full GQA': '交替 Sink/Full GQA',
  'Heavily Compressed Attention': '高压缩注意力',
  'Compressed Sparse Attention': '压缩稀疏注意力',
  'Sliding Attention + Sink': '滑动窗口注意力 + Sink',
  'Causal Grouped Query Attention': '因果分组查询注意力',
  'Causal GQA + Sink': '因果 GQA + Sink',
  'MiniMax Sparse Attention (MSA)': 'MiniMax 稀疏注意力（MSA）',
  Clamp: '截断',
  'Scaled SiLU': '带缩放系数的 SiLU',
  'gated MLA at layers 4, 8, …, 92, 93': '第 4、8、…、92、93 层使用 gated MLA',
  'Gated MLA': '门控 MLA',
  'Gated Attention': '门控注意力',
  'Sliding GQA': '滑动窗口 GQA',
  'Full GQA (NoPE)': '全局 GQA（NoPE）',
  'Qwen Sparse Attention (QSA)': 'Qwen 稀疏注意力（QSA）',
  'Q Projection': 'Q 投影',
  'K Projection': 'K 投影',
  'V Projection': 'V 投影',
  'Output Projection': '输出投影',
  'Gate Projection': '门控投影',
  'Up Projection': '升维投影',
  'Down Projection': '降维投影',
  'Grouped Attention': '分组注意力',
  'Rotary Pos Emb': '旋转位置编码',
  'Query heads': 'Query head',
  'Shared KV heads': '共享 KV head',
  'Value heads': 'Value head',
  'Shared KV groups': '共享 KV 组',
  'Applied to gate output': '应用于门控输出',
  'Sliding Window': '滑动窗口',
  'Token Compression': 'Token 压缩',
  'Lightning Indexer': 'Lightning Indexer',
  'Heavy Compression': '高压缩',
  Local: '局部',
  Compressed: '压缩',
  'Shared-KV MQA + Sink': '共享 KV MQA + Sink',
  'alternating every layer': '逐层交替',
};

export function localizeArchitectureDiagramText(value: string, locale: Locale): string {
  if (locale === 'en') return value;
  let localized = value;
  for (const [source, target] of Object.entries(ARCHITECTURE_TEXT_ZH).toSorted(
    ([a], [b]) => b.length - a.length,
  )) {
    localized = localized.replaceAll(source, target);
  }
  return localized
    .replaceAll(/(?<count>\d+) KV heads/gu, '$<count> 个 KV head')
    .replaceAll(/(?<count>\d+) heads/gu, '$<count> 个 attention head')
    .replace(/\(shared\)$/u, '（共享）')
    .replace(/^(?<count>\d+)D \+ (?<moe>\d+)M$/u, '$<count> 个稠密层 + $<moe> 个 MoE 层')
    .replaceAll(/×(?<count>\d+) first layers/gu, '前 $<count> 层')
    .replaceAll('dense layers', '个稠密层')
    .replaceAll('MoE layers', '个 MoE 层')
    .replaceAll('layers', '层')
    .replaceAll('total', '总参数')
    .replaceAll('active', '激活参数')
    .replaceAll('context', '上下文')
    .replaceAll('vocab =', '词表 =')
    .replaceAll('intermediate =', '中间维度 =')
    .replaceAll('Feed-Forward', '前馈网络')
    .replaceAll('Expert FFN', '专家 FFN')
    .replaceAll('Details', '详情')
    .replaceAll('Activation', '激活')
    .replaceAll('activation', '激活')
    .replaceAll(' of ', '/')
    .replaceAll(' routed', ' 个路由 expert')
    .replaceAll(' shared', ' 个共享 expert')
    .replaceAll(/last (?<count>\d+) tokens/gu, '最近 $<count> 个 token')
    .replaceAll('local KV', '局部 KV')
    .replaceAll(
      /(?<count>\d+) entry \/ (?<tokens>\d+) tokens/gu,
      '每 $<tokens> 个 token 压缩为 $<count> 项',
    )
    .replaceAll('sparse top-', '稀疏 top-');
}
export const BLOCK_COLORS = {
  embedding: { light: '#dbeafe', dark: '#1e3a5f', stroke: '#3b82f6' },
  attention: { light: '#fef3c7', dark: '#422006', stroke: '#d97706' },
  ffn: { light: '#d1fae5', dark: '#064e3b', stroke: '#059669' },
  output: { light: '#e0e7ff', dark: '#1e1b4b', stroke: '#6366f1' },
  norm: { light: '#f1f5f9', dark: '#1e293b', stroke: '#94a3b8' },
  specs: { light: '#f8fafc', dark: '#1a1c1e', stroke: '#cbd5e1' },
  router: { light: '#fce7f3', dark: '#500724', stroke: '#db2777' },
  expert: { light: '#f3e8ff', dark: '#3b0764', stroke: '#9333ea' },
  expertActive: { light: '#e9d5ff', dark: '#581c87', stroke: '#7c3aed' },
};

const SUB_BLOCK_COLORS = {
  projection: { light: '#e0f2fe', dark: '#0c4a6e', stroke: '#0284c7' },
  activation: { light: '#dcfce7', dark: '#14532d', stroke: '#16a34a' },
  operation: { light: '#f3f4f6', dark: '#1f2937', stroke: '#6b7280' },
  attention: { light: '#fef9c3', dark: '#422006', stroke: '#ca8a04' },
};

function getColor(type: keyof typeof BLOCK_COLORS, isDark: boolean) {
  const c = BLOCK_COLORS[type];
  return { fill: isDark ? c.dark : c.light, stroke: c.stroke };
}

function getSubBlockColor(type: ArchSubBlock['type'], isDark: boolean) {
  const c = SUB_BLOCK_COLORS[type];
  return { fill: isDark ? c.dark : c.light, stroke: c.stroke };
}

interface SubBlockLayoutMetrics {
  blockHeight: number;
  arrowHeight: number;
  paddingY: number;
}

export function getFlowHeight(
  flow: SubBlockFlow,
  hasLabel: boolean,
  metrics: SubBlockLayoutMetrics,
): number {
  const { blockHeight, arrowHeight, paddingY } = metrics;
  if (flow.layout === 'sequential') {
    return (
      flow.blocks.length * blockHeight +
      Math.max(0, flow.blocks.length - 1) * arrowHeight +
      paddingY * 2 +
      (hasLabel ? 24 : 0)
    );
  }
  if (flow.layout === 'threeWay') {
    const maxRows = Math.max(flow.leftPath.length, flow.middlePath.length, flow.rightPath.length);
    const pathLabelsHeight = flow.leftLabel || flow.middleLabel || flow.rightLabel ? 16 : 0;
    const hasIntermediate = flow.intermediateMergeBlocks.length > 0;
    return (
      paddingY * 2 +
      (hasLabel ? 24 : 0) +
      pathLabelsHeight +
      arrowHeight +
      maxRows * blockHeight +
      Math.max(0, maxRows - 1) * arrowHeight +
      (arrowHeight + 4) +
      (hasIntermediate
        ? flow.intermediateMergeBlocks.length * blockHeight +
          Math.max(0, flow.intermediateMergeBlocks.length - 1) * arrowHeight +
          (arrowHeight + 4)
        : 0) +
      flow.finalMergeBlocks.length * blockHeight +
      Math.max(0, flow.finalMergeBlocks.length - 1) * arrowHeight
    );
  }
  const maxRows = Math.max(flow.leftPath.length, flow.rightPath.length);
  const pathLabelsHeight = flow.leftLabel || flow.rightLabel ? 16 : 0;
  return (
    paddingY * 2 +
    (hasLabel ? 24 : 0) +
    pathLabelsHeight +
    arrowHeight +
    maxRows * blockHeight +
    Math.max(0, maxRows - 1) * arrowHeight +
    (arrowHeight + 4) +
    flow.mergeBlocks.length * blockHeight +
    Math.max(0, flow.mergeBlocks.length - 1) * arrowHeight
  );
}

export function deriveArchitectureVariant(
  arch: ModelArchitecture,
  expandedBlocks: ReadonlySet<string>,
  metrics: SubBlockLayoutMetrics,
) {
  const isMoE = arch.architectureType === 'moe';
  const sharedExperts = sharedExpertCount(arch);
  const ffnVariant = ffnVariantLabel(arch);
  const hasDenseLayers = isMoE && (arch.denseFFNLayers ?? 0) > 0;
  const denseLayerCount = arch.denseFFNLayers ?? 0;
  const moeLayerCount = (arch.numLayers ?? 0) - denseLayerCount;
  const isAttnExpandable =
    arch.attentionExpandable !== false &&
    arch.attentionType !== 'MLA' &&
    arch.attentionType !== 'AlternatingSinkGQA';
  const hasAlternatingLayers = Boolean(arch.alternatingLayers?.length);
  const alternatingSpecs = arch.alternatingLayers ?? [];
  const attnFlow = isAttnExpandable ? getAttentionSubBlocks(arch) : null;
  const ffnFlow = getFFNSubBlocks(arch);
  const denseFFNFlow = hasDenseLayers ? getFFNSubBlocks(arch, { useDenseFFNDim: true }) : null;
  const attnExpanded = isAttnExpandable && expandedBlocks.has('attention');
  const ffnExpanded = expandedBlocks.has(isMoE ? 'experts' : 'ffn');
  const txExpanded = expandedBlocks.has('transformer');
  const denseTxExpanded = expandedBlocks.has('denseTransformer');
  const denseAttnExpanded = isAttnExpandable && expandedBlocks.has('denseAttention');
  const denseFFNExpanded = expandedBlocks.has('denseFFN');
  const hasHashBlock = isMoE && (arch.hashRoutedLayers ?? 0) > 0;
  const hashBlockExpanded = hasHashBlock && expandedBlocks.has('hashBlock');
  const hashExpertsExpanded = hasHashBlock && expandedBlocks.has('hashExperts');
  const altBlockExpanded = [
    hasAlternatingLayers && expandedBlocks.has('altBlock0'),
    hasAlternatingLayers && expandedBlocks.has('altBlock1'),
  ];
  const altExpertsExpanded = [
    hasAlternatingLayers && expandedBlocks.has(isMoE ? 'altExperts0' : 'altFFN0'),
    hasAlternatingLayers && expandedBlocks.has(isMoE ? 'altExperts1' : 'altFFN1'),
  ];
  const altAttnExpandable =
    hasAlternatingLayers &&
    arch.attentionType === 'Hybrid' &&
    arch.alternatingAttentionExpandable !== false;
  const altAttnExpanded = [
    altAttnExpandable && expandedBlocks.has('altAttention0'),
    altAttnExpandable && expandedBlocks.has('altAttention1'),
  ];
  const altAttnFlow: (SubBlockFlow | null)[] = altAttnExpandable
    ? [0, 1].map((index) =>
        alternatingSpecs[index] ? getHybridAttentionSubBlocks(arch, alternatingSpecs[index]) : null,
      )
    : [null, null];
  const attnExpandedH = attnExpanded && attnFlow ? getFlowHeight(attnFlow, false, metrics) : 0;
  const ffnExpandedH = ffnExpanded ? getFlowHeight(ffnFlow, true, metrics) : 0;
  const denseAttnExpandedH =
    denseAttnExpanded && attnFlow ? getFlowHeight(attnFlow, false, metrics) : 0;
  const denseFFNExpandedH =
    denseFFNExpanded && denseFFNFlow ? getFlowHeight(denseFFNFlow, true, metrics) : 0;
  const altExpertsExpandedH = altExpertsExpanded.map((expanded) =>
    expanded ? getFlowHeight(ffnFlow, true, metrics) : 0,
  );
  const altAttnExpandedH = altAttnExpanded.map((expanded, index) => {
    const flow = altAttnFlow[index];
    return expanded && flow ? getFlowHeight(flow, false, metrics) : 0;
  });
  const hashExpertsExpandedH = hashExpertsExpanded ? getFlowHeight(ffnFlow, true, metrics) : 0;

  return {
    isMoE,
    sharedExperts,
    ffnVariant,
    hasDenseLayers,
    denseLayerCount,
    moeLayerCount,
    isAttnExpandable,
    hasAlternatingLayers,
    alternatingSpecs,
    attnFlow,
    ffnFlow,
    denseFFNFlow,
    attnExpanded,
    ffnExpanded,
    txExpanded,
    denseTxExpanded,
    denseAttnExpanded,
    denseFFNExpanded,
    hasHashBlock,
    hashBlockExpanded,
    hashExpertsExpanded,
    altBlockExpanded,
    altExpertsExpanded,
    altAttnExpandable,
    altAttnExpanded,
    altAttnFlow,
    attnExpandedH,
    ffnExpandedH,
    denseAttnExpandedH,
    denseFFNExpandedH,
    altExpertsExpandedH,
    altAttnExpandedH,
    hashExpertsExpandedH,
  };
}

export function renderDiagram(
  svgEl: SVGSVGElement,
  arch: ModelArchitecture,
  isDark: boolean,
  expandedBlocks: Set<string>,
  onBlockClick: (blockId: string) => void,
  locale: Locale = 'en',
) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const containerWidth = svgEl.clientWidth || svgEl.parentElement?.clientWidth || 600;
  const width = Math.min(containerWidth, 640);

  const fg = isDark ? '#eaebec' : '#131416';
  const mutedFg = isDark ? '#9ca3af' : '#6b7280';
  const borderColor = isDark ? '#374151' : '#d1d5db';
  const bgSubtle = isDark ? '#1f2937' : '#f9fafb';
  const expandedBg = isDark ? '#111827' : '#f1f5f9';
  const localizedText = (value: string): string => localizeArchitectureDiagramText(value, locale);

  const pad = { top: 20, right: 16, bottom: 16, left: 16 };
  const bw = width - pad.left - pad.right;
  const innerW = bw - 32;
  const innerX = pad.left + 16;
  const cx = width / 2;
  const blockH = 52;
  const smallH = 32;
  const arrowH = 20;
  const circleR = 9;
  const mergeGap = 36;
  const residLeftX = pad.left + 6;
  const collapsedTxH = 64;

  const expertSize = 36;
  const expertGap = 6;
  const expertGridH = 70;

  const subBlockH = 34;
  const subArrowH = 12;
  const subPadY = 10;
  const drillGap = 8;

  const {
    isMoE,
    sharedExperts,
    ffnVariant,
    hasDenseLayers,
    denseLayerCount,
    moeLayerCount,
    isAttnExpandable,
    hasAlternatingLayers,
    alternatingSpecs,
    attnFlow,
    ffnFlow,
    denseFFNFlow,
    attnExpanded,
    ffnExpanded,
    txExpanded,
    denseTxExpanded,
    denseAttnExpanded,
    denseFFNExpanded,
    hasHashBlock,
    hashBlockExpanded,
    hashExpertsExpanded,
    altBlockExpanded,
    altExpertsExpanded,
    altAttnExpandable,
    altAttnExpanded,
    altAttnFlow,
    attnExpandedH,
    ffnExpandedH,
    denseAttnExpandedH,
    denseFFNExpandedH,
    altExpertsExpandedH,
    altAttnExpandedH,
    hashExpertsExpandedH,
  } = deriveArchitectureVariant(arch, expandedBlocks, {
    blockHeight: subBlockH,
    arrowHeight: subArrowH,
    paddingY: subPadY,
  });

  let y = pad.top;

  const titleY = y;
  y += 44;

  const embedY = y;
  y += blockH + arrowH;

  let denseTxStart = 0;
  let denseNorm1Y = 0;
  let denseAttnY = 0;
  let denseAttnExpandedStartY = 0;
  let denseMerge1Y = 0;
  let denseNorm2Y = 0;
  let denseFFNBlockY = 0;
  let denseFFNExpandedStartY = 0;
  let denseMerge2Y = 0;
  let denseTxEnd = 0;

  if (hasDenseLayers) {
    denseTxStart = y;
    if (denseTxExpanded) {
      y += 14;

      denseNorm1Y = y;
      y += smallH + arrowH;

      denseAttnY = y;
      y += blockH;

      if (denseAttnExpanded) y += drillGap;
      denseAttnExpandedStartY = y;
      if (denseAttnExpanded) {
        y += denseAttnExpandedH;
      }

      y += 4;
      denseMerge1Y = y + mergeGap / 2;
      y += mergeGap;

      y += arrowH;
      denseNorm2Y = y;
      y += smallH + arrowH;

      denseFFNBlockY = y;
      y += blockH;

      denseFFNExpandedStartY = y;
      if (denseFFNExpanded) {
        y += denseFFNExpandedH;
      }

      denseMerge2Y = y + mergeGap / 2;
      y += mergeGap;

      y += 14;
    } else {
      y += collapsedTxH;
    }
    denseTxEnd = y;
    y += arrowH;
  }

  let hashTxStart = 0;
  let hashNorm1Y = 0;
  let hashAttnY = 0;
  let hashMerge1Y = 0;
  let hashNorm2Y = 0;
  let hashExpertY = 0;
  let hashFFNExpandedStartY = 0;
  let hashMerge2Y = 0;
  let hashTxEnd = 0;

  if (hasHashBlock) {
    hashTxStart = y;
    if (hashBlockExpanded) {
      y += 14;

      hashNorm1Y = y;
      y += smallH + arrowH;

      hashAttnY = y;
      y += blockH;

      y += 4;
      hashMerge1Y = y + mergeGap / 2;
      y += mergeGap;

      y += arrowH;
      hashNorm2Y = y;
      y += smallH + arrowH;

      y += blockH + arrowH;
      hashExpertY = y;
      y += expertGridH;

      hashFFNExpandedStartY = y;
      if (hashExpertsExpanded) {
        y += hashExpertsExpandedH;
      }

      hashMerge2Y = y + mergeGap / 2;
      y += mergeGap;

      y += 14;
    } else {
      y += collapsedTxH;
    }
    hashTxEnd = y;
    y += arrowH;
  }

  const altBlockStart = [0, 0];
  const altBlockEnd = [0, 0];
  const altNorm1Y = [0, 0];
  const altAttnY = [0, 0];
  const altAttnExpandedStartY = [0, 0];
  const altMerge1Y = [0, 0];
  const altNorm2Y = [0, 0];
  const altRouterY = [0, 0];
  const altExpertY = [0, 0];
  const altFFNExpandedStartY = [0, 0];
  const altMerge2Y = [0, 0];
  let altIndicatorY = 0;

  const txStart = hasAlternatingLayers ? 0 : y;
  let attnY = 0;
  let attnExpandedStartY = 0;
  let merge1Y = 0;
  let norm1Y = 0;
  const _routerY = 0;
  let expertY = 0;
  let ffnY = 0;
  let ffnExpandedStartY = 0;
  let merge2Y = 0;
  let norm2Y = 0;
  let txEnd = 0; // oxlint-disable-line no-useless-assignment -- overwritten when txExpanded

  if (hasAlternatingLayers) {
    for (let bi = 0; bi < 2; bi++) {
      altBlockStart[bi] = y;
      const isExp = altBlockExpanded[bi];
      const isExpExperts = altExpertsExpanded[bi];

      if (isExp) {
        y += 14;

        altNorm1Y[bi] = y;
        y += smallH + arrowH;

        altAttnY[bi] = y;
        y += blockH;

        if (altAttnExpanded[bi]) y += drillGap;
        altAttnExpandedStartY[bi] = y;
        if (altAttnExpanded[bi]) {
          y += altAttnExpandedH[bi];
        }

        y += 4;
        altMerge1Y[bi] = y + mergeGap / 2;
        y += mergeGap;

        y += arrowH;
        altNorm2Y[bi] = y;
        y += smallH + arrowH;

        altRouterY[bi] = y;
        if (isMoE) y += blockH + arrowH;

        altExpertY[bi] = y;
        y += isMoE ? expertGridH : blockH;

        altFFNExpandedStartY[bi] = y;
        if (isExpExperts) {
          y += altExpertsExpandedH[bi];
        }

        altMerge2Y[bi] = y + mergeGap / 2;
        y += mergeGap;

        y += 14;
      } else {
        y += collapsedTxH;
      }
      altBlockEnd[bi] = y;

      if (bi === 0) {
        y += 6;
        altIndicatorY = y + 10;
        y += 24;
      }
    }
  } else if (txExpanded) {
    y += 14;

    norm1Y = y;
    y += smallH + arrowH;

    attnY = y;
    y += blockH;

    if (attnExpanded) y += drillGap;
    attnExpandedStartY = y;
    if (attnExpanded) {
      y += attnExpandedH;
    }

    y += 4;
    merge1Y = y + mergeGap / 2;
    y += mergeGap;

    y += arrowH;
    norm2Y = y;
    y += smallH + arrowH;

    if (isMoE) {
      y += blockH + arrowH;

      expertY = y;
      y += expertGridH;
    } else {
      ffnY = y;
      y += blockH;
    }

    ffnExpandedStartY = y;
    if (ffnExpanded) {
      y += ffnExpandedH;
    }

    merge2Y = y + mergeGap / 2;
    y += mergeGap;

    y += 14;
  } else {
    y += collapsedTxH;
  }
  txEnd = y;
  y += arrowH;

  const finalNormY = y;
  y += smallH + arrowH;

  const outputY = y;
  y += blockH + 16;

  const specsY = y;
  const specsH = 56;
  y += specsH;

  const totalH = y + pad.bottom;

  svg.attr('width', width).attr('height', totalH).attr('viewBox', `0 0 ${width} ${totalH}`);

  const defs = svg.append('defs');
  defs
    .append('marker')
    .attr('id', 'arch-arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 5)
    .attr('refY', 5)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', mutedFg);

  defs
    .append('marker')
    .attr('id', 'arch-arrow-sub')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 5)
    .attr('refY', 5)
    .attr('markerWidth', 4)
    .attr('markerHeight', 4)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', mutedFg);

  const bgG = svg.append('g');
  const g = svg.append('g');

  function drawArrow(fromY: number, toY: number) {
    g.append('line')
      .attr('x1', cx)
      .attr('y1', fromY)
      .attr('x2', cx)
      .attr('y2', toY - 2)
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arch-arrow)');
  }

  function drawCircleGlyph(gx: number, gy: number, color: string, symbol: string) {
    const arm = 5;
    const seg = (x1: number, y1: number, x2: number, y2: number) =>
      g
        .append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .style('pointer-events', 'none');
    if (symbol === '×') {
      seg(gx - arm, gy - arm, gx + arm, gy + arm);
      seg(gx - arm, gy + arm, gx + arm, gy - arm);
    } else {
      seg(gx - arm, gy, gx + arm, gy);
      if (symbol !== '−') seg(gx, gy - arm, gx, gy + arm);
    }
  }

  const hcStreams = arch.hyperConnections ?? 0;
  const isHyperConn = hcStreams > 1;

  function drawResidualBypass(branchY: number, mergeY: number) {
    const tapY = branchY - arrowH / 2;
    const nodeHalfW = isHyperConn || arch.residualType ? 25 : circleR;
    bgG
      .append('path')
      .attr(
        'd',
        `M ${cx} ${tapY} L ${residLeftX} ${tapY} L ${residLeftX} ${mergeY} L ${cx - nodeHalfW} ${mergeY}`,
      )
      .attr('fill', 'none')
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6);
    if (isHyperConn || arch.residualType) {
      g.append('rect')
        .attr('x', cx - nodeHalfW)
        .attr('y', mergeY - circleR)
        .attr('width', nodeHalfW * 2)
        .attr('height', circleR * 2)
        .attr('rx', circleR)
        .attr('fill', bgSubtle)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1.5);
      g.append('text')
        .attr('x', cx)
        .attr('y', mergeY)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', fg)
        .attr('font-size', '8.5px')
        .attr('font-weight', 700)
        .attr('font-family', 'inherit')
        .text(arch.residualType ?? `mHC ×${hcStreams}`);
    } else {
      g.append('circle')
        .attr('cx', cx)
        .attr('cy', mergeY)
        .attr('r', circleR)
        .attr('fill', bgSubtle)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1.5);
      drawCircleGlyph(cx, mergeY, fg, '+');
    }
  }

  function drawBlock(
    x: number,
    by: number,
    w: number,
    h: number,
    type: keyof typeof BLOCK_COLORS,
    mainText: string,
    subText?: string,
  ) {
    const c = getColor(type, isDark);
    g.append('rect')
      .attr('x', x)
      .attr('y', by)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', 8)
      .attr('fill', c.fill)
      .attr('stroke', c.stroke)
      .attr('stroke-width', 1.5);

    g.append('text')
      .attr('x', x + w / 2)
      .attr('y', by + h / 2 - (subText ? 7 : 0))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', fg)
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .text(localizedText(mainText));

    if (subText) {
      g.append('text')
        .attr('x', x + w / 2)
        .attr('y', by + h / 2 + 10)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '11px')
        .attr('font-family', 'inherit')
        .text(localizedText(subText));
    }
  }

  function drawExpandableBlock(
    x: number,
    by: number,
    w: number,
    h: number,
    type: keyof typeof BLOCK_COLORS,
    mainText: string,
    subText: string | undefined,
    isBlockExpanded: boolean,
    blockId: string,
  ) {
    const c = getColor(type, isDark);
    g.append('rect')
      .attr('x', x)
      .attr('y', by)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', 8)
      .attr('fill', c.fill)
      .attr('stroke', c.stroke)
      .attr('stroke-width', isBlockExpanded ? 2.5 : 1.5);

    g.append('text')
      .attr('x', x + w / 2 - 8)
      .attr('y', by + h / 2 - (subText ? 7 : 0))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', fg)
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .style('pointer-events', 'none')
      .text(localizedText(mainText));

    if (subText) {
      g.append('text')
        .attr('x', x + w / 2 - 8)
        .attr('y', by + h / 2 + 10)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '11px')
        .attr('font-family', 'inherit')
        .style('pointer-events', 'none')
        .text(localizedText(subText));
    }

    const iconX = x + w - 22;
    const iconY = by + h / 2;

    g.append('circle')
      .attr('cx', iconX)
      .attr('cy', iconY)
      .attr('r', 10)
      .attr('fill', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
      .attr('stroke', c.stroke)
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');

    drawCircleGlyph(iconX, iconY, c.stroke, isBlockExpanded ? '\u2212' : '+');

    g.append('rect')
      .attr('x', x)
      .attr('y', by)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', 8)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .attr('data-testid', `expand-${blockId}`)
      .on('click', () => {
        onBlockClick(blockId);
      });
  }

  const DEFAULT_SUB_BLOCK_FONT_SIZE = { name: '11px', detail: '9px' };

  function drawSingleSubBlock(
    block: ArchSubBlock,
    bx: number,
    by: number,
    subBw: number,
    fontSize: { name: string; detail: string } = DEFAULT_SUB_BLOCK_FONT_SIZE,
  ) {
    const color = getSubBlockColor(block.type, isDark);
    g.append('rect')
      .attr('x', bx)
      .attr('y', by)
      .attr('width', subBw)
      .attr('height', subBlockH)
      .attr('rx', 6)
      .attr('fill', color.fill)
      .attr('stroke', color.stroke)
      .attr('stroke-width', 1);

    g.append('text')
      .attr('x', bx + subBw / 2)
      .attr('y', by + subBlockH / 2 - (block.detail ? 5 : 0))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', fg)
      .attr('font-size', fontSize.name)
      .attr('font-weight', 500)
      .attr('font-family', 'inherit')
      .text(localizedText(block.name));

    if (block.detail) {
      g.append('text')
        .attr('x', bx + subBw / 2)
        .attr('y', by + subBlockH / 2 + 8)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', fontSize.detail)
        .attr('font-family', 'inherit')
        .text(localizedText(block.detail));
    }
  }

  function drawParallelFlow(
    flow: Extract<SubBlockFlow, { layout: 'parallel' }>,
    startY: number,
    x: number,
    w: number,
    label?: string,
  ) {
    let sy = startY;
    const flowH = getFlowHeight(flow, Boolean(label), {
      blockHeight: subBlockH,
      arrowHeight: subArrowH,
      paddingY: subPadY,
    });

    g.append('rect')
      .attr('x', x + 4)
      .attr('y', sy)
      .attr('width', w - 8)
      .attr('height', flowH)
      .attr('rx', 8)
      .attr('fill', expandedBg)
      .attr('stroke', borderColor)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');

    sy += subPadY;

    if (label) {
      g.append('text')
        .attr('x', x + w / 2)
        .attr('y', sy + 8)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '10px')
        .attr('font-weight', 600)
        .attr('font-family', 'inherit')
        .attr('letter-spacing', '0.5px')
        .text(locale === 'en' ? label.toUpperCase() : localizedText(label));
      sy += 24;
    }

    const colGap = 10;
    const innerPadCol = 12;
    const colW = (w - 2 * innerPadCol - colGap) / 2;
    const leftX = x + innerPadCol;
    const rightX = x + innerPadCol + colW + colGap;
    const leftCx = leftX + colW / 2;
    const rightCx = rightX + colW / 2;
    const mergeCx = x + w / 2;

    if (flow.leftLabel || flow.rightLabel) {
      if (flow.leftLabel) {
        g.append('text')
          .attr('x', leftCx)
          .attr('y', sy + 6)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', mutedFg)
          .attr('font-size', '9px')
          .attr('font-weight', 600)
          .attr('font-family', 'inherit')
          .text(localizedText(flow.leftLabel));
      }
      if (flow.rightLabel) {
        g.append('text')
          .attr('x', rightCx)
          .attr('y', sy + 6)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', mutedFg)
          .attr('font-size', '9px')
          .attr('font-weight', 600)
          .attr('font-family', 'inherit')
          .text(localizedText(flow.rightLabel));
      }
      sy += 16;
    }

    const splitTopY = sy;
    const splitMidY = sy + subArrowH / 2;
    sy += subArrowH;

    const parallelStartY = sy;
    const colFontSize = { name: '10px', detail: '8px' };

    const maxRows = Math.max(flow.leftPath.length, flow.rightPath.length);
    const rowsH = (n: number) => n * subBlockH + Math.max(0, n - 1) * subArrowH;
    const colAreaH = rowsH(maxRows);
    const leftStartY = parallelStartY + (colAreaH - rowsH(flow.leftPath.length)) / 2;
    const rightStartY = parallelStartY + (colAreaH - rowsH(flow.rightPath.length)) / 2;

    g.append('line')
      .attr('x1', mergeCx)
      .attr('y1', splitTopY)
      .attr('x2', mergeCx)
      .attr('y2', splitMidY)
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1);

    g.append('path')
      .attr('d', `M ${mergeCx} ${splitMidY} L ${leftCx} ${splitMidY} L ${leftCx} ${leftStartY - 2}`)
      .attr('fill', 'none')
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arch-arrow-sub)');

    g.append('path')
      .attr(
        'd',
        `M ${mergeCx} ${splitMidY} L ${rightCx} ${splitMidY} L ${rightCx} ${rightStartY - 2}`,
      )
      .attr('fill', 'none')
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arch-arrow-sub)');

    let lsy = leftStartY;
    for (let i = 0; i < flow.leftPath.length; i++) {
      drawSingleSubBlock(flow.leftPath[i], leftX, lsy, colW, colFontSize);
      lsy += subBlockH;
      if (i < flow.leftPath.length - 1) {
        g.append('line')
          .attr('x1', leftCx)
          .attr('y1', lsy + 1)
          .attr('x2', leftCx)
          .attr('y2', lsy + subArrowH - 2)
          .attr('stroke', mutedFg)
          .attr('stroke-width', 1)
          .attr('marker-end', 'url(#arch-arrow-sub)');
        lsy += subArrowH;
      }
    }
    const leftEndY = lsy;

    let rsy = rightStartY;
    for (let i = 0; i < flow.rightPath.length; i++) {
      drawSingleSubBlock(flow.rightPath[i], rightX, rsy, colW, colFontSize);
      rsy += subBlockH;
      if (i < flow.rightPath.length - 1) {
        g.append('line')
          .attr('x1', rightCx)
          .attr('y1', rsy + 1)
          .attr('x2', rightCx)
          .attr('y2', rsy + subArrowH - 2)
          .attr('stroke', mutedFg)
          .attr('stroke-width', 1)
          .attr('marker-end', 'url(#arch-arrow-sub)');
        rsy += subArrowH;
      }
    }
    const rightEndY = rsy;

    const mergeStartY = parallelStartY + colAreaH + subArrowH + 4;

    const subInnerXLocal = x + 16;
    const subInnerWLocal = w - 40;

    const firstIsCircle = flow.mergeBlocks[0]?.circleSymbol;

    if (firstIsCircle) {
      const circleCy = mergeStartY + subBlockH / 2;
      g.append('path')
        .attr(
          'd',
          `M ${leftCx} ${leftEndY + 1} L ${leftCx} ${circleCy} L ${mergeCx - circleR - 2} ${circleCy}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);
      g.append('path')
        .attr(
          'd',
          `M ${rightCx} ${rightEndY + 1} L ${rightCx} ${circleCy} L ${mergeCx + circleR + 2} ${circleCy}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);
    } else {
      const convergeHorizY = Math.max(leftEndY, rightEndY) + (subArrowH + 4) / 2;

      g.append('path')
        .attr(
          'd',
          `M ${leftCx} ${leftEndY + 1} L ${leftCx} ${convergeHorizY} L ${mergeCx} ${convergeHorizY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('path')
        .attr(
          'd',
          `M ${rightCx} ${rightEndY + 1} L ${rightCx} ${convergeHorizY} L ${mergeCx} ${convergeHorizY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('line')
        .attr('x1', mergeCx)
        .attr('y1', convergeHorizY)
        .attr('x2', mergeCx)
        .attr('y2', mergeStartY - 2)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');
    }

    let msy = mergeStartY;
    for (let i = 0; i < flow.mergeBlocks.length; i++) {
      const block = flow.mergeBlocks[i];
      if (block.circleSymbol) {
        const circleCy = msy + subBlockH / 2;
        const symbolR = circleR + 2;
        g.append('circle')
          .attr('cx', mergeCx)
          .attr('cy', circleCy)
          .attr('r', symbolR)
          .attr('fill', bgSubtle)
          .attr('stroke', mutedFg)
          .attr('stroke-width', 1.5);
        drawCircleGlyph(mergeCx, circleCy, fg, block.circleSymbol);
      } else {
        drawSingleSubBlock(block, subInnerXLocal, msy, subInnerWLocal);
      }
      msy += subBlockH;
      if (i < flow.mergeBlocks.length - 1) {
        g.append('line')
          .attr('x1', mergeCx)
          .attr('y1', msy + 1)
          .attr('x2', mergeCx)
          .attr('y2', msy + subArrowH - 2)
          .attr('stroke', mutedFg)
          .attr('stroke-width', 1)
          .attr('marker-end', 'url(#arch-arrow-sub)');
        msy += subArrowH;
      }
    }
  }

  function drawThreeWayFlow(
    flow: Extract<SubBlockFlow, { layout: 'threeWay' }>,
    startY: number,
    x: number,
    w: number,
    _label?: string,
  ) {
    let sy = startY;
    const flowH = getFlowHeight(flow, false, {
      blockHeight: subBlockH,
      arrowHeight: subArrowH,
      paddingY: subPadY,
    });

    g.append('rect')
      .attr('x', x + 4)
      .attr('y', sy)
      .attr('width', w - 8)
      .attr('height', flowH)
      .attr('rx', 8)
      .attr('fill', expandedBg)
      .attr('stroke', borderColor)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');

    sy += subPadY;

    const colGap = 6;
    const innerPadCol = 8;
    const colW = (w - 2 * innerPadCol - 2 * colGap) / 3;
    const leftX = x + innerPadCol;
    const middleX = x + innerPadCol + colW + colGap;
    const rightX = x + innerPadCol + 2 * (colW + colGap);
    const leftCx = leftX + colW / 2;
    const middleCx = middleX + colW / 2;
    const rightCx = rightX + colW / 2;
    const mergeCxLocal = x + w / 2;
    const qkMergeCx = (leftCx + middleCx) / 2;

    if (flow.leftLabel || flow.middleLabel || flow.rightLabel) {
      const labels = [
        { label: flow.leftLabel, cx: leftCx },
        { label: flow.middleLabel, cx: middleCx },
        { label: flow.rightLabel, cx: rightCx },
      ];
      for (const { label: lbl, cx: lcx } of labels) {
        if (lbl) {
          g.append('text')
            .attr('x', lcx)
            .attr('y', sy + 6)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', mutedFg)
            .attr('font-size', '9px')
            .attr('font-weight', 600)
            .attr('font-family', 'inherit')
            .text(localizedText(lbl));
        }
      }
      sy += 16;
    }

    const splitTopY = sy;
    const splitMidY = sy + subArrowH / 2;
    sy += subArrowH;

    const parallelStartY = sy;
    const colFontSize = { name: '9px', detail: '7.5px' };

    g.append('line')
      .attr('x1', mergeCxLocal)
      .attr('y1', splitTopY)
      .attr('x2', mergeCxLocal)
      .attr('y2', splitMidY)
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1);

    for (const colCx of [leftCx, middleCx, rightCx]) {
      g.append('path')
        .attr(
          'd',
          `M ${mergeCxLocal} ${splitMidY} L ${colCx} ${splitMidY} L ${colCx} ${parallelStartY - 2}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');
    }

    const drawColumn = (path: ArchSubBlock[], colX: number, colCx: number) => {
      let csy = parallelStartY;
      for (let i = 0; i < path.length; i++) {
        drawSingleSubBlock(path[i], colX, csy, colW, colFontSize);
        csy += subBlockH;
        if (i < path.length - 1) {
          g.append('line')
            .attr('x1', colCx)
            .attr('y1', csy + 1)
            .attr('x2', colCx)
            .attr('y2', csy + subArrowH - 2)
            .attr('stroke', mutedFg)
            .attr('stroke-width', 1)
            .attr('marker-end', 'url(#arch-arrow-sub)');
          csy += subArrowH;
        }
      }
      return csy;
    };

    const leftEndY = drawColumn(flow.leftPath, leftX, leftCx);
    const middleEndY = drawColumn(flow.middlePath, middleX, middleCx);
    const rightEndY = drawColumn(flow.rightPath, rightX, rightCx);

    const maxRows = Math.max(flow.leftPath.length, flow.middlePath.length, flow.rightPath.length);
    const hasIntermediate = flow.intermediateMergeBlocks.length > 0;
    let finalMergeStartY: number;

    if (hasIntermediate) {
      const intermediateStartY =
        parallelStartY + maxRows * subBlockH + Math.max(0, maxRows - 1) * subArrowH + subArrowH + 4;

      const qkConvergeY = Math.max(leftEndY, middleEndY) + (subArrowH + 4) / 2;

      g.append('path')
        .attr(
          'd',
          `M ${leftCx} ${leftEndY + 1} L ${leftCx} ${qkConvergeY} L ${qkMergeCx} ${qkConvergeY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('path')
        .attr(
          'd',
          `M ${middleCx} ${middleEndY + 1} L ${middleCx} ${qkConvergeY} L ${qkMergeCx} ${qkConvergeY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('line')
        .attr('x1', qkMergeCx)
        .attr('y1', qkConvergeY)
        .attr('x2', qkMergeCx)
        .attr('y2', intermediateStartY - 2)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');

      const intermediateBlockW = middleX + colW - leftX;
      let imsy = intermediateStartY;
      for (let i = 0; i < flow.intermediateMergeBlocks.length; i++) {
        drawSingleSubBlock(
          flow.intermediateMergeBlocks[i],
          leftX,
          imsy,
          intermediateBlockW,
          colFontSize,
        );
        imsy += subBlockH;
        if (i < flow.intermediateMergeBlocks.length - 1) {
          g.append('line')
            .attr('x1', qkMergeCx)
            .attr('y1', imsy + 1)
            .attr('x2', qkMergeCx)
            .attr('y2', imsy + subArrowH - 2)
            .attr('stroke', mutedFg)
            .attr('stroke-width', 1)
            .attr('marker-end', 'url(#arch-arrow-sub)');
          imsy += subArrowH;
        }
      }

      finalMergeStartY =
        intermediateStartY +
        flow.intermediateMergeBlocks.length * subBlockH +
        Math.max(0, flow.intermediateMergeBlocks.length - 1) * subArrowH +
        subArrowH +
        4;

      const finalConvergeY = Math.max(imsy, rightEndY) + (subArrowH + 4) / 2;

      g.append('path')
        .attr(
          'd',
          `M ${qkMergeCx} ${imsy + 1} L ${qkMergeCx} ${finalConvergeY} L ${mergeCxLocal} ${finalConvergeY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('path')
        .attr(
          'd',
          `M ${rightCx} ${rightEndY + 1} L ${rightCx} ${finalConvergeY} L ${mergeCxLocal} ${finalConvergeY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('line')
        .attr('x1', mergeCxLocal)
        .attr('y1', finalConvergeY)
        .attr('x2', mergeCxLocal)
        .attr('y2', finalMergeStartY - 2)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');
    } else {
      finalMergeStartY =
        parallelStartY + maxRows * subBlockH + Math.max(0, maxRows - 1) * subArrowH + subArrowH + 4;

      const allEndY = Math.max(leftEndY, middleEndY, rightEndY);
      const convergeY = allEndY + (subArrowH + 4) / 2;

      g.append('path')
        .attr(
          'd',
          `M ${leftCx} ${leftEndY + 1} L ${leftCx} ${convergeY} L ${mergeCxLocal} ${convergeY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('line')
        .attr('x1', middleCx)
        .attr('y1', middleEndY + 1)
        .attr('x2', middleCx)
        .attr('y2', convergeY)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);
      if (Math.abs(middleCx - mergeCxLocal) > 1) {
        g.append('line')
          .attr('x1', middleCx)
          .attr('y1', convergeY)
          .attr('x2', mergeCxLocal)
          .attr('y2', convergeY)
          .attr('stroke', mutedFg)
          .attr('stroke-width', 1);
      }

      g.append('path')
        .attr(
          'd',
          `M ${rightCx} ${rightEndY + 1} L ${rightCx} ${convergeY} L ${mergeCxLocal} ${convergeY}`,
        )
        .attr('fill', 'none')
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1);

      g.append('line')
        .attr('x1', mergeCxLocal)
        .attr('y1', convergeY)
        .attr('x2', mergeCxLocal)
        .attr('y2', finalMergeStartY - 2)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');
    }

    const subInnerXLocal = x + 16;
    const subInnerWLocal = w - 40;
    let fmsy = finalMergeStartY;
    for (let i = 0; i < flow.finalMergeBlocks.length; i++) {
      drawSingleSubBlock(flow.finalMergeBlocks[i], subInnerXLocal, fmsy, subInnerWLocal);
      fmsy += subBlockH;
      if (i < flow.finalMergeBlocks.length - 1) {
        g.append('line')
          .attr('x1', mergeCxLocal)
          .attr('y1', fmsy + 1)
          .attr('x2', mergeCxLocal)
          .attr('y2', fmsy + subArrowH - 2)
          .attr('stroke', mutedFg)
          .attr('stroke-width', 1)
          .attr('marker-end', 'url(#arch-arrow-sub)');
        fmsy += subArrowH;
      }
    }
  }

  function drawFlow(flow: SubBlockFlow, startY: number, x: number, w: number, label?: string) {
    if (flow.layout === 'threeWay') {
      drawThreeWayFlow(flow, startY, x, w, label);
    } else if (flow.layout === 'parallel') {
      drawParallelFlow(flow, startY, x, w, label);
    }
  }

  function drawCollapsedTransformerBlock(
    x: number,
    by: number,
    w: number,
    h: number,
    label: string,
    subtitle: string,
    blockId: string,
  ) {
    g.append('rect')
      .attr('x', x)
      .attr('y', by)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', 10)
      .attr('fill', bgSubtle)
      .attr('stroke', borderColor)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3');

    g.append('text')
      .attr('x', x + w / 2 - 8)
      .attr('y', by + h / 2 - 8)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', fg)
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .style('pointer-events', 'none')
      .text(localizedText(label));

    g.append('text')
      .attr('x', x + w / 2 - 8)
      .attr('y', by + h / 2 + 10)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', mutedFg)
      .attr('font-size', '11px')
      .attr('font-family', 'inherit')
      .style('pointer-events', 'none')
      .text(localizedText(subtitle));

    const iconX = x + w - 22;
    const iconY = by + h / 2;
    g.append('circle')
      .attr('cx', iconX)
      .attr('cy', iconY)
      .attr('r', 10)
      .attr('fill', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
      .attr('stroke', borderColor)
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');
    drawCircleGlyph(iconX, iconY, mutedFg, '+');

    g.append('rect')
      .attr('x', x)
      .attr('y', by)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', 10)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .attr('data-testid', `expand-${blockId}`)
      .on('click', () => {
        onBlockClick(blockId);
      });
  }

  const modelName = arch.developer || '';
  const paramsSummary = [
    locale === 'zh'
      ? `总参数 ${formatParamCount(arch.totalParams)}`
      : `${formatParamCount(arch.totalParams)} total`,
    isMoE
      ? locale === 'zh'
        ? `激活参数 ${formatParamCount(arch.activeParams)}`
        : `${formatParamCount(arch.activeParams)} active`
      : null,
    arch.contextWindow
      ? locale === 'zh'
        ? `上下文 ${formatContextWindow(arch.contextWindow)}`
        : `${formatContextWindow(arch.contextWindow)} context`
      : null,
  ]
    .filter(Boolean)
    .join(' \u00B7 ');

  g.append('text')
    .attr('x', cx)
    .attr('y', titleY + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', fg)
    .attr('font-size', '15px')
    .attr('font-weight', 700)
    .attr('font-family', 'inherit')
    .text(modelName);

  g.append('text')
    .attr('x', cx)
    .attr('y', titleY + 32)
    .attr('text-anchor', 'middle')
    .attr('fill', mutedFg)
    .attr('font-size', '11px')
    .attr('font-family', 'inherit')
    .text(paramsSummary);

  const embedSub = [
    arch.hiddenSize ? `d = ${arch.hiddenSize.toLocaleString()}` : null,
    arch.vocabSize ? `vocab = ${arch.vocabSize.toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join('  \u00B7  ');
  drawBlock(pad.left, embedY, bw, blockH, 'embedding', 'Token Embedding', embedSub || undefined);

  const denseEntryY = denseTxExpanded ? denseNorm1Y : denseTxStart;
  const hashEntryY = hashBlockExpanded ? hashNorm1Y : hashTxStart;
  const altEntryY = [
    altBlockExpanded[0] ? altNorm1Y[0] : altBlockStart[0],
    altBlockExpanded[1] ? altNorm1Y[1] : altBlockStart[1],
  ];
  const mainEntryY = txExpanded ? norm1Y : txStart;

  drawArrow(
    embedY + blockH,
    hasDenseLayers
      ? denseEntryY
      : hasHashBlock
        ? hashEntryY
        : hasAlternatingLayers
          ? altEntryY[0]
          : mainEntryY,
  );

  if (hasDenseLayers) {
    if (denseTxExpanded) {
      g.append('rect')
        .attr('x', pad.left - 4)
        .attr('y', denseTxStart)
        .attr('width', bw + 8)
        .attr('height', denseTxEnd - denseTxStart)
        .attr('rx', 10)
        .attr('fill', 'none')
        .attr('stroke', borderColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,3');

      const denseLabel = localizedText(`\u2212 \u00D7${denseLayerCount} dense layers`);
      const denseBadgeW = denseLabel.length * 7 + 16;
      g.append('rect')
        .attr('x', width - pad.right - denseBadgeW - 4)
        .attr('y', denseTxStart - 11)
        .attr('width', denseBadgeW)
        .attr('height', 22)
        .attr('rx', 11)
        .attr('fill', bgSubtle)
        .attr('stroke', borderColor)
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', width - pad.right - denseBadgeW / 2 - 4)
        .attr('y', denseTxStart)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '11px')
        .attr('font-weight', 600)
        .attr('font-family', 'inherit')
        .text(denseLabel);
      g.append('rect')
        .attr('x', width - pad.right - denseBadgeW - 4)
        .attr('y', denseTxStart - 11)
        .attr('width', denseBadgeW)
        .attr('height', 22)
        .attr('rx', 11)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .attr('data-testid', 'collapse-denseTransformer')
        .on('click', () => onBlockClick('denseTransformer'));

      drawBlock(innerX, denseNorm1Y, innerW, smallH, 'norm', 'RMSNorm');
      drawArrow(denseNorm1Y + smallH, denseAttnY);

      const denseAttnLabel = denseLayerAttentionLabel(arch);
      const denseHeadSub = arch.numHeads ? `${arch.numHeads} heads` : undefined;
      if (isAttnExpandable) {
        drawExpandableBlock(
          innerX,
          denseAttnY,
          innerW,
          blockH,
          'attention',
          denseAttnLabel,
          denseHeadSub,
          denseAttnExpanded,
          'denseAttention',
        );
        if (denseAttnExpanded && attnFlow) {
          drawFlow(attnFlow, denseAttnExpandedStartY, innerX, innerW);
        }
      } else {
        drawBlock(innerX, denseAttnY, innerW, blockH, 'attention', denseAttnLabel, denseHeadSub);
      }

      const denseAttnBottom = denseAttnExpanded
        ? denseAttnExpandedStartY + denseAttnExpandedH + 4
        : denseAttnY + blockH + 4;
      drawArrow(denseAttnBottom, denseMerge1Y - circleR);
      drawResidualBypass(denseNorm1Y, denseMerge1Y);
      drawArrow(denseMerge1Y + circleR, denseNorm2Y);

      drawBlock(innerX, denseNorm2Y, innerW, smallH, 'norm', 'RMSNorm');
      drawArrow(denseNorm2Y + smallH, denseFFNBlockY);

      const denseFFNSub = arch.denseFFNDim
        ? `intermediate = ${arch.denseFFNDim.toLocaleString()}`
        : 'Dense Feed-Forward';
      drawExpandableBlock(
        innerX,
        denseFFNBlockY,
        innerW,
        blockH,
        'ffn',
        'Dense FFN',
        denseFFNSub,
        denseFFNExpanded,
        'denseFFN',
      );

      if (denseFFNExpanded && denseFFNFlow) {
        drawFlow(denseFFNFlow, denseFFNExpandedStartY, innerX, innerW, `${ffnVariant} FFN`);
      }

      const denseFFNBottom = denseFFNExpanded
        ? denseFFNExpandedStartY + denseFFNExpandedH + 4
        : denseFFNBlockY + blockH + 4;
      drawArrow(denseFFNBottom, denseMerge2Y - circleR);
      drawResidualBypass(denseNorm2Y, denseMerge2Y);
    } else {
      const denseSub = `\u00D7${denseLayerCount} dense layers${arch.denseFFNDim ? ` \u00B7 FFN = ${arch.denseFFNDim.toLocaleString()}` : ''}`;
      drawCollapsedTransformerBlock(
        pad.left,
        denseTxStart,
        bw,
        collapsedTxH,
        'Dense Transformer Block',
        denseSub,
        'denseTransformer',
      );
    }

    drawArrow(
      denseTxEnd,
      hasHashBlock ? hashEntryY : hasAlternatingLayers ? altEntryY[0] : mainEntryY,
    );
  }

  const attnLabel = architectureAttentionLabel(arch);
  const mainLayerCount = hasDenseLayers ? moeLayerCount : arch.numLayers;
  const layerSuffix = hasDenseLayers ? ' MoE layers' : ' layers';
  const layerLabel = mainLayerCount ? `\u00D7${mainLayerCount}${layerSuffix}` : 'Transformer Block';

  function drawExpertGrid(
    eY: number,
    isExpExpanded: boolean,
    expandedH: number,
    expandedStartY: number,
    n2Y: number,
    m2Y: number,
    expertBlockId: string,
    routerLabel = 'MoE Router',
    routerSubOverride?: string,
  ) {
    const routerSub = routerSubOverride ?? expertRouterSummary(arch);
    const rY = n2Y + smallH + arrowH;
    drawBlock(innerX, rY, innerW, blockH, 'router', routerLabel, routerSub);
    drawArrow(rY + blockH, rY + blockH + arrowH);

    const ec = getColor('expert', isDark);
    const eac = getColor('expertActive', isDark);

    g.append('rect')
      .attr('x', innerX)
      .attr('y', eY)
      .attr('width', innerW)
      .attr('height', expertGridH)
      .attr('rx', 8)
      .attr('fill', ec.fill)
      .attr('stroke', ec.stroke)
      .attr('stroke-width', isExpExpanded ? 2.5 : 1)
      .attr('stroke-dasharray', '4,3');

    const numActive = arch.activeExperts || 2;
    const numShow = Math.min(arch.numExperts || 8, 6);
    const showEllipsis = (arch.numExperts || 0) > numShow;
    const totalBoxes = numShow + (showEllipsis ? 2 : 0);
    const totalBoxWidth = totalBoxes * expertSize + (totalBoxes - 1) * expertGap;
    let ex = cx - totalBoxWidth / 2;
    const ey = eY + (expertGridH - expertSize) / 2;

    for (let i = 0; i < numShow; i++) {
      const isActive = i < numActive;
      g.append('rect')
        .attr('x', ex)
        .attr('y', ey)
        .attr('width', expertSize)
        .attr('height', expertSize)
        .attr('rx', 6)
        .attr('fill', isActive ? eac.fill : bgSubtle)
        .attr('stroke', isActive ? eac.stroke : borderColor)
        .attr('stroke-width', isActive ? 1.5 : 1)
        .attr('opacity', isActive ? 1 : 0.6)
        .style('pointer-events', 'none');
      g.append('text')
        .attr('x', ex + expertSize / 2)
        .attr('y', ey + expertSize / 2)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', isActive ? fg : mutedFg)
        .attr('font-size', '9px')
        .attr('font-weight', isActive ? 600 : 400)
        .attr('font-family', 'inherit')
        .style('pointer-events', 'none')
        .text(`E${i + 1}`);
      ex += expertSize + expertGap;
    }

    if (showEllipsis) {
      g.append('text')
        .attr('x', ex + expertSize / 2)
        .attr('y', ey + expertSize / 2)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '14px')
        .attr('font-weight', 700)
        .style('pointer-events', 'none')
        .text('\u00B7\u00B7\u00B7');
      ex += expertSize + expertGap;
      const countText = `\u00D7${arch.numExperts}`;
      g.append('rect')
        .attr('x', ex)
        .attr('y', ey + 3)
        .attr('width', expertSize)
        .attr('height', expertSize - 6)
        .attr('rx', 4)
        .attr('fill', bgSubtle)
        .attr('stroke', borderColor)
        .attr('stroke-width', 1)
        .style('pointer-events', 'none');
      g.append('text')
        .attr('x', ex + expertSize / 2)
        .attr('y', ey + expertSize / 2)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '9px')
        .attr('font-weight', 600)
        .attr('font-family', 'inherit')
        .style('pointer-events', 'none')
        .text(countText);
    }

    const expIconX = innerX + innerW - 18;
    const expIconY = eY + expertGridH / 2;
    g.append('circle')
      .attr('cx', expIconX)
      .attr('cy', expIconY)
      .attr('r', 10)
      .attr('fill', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
      .attr('stroke', ec.stroke)
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');
    drawCircleGlyph(expIconX, expIconY, ec.stroke, isExpExpanded ? '\u2212' : '+');

    g.append('rect')
      .attr('x', innerX)
      .attr('y', eY)
      .attr('width', innerW)
      .attr('height', expertGridH)
      .attr('rx', 8)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .attr('data-testid', `expand-${expertBlockId}`)
      .on('click', () => {
        onBlockClick(expertBlockId);
      });

    if (isExpExpanded) {
      drawFlow(ffnFlow, expandedStartY, innerX, innerW, `Expert FFN (${ffnVariant})`);
    }

    const expertBottom = isExpExpanded ? expandedStartY + expandedH : eY + expertGridH;
    drawArrow(expertBottom, m2Y - circleR);
    drawResidualBypass(n2Y, m2Y);
  }

  if (hasHashBlock) {
    if (hashBlockExpanded) {
      g.append('rect')
        .attr('x', pad.left - 4)
        .attr('y', hashTxStart)
        .attr('width', bw + 8)
        .attr('height', hashTxEnd - hashTxStart)
        .attr('rx', 10)
        .attr('fill', 'none')
        .attr('stroke', borderColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,3');

      const hashBadge = localizedText(`− ×${arch.hashRoutedLayers} layers`);
      const hashBadgeW = hashBadge.length * 7 + 16;
      g.append('rect')
        .attr('x', width - pad.right - hashBadgeW - 4)
        .attr('y', hashTxStart - 11)
        .attr('width', hashBadgeW)
        .attr('height', 22)
        .attr('rx', 11)
        .attr('fill', bgSubtle)
        .attr('stroke', borderColor)
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', width - pad.right - hashBadgeW / 2 - 4)
        .attr('y', hashTxStart)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', mutedFg)
        .attr('font-size', '11px')
        .attr('font-weight', 600)
        .attr('font-family', 'inherit')
        .text(hashBadge);
      g.append('rect')
        .attr('x', width - pad.right - hashBadgeW - 4)
        .attr('y', hashTxStart - 11)
        .attr('width', hashBadgeW)
        .attr('height', 22)
        .attr('rx', 11)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .attr('data-testid', 'collapse-hashBlock')
        .on('click', () => onBlockClick('hashBlock'));

      drawBlock(innerX, hashNorm1Y, innerW, smallH, 'norm', 'RMSNorm');
      drawArrow(hashNorm1Y + smallH, hashAttnY);

      const hashHeadSub = [
        arch.numHeads ? `${arch.numHeads} heads` : null,
        arch.numKVHeads ? `${arch.numKVHeads} KV heads` : null,
      ]
        .filter(Boolean)
        .join('  ·  ');
      drawBlock(
        innerX,
        hashAttnY,
        innerW,
        blockH,
        'attention',
        attnLabel,
        hashHeadSub || undefined,
      );

      drawArrow(hashAttnY + blockH + 4, hashMerge1Y - circleR);
      drawResidualBypass(hashNorm1Y, hashMerge1Y);
      drawArrow(hashMerge1Y + circleR, hashNorm2Y);

      drawBlock(innerX, hashNorm2Y, innerW, smallH, 'norm', 'RMSNorm');
      drawArrow(hashNorm2Y + smallH, hashNorm2Y + smallH + arrowH);

      const hashShared = sharedExpertCount(arch);
      const hashRoutedCount = (arch.numExperts ?? 0) - hashShared;
      const hashRouterSub = `token-id → ${arch.activeExperts} of ${hashRoutedCount}${hashShared > 0 ? ` + ${hashShared} shared` : ''}`;
      drawExpertGrid(
        hashExpertY,
        hashExpertsExpanded,
        hashExpertsExpandedH,
        hashFFNExpandedStartY,
        hashNorm2Y,
        hashMerge2Y,
        'hashExperts',
        'Hash Router',
        hashRouterSub,
      );
    } else {
      const hashSub = `×${arch.hashRoutedLayers} first layers · token-id → experts`;
      drawCollapsedTransformerBlock(
        pad.left,
        hashTxStart,
        bw,
        collapsedTxH,
        'Hash-Routed MoE',
        hashSub,
        'hashBlock',
      );
    }

    drawArrow(hashTxEnd, hasAlternatingLayers ? altEntryY[0] : mainEntryY);
  }

  if (hasAlternatingLayers) {
    for (let bi = 0; bi < 2; bi++) {
      const spec = alternatingSpecs[bi];
      const blockId = `altBlock${bi}`;
      const expertsId = isMoE ? `altExperts${bi}` : `altFFN${bi}`;
      const isExp = altBlockExpanded[bi];
      const isExpExperts = altExpertsExpanded[bi];

      if (isExp) {
        g.append('rect')
          .attr('x', pad.left - 4)
          .attr('y', altBlockStart[bi])
          .attr('width', bw + 8)
          .attr('height', altBlockEnd[bi] - altBlockStart[bi])
          .attr('rx', 10)
          .attr('fill', 'none')
          .attr('stroke', borderColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6,3');

        const badgeLabel = localizedText(`\u2212 \u00D7${spec.count} layers`);
        const badgeW = badgeLabel.length * 7 + 16;
        g.append('rect')
          .attr('x', width - pad.right - badgeW - 4)
          .attr('y', altBlockStart[bi] - 11)
          .attr('width', badgeW)
          .attr('height', 22)
          .attr('rx', 11)
          .attr('fill', bgSubtle)
          .attr('stroke', borderColor)
          .attr('stroke-width', 1);
        g.append('text')
          .attr('x', width - pad.right - badgeW / 2 - 4)
          .attr('y', altBlockStart[bi])
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', mutedFg)
          .attr('font-size', '11px')
          .attr('font-weight', 600)
          .attr('font-family', 'inherit')
          .text(badgeLabel);
        g.append('rect')
          .attr('x', width - pad.right - badgeW - 4)
          .attr('y', altBlockStart[bi] - 11)
          .attr('width', badgeW)
          .attr('height', 22)
          .attr('rx', 11)
          .attr('fill', 'transparent')
          .style('cursor', 'pointer')
          .attr('data-testid', `collapse-${blockId}`)
          .on('click', () => onBlockClick(blockId));

        drawBlock(innerX, altNorm1Y[bi], innerW, smallH, 'norm', 'RMSNorm');
        drawArrow(altNorm1Y[bi] + smallH, altAttnY[bi]);

        const headSub =
          spec.attentionShape ??
          [
            arch.numHeads ? `${arch.numHeads} heads` : null,
            arch.numKVHeads ? `${arch.numKVHeads} KV heads` : null,
          ]
            .filter(Boolean)
            .join('  \u00B7  ');
        const specWindow = spec.slidingWindow;
        const attnSub = specWindow
          ? `${headSub}${headSub ? '  \u00B7  ' : ''}window=${specWindow}`
          : headSub || undefined;
        if (altAttnExpandable) {
          drawExpandableBlock(
            innerX,
            altAttnY[bi],
            innerW,
            blockH,
            'attention',
            spec.label,
            attnSub,
            altAttnExpanded[bi],
            `altAttention${bi}`,
          );
          const flow = altAttnFlow[bi];
          if (altAttnExpanded[bi] && flow) {
            drawFlow(flow, altAttnExpandedStartY[bi], innerX, innerW);
          }
        } else {
          drawBlock(innerX, altAttnY[bi], innerW, blockH, 'attention', spec.label, attnSub);
        }

        const aBottom = altAttnExpanded[bi]
          ? altAttnExpandedStartY[bi] + altAttnExpandedH[bi] + 4
          : altAttnY[bi] + blockH + 4;
        drawArrow(aBottom, altMerge1Y[bi] - circleR);
        drawResidualBypass(altNorm1Y[bi], altMerge1Y[bi]);
        drawArrow(altMerge1Y[bi] + circleR, altNorm2Y[bi]);

        drawBlock(innerX, altNorm2Y[bi], innerW, smallH, 'norm', 'RMSNorm');
        drawArrow(altNorm2Y[bi] + smallH, altNorm2Y[bi] + smallH + arrowH);

        if (isMoE) {
          drawExpertGrid(
            altExpertY[bi],
            isExpExperts,
            altExpertsExpandedH[bi],
            altFFNExpandedStartY[bi],
            altNorm2Y[bi],
            altMerge2Y[bi],
            expertsId,
          );
        } else {
          drawExpandableBlock(
            innerX,
            altExpertY[bi],
            innerW,
            blockH,
            'ffn',
            'Feed-Forward Network',
            `intermediate = ${arch.ffnDim?.toLocaleString()}`,
            isExpExperts,
            expertsId,
          );
          if (isExpExperts) {
            drawFlow(ffnFlow, altFFNExpandedStartY[bi], innerX, innerW, `${ffnVariant} FFN`);
          }
          const bottom = isExpExperts
            ? altFFNExpandedStartY[bi] + altExpertsExpandedH[bi]
            : altExpertY[bi] + blockH;
          drawArrow(bottom, altMerge2Y[bi] - circleR);
          drawResidualBypass(altNorm2Y[bi], altMerge2Y[bi]);
        }
      } else {
        const collapsedSub = isMoE
          ? `\u00D7${spec.count} layers \u00B7 Top-${arch.activeExperts}/${arch.numExperts} MoE`
          : `\u00D7${spec.count} layers \u00B7 Dense FFN`;
        drawCollapsedTransformerBlock(
          pad.left,
          altBlockStart[bi],
          bw,
          collapsedTxH,
          spec.label,
          collapsedSub,
          blockId,
        );
      }

      if (bi === 0) {
        drawArrow(altBlockEnd[0] + 2, altEntryY[1]);

        const cardBg = isDark ? '#131416' : '#eaebec';
        const labelText = `\u21C5 ${
          locale === 'zh' && arch.alternatingNoteZh
            ? arch.alternatingNoteZh
            : localizedText(arch.alternatingNote ?? 'alternating every layer')
        }`;
        const labelPadX = 6;
        const labelPadY = 4;
        const labelFontSize = 10;
        const estLabelW = labelText.length * labelFontSize * 0.55 + labelPadX * 2;
        const estLabelH = labelFontSize + labelPadY * 2;
        g.append('rect')
          .attr('x', cx - estLabelW / 2)
          .attr('y', altIndicatorY - estLabelH / 2)
          .attr('width', estLabelW)
          .attr('height', estLabelH)
          .attr('rx', 4)
          .attr('fill', cardBg);

        g.append('text')
          .attr('x', cx)
          .attr('y', altIndicatorY)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', mutedFg)
          .attr('font-size', `${labelFontSize}px`)
          .attr('font-weight', 500)
          .attr('font-family', 'inherit')
          .attr('data-testid', 'alternating-indicator')
          .text(labelText);
      }
    }

    drawArrow(altBlockEnd[1], finalNormY);
  } else if (txExpanded) {
    g.append('rect')
      .attr('x', pad.left - 4)
      .attr('y', txStart)
      .attr('width', bw + 8)
      .attr('height', txEnd - txStart)
      .attr('rx', 10)
      .attr('fill', 'none')
      .attr('stroke', borderColor)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3');

    const collapseBadgeLabel = localizedText(`\u2212 ${layerLabel}`);
    const badgeW = collapseBadgeLabel.length * 7 + 16;
    g.append('rect')
      .attr('x', width - pad.right - badgeW - 4)
      .attr('y', txStart - 11)
      .attr('width', badgeW)
      .attr('height', 22)
      .attr('rx', 11)
      .attr('fill', bgSubtle)
      .attr('stroke', borderColor)
      .attr('stroke-width', 1);
    g.append('text')
      .attr('x', width - pad.right - badgeW / 2 - 4)
      .attr('y', txStart)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', mutedFg)
      .attr('font-size', '11px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .text(collapseBadgeLabel);
    g.append('rect')
      .attr('x', width - pad.right - badgeW - 4)
      .attr('y', txStart - 11)
      .attr('width', badgeW)
      .attr('height', 22)
      .attr('rx', 11)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .attr('data-testid', 'collapse-transformer')
      .on('click', () => onBlockClick('transformer'));

    drawBlock(innerX, norm1Y, innerW, smallH, 'norm', 'RMSNorm');
    drawArrow(norm1Y + smallH, attnY);

    const headSub = [
      arch.numHeads ? `${arch.numHeads} heads` : null,
      arch.numKVHeads ? `${arch.numKVHeads} KV heads` : null,
    ]
      .filter(Boolean)
      .join('  \u00B7  ');

    if (isAttnExpandable) {
      drawExpandableBlock(
        innerX,
        attnY,
        innerW,
        blockH,
        'attention',
        attnLabel,
        headSub || undefined,
        attnExpanded,
        'attention',
      );
      if (attnExpanded && attnFlow) {
        drawFlow(attnFlow, attnExpandedStartY, innerX, innerW);
      }
    } else {
      drawBlock(innerX, attnY, innerW, blockH, 'attention', attnLabel, headSub || undefined);
    }

    const attnBottom = attnExpanded ? attnExpandedStartY + attnExpandedH + 4 : attnY + blockH + 4;
    drawArrow(attnBottom, merge1Y - circleR);
    drawResidualBypass(norm1Y, merge1Y);
    drawArrow(merge1Y + circleR, norm2Y);

    drawBlock(innerX, norm2Y, innerW, smallH, 'norm', 'RMSNorm');
    drawArrow(norm2Y + smallH, norm2Y + smallH + arrowH);

    if (isMoE) {
      drawExpertGrid(
        expertY,
        ffnExpanded,
        ffnExpandedH,
        ffnExpandedStartY,
        norm2Y,
        merge2Y,
        'experts',
      );
    } else {
      const ffnSub = arch.ffnDim
        ? `intermediate = ${arch.ffnDim.toLocaleString()}`
        : `${ffnVariant} activation`;
      drawExpandableBlock(
        innerX,
        ffnY,
        innerW,
        blockH,
        'ffn',
        'Feed-Forward Network',
        ffnSub,
        ffnExpanded,
        'ffn',
      );

      if (ffnExpanded) {
        drawFlow(ffnFlow, ffnExpandedStartY, innerX, innerW, `${ffnVariant} Details`);
      }

      const ffnBottom = ffnExpanded ? ffnExpandedStartY + ffnExpandedH : ffnY + blockH;
      drawArrow(ffnBottom, merge2Y - circleR);
      drawResidualBypass(norm2Y, merge2Y);
    }
  } else {
    const collapsedLabel = isMoE ? 'MoE Transformer Block' : 'Dense Transformer Block';
    const collapsedSub = isMoE
      ? `${layerLabel} \u00B7 ${attnLabel} \u00B7 Top-${arch.activeExperts}/${arch.numExperts}`
      : `${layerLabel} \u00B7 ${attnLabel}`;
    drawCollapsedTransformerBlock(
      pad.left,
      txStart,
      bw,
      collapsedTxH,
      collapsedLabel,
      collapsedSub,
      'transformer',
    );
  }

  if (!hasAlternatingLayers) {
    drawArrow(txEnd, finalNormY);
  }

  drawBlock(pad.left, finalNormY, bw, smallH, 'norm', 'RMSNorm');
  drawArrow(finalNormY + smallH, outputY);

  const outSub = arch.vocabSize ? `vocab = ${arch.vocabSize.toLocaleString()}` : undefined;
  drawBlock(pad.left, outputY, bw, blockH, 'output', 'Output Head (LM Head)', outSub);

  const specItems: { label: string; value: string }[] = [
    { label: 'Type', value: isMoE ? 'MoE' : 'Dense' },
    {
      label: 'Layers',
      value: hasDenseLayers
        ? `${denseLayerCount}D + ${moeLayerCount}M`
        : arch.numLayers
          ? `${arch.numLayers}`
          : '\u2014',
    },
    {
      label: 'Attention',
      value: arch.attentionType === 'AlternatingSinkGQA' ? 'Sink/Full GQA' : arch.attentionType,
    },
    {
      label: 'Context',
      value: arch.contextWindow ? formatContextWindow(arch.contextWindow) : '\u2014',
    },
    ...(isMoE
      ? [
          {
            label: 'Experts',
            value: `${arch.activeExperts}${sharedExperts > 0 ? `+${sharedExperts}` : ''}/${arch.numExperts}`,
          },
        ]
      : []),
  ];

  const specColW = bw / specItems.length;

  g.append('rect')
    .attr('x', pad.left)
    .attr('y', specsY)
    .attr('width', bw)
    .attr('height', specsH)
    .attr('rx', 8)
    .attr('fill', bgSubtle)
    .attr('stroke', borderColor)
    .attr('stroke-width', 1);

  specItems.forEach((spec, i) => {
    const sx = pad.left + i * specColW + specColW / 2;

    g.append('text')
      .attr('x', sx)
      .attr('y', specsY + 18)
      .attr('text-anchor', 'middle')
      .attr('fill', mutedFg)
      .attr('font-size', '10px')
      .attr('font-weight', 500)
      .attr('font-family', 'inherit')
      .text(localizedText(spec.label));

    g.append('text')
      .attr('x', sx)
      .attr('y', specsY + 38)
      .attr('text-anchor', 'middle')
      .attr('fill', fg)
      .attr('font-size', '14px')
      .attr('font-weight', 700)
      .attr('font-family', 'inherit')
      .text(localizedText(spec.value));

    if (i < specItems.length - 1) {
      g.append('line')
        .attr('x1', pad.left + (i + 1) * specColW)
        .attr('y1', specsY + 8)
        .attr('x2', pad.left + (i + 1) * specColW)
        .attr('y2', specsY + specsH - 8)
        .attr('stroke', borderColor)
        .attr('stroke-width', 1);
    }
  });
}
