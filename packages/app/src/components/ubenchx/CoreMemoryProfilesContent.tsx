'use client';

import * as d3 from 'd3';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { coreMemoryProfiles, type CoreProfilePanel } from './core-memory-profiles';

const STRINGS = {
  en: {
    noPairs: 'No pairs',
    title: 'Core memory-access profiles',
    subtitle: 'Ascend 950PR_9579 · 128 MiB · Cube and Vector scalar controllers',
    isolated: 'One active core',
    concurrent: 'Concurrent launch',
    core: 'Physical core ID',
    units: 'Mean absolute difference (SYS_CNT ticks)',
    within: 'Within decoded die group',
    between: 'Between decoded die groups',
    instructions:
      'Hover or focus a heatmap; use arrow keys to inspect core pairs. Click or press Enter to pin, Escape to clear.',
    method:
      'Both core types execute the same scalar pointer chase on one allocation. Six passes are averaged at each matched address, then the mean absolute difference between each pair of core profiles is computed.',
    limits:
      'These values are differences between memory-access profiles, not core-to-core latency, wire distance or physical coordinates. SYS_CNT ticks are not clock64 cycles or nanoseconds. Runtime IDs contain gaps; their numeric spacing is not geometric spacing.',
    concurrentLimit:
      'Concurrent launches have no grid-wide starting barrier. Their fine structure is less repeatable than the broad grouping; these panels do not establish which cores physically share a cache.',
    source: 'Source data',
    methodology: 'Methodology',
    selected: 'Selected core pair',
    sharedScale: 'All four panels use the same color scale.',
  },
  zh: {
    noPairs: '无核心对',
    title: '核心访存特征',
    subtitle: 'Ascend 950PR_9579 · 128 MiB · Cube 与 Vector 标量控制器',
    isolated: '单个核心执行',
    concurrent: '并发启动',
    core: '物理核心 ID',
    units: '平均绝对差（SYS_CNT ticks）',
    within: '解码出的同一 die 分组内',
    between: '解码出的不同 die 分组间',
    instructions: '悬停或聚焦热力图，用方向键查看核心对；点击或按 Enter 固定，按 Escape 清除。',
    method:
      '两类核心在同一块分配的内存上执行相同的标量指针追踪。先在每个对应地址上对六次遍历取平均，再计算每对核心访存特征之间的平均绝对差。',
    limits:
      '数值表示访存特征之间的差异，不是核心间通信延迟、连线距离或物理坐标。SYS_CNT ticks 不等同于 clock64 周期或纳秒。运行时 ID 存在空缺，数值间距不代表空间距离。',
    concurrentLimit:
      '并发启动没有网格级起始同步屏障。相比整体分组，细节模式的可重复性较弱；这些图不能确定哪些核心在物理上共享缓存。',
    source: '数据来源',
    methodology: '测试方法',
    selected: '选中的核心对',
    sharedScale: '四幅图使用相同的色标范围。',
  },
} as const;

type Copy = (typeof STRINGS)[keyof typeof STRINGS];
function Panel({ panel, max, text }: { panel: CoreProfilePanel; max: number; text: Copy }) {
  const [cell, setCell] = useState<[number, number] | null>(null);
  const [pinned, setPinned] = useState(false);
  const n = panel.coreIds.length,
    extent = 320,
    start = 54,
    top = 22,
    step = extent / n;
  const colors = useMemo(() => d3.scaleSequential(d3.interpolateReds).domain([0, max]), [max]);
  const ticks = [
    ...new Set([0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]),
  ];
  const id = `profile-${panel.condition}`;
  const choose = (pair: [number, number]) => {
    setCell(pair);
    setPinned(true);
    track('ubenchx_core_profile_cell_selected', {
      condition: panel.condition,
      row: panel.coreIds[pair[0]],
      column: panel.coreIds[pair[1]],
    });
  };
  return (
    <section className="space-y-2 min-w-0" data-testid={id}>
      <h3 className="text-base font-semibold">
        {panel.coreType === 'cube' ? 'Cube' : 'Vector'} · {text[panel.launchMode]}
      </h3>
      <svg
        viewBox="0 0 420 420"
        className="w-full"
        role="img"
        tabIndex={0}
        aria-label={`${panel.coreType}, ${text[panel.launchMode]}, ${text.units}`}
        onFocus={() => {
          if (!cell) setCell([0, 1]);
        }}
        onPointerMove={(event) => {
          if (pinned) return;
          const box = event.currentTarget.getBoundingClientRect();
          const j = Math.floor((((event.clientX - box.left) * 420) / box.width - start) / step);
          const i = Math.floor((((event.clientY - box.top) * 420) / box.height - top) / step);
          if (i >= 0 && j >= 0 && i < n && j < n) setCell([i, j]);
        }}
        onClick={() => {
          if (cell) choose(cell);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setPinned(false);
            setCell(null);
            return;
          }
          if (event.key === 'Enter' && cell) {
            choose(cell);
            return;
          }
          const delta: Record<string, [number, number]> = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
          };
          if (delta[event.key]) {
            event.preventDefault();
            const [i, j] = cell ?? [0, 0];
            const [di, dj] = delta[event.key];
            setPinned(false);
            setCell([Math.max(0, Math.min(n - 1, i + di)), Math.max(0, Math.min(n - 1, j + dj))]);
          }
        }}
      >
        <title>{`${panel.coreType} ${text[panel.launchMode]}`}</title>
        {panel.matrix.flatMap((row, i) =>
          row.map((value, j) => (
            <rect
              key={`${i}-${j}`}
              x={start + j * step}
              y={top + i * step}
              width={step + 0.1}
              height={step + 0.1}
              fill={i === j ? 'var(--background)' : colors(value)}
            />
          )),
        )}
        <line
          x1={start + extent / 2}
          x2={start + extent / 2}
          y1={top}
          y2={top + extent}
          stroke="var(--muted-foreground)"
        />
        <line
          y1={top + extent / 2}
          y2={top + extent / 2}
          x1={start}
          x2={start + extent}
          stroke="var(--muted-foreground)"
        />
        {ticks.map((i) => (
          <g key={i} className="text-xs" fill="currentColor">
            <text x={start + (i + 0.5) * step} y={top + extent + 20} textAnchor="middle">
              {panel.coreIds[i]}
            </text>
            <text
              x={start - 10}
              y={top + (i + 0.5) * step}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {panel.coreIds[i]}
            </text>
          </g>
        ))}
        <text
          x={start + extent / 2}
          y={top + extent + 48}
          textAnchor="middle"
          className="text-xs"
          fill="currentColor"
        >
          {text.core}
        </text>
        <text
          transform={`translate(14 ${top + extent / 2}) rotate(-90)`}
          textAnchor="middle"
          className="text-xs"
          fill="currentColor"
        >
          {text.core}
        </text>
        {cell && (
          <rect
            x={start + cell[1] * step}
            y={top + cell[0] * step}
            width={step}
            height={step}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          />
        )}
      </svg>
      <output className="block text-sm min-h-6" aria-live="polite" data-testid={`${id}-value`}>
        {cell
          ? `${text.selected}: ${panel.coreIds[cell[0]]} ↔ ${panel.coreIds[cell[1]]}: ${panel.matrix[cell[0]][cell[1]].toFixed(2)} SYS_CNT ticks`
          : text.instructions}
      </output>
      <p className="text-xs text-muted-foreground">
        {text.within}: {panel.stats.withinDieGroupMean?.toFixed(2) ?? text.noPairs} · {text.between}
        : {panel.stats.betweenDieGroupMean?.toFixed(2) ?? text.noPairs} SYS_CNT ticks
      </p>
    </section>
  );
}

export function CoreMemoryProfilesContent() {
  const locale = useLocale(),
    t = STRINGS[locale];
  const result = useMemo(coreMemoryProfiles, []);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>
      <p className="text-sm text-muted-foreground">{t.limits}</p>
      <div className="space-y-1 max-w-lg">
        <p className="text-sm">{t.units}</p>
        <div
          className="h-4 rounded"
          style={{
            background: `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => `${d3.interpolateReds(i / 10)} ${i * 10}%`).join(', ')})`,
          }}
        />
        <div className="flex justify-between text-xs">
          <span>0</span>
          <span>{result.colorLimits[1].toFixed(2)}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t.sharedScale}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {result.panels.map((panel) => (
          <Panel key={panel.condition} panel={panel} max={result.colorLimits[1]} text={t} />
        ))}
      </div>
      <section className="text-sm text-muted-foreground space-y-2">
        <h3 className="font-semibold">{t.methodology}</h3>
        <p>{t.method}</p>
        <p>{t.concurrentLimit}</p>
        <a className="underline" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">
          {t.source}
        </a>
      </section>
    </div>
  );
}
