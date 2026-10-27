import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { Locale } from '@/lib/i18n/i18n';

export const FLOW_NODES = [
  'exporter',
  'window',
  'gpu',
  'model',
  'it',
  'pue',
  'facility',
  'energy',
] as const;
export type FlowNode = (typeof FLOW_NODES)[number];
export const DEFAULT_FLOW_NODE: FlowNode = 'gpu';

type Provenance = 'measured' | 'modeled' | 'rated';
export const FLOW_PROVENANCE: Record<FlowNode, Provenance> = {
  exporter: 'measured',
  window: 'measured',
  gpu: 'measured',
  energy: 'measured',
  model: 'modeled',
  it: 'modeled',
  pue: 'rated',
  facility: 'modeled',
};

export const FLOW_STRINGS = {
  en: {
    nodes: {
      exporter: ['Exporter', '1 Hz on every node'],
      window: ['Serving window', 'one per point'],
      gpu: ['Measured GPU W', 'avg · P75 · P90'],
      model: ['Power model', 'operating state'],
      it: ['IT power', 'no PUE'],
      pue: ['× PUE', '1.3 air · 1.1 liquid'],
      facility: ['Facility power', 'per GPU'],
      energy: ['Energy per token', '∫ W dt ÷ tokens'],
    },
    sentences: {
      exporter:
        'dcgm-exporter on NVIDIA nodes and device-metrics-exporter on AMD nodes report every GPU once a second; the head node scrapes all of them on one clock.',
      window:
        'Each concurrency point gets one serving window, from the end of warmup to the last request. Samples outside it are discarded.',
      gpu: 'Average, P75 and P90 watts per GPU are time-weighted over the window across every GPU in the deployment; prefill and decode roles are averaged over the same window.',
      model:
        'The open-source power_model takes the measured watts and an operating state (fixed sequence, agentic, agentic with KV offload) and adds the parts the cluster cannot measure.',
      it: 'IT power is the measured GPU plus modeled CPUs, memory, NICs, switches, storage, fans and PSU loss: the number capacity teams size racks with, before PUE.',
      pue: 'PUE is a fixed input per cooling type, 1.3 for an air-cooled chassis and 1.1 for a liquid-cooled NVL72 rack. It is not measured at the benchmark site.',
      facility: 'Facility power is IT × PUE: what the utility has to deliver for the deployment.',
      energy:
        'Energy is the trapezoid integral of each GPU’s samples over the window; dividing the deployment’s energy by the tokens the client counted gives joules per token.',
    },
    aria: 'Flow from exporter samples to measured GPU watts, the power model, IT power and facility power, with energy per token branching from the serving window',
  },
  zh: {
    nodes: {
      exporter: ['Exporter', '每节点 1 Hz'],
      window: ['服务窗口', '每个数据点一个'],
      gpu: ['实测 GPU 功耗', '平均 · P75 · P90'],
      model: ['功耗模型', '按工作状态'],
      it: ['IT 功率', '不含 PUE'],
      pue: ['× PUE', '风冷 1.3 · 液冷 1.1'],
      facility: ['数据中心功率', '每 GPU'],
      energy: ['每 token 能量', '∫ W dt ÷ token 数'],
    },
    sentences: {
      exporter:
        'NVIDIA 节点上的 dcgm-exporter 和 AMD 节点上的 device-metrics-exporter 每秒上报一次每颗 GPU 的功耗，头节点按同一时钟抓取所有节点。',
      window:
        '每个并发点只有一个服务窗口，从 warmup 结束到最后一个请求完成，窗口之外的样本一律丢弃。',
      gpu: '每 GPU 的平均、P75 和 P90 瓦特数在窗口内按时间加权，覆盖部署中的全部 GPU；prefill 和 decode 角色在同一窗口内分别求平均。',
      model:
        '开源的 power_model 接收实测瓦特数和一个工作状态（固定序列、智能体、带 KV offload 的智能体），补上集群无法实测的部件。',
      it: 'IT 功率 = 实测 GPU + 建模的 CPU、内存、NIC、交换芯片、存储、风扇和 PSU 损耗，是容量团队规划机柜时用的数字，不含 PUE。',
      pue: 'PUE 是按散热方式固定的输入：风冷机箱 1.3，液冷 NVL72 机柜 1.1，并非在基准测试站点测得。',
      facility: '数据中心功率 = IT × PUE，即市电需要为这套部署供给的功率。',
      energy:
        '能量是每颗 GPU 的样本在窗口内的梯形积分；用整个部署的能量除以客户端统计的 token 数，就得到每 token 焦耳数。',
    },
    aria: '从 exporter 采样到实测 GPU 功耗、功耗模型、IT 功率和数据中心功率的流程，每 token 能量从服务窗口分支',
  },
} as const;

const COLOR = {
  brand: 'var(--brand)',
  foreground: 'var(--foreground)',
  background: 'var(--background)',
  muted: 'var(--muted-foreground)',
} as const;

const MAIN: FlowNode[] = ['exporter', 'window', 'gpu', 'model', 'it', 'pue', 'facility'];

function arrowHead(x: number, y: number, direction: 'right' | 'down'): string {
  const back = 6.1;
  const half = 3.1;
  return direction === 'right'
    ? `M${x - back},${y - half} L${x},${y} L${x - back},${y + half}`
    : `M${x - half},${y - back} L${x},${y} L${x + half},${y - back}`;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function flowLayout(width: number, orientation: 'horizontal' | 'vertical') {
  const boxes = {} as Record<FlowNode, Box>;
  if (orientation === 'horizontal') {
    const gap = Math.max(14, Math.min(28, width * 0.022));
    const w = (width - gap * (MAIN.length - 1)) / MAIN.length;
    const h = 58;
    MAIN.forEach((node, index) => {
      boxes[node] = { x: index * (w + gap), y: 0, w, h };
    });
    boxes.energy = { x: boxes.window.x, y: h + 46, w: w * 1.45 + gap, h };
    return { boxes, height: boxes.energy.y + h, orientation };
  }
  const h = 56;
  const gap = 22;
  const w = Math.round(width * 0.6);
  MAIN.forEach((node, index) => {
    boxes[node] = { x: 0, y: index * (h + gap), w, h };
  });
  boxes.energy = { x: w + 18, y: boxes.window.y + h + gap, w: width - w - 18, h };
  return { boxes, height: boxes.facility.y + h, orientation };
}

export interface FlowSvgProps {
  locale: Locale;
  width: number;
  orientation: 'horizontal' | 'vertical';
  active: FlowNode;
  onActivate: (node: FlowNode) => void;
  onSelect: (node: FlowNode) => void;
  /** The id prefix for the description the nodes point at. */
  describedBy: string;
}

export function FlowSvg({
  locale,
  width,
  orientation,
  active,
  onActivate,
  onSelect,
  describedBy,
}: FlowSvgProps) {
  const t = FLOW_STRINGS[locale];
  const { boxes, height } = flowLayout(width, orientation);
  const edges: [FlowNode, FlowNode][] = [];
  for (let index = 1; index < MAIN.length; index++) edges.push([MAIN[index - 1], MAIN[index]]);
  const edgeDirection = orientation === 'horizontal' ? 'right' : 'down';

  function edgePath(a: Box, b: Box): string {
    if (orientation === 'horizontal') {
      return `M${a.x + a.w},${a.y + a.h / 2} L${b.x},${b.y + b.h / 2}`;
    }
    return `M${a.x + a.w / 2},${a.y + a.h} L${b.x + b.w / 2},${b.y}`;
  }
  function edgeEnd(b: Box): [number, number] {
    return orientation === 'horizontal' ? [b.x, b.y + b.h / 2] : [b.x + b.w / 2, b.y];
  }
  const windowBox = boxes.window;
  const energyBox = boxes.energy;
  // The branch ends where its arrowhead sits: under the window box when the row is horizontal
  // (the energy box is wider than the window box, so its own centre is not on the line).
  const branchEnd: [number, number] =
    orientation === 'horizontal'
      ? [windowBox.x + windowBox.w / 2, energyBox.y]
      : [energyBox.x + energyBox.w / 2, energyBox.y];
  const branch =
    orientation === 'horizontal'
      ? `M${branchEnd[0]},${windowBox.y + windowBox.h} L${branchEnd[0]},${branchEnd[1]}`
      : `M${windowBox.x + windowBox.w},${windowBox.y + windowBox.h / 2} L${branchEnd[0]},${windowBox.y + windowBox.h / 2} L${branchEnd[0]},${branchEnd[1]}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t.aria}
      fontFamily="inherit"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {edges.map(([a, b]) => (
        <g key={`${a}-${b}`}>
          <path
            d={edgePath(boxes[a], boxes[b])}
            fill="none"
            stroke={COLOR.muted}
            strokeWidth={1.25}
          />
          <path
            d={arrowHead(...edgeEnd(boxes[b]), edgeDirection)}
            fill="none"
            stroke={COLOR.muted}
            strokeWidth={1.25}
          />
        </g>
      ))}
      <g>
        <path d={branch} fill="none" stroke={COLOR.muted} strokeWidth={1.25} />
        <path
          d={arrowHead(...branchEnd, 'down')}
          fill="none"
          stroke={COLOR.muted}
          strokeWidth={1.25}
        />
      </g>
      {FLOW_NODES.map((node) => {
        const box = boxes[node];
        const kind = FLOW_PROVENANCE[node];
        const isActive = active === node;
        const [title, sub] = t.nodes[node];
        const textColor = kind === 'measured' ? COLOR.background : COLOR.foreground;
        return (
          <g
            key={node}
            data-node={node}
            data-active={isActive || undefined}
            tabIndex={0}
            role="button"
            aria-pressed={isActive}
            aria-describedby={describedBy}
            onMouseEnter={() => onActivate(node)}
            onFocus={() => onActivate(node)}
            onClick={() => onSelect(node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(node);
              }
            }}
            style={{
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <rect
              x={box.x + 0.75}
              y={box.y + 0.75}
              width={box.w - 1.5}
              height={box.h - 1.5}
              rx={6}
              fill={kind === 'measured' ? COLOR.brand : kind === 'modeled' ? COLOR.brand : 'none'}
              fillOpacity={kind === 'measured' ? 1 : kind === 'modeled' ? 0.12 : 0}
              stroke={kind === 'rated' ? COLOR.muted : COLOR.brand}
              strokeWidth={isActive ? 2.25 : 1.5}
              strokeDasharray={kind === 'rated' ? '5 3' : undefined}
            />
            <text
              x={box.x + box.w / 2}
              y={box.y + box.h / 2 - 3}
              textAnchor="middle"
              fontSize={CHART_TYPE.lineLabel}
              fontWeight={600}
              fill={textColor}
            >
              {title}
            </text>
            <text
              x={box.x + box.w / 2}
              y={box.y + box.h / 2 + 14}
              textAnchor="middle"
              fontSize={CHART_TYPE.annotation}
              fill={textColor}
              fillOpacity={kind === 'measured' ? 0.85 : 0.75}
            >
              {sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
