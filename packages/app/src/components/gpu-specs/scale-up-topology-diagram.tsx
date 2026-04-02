'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { track } from '@/lib/analytics';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  getScaleUpTopologyConfig,
  type GpuSpec,
  type ScaleUpTopologyConfig,
} from '@/lib/gpu-specs';

export interface ScaleUpTopologyDiagramHandle {
  openDialog: () => void;
}

/**
 * Renders D3-based scale-up topology diagrams for GPU SKUs.
 * Three layout types:
 * - Switched (H100/H200, B200/B300): NVSwitches at top, GPUs at bottom
 * - Full Mesh (MI300/MI325/MI355): GPUs in octagon, all-to-all connections
 * - Switched NVL72 (GB200/GB300): Nodes + NVSwitches
 * Expanded dialog supports left/right arrow navigation between GPU SKUs.
 */
export const ScaleUpTopologyDiagram = forwardRef<
  ScaleUpTopologyDiagramHandle,
  { spec: GpuSpec; allSpecs: GpuSpec[] }
>(function ScaleUpTopologyDiagram({ spec, allSpecs }, ref) {
  const [open, setOpen] = useState(false);
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const displayedIndexRef = useRef(0);
  displayedIndexRef.current = displayedIndex;

  // Compact view always uses own spec
  const compactConfig = getScaleUpTopologyConfig(spec);

  // Dialog uses the displayed (navigable) spec
  const displayedSpec = allSpecs[displayedIndex] ?? spec;
  const displayedConfig = getScaleUpTopologyConfig(displayedSpec);

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      const currentIdx = displayedIndexRef.current;
      const newIdx =
        direction === 'prev'
          ? currentIdx > 0
            ? currentIdx - 1
            : allSpecs.length - 1
          : currentIdx < allSpecs.length - 1
            ? currentIdx + 1
            : 0;
      setDisplayedIndex(newIdx);
      track('gpu_specs_scaleup_topology_navigated', {
        gpu: allSpecs[newIdx].name,
        direction,
      });
    },
    [allSpecs],
  );

  useImperativeHandle(ref, () => ({
    openDialog: () => {
      const idx = allSpecs.findIndex((s) => s.name === spec.name);
      setDisplayedIndex(idx >= 0 ? idx : 0);
      setOpen(true);
      track('gpu_specs_scaleup_topology_expanded', { gpu: spec.name });
    },
  }));

  // Keyboard arrow navigation when dialog is open
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, navigate]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold">{spec.name}</h4>
        <span className="text-xs text-muted-foreground">
          {spec.scaleUpTopology} &middot; {compactConfig.techName}
        </span>
      </div>
      <button
        type="button"
        className="cursor-pointer rounded-md hover:bg-muted/50 transition-colors p-1 -m-1"
        onClick={() => {
          const idx = allSpecs.findIndex((s) => s.name === spec.name);
          setDisplayedIndex(idx >= 0 ? idx : 0);
          setOpen(true);
          track('gpu_specs_scaleup_topology_expanded', { gpu: spec.name });
        }}
        aria-label={`Expand ${spec.name} scale-up topology diagram`}
      >
        <ScaleUpTopologyD3 spec={spec} config={compactConfig} compact />
        <p className="text-[10px] text-muted-foreground mt-1 text-center">Click to expand</p>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <div className="flex items-center gap-2 pr-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('prev')}
              aria-label="Previous GPU"
              data-testid="scaleup-topology-nav-prev"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <DialogHeader className="flex-1">
              <DialogTitle>{displayedSpec.name} Scale-Up Topology</DialogTitle>
              <DialogDescription>
                {displayedSpec.scaleUpBandwidth} {displayedSpec.scaleUpTopology} &middot;{' '}
                {displayedConfig.techName}
                {displayedConfig.nodeCount > 1 &&
                  ` · ${displayedConfig.nodeCount} nodes × ${displayedConfig.gpusPerNode} GPUs`}
                <span className="ml-2 opacity-60">
                  ({displayedIndex + 1} / {allSpecs.length})
                </span>
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('next')}
              aria-label="Next GPU"
              data-testid="scaleup-topology-nav-next"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <ScaleUpTopologyD3 spec={displayedSpec} config={displayedConfig} compact={false} />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium">Interconnect:</span> {displayedConfig.techName}
            </p>
            <p>
              <span className="font-medium">Bandwidth:</span> {displayedSpec.scaleUpBandwidth} per
              GPU (unidirectional)
            </p>
            <p>
              <span className="font-medium">Topology:</span> {displayedSpec.scaleUpTopology}
              {displayedConfig.switchCount > 0 && ` · ${displayedConfig.switchCount} NVSwitches`}
              {displayedConfig.type === 'mesh' &&
                ` · ${(displayedConfig.gpuCount * (displayedConfig.gpuCount - 1)) / 2} links`}
            </p>
            {displayedConfig.nodeCount > 1 && (
              <p>
                <span className="font-medium">Domain:</span> {displayedConfig.nodeCount} nodes ×{' '}
                {displayedConfig.gpusPerNode} GPUs = {displayedConfig.gpuCount} GPUs total
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

interface ScaleUpD3Props {
  spec: GpuSpec;
  config: ScaleUpTopologyConfig;
  compact: boolean;
}

function ScaleUpTopologyD3({ spec, config, compact }: ScaleUpD3Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = d3.select(containerRef.current);
    container.selectAll('*').remove();

    if (config.type === 'mesh') {
      renderMeshTopology(container, spec, config, compact);
    } else if (config.nodeCount > 1) {
      renderSwitchedNvl72Topology(container, spec, config, compact);
    } else {
      renderSwitchedTopology(container, spec, config, compact);
    }

    return () => {
      container.selectAll('*').remove();
    };
  }, [spec, config, compact]);

  return <div ref={containerRef} />;
}

// ─── Switched topology (H100/H200 4-switch, B200/B300 2-switch) ─────────────

function renderSwitchedTopology(
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>,
  spec: GpuSpec,
  config: ScaleUpTopologyConfig,
  compact: boolean,
) {
  const { gpuCount, switchCount } = config;
  const isNvidia = spec.vendor === 'nvidia';
  const vendorColor = isNvidia ? '#76b900' : '#ed1c24';
  const fontSize = compact ? '8px' : '11px';
  const smallFont = compact ? '7px' : '9px';

  const swBoxW = compact ? 52 : 72;
  const swBoxH = compact ? 20 : 28;
  const swGap = compact ? 10 : 16;

  const gpuBoxW = compact ? 36 : 50;
  const gpuBoxH = compact ? 18 : 24;
  const gpuGap = compact ? 4 : 7;

  const swRowW = switchCount * swBoxW + (switchCount - 1) * swGap;
  const gpuRowW = gpuCount * gpuBoxW + (gpuCount - 1) * gpuGap;
  const contentW = Math.max(swRowW, gpuRowW);
  const padX = compact ? 12 : 20;
  const totalW = contentW + 2 * padX;

  const topPad = compact ? 8 : 14;
  const swY = topPad;
  const gap = compact ? 40 : 60;
  const gpuY = swY + swBoxH + gap;
  const bottomPad = compact ? 12 : 18;
  const viewBoxH = gpuY + gpuBoxH + bottomPad;

  const swStartX = padX + (contentW - swRowW) / 2;
  const gpuStartX = padX + (contentW - gpuRowW) / 2;

  const swPositions = Array.from({ length: switchCount }, (_, i) => ({
    x: swStartX + i * (swBoxW + swGap),
    cx: swStartX + i * (swBoxW + swGap) + swBoxW / 2,
  }));
  const gpuPositions = Array.from({ length: gpuCount }, (_, i) => ({
    x: gpuStartX + i * (gpuBoxW + gpuGap),
    cx: gpuStartX + i * (gpuBoxW + gpuGap) + gpuBoxW / 2,
  }));

  const svg = container
    .append('svg')
    .attr('viewBox', `0 0 ${totalW} ${viewBoxH}`)
    .attr('class', compact ? 'w-full max-w-[500px]' : 'w-full min-w-[600px]')
    .attr('role', 'img')
    .attr('aria-label', `${spec.name} ${spec.scaleUpTopology} scale-up topology diagram`);

  // Add background logo watermark
  const patternId = `logo-scaleup-sw-${spec.name.replace(/\s+/g, '-')}-${compact ? 'c' : 'e'}`;
  svg
    .append('defs')
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', totalW)
    .attr('height', viewBoxH)
    .append('image')
    .attr('href', '/brand/logo-color.webp')
    .attr('width', totalW * 0.3)
    .attr('height', viewBoxH * 0.3)
    .attr('x', (totalW - totalW * 0.3) / 2)
    .attr('y', (viewBoxH - viewBoxH * 0.3) / 2)
    .attr('opacity', 0.1);

  svg
    .insert('rect', ':first-child')
    .attr('width', totalW)
    .attr('height', viewBoxH)
    .attr('fill', `url(#${patternId})`);

  // Connections: each GPU → each NVSwitch
  const conns = svg.append('g').attr('class', 'connections');
  for (const gpu of gpuPositions) {
    for (const sw of swPositions) {
      conns
        .append('line')
        .attr('x1', gpu.cx)
        .attr('y1', gpuY)
        .attr('x2', sw.cx)
        .attr('y2', swY + swBoxH)
        .attr('stroke', vendorColor)
        .attr('stroke-opacity', 0.2)
        .attr('stroke-width', compact ? 0.75 : 1);
    }
  }

  // NVSwitch boxes
  const swGroup = svg.append('g').attr('class', 'nvswitches');
  for (let i = 0; i < switchCount; i++) {
    const pos = swPositions[i];
    const g = swGroup.append('g');
    g.append('rect')
      .attr('x', pos.x)
      .attr('y', swY)
      .attr('width', swBoxW)
      .attr('height', swBoxH)
      .attr('rx', 4)
      .attr('class', 'fill-purple-500/10 stroke-purple-500/50')
      .attr('stroke-width', 1);
    g.append('text')
      .attr('x', pos.cx)
      .attr('y', swY + swBoxH / 2 + (compact ? 3 : 4))
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-purple-400 font-medium')
      .style('font-size', fontSize)
      .text(`NVSwitch ${i}`);
  }

  // GPU boxes
  const gpuGroup = svg.append('g').attr('class', 'gpus');
  for (let i = 0; i < gpuCount; i++) {
    const pos = gpuPositions[i];
    const g = gpuGroup.append('g');
    g.append('rect')
      .attr('x', pos.x)
      .attr('y', gpuY)
      .attr('width', gpuBoxW)
      .attr('height', gpuBoxH)
      .attr('rx', 4)
      .attr('fill', vendorColor)
      .attr('fill-opacity', 0.15)
      .attr('stroke', vendorColor)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5);
    g.append('text')
      .attr('x', pos.cx)
      .attr('y', gpuY + gpuBoxH / 2 + (compact ? 3 : 4))
      .attr('text-anchor', 'middle')
      .attr('class', 'font-medium')
      .style('font-size', fontSize)
      .attr('fill', vendorColor)
      .text(`GPU ${i}`);
  }

  // Subtitle label
  if (!compact) {
    svg
      .append('text')
      .attr('x', totalW / 2)
      .attr('y', viewBoxH - 4)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-muted-foreground')
      .style('font-size', smallFont)
      .html(
        `${spec.scaleUpBandwidth} &middot; ${switchCount} NVSwitches &middot; ${spec.scaleUpTopology}`,
      );
  }
}

// ─── Full Mesh topology (MI300/MI325/MI355) ──────────────────────────────────

function renderMeshTopology(
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>,
  spec: GpuSpec,
  config: ScaleUpTopologyConfig,
  compact: boolean,
) {
  const { gpuCount } = config;
  const vendorColor = '#ed1c24'; // AMD red
  const fontSize = compact ? '8px' : '11px';
  const smallFont = compact ? '7px' : '9px';

  const gpuBoxW = compact ? 38 : 52;
  const gpuBoxH = compact ? 18 : 24;

  const radius = compact ? 70 : 110;
  const cx = radius + gpuBoxW / 2 + (compact ? 10 : 16);
  const cy = radius + gpuBoxH / 2 + (compact ? 10 : 16);
  const totalW = cx * 2;
  const totalH = cy * 2;

  // Place GPUs in octagon: start from top-right, clockwise
  const gpuPositions = Array.from({ length: gpuCount }, (_, i) => {
    const angle = (-3 * Math.PI) / 8 + (i * 2 * Math.PI) / gpuCount;
    return {
      x: cx + radius * Math.cos(angle) - gpuBoxW / 2,
      y: cy + radius * Math.sin(angle) - gpuBoxH / 2,
      cx: cx + radius * Math.cos(angle),
      cy: cy + radius * Math.sin(angle),
    };
  });

  // All pairs for full mesh connections
  const pairs: [number, number][] = [];
  for (let i = 0; i < gpuCount; i++) {
    for (let j = i + 1; j < gpuCount; j++) {
      pairs.push([i, j]);
    }
  }

  const svg = container
    .append('svg')
    .attr('viewBox', `0 0 ${totalW} ${totalH}`)
    .attr(
      'class',
      compact ? 'w-full max-w-[300px] mx-auto' : 'w-full max-w-[400px] mx-auto min-w-[350px]',
    )
    .attr('role', 'img')
    .attr('aria-label', `${spec.name} ${spec.scaleUpTopology} scale-up topology diagram`);

  // Add background logo watermark
  const patternId = `logo-scaleup-mesh-${spec.name.replace(/\s+/g, '-')}-${compact ? 'c' : 'e'}`;
  svg
    .append('defs')
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', totalW)
    .attr('height', totalH)
    .append('image')
    .attr('href', '/brand/logo-color.webp')
    .attr('width', totalW * 0.3)
    .attr('height', totalH * 0.3)
    .attr('x', (totalW - totalW * 0.3) / 2)
    .attr('y', (totalH - totalH * 0.3) / 2)
    .attr('opacity', 0.1);

  svg
    .insert('rect', ':first-child')
    .attr('width', totalW)
    .attr('height', totalH)
    .attr('fill', `url(#${patternId})`);

  // Mesh connections
  const meshConns = svg.append('g').attr('class', 'mesh-connections');
  for (const [i, j] of pairs) {
    meshConns
      .append('line')
      .attr('x1', gpuPositions[i].cx)
      .attr('y1', gpuPositions[i].cy)
      .attr('x2', gpuPositions[j].cx)
      .attr('y2', gpuPositions[j].cy)
      .attr('stroke', vendorColor)
      .attr('stroke-opacity', 0.2)
      .attr('stroke-width', compact ? 1 : 1.5);
  }

  // GPU boxes — opaque background rect hides mesh lines behind GPU boxes
  const gpuGroup = svg.append('g').attr('class', 'gpus');
  for (let i = 0; i < gpuCount; i++) {
    const pos = gpuPositions[i];
    const g = gpuGroup.append('g');
    // Opaque background to cover mesh lines
    g.append('rect')
      .attr('x', pos.x)
      .attr('y', pos.y)
      .attr('width', gpuBoxW)
      .attr('height', gpuBoxH)
      .attr('rx', 4)
      .style('fill', 'var(--card)');
    // Colored overlay
    g.append('rect')
      .attr('x', pos.x)
      .attr('y', pos.y)
      .attr('width', gpuBoxW)
      .attr('height', gpuBoxH)
      .attr('rx', 4)
      .attr('fill', vendorColor)
      .attr('fill-opacity', 0.15)
      .attr('stroke', vendorColor)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5);
    g.append('text')
      .attr('x', pos.cx)
      .attr('y', pos.cy + (compact ? 3 : 4))
      .attr('text-anchor', 'middle')
      .attr('class', 'font-medium')
      .style('font-size', fontSize)
      .attr('fill', vendorColor)
      .text(`GPU ${i}`);
  }

  // Center label
  if (!compact) {
    svg
      .append('text')
      .attr('x', cx)
      .attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('class', 'fill-muted-foreground')
      .style('font-size', smallFont)
      .text(spec.scaleUpBandwidth);
  }
}

// ─── Switched NVL72 topology (GB200/GB300) ───────────────────────────────────

function renderSwitchedNvl72Topology(
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>,
  spec: GpuSpec,
  config: ScaleUpTopologyConfig,
  compact: boolean,
) {
  const { switchCount, gpusPerNode, nodeCount } = config;
  const vendorColor = '#76b900'; // NVIDIA green
  const fontSize = compact ? '8px' : '10px';
  const smallFont = compact ? '7px' : '9px';

  // Node 1 detail
  const gpuBoxW = compact ? 30 : 42;
  const gpuBoxH = compact ? 16 : 22;
  const gpuGap = compact ? 4 : 8;
  const nodePad = compact ? 6 : 10;
  const nodeLabelH = compact ? 10 : 14;
  const gpuRowW = gpusPerNode * gpuBoxW + (gpusPerNode - 1) * gpuGap;
  const node1W = gpuRowW + 2 * nodePad;
  const node1H = gpuBoxH + nodeLabelH + 2 * nodePad;

  // Abstracted nodes
  const absBoxW = compact ? 20 : 32;
  const absBoxH = node1H;
  const absGap = compact ? 4 : 6;
  const dotsW = compact ? 14 : 22;
  const absAreaW = 2 * absBoxW + absGap + dotsW + absGap;

  // NVSwitch row - show: [0] [1] ... [17]
  const swBoxW = compact ? 42 : 58;
  const swBoxH = compact ? 16 : 22;
  const swGap = compact ? 4 : 6;
  const swDotsW = compact ? 14 : 22;
  const swRowW = 3 * swBoxW + 2 * swGap + swDotsW + swGap;

  const nodeGap = compact ? 8 : 14;
  const nodeAreaW = node1W + nodeGap + absAreaW;
  const contentW = Math.max(nodeAreaW, swRowW);
  const padX = compact ? 10 : 18;
  const totalW = contentW + 2 * padX;

  const topPad = compact ? 8 : 14;
  const nodeY = topPad;
  const vertGap = compact ? 32 : 48;
  const swY = nodeY + node1H + vertGap;
  const bottomPad = compact ? 14 : 20;
  const viewBoxH = swY + swBoxH + bottomPad;

  // Node 1 position
  const nodeAreaStartX = padX + (contentW - nodeAreaW) / 2;
  const node1X = nodeAreaStartX;
  const gpuRowX = node1X + nodePad;
  const gpuY = nodeY + nodeLabelH + nodePad;

  const gpuPositions = Array.from({ length: gpusPerNode }, (_, i) => ({
    x: gpuRowX + i * (gpuBoxW + gpuGap),
    cx: gpuRowX + i * (gpuBoxW + gpuGap) + gpuBoxW / 2,
  }));

  // Abstracted nodes
  const absStartX = node1X + node1W + nodeGap;
  const abs2X = absStartX;
  const absDotsX = abs2X + absBoxW + absGap + dotsW / 2;
  const abs18X = absStartX + absBoxW + absGap + dotsW + absGap;

  // NVSwitch positions
  const swStartX = padX + (contentW - swRowW) / 2;
  const sw1X = swStartX;
  const sw2X = sw1X + swBoxW + swGap;
  const swDotsX = sw2X + swBoxW + swGap + swDotsW / 2;
  const sw18X = sw2X + swBoxW + swGap + swDotsW + swGap;
  const swCenters = [sw1X + swBoxW / 2, sw2X + swBoxW / 2, sw18X + swBoxW / 2];

  const svg = container
    .append('svg')
    .attr('viewBox', `0 0 ${totalW} ${viewBoxH}`)
    .attr('class', compact ? 'w-full max-w-[500px]' : 'w-full min-w-[550px]')
    .attr('role', 'img')
    .attr('aria-label', `${spec.name} ${spec.scaleUpTopology} scale-up topology diagram`);

  // Add background logo watermark
  const patternId = `logo-scaleup-nvl72-${spec.name.replace(/\s+/g, '-')}-${compact ? 'c' : 'e'}`;
  svg
    .append('defs')
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', totalW)
    .attr('height', viewBoxH)
    .append('image')
    .attr('href', '/brand/logo-color.webp')
    .attr('width', totalW * 0.3)
    .attr('height', viewBoxH * 0.3)
    .attr('x', (totalW - totalW * 0.3) / 2)
    .attr('y', (viewBoxH - viewBoxH * 0.3) / 2)
    .attr('opacity', 0.1);

  svg
    .insert('rect', ':first-child')
    .attr('width', totalW)
    .attr('height', viewBoxH)
    .attr('fill', `url(#${patternId})`);

  // Connections: each GPU → each visible NVSwitch
  const gpuSwConns = svg.append('g').attr('class', 'gpu-switch-connections');
  for (const gpu of gpuPositions) {
    for (const swCx of swCenters) {
      gpuSwConns
        .append('line')
        .attr('x1', gpu.cx)
        .attr('y1', gpuY + gpuBoxH)
        .attr('x2', swCx)
        .attr('y2', swY)
        .attr('stroke', vendorColor)
        .attr('stroke-opacity', 0.15)
        .attr('stroke-width', compact ? 0.75 : 1);
    }
  }

  // Abstracted nodes → NVSwitches (dashed)
  const absSwConns = svg.append('g').attr('class', 'abs-switch-connections');
  const absNodeCenters = [abs2X + absBoxW / 2, abs18X + absBoxW / 2];
  for (const nx of absNodeCenters) {
    for (const swCx of swCenters) {
      absSwConns
        .append('line')
        .attr('x1', nx)
        .attr('y1', nodeY + absBoxH)
        .attr('x2', swCx)
        .attr('y2', swY)
        .attr('class', 'stroke-muted-foreground/10')
        .attr('stroke-width', compact ? 0.5 : 0.75)
        .attr('stroke-dasharray', '3 2');
    }
  }

  // Node 1 boundary
  svg
    .append('rect')
    .attr('x', node1X)
    .attr('y', nodeY)
    .attr('width', node1W)
    .attr('height', node1H)
    .attr('rx', 6)
    .attr('class', 'fill-amber-500/5 stroke-amber-500/40')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4 2');
  svg
    .append('text')
    .attr('x', node1X + nodePad)
    .attr('y', nodeY + nodeLabelH - 2)
    .attr('class', 'fill-amber-500/70')
    .style('font-size', smallFont)
    .style('font-weight', '500')
    .text('Node 0');

  // GPU boxes inside Node 1
  const gpuGroup = svg.append('g').attr('class', 'gpus');
  for (let i = 0; i < gpusPerNode; i++) {
    const pos = gpuPositions[i];
    const g = gpuGroup.append('g');
    g.append('rect')
      .attr('x', pos.x)
      .attr('y', gpuY)
      .attr('width', gpuBoxW)
      .attr('height', gpuBoxH)
      .attr('rx', 4)
      .attr('fill', vendorColor)
      .attr('fill-opacity', 0.15)
      .attr('stroke', vendorColor)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5);
    g.append('text')
      .attr('x', pos.cx)
      .attr('y', gpuY + gpuBoxH / 2 + (compact ? 3 : 4))
      .attr('text-anchor', 'middle')
      .attr('class', 'font-medium')
      .style('font-size', fontSize)
      .attr('fill', vendorColor)
      .text(`GPU ${i}`);
  }

  // Abstracted node boxes
  const absGroup = svg.append('g').attr('class', 'abstracted-nodes');

  // Node 2
  absGroup
    .append('rect')
    .attr('x', abs2X)
    .attr('y', nodeY)
    .attr('width', absBoxW)
    .attr('height', absBoxH)
    .attr('rx', 4)
    .attr('class', 'fill-muted/30 stroke-muted-foreground/20')
    .attr('stroke-width', 1);
  absGroup
    .append('text')
    .attr('x', abs2X + absBoxW / 2)
    .attr('y', nodeY + absBoxH / 2 + 3)
    .attr('text-anchor', 'middle')
    .attr('class', 'fill-muted-foreground')
    .style('font-size', smallFont)
    .text('1');

  // Dots
  absGroup
    .append('text')
    .attr('x', absDotsX)
    .attr('y', nodeY + absBoxH / 2 + 3)
    .attr('text-anchor', 'middle')
    .attr('class', 'fill-muted-foreground/60')
    .style('font-size', fontSize)
    .html('&bull;&bull;&bull;');

  // Node N-1 (0-indexed, so last node is nodeCount - 1)
  absGroup
    .append('rect')
    .attr('x', abs18X)
    .attr('y', nodeY)
    .attr('width', absBoxW)
    .attr('height', absBoxH)
    .attr('rx', 4)
    .attr('class', 'fill-muted/30 stroke-muted-foreground/20')
    .attr('stroke-width', 1);
  absGroup
    .append('text')
    .attr('x', abs18X + absBoxW / 2)
    .attr('y', nodeY + absBoxH / 2 + 3)
    .attr('text-anchor', 'middle')
    .attr('class', 'fill-muted-foreground')
    .style('font-size', smallFont)
    .text(`${nodeCount - 1}`);

  // NVSwitch boxes
  const swGroup = svg.append('g').attr('class', 'nvswitches');
  const switchItems = [
    { x: sw1X, label: 'NVSwitch 0' },
    { x: sw2X, label: 'NVSwitch 1' },
    { x: sw18X, label: `NVSwitch ${switchCount - 1}` },
  ];

  for (const sw of switchItems) {
    const g = swGroup.append('g');
    g.append('rect')
      .attr('x', sw.x)
      .attr('y', swY)
      .attr('width', swBoxW)
      .attr('height', swBoxH)
      .attr('rx', 4)
      .attr('class', 'fill-purple-500/10 stroke-purple-500/50')
      .attr('stroke-width', 1);
    g.append('text')
      .attr('x', sw.x + swBoxW / 2)
      .attr('y', swY + swBoxH / 2 + (compact ? 3 : 4))
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-purple-400 font-medium')
      .style('font-size', smallFont)
      .text(sw.label);
  }

  // Dots between NVSwitches
  svg
    .append('text')
    .attr('x', swDotsX)
    .attr('y', swY + swBoxH / 2 + 3)
    .attr('text-anchor', 'middle')
    .attr('class', 'fill-muted-foreground/60')
    .style('font-size', fontSize)
    .html('&bull;&bull;&bull;');

  // Label
  if (!compact) {
    svg
      .append('text')
      .attr('x', totalW / 2)
      .attr('y', viewBoxH - 4)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-muted-foreground')
      .style('font-size', smallFont)
      .html(
        `${spec.scaleUpBandwidth} &middot; ${switchCount} NVSwitches &middot; ${nodeCount} nodes &times; ${gpusPerNode} GPUs`,
      );
  }
}
