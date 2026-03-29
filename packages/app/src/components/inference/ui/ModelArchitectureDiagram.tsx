'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

import { Badge } from '@/components/ui/badge';
import { Model } from '@/lib/data-mappings';
import {
  ArchSubBlock,
  SubBlockFlow,
  formatContextWindow,
  formatParamCount,
  getAttentionLabel,
  getAttentionSubBlocks,
  getFFNSubBlocks,
  getModelArchitecture,
  ModelArchitecture,
} from '@/lib/model-architectures';

interface ModelArchitectureDiagramProps {
  model: Model;
  className?: string;
}

/** Block color definitions for light/dark themes */
const BLOCK_COLORS = {
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

/** Sub-block color definitions for expanded drill-down views */
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

/**
 * Renders the D3-based SVG architecture diagram.
 * Supports both dense (Llama) and MoE (DeepSeek R1) architectures.
 * For MoE models with denseFFNLayers, renders a separate dense transformer block.
 * MLA attention blocks are NOT expandable (shown as static blocks).
 */
function renderDiagram(
  svgEl: SVGSVGElement,
  arch: ModelArchitecture,
  isDark: boolean,
  expandedBlocks: Set<string>,
  onBlockClick: (blockId: string) => void,
) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const containerWidth = svgEl.parentElement?.clientWidth || 600;
  const width = Math.min(containerWidth, 640);

  // Theme colors
  const fg = isDark ? '#f2f4f7' : '#080c12';
  const mutedFg = isDark ? '#9ca3af' : '#6b7280';
  const borderColor = isDark ? '#374151' : '#d1d5db';
  const bgSubtle = isDark ? '#1f2937' : '#f9fafb';
  const expandedBg = isDark ? '#111827' : '#f1f5f9';

  // Layout constants
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

  // Expert grid constants
  const expertSize = 36;
  const expertGap = 6;
  const expertGridH = 70;

  // Sub-block layout constants
  const subBlockH = 34;
  const subArrowH = 12;
  const subPadY = 10;

  // Architecture flags
  const isMoE = arch.architectureType === 'moe';
  const hasDenseLayers = isMoE && (arch.denseFFNLayers ?? 0) > 0;
  const denseLayerCount = arch.denseFFNLayers ?? 0;
  const moeLayerCount = (arch.numLayers ?? 0) - denseLayerCount;
  // MLA and AlternatingSinkGQA attention types are NOT expandable.
  // Models can also explicitly opt out via attentionExpandable: false.
  const isAttnExpandable =
    arch.attentionExpandable !== false &&
    arch.attentionType !== 'MLA' &&
    arch.attentionType !== 'AlternatingSinkGQA';
  const hasAlternatingLayers = !!(arch.alternatingLayers && arch.alternatingLayers.length > 0);
  const alternatingSpecs = arch.alternatingLayers ?? [];

  // Get sub-blocks data (only used for expandable attention types)
  const attnFlow = isAttnExpandable ? getAttentionSubBlocks(arch) : null;
  const ffnFlow = getFFNSubBlocks(arch);
  const denseFFNFlow = hasDenseLayers ? getFFNSubBlocks(arch, { useDenseFFNDim: true }) : null;

  const attnExpanded = isAttnExpandable && expandedBlocks.has('attention');
  const ffnExpanded = expandedBlocks.has(isMoE ? 'experts' : 'ffn');
  const txExpanded = expandedBlocks.has('transformer');
  const denseTxExpanded = expandedBlocks.has('denseTransformer');
  const denseAttnExpanded = isAttnExpandable && expandedBlocks.has('denseAttention');
  const denseFFNExpanded = expandedBlocks.has('denseFFN');

  // Alternating block expand states (for models with alternating attention like gpt-oss)
  const altBlockExpanded = [
    hasAlternatingLayers && expandedBlocks.has('altBlock0'),
    hasAlternatingLayers && expandedBlocks.has('altBlock1'),
  ];
  const altExpertsExpanded = [
    hasAlternatingLayers && expandedBlocks.has('altExperts0'),
    hasAlternatingLayers && expandedBlocks.has('altExperts1'),
  ];

  // Calculate flow height for either sequential or parallel layouts
  function getFlowHeight(flow: SubBlockFlow, hasLabel: boolean): number {
    if (flow.layout === 'sequential') {
      return (
        flow.blocks.length * subBlockH +
        Math.max(0, flow.blocks.length - 1) * subArrowH +
        subPadY * 2 +
        (hasLabel ? 24 : 0)
      );
    }
    if (flow.layout === 'threeWay') {
      const maxRows = Math.max(flow.leftPath.length, flow.middlePath.length, flow.rightPath.length);
      const pathLabelsH = flow.leftLabel || flow.middleLabel || flow.rightLabel ? 16 : 0;
      const splitH = subArrowH;
      const hasIntermediate = flow.intermediateMergeBlocks.length > 0;
      return (
        subPadY * 2 +
        (hasLabel ? 24 : 0) +
        pathLabelsH +
        splitH +
        maxRows * subBlockH +
        Math.max(0, maxRows - 1) * subArrowH +
        (subArrowH + 4) +
        (hasIntermediate
          ? flow.intermediateMergeBlocks.length * subBlockH +
            Math.max(0, flow.intermediateMergeBlocks.length - 1) * subArrowH +
            (subArrowH + 4)
          : 0) +
        flow.finalMergeBlocks.length * subBlockH +
        Math.max(0, flow.finalMergeBlocks.length - 1) * subArrowH
      );
    }
    const maxRows = Math.max(flow.leftPath.length, flow.rightPath.length);
    const pathLabelsH = flow.leftLabel || flow.rightLabel ? 16 : 0;
    const splitH = subArrowH;
    return (
      subPadY * 2 +
      (hasLabel ? 24 : 0) +
      pathLabelsH +
      splitH +
      maxRows * subBlockH +
      Math.max(0, maxRows - 1) * subArrowH +
      (subArrowH + 4) +
      flow.mergeBlocks.length * subBlockH +
      Math.max(0, flow.mergeBlocks.length - 1) * subArrowH
    );
  }

  // Calculate expanded section heights
  const attnExpandedH = attnExpanded && attnFlow ? getFlowHeight(attnFlow, false) : 0;
  const ffnExpandedH = ffnExpanded ? getFlowHeight(ffnFlow, true) : 0;
  const denseAttnExpandedH = denseAttnExpanded && attnFlow ? getFlowHeight(attnFlow, false) : 0;
  const denseFFNExpandedH =
    denseFFNExpanded && denseFFNFlow ? getFlowHeight(denseFFNFlow, true) : 0;
  const altExpertsExpandedH = [
    altExpertsExpanded[0] ? getFlowHeight(ffnFlow, true) : 0,
    altExpertsExpanded[1] ? getFlowHeight(ffnFlow, true) : 0,
  ];

  // Compute vertical positions
  let y = pad.top;

  // Title
  const titleY = y;
  y += 44;

  // Embedding
  const embedY = y;
  y += blockH + arrowH;

  // === DENSE TRANSFORMER BLOCK (for MoE models with initial dense layers) ===
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

  // === ALTERNATING TRANSFORMER BLOCKS (for models like gpt-oss with alternating attention) ===
  const altBlockStart = [0, 0];
  const altBlockEnd = [0, 0];
  const altNorm1Y = [0, 0];
  const altAttnY = [0, 0];
  const altMerge1Y = [0, 0];
  const altNorm2Y = [0, 0];
  const altRouterY = [0, 0];
  const altExpertY = [0, 0];
  const altFFNExpandedStartY = [0, 0];
  const altMerge2Y = [0, 0];
  let altIndicatorY = 0;

  // Main transformer container (used when NOT hasAlternatingLayers)
  const txStart = hasAlternatingLayers ? 0 : y;
  let attnY = 0;
  let attnExpandedStartY = 0;
  let merge1Y = 0;
  let norm1Y = 0;
  let _routerY = 0;
  let expertY = 0;
  let ffnY = 0;
  let ffnExpandedStartY = 0;
  let merge2Y = 0;
  let norm2Y = 0;
  let txEnd = 0;

  if (hasAlternatingLayers) {
    // Layout two separate transformer blocks with alternating indicator between them
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

        y += 4;
        altMerge1Y[bi] = y + mergeGap / 2;
        y += mergeGap;

        y += arrowH;
        altNorm2Y[bi] = y;
        y += smallH + arrowH;

        // MoE Router
        altRouterY[bi] = y;
        y += blockH + arrowH;

        // Expert grid
        altExpertY[bi] = y;
        y += expertGridH;

        // Expanded expert FFN sub-blocks
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

      // Add alternating indicator between the two blocks
      if (bi === 0) {
        y += 6;
        altIndicatorY = y + 10;
        y += 24;
      }
    }
    y += arrowH;
  } else if (txExpanded) {
    y += 14;

    // Pre-LN: RMSNorm 1 before attention
    norm1Y = y;
    y += smallH + arrowH;

    // Attention
    attnY = y;
    y += blockH;

    // Expanded attention sub-blocks (only for non-MLA, non-AlternatingSinkGQA)
    attnExpandedStartY = y;
    if (attnExpanded) {
      y += attnExpandedH;
    }

    y += 4;
    merge1Y = y + mergeGap / 2;
    y += mergeGap;

    // Pre-LN: RMSNorm 2 before FFN
    y += arrowH;
    norm2Y = y;
    y += smallH + arrowH;

    if (isMoE) {
      // Router
      _routerY = y;
      y += blockH + arrowH;

      // Expert grid
      expertY = y;
      y += expertGridH;

      // Expanded expert FFN sub-blocks
      ffnExpandedStartY = y;
      if (ffnExpanded) {
        y += ffnExpandedH;
      }
    } else {
      // Dense FFN
      ffnY = y;
      y += blockH;

      // Expanded FFN sub-blocks
      ffnExpandedStartY = y;
      if (ffnExpanded) {
        y += ffnExpandedH;
      }
    }

    merge2Y = y + mergeGap / 2;
    y += mergeGap;

    y += 14;
    txEnd = y;
    y += arrowH;
  } else {
    y += collapsedTxH;
    txEnd = y;
    y += arrowH;
  }

  // Final RMSNorm
  const finalNormY = y;
  y += smallH + arrowH;

  // Output head
  const outputY = y;
  y += blockH + 16;

  // Specs bar
  const specsY = y;
  const specsH = 56;
  y += specsH;

  const totalH = y + pad.bottom;

  // Set SVG size
  svg.attr('width', width).attr('height', totalH).attr('viewBox', `0 0 ${width} ${totalH}`);

  // Defs (arrow markers)
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

  // --- Helpers ---
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

  function drawResidualBypass(branchY: number, mergeY: number) {
    bgG
      .append('path')
      .attr(
        'd',
        `M ${cx} ${branchY} L ${residLeftX} ${branchY} L ${residLeftX} ${mergeY} L ${cx - circleR} ${mergeY}`,
      )
      .attr('fill', 'none')
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6);
    g.append('circle')
      .attr('cx', cx)
      .attr('cy', mergeY)
      .attr('r', circleR)
      .attr('fill', bgSubtle)
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1.5);
    g.append('text')
      .attr('x', cx)
      .attr('y', mergeY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', fg)
      .attr('font-size', '14px')
      .attr('font-weight', 700)
      .attr('font-family', 'inherit')
      .text('+');
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
      .attr('dominant-baseline', 'central')
      .attr('fill', fg)
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .text(mainText);

    if (subText) {
      g.append('text')
        .attr('x', x + w / 2)
        .attr('y', by + h / 2 + 10)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', mutedFg)
        .attr('font-size', '11px')
        .attr('font-family', 'inherit')
        .text(subText);
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
      .attr('dominant-baseline', 'central')
      .attr('fill', fg)
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .style('pointer-events', 'none')
      .text(mainText);

    if (subText) {
      g.append('text')
        .attr('x', x + w / 2 - 8)
        .attr('y', by + h / 2 + 10)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', mutedFg)
        .attr('font-size', '11px')
        .attr('font-family', 'inherit')
        .style('pointer-events', 'none')
        .text(subText);
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

    g.append('text')
      .attr('x', iconX)
      .attr('y', iconY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', c.stroke)
      .attr('font-size', '14px')
      .attr('font-weight', 700)
      .style('pointer-events', 'none')
      .text(isBlockExpanded ? '\u2212' : '+');

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

  /** Draw a single sub-block at the given position */
  function drawSingleSubBlock(
    block: ArchSubBlock,
    bx: number,
    by: number,
    bw: number,
    fontSize: { name: string; detail: string } = { name: '11px', detail: '9px' },
  ) {
    const color = getSubBlockColor(block.type, isDark);
    g.append('rect')
      .attr('x', bx)
      .attr('y', by)
      .attr('width', bw)
      .attr('height', subBlockH)
      .attr('rx', 6)
      .attr('fill', color.fill)
      .attr('stroke', color.stroke)
      .attr('stroke-width', 1);

    g.append('text')
      .attr('x', bx + bw / 2)
      .attr('y', by + subBlockH / 2 - (block.detail ? 5 : 0))
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', fg)
      .attr('font-size', fontSize.name)
      .attr('font-weight', 500)
      .attr('font-family', 'inherit')
      .text(block.name);

    if (block.detail) {
      g.append('text')
        .attr('x', bx + bw / 2)
        .attr('y', by + subBlockH / 2 + 8)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', mutedFg)
        .attr('font-size', fontSize.detail)
        .attr('font-family', 'inherit')
        .text(block.detail);
    }
  }

  /** Draw parallel sub-block flow (two columns converging into merge blocks) */
  function drawParallelFlow(
    flow: Extract<SubBlockFlow, { layout: 'parallel' }>,
    startY: number,
    x: number,
    w: number,
    label?: string,
  ) {
    let sy = startY;
    const totalH = getFlowHeight(flow, !!label);

    g.append('rect')
      .attr('x', x + 4)
      .attr('y', sy)
      .attr('width', w - 8)
      .attr('height', totalH)
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
        .attr('dominant-baseline', 'central')
        .attr('fill', mutedFg)
        .attr('font-size', '10px')
        .attr('font-weight', 600)
        .attr('font-family', 'inherit')
        .attr('letter-spacing', '0.5px')
        .text(label.toUpperCase());
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
          .attr('dominant-baseline', 'central')
          .attr('fill', mutedFg)
          .attr('font-size', '9px')
          .attr('font-weight', 600)
          .attr('font-family', 'inherit')
          .text(flow.leftLabel);
      }
      if (flow.rightLabel) {
        g.append('text')
          .attr('x', rightCx)
          .attr('y', sy + 6)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', mutedFg)
          .attr('font-size', '9px')
          .attr('font-weight', 600)
          .attr('font-family', 'inherit')
          .text(flow.rightLabel);
      }
      sy += 16;
    }

    const splitTopY = sy;
    const splitMidY = sy + subArrowH / 2;
    sy += subArrowH;

    const parallelStartY = sy;
    const colFontSize = { name: '10px', detail: '8px' };

    g.append('line')
      .attr('x1', mergeCx)
      .attr('y1', splitTopY)
      .attr('x2', mergeCx)
      .attr('y2', splitMidY)
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1);

    g.append('path')
      .attr(
        'd',
        `M ${mergeCx} ${splitMidY} L ${leftCx} ${splitMidY} L ${leftCx} ${parallelStartY - 2}`,
      )
      .attr('fill', 'none')
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arch-arrow-sub)');

    g.append('path')
      .attr(
        'd',
        `M ${mergeCx} ${splitMidY} L ${rightCx} ${splitMidY} L ${rightCx} ${parallelStartY - 2}`,
      )
      .attr('fill', 'none')
      .attr('stroke', mutedFg)
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arch-arrow-sub)');

    let lsy = parallelStartY;
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

    let rsy = parallelStartY;
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

    const maxRows = Math.max(flow.leftPath.length, flow.rightPath.length);
    const mergeStartY =
      parallelStartY + maxRows * subBlockH + Math.max(0, maxRows - 1) * subArrowH + subArrowH + 4;

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
        g.append('text')
          .attr('x', mergeCx)
          .attr('y', circleCy)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', fg)
          .attr('font-size', '14px')
          .attr('font-weight', 700)
          .attr('font-family', 'inherit')
          .text(block.circleSymbol);
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

  /** Draw three-way parallel flow (3 columns: left+middle converge first, then merge with right) */
  function drawThreeWayFlow(
    flow: Extract<SubBlockFlow, { layout: 'threeWay' }>,
    startY: number,
    x: number,
    w: number,
    _label?: string,
  ) {
    let sy = startY;
    const totalH = getFlowHeight(flow, false);

    g.append('rect')
      .attr('x', x + 4)
      .attr('y', sy)
      .attr('width', w - 8)
      .attr('height', totalH)
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
            .attr('dominant-baseline', 'central')
            .attr('fill', mutedFg)
            .attr('font-size', '9px')
            .attr('font-weight', 600)
            .attr('font-family', 'inherit')
            .text(lbl);
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

      const finalStartY =
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
        .attr('y2', finalStartY - 2)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');

      const subInnerXLocal = x + 16;
      const subInnerWLocal = w - 40;
      let fmsy = finalStartY;
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
    } else {
      const finalStartY =
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
        .attr('y2', finalStartY - 2)
        .attr('stroke', mutedFg)
        .attr('stroke-width', 1)
        .attr('marker-end', 'url(#arch-arrow-sub)');

      const subInnerXLocal = x + 16;
      const subInnerWLocal = w - 40;
      let fmsy = finalStartY;
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
  }

  /** Dispatch to correct rendering based on flow layout */
  function drawFlow(flow: SubBlockFlow, startY: number, x: number, w: number, label?: string) {
    if (flow.layout === 'threeWay') {
      drawThreeWayFlow(flow, startY, x, w, label);
    } else if (flow.layout === 'parallel') {
      drawParallelFlow(flow, startY, x, w, label);
    }
  }

  /** Draw a collapsed transformer block (compact summary with expand icon) */
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
      .attr('dominant-baseline', 'central')
      .attr('fill', fg)
      .attr('font-size', '13px')
      .attr('font-weight', 600)
      .attr('font-family', 'inherit')
      .style('pointer-events', 'none')
      .text(label);

    g.append('text')
      .attr('x', x + w / 2 - 8)
      .attr('y', by + h / 2 + 10)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', mutedFg)
      .attr('font-size', '11px')
      .attr('font-family', 'inherit')
      .style('pointer-events', 'none')
      .text(subtitle);

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
    g.append('text')
      .attr('x', iconX)
      .attr('y', iconY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', mutedFg)
      .attr('font-size', '14px')
      .attr('font-weight', 700)
      .style('pointer-events', 'none')
      .text('+');

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

  // === TITLE ===
  const modelName = arch.developer || '';
  const paramsSummary = [
    `${formatParamCount(arch.totalParams)} total`,
    isMoE ? `${formatParamCount(arch.activeParams)} active` : null,
    arch.contextWindow ? `${formatContextWindow(arch.contextWindow)} context` : null,
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

  // === EMBEDDING ===
  const embedSub = [
    arch.hiddenSize ? `d = ${arch.hiddenSize.toLocaleString()}` : null,
    arch.vocabSize ? `vocab = ${arch.vocabSize.toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join('  \u00B7  ');
  drawBlock(pad.left, embedY, bw, blockH, 'embedding', 'Token Embedding', embedSub || undefined);
  drawArrow(
    embedY + blockH,
    hasDenseLayers ? denseTxStart : hasAlternatingLayers ? altBlockStart[0] : txStart,
  );

  // === DENSE TRANSFORMER BLOCK (for MoE models with initial dense layers) ===
  if (hasDenseLayers) {
    if (denseTxExpanded) {
      // Container
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

      // Dense layer badge (clickable to collapse)
      const denseLabel = `\u2212 \u00D7${denseLayerCount} dense layers`;
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
        .attr('dominant-baseline', 'central')
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

      // RMSNorm 1 (Pre-LN)
      drawBlock(innerX, denseNorm1Y, innerW, smallH, 'norm', 'RMSNorm');
      drawArrow(denseNorm1Y + smallH, denseAttnY);

      // Attention (expandable only for non-MLA types)
      const denseAttnLabel = getAttentionLabel(arch.attentionType);
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

      // RMSNorm 2 (Pre-LN)
      drawBlock(innerX, denseNorm2Y, innerW, smallH, 'norm', 'RMSNorm');
      drawArrow(denseNorm2Y + smallH, denseFFNBlockY);

      // Dense FFN (expandable)
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
        drawFlow(denseFFNFlow, denseFFNExpandedStartY, innerX, innerW, 'SwiGLU FFN');
      }

      const denseFFNBottom = denseFFNExpanded
        ? denseFFNExpandedStartY + denseFFNExpandedH + 4
        : denseFFNBlockY + blockH + 4;
      drawArrow(denseFFNBottom, denseMerge2Y - circleR);
      drawResidualBypass(denseNorm2Y, denseMerge2Y);
    } else {
      // Collapsed dense transformer block
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

    // Arrow from dense block to next block
    drawArrow(denseTxEnd, hasAlternatingLayers ? altBlockStart[0] : txStart);
  }

  // Compute labels
  const attnLabel = getAttentionLabel(arch.attentionType);
  const mainLayerCount = hasDenseLayers ? moeLayerCount : arch.numLayers;
  const layerSuffix = hasDenseLayers ? ' MoE layers' : ' layers';
  const layerLabel = mainLayerCount ? `\u00D7${mainLayerCount}${layerSuffix}` : 'Transformer Block';

  /** Helper: draw a MoE expert grid (used in both alternating and standard blocks) */
  function drawExpertGrid(
    eY: number,
    isExpExpanded: boolean,
    expandedH: number,
    expandedStartY: number,
    n2Y: number,
    m2Y: number,
    expertBlockId: string,
  ) {
    const routedCount = arch.hasSharedExpert ? (arch.numExperts || 0) - 1 : arch.numExperts;
    const routerSub = `Top-${arch.activeExperts} of ${routedCount} routed${arch.hasSharedExpert ? ' + 1 shared' : ''}`;
    const rY = n2Y + smallH + arrowH;
    drawBlock(innerX, rY, innerW, blockH, 'router', 'MoE Router', routerSub);
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
        .attr('dominant-baseline', 'central')
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
        .attr('dominant-baseline', 'central')
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
        .attr('dominant-baseline', 'central')
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
    g.append('text')
      .attr('x', expIconX)
      .attr('y', expIconY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', ec.stroke)
      .attr('font-size', '14px')
      .attr('font-weight', 700)
      .style('pointer-events', 'none')
      .text(isExpExpanded ? '\u2212' : '+');

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
      drawFlow(ffnFlow, expandedStartY, innerX, innerW, 'Expert FFN (SwiGLU)');
    }

    const expertBottom = isExpExpanded ? expandedStartY + expandedH : eY + expertGridH;
    drawArrow(expertBottom, m2Y - circleR);
    drawResidualBypass(n2Y, m2Y);
  }

  // === ALTERNATING TRANSFORMER BLOCKS (gpt-oss style) ===
  if (hasAlternatingLayers) {
    for (let bi = 0; bi < 2; bi++) {
      const spec = alternatingSpecs[bi];
      const blockId = `altBlock${bi}`;
      const expertsId = `altExperts${bi}`;
      const isExp = altBlockExpanded[bi];
      const isExpExperts = altExpertsExpanded[bi];

      if (isExp) {
        // === EXPANDED ALTERNATING BLOCK ===
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

        // Collapse badge
        const badgeLabel = `\u2212 \u00D7${spec.count} layers`;
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
          .attr('dominant-baseline', 'central')
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

        // RMSNorm 1
        drawBlock(innerX, altNorm1Y[bi], innerW, smallH, 'norm', 'RMSNorm');
        drawArrow(altNorm1Y[bi] + smallH, altAttnY[bi]);

        // Attention (non-expandable — AlternatingSinkGQA)
        const headSub = [
          arch.numHeads ? `${arch.numHeads} heads` : null,
          arch.numKVHeads ? `${arch.numKVHeads} KV heads` : null,
        ]
          .filter(Boolean)
          .join('  \u00B7  ');
        const attnSub =
          bi === 0 && arch.slidingWindow
            ? `${headSub}${headSub ? '  \u00B7  ' : ''}window=${arch.slidingWindow}`
            : headSub || undefined;
        drawBlock(innerX, altAttnY[bi], innerW, blockH, 'attention', spec.label, attnSub);

        const aBottom = altAttnY[bi] + blockH + 4;
        drawArrow(aBottom, altMerge1Y[bi] - circleR);
        drawResidualBypass(altNorm1Y[bi], altMerge1Y[bi]);
        drawArrow(altMerge1Y[bi] + circleR, altNorm2Y[bi]);

        // RMSNorm 2
        drawBlock(innerX, altNorm2Y[bi], innerW, smallH, 'norm', 'RMSNorm');
        drawArrow(altNorm2Y[bi] + smallH, altNorm2Y[bi] + smallH + arrowH);

        // MoE Router + Expert Grid
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
        // === COLLAPSED ALTERNATING BLOCK ===
        const collapsedSub = `\u00D7${spec.count} layers \u00B7 Top-${arch.activeExperts}/${arch.numExperts} MoE`;
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

      // Draw alternating indicator between the two blocks
      if (bi === 0) {
        // Arrow from block 0 end through indicator to block 1 start (drawn first, behind text)
        drawArrow(altBlockEnd[0] + 2, altBlockStart[1]);

        // Opaque background rect behind the label so it doesn't overlap the arrow
        const cardBg = isDark ? '#080c12' : '#f2f4f7';
        const labelText = '\u21C5 alternating every layer';
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
          .attr('dominant-baseline', 'central')
          .attr('fill', mutedFg)
          .attr('font-size', `${labelFontSize}px`)
          .attr('font-weight', 500)
          .attr('font-family', 'inherit')
          .attr('data-testid', 'alternating-indicator')
          .text(labelText);
      }
    }

    // Arrow from last alternating block to final norm
    drawArrow(altBlockEnd[1], finalNormY);
  } else if (txExpanded) {
    // === MAIN TRANSFORMER CONTAINER (expanded, non-alternating) ===
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

    // Layer badge (clickable to collapse)
    const collapseBadgeLabel = `\u2212 ${layerLabel}`;
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
      .attr('dominant-baseline', 'central')
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

    // === RMSNORM 1 (before attention — Pre-LN) ===
    drawBlock(innerX, norm1Y, innerW, smallH, 'norm', 'RMSNorm');
    drawArrow(norm1Y + smallH, attnY);

    // === ATTENTION ===
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
      // MLA: non-expandable static block
      drawBlock(innerX, attnY, innerW, blockH, 'attention', attnLabel, headSub || undefined);
    }

    const attnBottom = attnExpanded ? attnExpandedStartY + attnExpandedH + 4 : attnY + blockH + 4;
    drawArrow(attnBottom, merge1Y - circleR);
    drawResidualBypass(norm1Y, merge1Y);
    drawArrow(merge1Y + circleR, norm2Y);

    // === RMSNORM 2 (before FFN — Pre-LN) ===
    drawBlock(innerX, norm2Y, innerW, smallH, 'norm', 'RMSNorm');
    drawArrow(norm2Y + smallH, norm2Y + smallH + arrowH);

    if (isMoE) {
      // === ROUTER + EXPERTS (via helper) ===
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
      // === FFN (expandable) for dense models ===
      const ffnSub = arch.ffnDim
        ? `intermediate = ${arch.ffnDim.toLocaleString()}`
        : 'SwiGLU activation';
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
        drawFlow(ffnFlow, ffnExpandedStartY, innerX, innerW, 'SwiGLU Details');
      }

      const ffnBottom = ffnExpanded ? ffnExpandedStartY + ffnExpandedH : ffnY + blockH;
      drawArrow(ffnBottom, merge2Y - circleR);
      drawResidualBypass(norm2Y, merge2Y);
    }

    // Arrow from transformer container to final norm
    drawArrow(txEnd, finalNormY);
  } else {
    // === MAIN TRANSFORMER (collapsed) ===
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

    // Arrow from transformer container to final norm
    drawArrow(txEnd, finalNormY);
  }

  // === FINAL RMSNORM ===
  drawBlock(pad.left, finalNormY, bw, smallH, 'norm', 'RMSNorm');
  drawArrow(finalNormY + smallH, outputY);

  // === OUTPUT HEAD ===
  const outSub = arch.vocabSize ? `vocab = ${arch.vocabSize.toLocaleString()}` : undefined;
  drawBlock(pad.left, outputY, bw, blockH, 'output', 'Output Head (LM Head)', outSub);

  // === SPECS BAR ===
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
      value: hasAlternatingLayers ? 'Sink/Full GQA' : arch.attentionType,
    },
    {
      label: 'Context',
      value: arch.contextWindow ? formatContextWindow(arch.contextWindow) : '\u2014',
    },
    ...(isMoE
      ? [
          {
            label: 'Experts',
            value: `${arch.activeExperts}/${arch.numExperts}`,
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
      .text(spec.label);

    g.append('text')
      .attr('x', sx)
      .attr('y', specsY + 38)
      .attr('text-anchor', 'middle')
      .attr('fill', fg)
      .attr('font-size', '14px')
      .attr('font-weight', 700)
      .attr('font-family', 'inherit')
      .text(spec.value);

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

export default function ModelArchitectureDiagram({
  model,
  className = '',
}: ModelArchitectureDiagramProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const arch = getModelArchitecture(model);

  const toggleBlock = useCallback(
    (blockId: string) => {
      setExpandedBlocks((prev) => {
        const next = new Set(prev);
        if (next.has(blockId)) {
          next.delete(blockId);
        } else {
          next.add(blockId);
        }
        return next;
      });
      track('model_architecture_block_toggled', { model, block: blockId });
    },
    [model],
  );

  useEffect(() => {
    if (isExpanded && svgRef.current && arch) {
      renderDiagram(svgRef.current, arch, resolvedTheme === 'dark', expandedBlocks, toggleBlock);
    }
  }, [isExpanded, arch, resolvedTheme, model, expandedBlocks, toggleBlock]);

  useEffect(() => {
    if (!isExpanded || !containerRef.current || !arch) return;

    const observer = new ResizeObserver(() => {
      if (svgRef.current && arch) {
        renderDiagram(svgRef.current, arch, resolvedTheme === 'dark', expandedBlocks, toggleBlock);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isExpanded, arch, resolvedTheme, expandedBlocks, toggleBlock]);

  useEffect(() => {
    setExpandedBlocks(new Set());
  }, [model]);

  if (!arch) return null;

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    track('model_architecture_toggled', { model, expanded: newState });
  };

  return (
    <div
      className={`rounded-lg border border-border/50 bg-muted/30 overflow-hidden transition-all ${className}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="architecture-content"
        data-testid="model-architecture-toggle"
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="9" x2="9" y2="21" />
          </svg>
          <span className="text-sm font-medium">Model Architecture</span>
          <Badge variant="outline" className="text-xs py-0">
            {arch.architectureType === 'moe' ? 'MoE' : 'Dense'}
          </Badge>
          <Badge variant="outline" className="text-xs py-0">
            {arch.attentionType === 'AlternatingSinkGQA' ? 'Sink/Full GQA' : arch.attentionType}
          </Badge>
          <Badge variant="outline" className="text-xs py-0">
            {formatParamCount(arch.totalParams)}
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <div
        id="architecture-content"
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div ref={containerRef} className="px-4 pb-4">
          <svg ref={svgRef} className="w-full" data-testid="model-architecture-svg" />
          {arch.features && arch.features.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">Features:</span>
                {arch.features.map((feature) => (
                  <Badge key={feature} variant="secondary" className="text-xs py-0">
                    {feature}
                  </Badge>
                ))}
                {arch.sourceUrl && (
                  <Link
                    href={arch.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-auto"
                    onClick={() =>
                      track('model_architecture_source_clicked', { url: arch.sourceUrl! })
                    }
                  >
                    Source <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          )}
          {arch.developer && arch.releaseDate && (
            <p className="text-xs text-muted-foreground mt-2">
              Released by {arch.developer} on{' '}
              {new Date(arch.releaseDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
