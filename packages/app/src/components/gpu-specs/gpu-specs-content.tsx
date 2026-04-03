'use client';

import { useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { BarChart3, Radar, Table2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ShareButton } from '@/components/ui/share-button';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
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

function GpuSpecsTable({
  onTopologyClick,
  onScaleUpTopologyClick,
}: {
  onTopologyClick?: (gpuName: string) => void;
  onScaleUpTopologyClick?: (gpuName: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[1400px]">
        <thead>
          <tr className="border-b border-border">
            <SpecCell header align="left" sticky>
              GPU
            </SpecCell>
            <SpecCell header align="right">
              Memory
            </SpecCell>
            <SpecCell header align="right">
              Mem BW
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
              Scale Up
            </SpecCell>
            <SpecCell header align="right">
              Scale Up BW
            </SpecCell>
            <SpecCell header align="right">
              World Size
            </SpecCell>
            <SpecCell header align="right" className="min-w-36">
              Scale Up Domain Memory
            </SpecCell>
            <SpecCell header align="right" className="min-w-36">
              Scale Up Domain Mem BW
            </SpecCell>
            <SpecCell header align="left">
              Scale Up Topology
            </SpecCell>
            <SpecCell header align="left">
              Scale Up Switch
            </SpecCell>
            <SpecCell header align="right" className="min-w-28">
              Scale Out BW per GPU
            </SpecCell>
            <SpecCell header align="left">
              Scale Out Tech
            </SpecCell>
            <SpecCell header align="left">
              Scale Out Switch
            </SpecCell>
            <SpecCell header align="left">
              Scale Out Topology
            </SpecCell>
            <SpecCell header align="left">
              NIC
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

  const [viewMode, setViewMode] = useState<'table' | 'chart' | 'radar'>('table');
  const [selectedMetric, setSelectedMetric] = useState(GPU_CHART_METRICS[0].key);

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

  return (
    <div data-testid="gpu-specs-content" className="flex flex-col gap-4">
      <section>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">GPU Specifications</h2>
              <p className="text-muted-foreground text-sm">
                Hardware specifications for GPUs used in InferenceX&trade; benchmarks, including
                compute performance, memory bandwidth, and interconnect details.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <ShareButton />
              <div className="hidden sm:flex items-center gap-1.5">
                <ShareTwitterButton />
                <ShareLinkedInButton />
              </div>
            </div>
          </div>
        </Card>
      </section>
      <section className="pt-8 md:pt-0">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between pb-4">
            <div />
            <div
              className="inline-flex items-center rounded-lg border border-border p-0.5 gap-0.5"
              role="tablist"
              aria-label="View mode"
              data-testid="gpu-specs-view-toggle"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setViewMode('table');
                  track('gpu_specs_view_changed', { view: 'table' });
                }}
                data-testid="gpu-specs-table-view-btn"
              >
                <Table2 className="size-3.5" />
                Table
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'chart'}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'chart'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setViewMode('chart');
                  track('gpu_specs_view_changed', { view: 'chart' });
                }}
                data-testid="gpu-specs-chart-view-btn"
              >
                <BarChart3 className="size-3.5" />
                Chart
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'radar'}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'radar'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setViewMode('radar');
                  track('gpu_specs_view_changed', { view: 'radar' });
                }}
                data-testid="gpu-specs-radar-view-btn"
              >
                <Radar className="size-3.5" />
                Radar
              </button>
            </div>
          </div>

          {viewMode === 'table' && (
            <>
              <GpuSpecsTable
                onTopologyClick={handleTopologyClick}
                onScaleUpTopologyClick={handleScaleUpTopologyClick}
              />
              <div className="px-4 md:px-8 pt-4">
                <p className="text-xs text-muted-foreground">
                  <sup>1</sup> Dense tensor core peak TFLOP/s (without sparsity).
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <sup>2</sup> Scale out isn&apos;t used in InferenceX&trade; for rack scale.
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
          <h3 className="text-lg font-semibold mb-2">Scale-Out Topology Diagrams</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Per-server scale-out network topology for each GPU SKU, showing GPU &rarr; NIC &rarr;
            leaf switch connectivity.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {specsWithTopology.map((spec) => (
              <div
                key={spec.name}
                className="border border-border/50 rounded-lg p-4"
                data-testid={`topology-${spec.name.toLowerCase().replace(/\s+/g, '-')}`}
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
          <h3 className="text-lg font-semibold mb-2">Scale-Up Topology Diagrams</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Intra-node scale-up interconnect topology for each GPU SKU, showing GPU &rarr; NVSwitch
            or direct GPU-to-GPU connectivity.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {GPU_SPECS.map((spec) => (
              <div
                key={spec.name}
                className="border border-border/50 rounded-lg p-4"
                data-testid={`scaleup-topology-${spec.name.toLowerCase().replace(/\s+/g, '-')}`}
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
