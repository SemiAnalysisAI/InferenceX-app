'use client';

import { useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { BarChart3, Radar, Table2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import {
  formatTflops,
  getScaleUpDomainMemory,
  getScaleUpDomainMemoryBw,
  GPU_CHART_METRICS,
  GPU_SPECS,
  type GpuSpec,
} from '@/lib/gpu-specs';
import {
  TopologyDiagram,
  type TopologyDiagramHandle,
} from '@/components/gpu-specs/topology-diagram';
import {
  ScaleUpTopologyDiagram,
  type ScaleUpTopologyDiagramHandle,
} from '@/components/gpu-specs/scale-up-topology-diagram';
import { GpuSpecsBarChart } from '@/components/gpu-specs/gpu-specs-bar-chart';
import { GpuSpecsRadarChart } from '@/components/gpu-specs/gpu-specs-radar-chart';
import { useLocale } from '@/lib/use-locale';

function SpecCell({
  children,
  align = 'left',
  header = false,
  sticky = false,
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  header?: boolean;
  sticky?: boolean;
  className?: string;
}) {
  const Tag = header ? 'th' : 'td';
  return (
    <Tag
      className={`px-3 py-2.5 ${header ? 'whitespace-normal' : 'whitespace-nowrap'} ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${header ? 'font-semibold text-xs uppercase tracking-wider text-muted-foreground' : 'text-sm'} ${sticky ? 'sticky left-0 z-10 bg-card after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-border' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

function VendorBadge({ vendor }: { vendor: GpuSpec['vendor'] }) {
  const isNvidia = vendor === 'nvidia';
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        isNvidia ? 'bg-[#76b900]/15 text-[#76b900]' : 'bg-[#ed1c24]/15 text-[#ed1c24]'
      }`}
    >
      {isNvidia ? 'NVIDIA' : 'AMD'}
    </span>
  );
}

const STRINGS = {
  en: {
    heading: 'GPU Specifications',
    description:
      'Hardware specifications for GPUs used in InferenceX™ benchmarks, including compute performance, memory bandwidth, and interconnect details.',
    viewTable: 'Table',
    viewChart: 'Chart',
    viewRadar: 'Radar',
    colGpu: 'GPU',
    colMemory: 'Memory',
    colMemBw: 'Mem BW',
    colScaleUp: 'Scale Up',
    colScaleUpBw: 'Scale Up BW',
    colWorldSize: 'World Size',
    colScaleUpDomainMem: 'Scale Up Domain Memory',
    colScaleUpDomainMemBw: 'Scale Up Domain Mem BW',
    colScaleUpTopology: 'Scale Up Topology',
    colScaleUpSwitch: 'Scale Up Switch',
    colScaleOutBwPerGpu: 'Scale Out BW per GPU',
    colScaleOutTech: 'Scale Out Tech',
    colScaleOutSwitch: 'Scale Out Switch',
    colScaleOutTopology: 'Scale Out Topology',
    colNic: 'NIC',
    footnote1: 'Dense tensor core peak TFLOP/s (without sparsity).',
    footnote2: 'Scale out isn’t used in InferenceX™ for rack scale.',
    scaleOutHeading: 'Scale-Out Topology Diagrams',
    scaleOutDescription:
      'Per-server scale-out network topology for each GPU SKU, showing GPU → NIC → leaf switch connectivity.',
    scaleUpHeading: 'Scale-Up Topology Diagrams',
    scaleUpDescription:
      'Intra-node scale-up interconnect topology for each GPU SKU, showing GPU → NVSwitch or direct GPU-to-GPU connectivity.',
  },
  zh: {
    heading: 'GPU 规格',
    description: 'InferenceX™ 基准测试中使用的 GPU 硬件规格，包括计算性能、显存带宽和互联详情。',
    viewTable: '表格',
    viewChart: '图表',
    viewRadar: '雷达图',
    colGpu: 'GPU',
    colMemory: '显存',
    colMemBw: '显存带宽',
    colScaleUp: '纵向扩展',
    colScaleUpBw: '纵向扩展带宽',
    colWorldSize: '域内 GPU 数',
    colScaleUpDomainMem: '纵向扩展域显存',
    colScaleUpDomainMemBw: '纵向扩展域显存带宽',
    colScaleUpTopology: '纵向扩展拓扑',
    colScaleUpSwitch: '纵向扩展交换机',
    colScaleOutBwPerGpu: '每 GPU 横向扩展带宽',
    colScaleOutTech: '横向扩展技术',
    colScaleOutSwitch: '横向扩展交换机',
    colScaleOutTopology: '横向扩展拓扑',
    colNic: 'NIC',
    footnote1: '密集 Tensor Core 峰值 TFLOP/s（不含稀疏加速）。',
    footnote2: 'InferenceX™ 机柜级测试不使用横向扩展。',
    scaleOutHeading: '横向扩展拓扑图',
    scaleOutDescription: '每台服务器的横向扩展网络拓扑，展示 GPU → NIC → Leaf 交换机的连接方式。',
    scaleUpHeading: '纵向扩展拓扑图',
    scaleUpDescription: '节点内纵向扩展互联拓扑，展示 GPU → NVSwitch 或 GPU 直连方式。',
  },
} as const;

type GpuSpecsViewMode = 'table' | 'chart' | 'radar';

function GpuSpecsTable({
  onTopologyClick,
  onScaleUpTopologyClick,
}: {
  onTopologyClick?: (gpuName: string) => void;
  onScaleUpTopologyClick?: (gpuName: string) => void;
}) {
  const t = STRINGS[useLocale()];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[1400px]">
        <thead>
          <tr className="border-b border-border">
            <SpecCell header align="left" sticky>
              {t.colGpu}
            </SpecCell>
            <SpecCell header align="right">
              {t.colMemory}
            </SpecCell>
            <SpecCell header align="right">
              {t.colMemBw}
            </SpecCell>
            <SpecCell header align="right">
              FP4{' '}
              <span className="whitespace-nowrap">
                TFLOP/s<sup className="text-muted-foreground/70">1</sup>
              </span>
            </SpecCell>
            <SpecCell header align="right">
              FP8{' '}
              <span className="whitespace-nowrap">
                TFLOP/s<sup className="text-muted-foreground/70">1</sup>
              </span>
            </SpecCell>
            <SpecCell header align="right">
              BF16{' '}
              <span className="whitespace-nowrap">
                TFLOP/s<sup className="text-muted-foreground/70">1</sup>
              </span>
            </SpecCell>
            <SpecCell header align="left">
              {t.colScaleUp}
            </SpecCell>
            <SpecCell header align="right">
              {t.colScaleUpBw}
            </SpecCell>
            <SpecCell header align="right">
              {t.colWorldSize}
            </SpecCell>
            <SpecCell header align="right" className="min-w-36">
              {t.colScaleUpDomainMem}
            </SpecCell>
            <SpecCell header align="right" className="min-w-36">
              {t.colScaleUpDomainMemBw}
            </SpecCell>
            <SpecCell header align="left">
              {t.colScaleUpTopology}
            </SpecCell>
            <SpecCell header align="left">
              {t.colScaleUpSwitch}
            </SpecCell>
            <SpecCell header align="right" className="min-w-28">
              {t.colScaleOutBwPerGpu}
            </SpecCell>
            <SpecCell header align="left">
              {t.colScaleOutTech}
            </SpecCell>
            <SpecCell header align="left">
              {t.colScaleOutSwitch}
            </SpecCell>
            <SpecCell header align="left">
              {t.colScaleOutTopology}
            </SpecCell>
            <SpecCell header align="left">
              {t.colNic}
            </SpecCell>
          </tr>
        </thead>
        <tbody>
          {GPU_SPECS.map((spec) => (
            <tr
              key={spec.name}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              onClick={() => track('gpu_specs_row_clicked', { gpu: spec.name })}
            >
              <SpecCell align="left" sticky>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{spec.name}</span>
                  <VendorBadge vendor={spec.vendor} />
                </div>
              </SpecCell>
              <SpecCell align="right">{spec.memory}</SpecCell>
              <SpecCell align="right">{spec.memoryBandwidth}</SpecCell>
              <SpecCell align="right" className={spec.fp4 === null ? 'text-muted-foreground' : ''}>
                {formatTflops(spec.fp4)}
              </SpecCell>
              <SpecCell align="right">{formatTflops(spec.fp8)}</SpecCell>
              <SpecCell align="right">{formatTflops(spec.bf16)}</SpecCell>
              <SpecCell align="left">{spec.scaleUpTech}</SpecCell>
              <SpecCell align="right">{spec.scaleUpBandwidth}</SpecCell>
              <SpecCell align="right">{spec.scaleUpWorldSize}</SpecCell>
              <SpecCell align="right">{getScaleUpDomainMemory(spec)}</SpecCell>
              <SpecCell align="right">{getScaleUpDomainMemoryBw(spec)}</SpecCell>
              <SpecCell align="left">
                <button
                  type="button"
                  className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onScaleUpTopologyClick?.(spec.name);
                    track('gpu_specs_scaleup_topology_cell_clicked', { gpu: spec.name });
                  }}
                >
                  {spec.scaleUpTopology}
                </button>
              </SpecCell>
              <SpecCell
                align="left"
                className={spec.scaleUpSwitch === null ? 'text-muted-foreground' : ''}
              >
                {spec.scaleUpSwitch === null ? '—' : spec.scaleUpSwitch}
              </SpecCell>
              <SpecCell
                align="right"
                className={spec.scaleOutBandwidth === null ? 'text-muted-foreground' : ''}
              >
                {spec.scaleOutBandwidth === null ? (
                  <>
                    N/A<sup>2</sup>
                  </>
                ) : (
                  spec.scaleOutBandwidth
                )}
              </SpecCell>
              <SpecCell
                align="left"
                className={spec.scaleOutTech === null ? 'text-muted-foreground' : ''}
              >
                {spec.scaleOutTech === null ? (
                  <>
                    N/A<sup>2</sup>
                  </>
                ) : (
                  spec.scaleOutTech
                )}
              </SpecCell>
              <SpecCell
                align="left"
                className={spec.scaleOutSwitch === null ? 'text-muted-foreground' : ''}
              >
                {spec.scaleOutSwitch === null ? (
                  <>
                    N/A<sup>2</sup>
                  </>
                ) : (
                  spec.scaleOutSwitch
                )}
              </SpecCell>
              <SpecCell
                align="left"
                className={spec.scaleOutTopology === null ? 'text-muted-foreground' : ''}
              >
                {spec.scaleOutTopology === null ? (
                  <>
                    N/A<sup>2</sup>
                  </>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTopologyClick?.(spec.name);
                      track('gpu_specs_topology_cell_clicked', { gpu: spec.name });
                    }}
                  >
                    {spec.scaleOutTopology}
                  </button>
                )}
              </SpecCell>
              <SpecCell align="left" className={spec.nic === null ? 'text-muted-foreground' : ''}>
                {spec.nic === null ? (
                  <>
                    N/A<sup>2</sup>
                  </>
                ) : (
                  spec.nic
                )}
              </SpecCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GpuSpecsContent() {
  const specsWithTopology = GPU_SPECS.filter((spec) => spec.scaleOutTopology !== null);
  const t = STRINGS[useLocale()];

  const [viewMode, setViewMode] = useState<GpuSpecsViewMode>('table');
  const [selectedMetric, setSelectedMetric] = useState(GPU_CHART_METRICS[0].key);

  const viewModeOptions = useMemo<SegmentedToggleOption<GpuSpecsViewMode>[]>(
    () => [
      {
        value: 'table',
        label: t.viewTable,
        icon: <Table2 className="size-3.5" />,
        testId: 'gpu-specs-table-view-btn',
      },
      {
        value: 'chart',
        label: t.viewChart,
        icon: <BarChart3 className="size-3.5" />,
        testId: 'gpu-specs-chart-view-btn',
      },
      {
        value: 'radar',
        label: t.viewRadar,
        icon: <Radar className="size-3.5" />,
        testId: 'gpu-specs-radar-view-btn',
      },
    ],
    [t],
  );

  // Refs for each scale-out topology diagram, keyed by GPU name
  const diagramRefs = useRef<Record<string, TopologyDiagramHandle | null>>({});
  // Refs for each scale-up topology diagram, keyed by GPU name
  const scaleUpDiagramRefs = useRef<Record<string, ScaleUpTopologyDiagramHandle | null>>({});

  const handleTopologyClick = (gpuName: string) => {
    diagramRefs.current[gpuName]?.openDialog();
  };

  const handleScaleUpTopologyClick = (gpuName: string) => {
    scaleUpDiagramRefs.current[gpuName]?.openDialog();
  };

  const handleViewModeChange = (value: GpuSpecsViewMode) => {
    setViewMode(value);
    track('gpu_specs_view_changed', { view: value });
  };

  return (
    <div data-testid="gpu-specs-content" className="flex flex-col gap-4">
      <section>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t.heading}</h2>
              <p className="text-muted-foreground text-sm">{t.description}</p>
            </div>
            <ChartShareActions />
          </div>
        </Card>
      </section>
      <section className="pt-8 md:pt-0">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between pb-4">
            <div />
            <SegmentedToggle
              value={viewMode}
              options={viewModeOptions}
              onValueChange={handleViewModeChange}
              ariaLabel="View mode"
              testId="gpu-specs-view-toggle"
            />
          </div>
          <UnofficialDomainNotice />

          {viewMode === 'table' && (
            <>
              <GpuSpecsTable
                onTopologyClick={handleTopologyClick}
                onScaleUpTopologyClick={handleScaleUpTopologyClick}
              />
              <div className="px-4 md:px-8 pt-4">
                <p className="text-xs text-muted-foreground">
                  <sup>1</sup> {t.footnote1}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <sup>2</sup> {t.footnote2}
                </p>
              </div>
            </>
          )}
          {viewMode === 'chart' && (
            <GpuSpecsBarChart selectedMetric={selectedMetric} onMetricChange={setSelectedMetric} />
          )}
          {viewMode === 'radar' && <GpuSpecsRadarChart />}
        </Card>
      </section>
      <section className="pt-8 md:pt-0">
        <Card>
          <h3 className="text-lg font-semibold mb-2">{t.scaleOutHeading}</h3>
          <p className="text-muted-foreground text-sm mb-6">{t.scaleOutDescription}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {specsWithTopology.map((spec) => (
              <div
                key={spec.name}
                className="border border-border/50 rounded-lg p-4"
                data-testid={`topology-${spec.name.toLowerCase().replaceAll(/\s+/gu, '-')}`}
              >
                <TopologyDiagram
                  ref={(el) => {
                    diagramRefs.current[spec.name] = el;
                  }}
                  spec={spec}
                  allSpecs={specsWithTopology}
                />
              </div>
            ))}
          </div>
        </Card>
      </section>
      <section className="pt-8 md:pt-0">
        <Card>
          <h3 className="text-lg font-semibold mb-2">{t.scaleUpHeading}</h3>
          <p className="text-muted-foreground text-sm mb-6">{t.scaleUpDescription}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {GPU_SPECS.map((spec) => (
              <div
                key={spec.name}
                className="border border-border/50 rounded-lg p-4"
                data-testid={`scaleup-topology-${spec.name.toLowerCase().replaceAll(/\s+/gu, '-')}`}
              >
                <ScaleUpTopologyDiagram
                  ref={(el) => {
                    scaleUpDiagramRefs.current[spec.name] = el;
                  }}
                  spec={spec}
                  allSpecs={GPU_SPECS}
                />
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
