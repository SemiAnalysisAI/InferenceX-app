'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';
import { isUnofficialHostname } from '@/lib/runtime/unofficial-domain';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  formatScaleOutTopology,
  getScaleOutExpandAriaLabel,
  getTopologyConfig,
  type GpuSpec,
} from '@/lib/catalog/gpu-specs';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    expandHint: 'Click to expand',
    previous: 'Previous Chip',
    next: 'Next Chip',
    title: 'Scale-Out Topology',
    diagram: 'scale-out topology diagram',
    leafSwitch: 'Leaf switch:',
    spineSwitch: 'Spine switch:',
    server: 'Server',
    servers: 'servers',
    chip: 'Chip',
    pod: 'Pod',
    railPod: 'Rail Pod',
    spine: 'Spine',
    leaf: 'Leaf',
  },
  zh: {
    expandHint: '点击展开',
    previous: '上一款芯片',
    next: '下一款芯片',
    title: '横向扩展拓扑',
    diagram: '横向扩展拓扑图',
    leafSwitch: 'Leaf 交换机：',
    spineSwitch: 'Spine 交换机：',
    server: '服务器',
    servers: '台服务器',
    chip: '芯片',
    pod: 'Pod',
    railPod: 'Rail Pod',
    spine: 'Spine',
    leaf: 'Leaf',
  },
} as const;

export interface TopologyDiagramHandle {
  openDialog: () => void;
}

export const TopologyDiagram = forwardRef<
  TopologyDiagramHandle,
  { spec: GpuSpec; allSpecs: GpuSpec[] }
>(({ spec, allSpecs }, ref) => {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [open, setOpen] = useState(false);
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const displayedIndexRef = useRef(0);
  displayedIndexRef.current = displayedIndex;

  const compactConfig = getTopologyConfig(spec);

  const displayedSpec = allSpecs[displayedIndex] ?? spec;
  useDialogCloseTracking(open, 'gpu_specs_topology_closed', { gpu: displayedSpec.name });
  const displayedConfig = getTopologyConfig(displayedSpec);

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
      track('gpu_specs_topology_navigated', {
        gpu: allSpecs[newIdx].name,
        direction,
      });
    },
    [allSpecs],
  );

  useImperativeHandle(ref, () => ({
    openDialog: () => {
      const idx = allSpecs.findIndex((s) => s.name === spec.name);
      setDisplayedIndex(Math.max(idx, 0));
      setOpen(true);
      track('gpu_specs_topology_expanded', { gpu: spec.name });
    },
  }));

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

  if (!compactConfig) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold">{spec.name}</h4>
        <span className="text-xs text-muted-foreground">
          {formatScaleOutTopology(spec.scaleOutTopology!, locale)} &middot;{' '}
          {compactConfig.networkTech}
        </span>
      </div>
      <button
        type="button"
        className="cursor-pointer rounded-md hover:bg-muted/50 transition-colors p-1 -m-1"
        onClick={() => {
          const idx = allSpecs.findIndex((s) => s.name === spec.name);
          setDisplayedIndex(Math.max(idx, 0));
          setOpen(true);
          track('gpu_specs_topology_expanded', { gpu: spec.name });
        }}
        aria-label={getScaleOutExpandAriaLabel(spec.name, locale)}
      >
        <TopologyD3 spec={spec} config={compactConfig} compact locale={locale} />
        <p className="text-3xs text-muted-foreground mt-1 text-center">{t.expandHint}</p>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <div className="flex items-center gap-2 pr-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('prev')}
              aria-label={t.previous}
              data-testid="topology-nav-prev"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <DialogHeader className="flex-1">
              <DialogTitle>
                {displayedSpec.name} {t.title}
              </DialogTitle>
              <DialogDescription>
                {formatScaleOutTopology(displayedSpec.scaleOutTopology!, locale)} &middot;{' '}
                {displayedConfig?.networkTech}
                <span className="ml-2 opacity-60">
                  ({displayedIndex + 1} / {allSpecs.length})
                </span>
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('next')}
              aria-label={t.next}
              data-testid="topology-nav-next"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
          {displayedConfig && (
            <>
              <div className="overflow-x-auto">
                <TopologyD3
                  spec={displayedSpec}
                  config={displayedConfig}
                  compact={false}
                  locale={locale}
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">{t.leafSwitch}</span> {displayedConfig.switchLabel}
                </p>
                <p>
                  <span className="font-medium">{t.spineSwitch}</span> {displayedConfig.spineLabel}
                </p>
                <p>
                  <span className="font-medium">NIC:</span> {displayedConfig.nicLabel}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

function abbreviateNic(nic: string): [string, string] {
  const parts = nic.replace('ConnectX-', 'CX-').split(/\s+/u);
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join(' ')];
  }
  return [nic, ''];
}

function isDualPortNic(nic: string): boolean {
  return /\b2x\d+/u.test(nic);
}

function abbreviateSwitch(sw: string): string {
  return sw
    .replace(/^\d+\.?\d*T\s*/u, '')
    .replace('Arista Tomahawk4 ', 'TH4 ')
    .replace('Arista Tomahawk5 ', 'TH5 ')
    .replace('NVIDIA Quantum-2 ', 'Q-2 ')
    .replace('NVIDIA Spectrum-X ', 'SX ')
    .replace('Whitebox Leaf Tomahawk3', 'TH3')
    .replace('Whitebox Tomahawk4', 'TH4')
    .replace('Tomahawk5', 'TH5');
}

interface TopologyD3Props {
  spec: GpuSpec;
  config: NonNullable<ReturnType<typeof getTopologyConfig>>;
  compact: boolean;
  locale: 'en' | 'zh';
}

function TopologyD3({ spec, config, compact, locale }: TopologyD3Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = STRINGS[locale];

  useEffect(() => {
    if (!containerRef.current) return;

    const { railCount, gpuCount, nicCount, nicToLeaf, spineCount, serversPerPod, podCount } =
      config;

    const isNvidia = spec.vendor === 'nvidia';
    const vendorColor = isNvidia ? '#76b900' : '#ed1c24';

    const fontSize = compact ? '8px' : '10px';
    const smallFontSize = compact ? '7px' : '9px';
    const labelFontSize = compact ? '7px' : '9px';

    const [nicLine1, nicLine2] = abbreviateNic(config.nicLabel);
    const dualPort = isDualPortNic(config.nicLabel);
    const leafShort = abbreviateSwitch(config.switchLabel);
    const spineShort = abbreviateSwitch(config.spineLabel);

    const gpuBoxW = compact ? 36 : 50;
    const gpuBoxH = compact ? 16 : 22;
    const gpuGap = compact ? 3 : 6;

    const nicBoxW = compact ? 36 : 50;
    const nicBoxH = compact ? 22 : 30;
    const nicGap = compact ? 3 : 6;

    const leafBoxW = compact ? 42 : 56;
    const leafBoxH = compact ? 20 : 26;
    const leafGap = railCount <= 4 ? (compact ? 14 : 20) : compact ? 5 : 8;

    const spineBoxW = compact ? 42 : 56;
    const spineBoxH = compact ? 20 : 26;
    const spineGap = compact ? 10 : 14;

    const absBoxW = compact ? 18 : 30;
    const absBoxGap = compact ? 3 : 6;

    const absPodW = compact ? 30 : 50;
    const absPodGap = compact ? 6 : 10;

    const s1Pad = compact ? 4 : 8;
    const gpuRowW = gpuCount * gpuBoxW + (gpuCount - 1) * gpuGap;
    const nicRowW = nicCount * nicBoxW + (nicCount - 1) * nicGap;
    const s1ContentW = Math.max(gpuRowW, nicRowW);
    const s1W = s1ContentW + 2 * s1Pad;
    const nicGpuVertGap = compact ? 6 : 10;
    const s1LabelH = compact ? 10 : 14;
    const s1ContentH = nicBoxH + nicGpuVertGap + gpuBoxH;
    const s1H = s1ContentH + 2 * s1Pad + s1LabelH;

    const showAllAbstracted = serversPerPod <= 5;
    const abstractedNums = showAllAbstracted
      ? Array.from({ length: serversPerPod - 1 }, (_, i) => i + 2)
      : [2, serversPerPod];
    const dotsW = showAllAbstracted ? 0 : compact ? 14 : 22;
    const absAreaW =
      abstractedNums.length * absBoxW + Math.max(0, abstractedNums.length - 1) * absBoxGap + dotsW;
    const absBoxH2 = s1H;

    const leafTotalW = railCount * leafBoxW + (railCount - 1) * leafGap;

    const serverGap = compact ? 6 : 12;
    const serverAreaW = s1W + serverGap + absAreaW;

    const podPad = compact ? 6 : 10;
    const podLabelH = compact ? 12 : 16;
    const leafServerGap = compact ? 14 : 22;
    const pod1ContentW = Math.max(leafTotalW, serverAreaW);
    const pod1InnerH = leafBoxH + leafServerGap + s1H;
    const pod1W = pod1ContentW + 2 * podPad;
    const pod1H = podLabelH + 2 * podPad + pod1InnerH;

    const extraPods = podCount - 1;
    const absPodH = pod1H;
    const extraPodsW = extraPods > 0 ? extraPods * absPodW + (extraPods - 1) * absPodGap : 0;
    const allPodsW = pod1W + (extraPods > 0 ? absPodGap + extraPodsW : 0);

    const spineTotalW = spineCount * spineBoxW + (spineCount - 1) * spineGap;

    const contentW = Math.max(allPodsW, spineTotalW);
    const totalW = contentW + (compact ? 16 : 30);

    const topPad = compact ? 10 : 18;
    const spineY = topPad;
    const spinePodGap = compact ? 24 : 36;
    const podY = spineY + spineBoxH + spinePodGap;

    const leafY = podY + podLabelH + podPad;
    const serverAreaY = leafY + leafBoxH + leafServerGap;

    const viewBoxH = podY + pod1H + (compact ? 14 : 22);

    const spineStartX = (totalW - spineTotalW) / 2;
    const allPodsStartX = (totalW - allPodsW) / 2;
    const pod1X = allPodsStartX;

    const leafStartX = pod1X + podPad + (pod1ContentW - leafTotalW) / 2;

    const serverAreaStartX = pod1X + podPad + (pod1ContentW - serverAreaW) / 2;
    const s1X = serverAreaStartX;
    const s1Y = serverAreaY;

    const gpuRowX = s1X + s1Pad + (s1ContentW - gpuRowW) / 2;
    const nicRowX = s1X + s1Pad + (s1ContentW - nicRowW) / 2;
    const nicY = s1Y + s1LabelH + s1Pad;
    const gpuY = nicY + nicBoxH + nicGpuVertGap;

    const spinePositions = Array.from({ length: spineCount }, (_, i) => ({
      x: spineStartX + i * (spineBoxW + spineGap),
      cx: spineStartX + i * (spineBoxW + spineGap) + spineBoxW / 2,
    }));

    const leafPositions = Array.from({ length: railCount }, (_, i) => ({
      x: leafStartX + i * (leafBoxW + leafGap),
      cx: leafStartX + i * (leafBoxW + leafGap) + leafBoxW / 2,
    }));

    const gpuPositions = Array.from({ length: gpuCount }, (_, i) => ({
      x: gpuRowX + i * (gpuBoxW + gpuGap),
      cx: gpuRowX + i * (gpuBoxW + gpuGap) + gpuBoxW / 2,
    }));

    const nicPositions = Array.from({ length: nicCount }, (_, i) => ({
      x: nicRowX + i * (nicBoxW + nicGap),
      cx: nicRowX + i * (nicBoxW + nicGap) + nicBoxW / 2,
    }));

    const absStartX = s1X + s1W + serverGap;
    const absY = s1Y;
    const absServerItems: { x: number; label: string }[] = [];
    let dotsX: number | null = null;
    let curX = absStartX;

    if (showAllAbstracted) {
      for (const num of abstractedNums) {
        absServerItems.push({ x: curX, label: `${num}` });
        curX += absBoxW + absBoxGap;
      }
    } else {
      absServerItems.push({ x: curX, label: '2' });
      curX += absBoxW + absBoxGap;
      dotsX = curX + dotsW / 2;
      curX += dotsW + absBoxGap;
      absServerItems.push({ x: curX, label: `${serversPerPod}` });
    }

    const extraPodPositions = Array.from({ length: extraPods }, (_, i) => ({
      x: pod1X + pod1W + absPodGap + i * (absPodW + absPodGap),
    }));

    const container = d3.select(containerRef.current);
    container.selectAll('*').remove();

    const svg = container
      .append('svg')
      .attr('viewBox', `0 0 ${totalW} ${viewBoxH}`)
      .attr('class', compact ? 'w-full max-w-[600px]' : 'w-full min-w-[700px]')
      .attr('role', 'img')
      .attr(
        'aria-label',
        `${spec.name} ${formatScaleOutTopology(spec.scaleOutTopology!, locale)} ${t.diagram}`,
      );

    if (!isUnofficialHostname(window.location.hostname)) {
      const patternId = `logo-scaleout-${spec.name.replaceAll(/\s+/gu, '-')}-${compact ? 'c' : 'e'}`;
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
    }

    const leafSpineConns = svg.append('g').attr('class', 'leaf-spine-connections');
    for (const leaf of leafPositions) {
      for (const spine of spinePositions) {
        leafSpineConns
          .append('line')
          .attr('x1', leaf.cx)
          .attr('y1', leafY)
          .attr('x2', spine.cx)
          .attr('y2', spineY + spineBoxH)
          .attr('class', 'stroke-muted-foreground/15')
          .attr('stroke-width', compact ? 0.5 : 0.75);
      }
    }

    const podSpineConns = svg.append('g').attr('class', 'pod-spine-connections');
    for (const pod of extraPodPositions) {
      for (const spine of spinePositions) {
        podSpineConns
          .append('line')
          .attr('x1', pod.x + absPodW / 2)
          .attr('y1', podY)
          .attr('x2', spine.cx)
          .attr('y2', spineY + spineBoxH)
          .attr('class', 'stroke-muted-foreground/10')
          .attr('stroke-width', compact ? 0.5 : 0.75)
          .attr('stroke-dasharray', '3 2');
      }
    }

    const nicLeafConns = svg.append('g').attr('class', 'nic-leaf-connections');
    const lineOffset = dualPort ? (compact ? 1.5 : 2.5) : 0;
    nicToLeaf.forEach((leafIdx, nicIdx) => {
      if (dualPort) {
        nicLeafConns
          .append('line')
          .attr('x1', nicPositions[nicIdx].cx - lineOffset)
          .attr('y1', nicY)
          .attr('x2', leafPositions[leafIdx].cx - lineOffset)
          .attr('y2', leafY + leafBoxH)
          .attr('class', 'stroke-muted-foreground/25')
          .attr('stroke-width', compact ? 0.75 : 1);
        nicLeafConns
          .append('line')
          .attr('x1', nicPositions[nicIdx].cx + lineOffset)
          .attr('y1', nicY)
          .attr('x2', leafPositions[leafIdx].cx + lineOffset)
          .attr('y2', leafY + leafBoxH)
          .attr('class', 'stroke-muted-foreground/25')
          .attr('stroke-width', compact ? 0.75 : 1);
      } else {
        nicLeafConns
          .append('line')
          .attr('x1', nicPositions[nicIdx].cx)
          .attr('y1', nicY)
          .attr('x2', leafPositions[leafIdx].cx)
          .attr('y2', leafY + leafBoxH)
          .attr('class', 'stroke-muted-foreground/25')
          .attr('stroke-width', compact ? 0.75 : 1);
      }
    });

    const gpuNicConns = svg.append('g').attr('class', 'gpu-nic-connections');
    for (let i = 0; i < gpuCount; i++) {
      gpuNicConns
        .append('line')
        .attr('x1', gpuPositions[i].cx)
        .attr('y1', gpuY)
        .attr('x2', nicPositions[i].cx)
        .attr('y2', nicY + nicBoxH)
        .attr('class', 'stroke-muted-foreground/25')
        .attr('stroke-width', compact ? 0.75 : 1);
    }

    const absLeafConns = svg.append('g').attr('class', 'abs-leaf-connections');
    for (const srv of absServerItems) {
      for (const leaf of leafPositions) {
        absLeafConns
          .append('line')
          .attr('x1', srv.x + absBoxW / 2)
          .attr('y1', absY)
          .attr('x2', leaf.cx)
          .attr('y2', leafY + leafBoxH)
          .attr('class', 'stroke-muted-foreground/8')
          .attr('stroke-width', compact ? 0.5 : 0.75)
          .attr('stroke-dasharray', '3 2');
      }
    }

    const spineGroup = svg.append('g').attr('class', 'spine-switches');
    for (let i = 0; i < spineCount; i++) {
      const pos = spinePositions[i];
      const g = spineGroup.append('g');
      g.append('rect')
        .attr('x', pos.x)
        .attr('y', spineY)
        .attr('width', spineBoxW)
        .attr('height', spineBoxH)
        .attr('rx', 4)
        .attr('class', 'fill-purple-500/10 stroke-purple-500/50')
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', pos.cx)
        .attr('y', spineY + spineBoxH / 2 + (compact ? 3 : 4))
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-purple-400 font-medium')
        .style('font-size', fontSize)
        .text(`S${i}`);
    }

    svg
      .append('rect')
      .attr('x', pod1X)
      .attr('y', podY)
      .attr('width', pod1W)
      .attr('height', pod1H)
      .attr('rx', 8)
      .attr('class', 'fill-green-500/5 stroke-green-500/30')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 2');
    svg
      .append('text')
      .attr('x', pod1X + podPad)
      .attr('y', podY + podLabelH - 2)
      .attr('class', 'fill-green-500/70')
      .style('font-size', labelFontSize)
      .style('font-weight', '500')
      .text(`${podCount > 1 ? `${t.pod} 1` : t.railPod} (${serversPerPod} ${t.servers})`);

    const leafGroup = svg.append('g').attr('class', 'leaf-switches');
    for (let i = 0; i < railCount; i++) {
      const pos = leafPositions[i];
      const g = leafGroup.append('g');
      g.append('rect')
        .attr('x', pos.x)
        .attr('y', leafY)
        .attr('width', leafBoxW)
        .attr('height', leafBoxH)
        .attr('rx', 4)
        .attr('class', 'fill-amber-500/10 stroke-amber-500/50')
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', pos.cx)
        .attr('y', leafY + leafBoxH / 2 + (compact ? 3 : 4))
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-amber-400 font-medium')
        .style('font-size', fontSize)
        .text(`L${i}`);
    }

    svg
      .append('rect')
      .attr('x', s1X)
      .attr('y', s1Y)
      .attr('width', s1W)
      .attr('height', s1H)
      .attr('rx', 6)
      .attr('class', 'fill-none stroke-border')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 2');
    svg
      .append('text')
      .attr('x', s1X + s1Pad)
      .attr('y', s1Y + s1LabelH - 2)
      .attr('class', 'fill-muted-foreground')
      .style('font-size', labelFontSize)
      .text(`${t.server} 1`);

    const nicGroup = svg.append('g').attr('class', 'nics');
    for (let i = 0; i < nicCount; i++) {
      const pos = nicPositions[i];
      const g = nicGroup.append('g');
      g.append('rect')
        .attr('x', pos.x)
        .attr('y', nicY)
        .attr('width', nicBoxW)
        .attr('height', nicBoxH)
        .attr('rx', 3)
        .attr('class', 'fill-blue-500/10 stroke-blue-500/50')
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', pos.cx)
        .attr('y', nicY + nicBoxH / 2 - (compact ? 2 : 3))
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-blue-400')
        .style('font-size', smallFontSize)
        .text(nicLine1);
      g.append('text')
        .attr('x', pos.cx)
        .attr('y', nicY + nicBoxH / 2 + (compact ? 6 : 8))
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-blue-400')
        .style('font-size', smallFontSize)
        .text(nicLine2);
    }

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
        .text(`${t.chip} ${i}`);
    }

    const absGroup = svg.append('g').attr('class', 'abstracted-servers');
    for (const srv of absServerItems) {
      const g = absGroup.append('g');
      g.append('rect')
        .attr('x', srv.x)
        .attr('y', absY)
        .attr('width', absBoxW)
        .attr('height', absBoxH2)
        .attr('rx', 4)
        .attr('class', 'fill-muted/30 stroke-muted-foreground/20')
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', srv.x + absBoxW / 2)
        .attr('y', absY + absBoxH2 / 2 + (compact ? 3 : 4))
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-muted-foreground')
        .style('font-size', smallFontSize)
        .text(srv.label);
    }

    if (dotsX !== null) {
      svg
        .append('text')
        .attr('x', dotsX)
        .attr('y', absY + absBoxH2 / 2 + 3)
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-muted-foreground/60')
        .style('font-size', fontSize)
        .html('&bull;&bull;&bull;');
    }

    const extraPodGroup = svg.append('g').attr('class', 'extra-pods');
    for (let i = 0; i < extraPods; i++) {
      const pos = extraPodPositions[i];
      const g = extraPodGroup.append('g');
      g.append('rect')
        .attr('x', pos.x)
        .attr('y', podY)
        .attr('width', absPodW)
        .attr('height', absPodH)
        .attr('rx', 8)
        .attr('class', 'fill-green-500/5 stroke-green-500/30')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 2');
      g.append('text')
        .attr('x', pos.x + absPodW / 2)
        .attr('y', podY + absPodH / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('class', 'fill-green-500/50')
        .style('font-size', smallFontSize)
        .style('font-weight', '500')
        .text(`${t.pod} ${i + 2}`);
    }

    if (!compact) {
      svg
        .append('text')
        .attr('x', 4)
        .attr('y', spineY + spineBoxH / 2 + 4)
        .attr('class', 'fill-muted-foreground')
        .style('font-size', labelFontSize)
        .text(t.spine);
    }

    if (compact) {
      svg
        .append('text')
        .attr('x', totalW / 2)
        .attr('y', viewBoxH - 4)
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-muted-foreground')
        .style('font-size', '7px')
        .html(`${leafShort} (${t.leaf}) &middot; ${spineShort} (${t.spine})`);
    } else {
      svg
        .append('text')
        .attr('x', totalW / 2)
        .attr('y', spineY - 6)
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-muted-foreground')
        .style('font-size', smallFontSize)
        .text(`${t.spine}${locale === 'zh' ? '：' : ': '}${spineShort}`);
      svg
        .append('text')
        .attr('x', totalW / 2)
        .attr('y', viewBoxH - 4)
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-muted-foreground')
        .style('font-size', smallFontSize)
        .html(
          `${t.leaf}${locale === 'zh' ? '：' : ': '}${leafShort} &middot; NIC${locale === 'zh' ? '：' : ': '}${nicLine1} ${nicLine2}`,
        );
    }

    return () => {
      container.selectAll('*').remove();
    };
  }, [spec, config, compact, locale, t]);

  return <div ref={containerRef} />;
}
