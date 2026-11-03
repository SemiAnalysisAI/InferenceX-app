'use client';

import { track } from '@/lib/analytics/analytics';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';

import { getModelReleaseDate } from '@semianalysisai/inferencex-constants';

import type { Model } from '@/lib/catalog/data-mappings';
import {
  type ModelArchitecture,
  formatParamCount,
  getModelArchitecture,
} from '@/lib/catalog/model-architectures';
import { diagramHeight, renderDiagram } from './model-architecture-diagram-renderer';

interface ModelArchitectureDiagramProps {
  model: Model;
  className?: string;
  variant?: 'drawer' | 'inline';
}

interface ArchitectureContentProps {
  model: Model;
  arch: ModelArchitecture;
  isExpanded: boolean;
  locale: Locale;
  /** Drawer content sits inside a bordered panel and needs its own inset. */
  inset: boolean;
}

/** Quiet one-line summary next to the heading, e.g. `MoE · GQA · 816B`. */
function architectureSummary(arch: ModelArchitecture): string {
  return [
    arch.architectureType === 'moe' ? 'MoE' : 'Dense',
    arch.attentionType === 'AlternatingSinkGQA' ? 'Sink/Full GQA' : arch.attentionType,
    formatParamCount(arch.totalParams),
  ].join(' · ');
}

interface DiagramRenderState {
  width: number;
  arch: ModelArchitecture;
  isDark: boolean;
  locale: Locale;
  expandedBlocks: Set<string>;
  onBlockClick: (blockId: string) => void;
}

const ARCHITECTURE_STRINGS = {
  en: {
    heading: 'Model architecture',
    features: 'Features:',
    source: 'Source',
    releasedBy: 'Released by',
    releasedOn: ' on',
    contextNote: (advertised: number, configured: number) =>
      `Advertised context: ${advertised.toLocaleString('en-US')} tokens; checkpoint position limit: ${configured.toLocaleString('en-US')} tokens.`,
    latentNote:
      'Routed experts operate in a 3,584-dimensional latent space; their combined output is projected back to 7,168 dimensions. Shared experts operate at the full hidden size. AttnRes aggregates representations across depth; the diagram groups layers by attention type and does not draw every dependency.',
    pooledNote: (latent: number, hidden: number) =>
      `Pooled experts operate in ${latent.toLocaleString('en-US')} dimensions. Pool/unpool projections connect this latent space to the ${hidden.toLocaleString('en-US')}-dimensional residual stream; the expanded FFN shows one routed expert.`,
    hybrid:
      'are two KV sources, not two separate attentions: each query attends in a single softmax to the union of sliding-window + selected compressed keys, with a learnable per-head attention sink.',
    mhc: (count: number) =>
      `replace each residual with ${count} parallel streams combined by learned, Sinkhorn-normalized weights — read (${count}→1), output, and a ${count}×${count} stream mix — shown as the mHC ×${count} nodes.`,
  },
  zh: {
    heading: '模型架构',
    features: '特性：',
    source: '来源',
    releasedBy: '发布方',
    releasedOn: '，发布于',
    contextNote: (advertised: number, configured: number) =>
      `标称上下文为 ${advertised.toLocaleString('en-US')} token；checkpoint 配置的位置上限为 ${configured.toLocaleString('en-US')} token。`,
    latentNote:
      '路由 expert 在 3,584 维潜在空间中计算，合并后的输出再投影回 7,168 维；共享 expert 使用完整隐藏维度。AttnRes 聚合不同深度的表示；图中按注意力类型归类各层，未逐一绘出所有依赖关系。',
    pooledNote: (latent: number, hidden: number) =>
      `Pooled expert 在 ${latent.toLocaleString('en-US')} 维潜在空间中计算，通过 pool/unpool 投影连接 ${hidden.toLocaleString('en-US')} 维残差流；展开的 FFN 展示单个路由 expert。`,
    hybrid:
      '是两路 KV 来源，而非两套独立注意力：每个 query 都通过一次 softmax 同时关注滑动窗口与筛选后的压缩 key，并为每个 attention head 使用可学习的 attention sink。',
    mhc: (count: number) =>
      `将每条残差连接替换为 ${count} 路并行流，并通过学习得到的 Sinkhorn 归一化权重组合：包括读取 (${count}→1)、输出以及 ${count}×${count} 的流混合；图中标为 mHC ×${count} 节点。`,
  },
} as const;

function ArchitectureContent({ model, arch, isExpanded, locale, inset }: ArchitectureContentProps) {
  const t = ARCHITECTURE_STRINGS[locale];
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRenderRef = useRef<DiagramRenderState | null>(null);
  const { resolvedTheme } = useTheme();
  const releaseDate = getModelReleaseDate(model);
  // The diagram draws after mount; the server-rendered svg already takes its final height.
  const reservedHeight = diagramHeight(arch, expandedBlocks);

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

  const renderIfChanged = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!isExpanded || !svg || !container) return;

    const width = Math.min(svg.clientWidth || container.clientWidth || 600, 640);
    const isDark = isDarkTheme(resolvedTheme);
    const previous = lastRenderRef.current;
    if (
      previous?.width === width &&
      previous.arch === arch &&
      previous.isDark === isDark &&
      previous.locale === locale &&
      previous.expandedBlocks === expandedBlocks &&
      previous.onBlockClick === toggleBlock
    ) {
      return;
    }

    renderDiagram(svg, arch, isDark, expandedBlocks, toggleBlock, locale);
    lastRenderRef.current = {
      width,
      arch,
      isDark,
      locale,
      expandedBlocks,
      onBlockClick: toggleBlock,
    };
  }, [isExpanded, arch, resolvedTheme, locale, expandedBlocks, toggleBlock]);

  useEffect(() => {
    if (!isExpanded || !containerRef.current) {
      lastRenderRef.current = null;
      return;
    }

    renderIfChanged();
    let resizeFrame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(renderIfChanged);
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    };
  }, [isExpanded, renderIfChanged]);

  return (
    <div
      id="architecture-content"
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div ref={containerRef} className={inset ? 'px-4 pb-4' : undefined}>
          <svg ref={svgRef} className="w-full" data-testid="model-architecture-svg" />
          {arch.advertisedContextWindow && arch.contextWindow && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t.contextNote(arch.advertisedContextWindow, arch.contextWindow)}
            </p>
          )}
          {arch.residualType === 'AttnRes' && (
            <p className="mt-2 text-xs text-muted-foreground">{t.latentNote}</p>
          )}
          {arch.routedExpertHiddenSize && arch.hiddenSize && arch.residualType !== 'AttnRes' && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t.pooledNote(arch.routedExpertHiddenSize, arch.hiddenSize)}
            </p>
          )}
          {arch.attentionType === 'Hybrid' &&
            arch.alternatingAttentionExpandable !== false &&
            [0, 1].some(
              (i) => expandedBlocks.has(`altBlock${i}`) && expandedBlocks.has(`altAttention${i}`),
            ) && (
              <p
                className="mt-2 text-2xs leading-snug text-muted-foreground"
                data-testid="hybrid-attention-note"
              >
                <span className="font-medium text-foreground">Local</span>{' '}
                {locale === 'zh' ? '与' : 'and'}{' '}
                <span className="font-medium text-foreground">Compressed</span> {t.hybrid}
              </p>
            )}
          {(arch.hyperConnections ?? 0) > 1 &&
            ['altBlock0', 'altBlock1', 'hashBlock', 'transformer', 'denseTransformer'].some((id) =>
              expandedBlocks.has(id),
            ) && (
              <p
                className="mt-2 text-2xs leading-snug text-muted-foreground"
                data-testid="mhc-note"
              >
                <span className="font-medium text-foreground">
                  Hyper-Connections (mHC ×{arch.hyperConnections})
                </span>{' '}
                {t.mhc(arch.hyperConnections ?? 0)}
              </p>
            )}
          {((arch.features?.length ?? 0) > 0 || arch.sourceUrl) && (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border/30 pt-3 text-xs text-muted-foreground">
              {(arch.features?.length ?? 0) > 0 && (
                <p className="min-w-0 flex-1">
                  {t.features}{' '}
                  <span className="text-foreground">
                    {arch.features
                      ?.map((feature, index) =>
                        locale === 'zh' ? (arch.featuresZh?.[index] ?? feature) : feature,
                      )
                      .join(' · ')}
                  </span>
                </p>
              )}
              {arch.sourceUrl && (
                <Link
                  href={arch.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-0.5 hover:text-foreground"
                  onClick={() =>
                    track('model_architecture_source_clicked', { url: arch.sourceUrl! })
                  }
                >
                  {t.source} <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
          )}
          {arch.developer && releaseDate && (
            <p className="text-xs text-muted-foreground mt-2">
              {t.releasedBy} {arch.developer}
              {t.releasedOn}{' '}
              {new Date(releaseDate).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
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

export default function ModelArchitectureDiagram({
  model,
  className = '',
  variant = 'drawer',
}: ModelArchitectureDiagramProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const arch = getModelArchitecture(model);
  const locale = useLocale();
  const t = ARCHITECTURE_STRINGS[locale];

  if (!arch) return null;

  if (variant === 'inline') {
    return (
      <div className={className} data-testid="model-architecture-inline">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{t.heading}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {architectureSummary(arch)}
          </span>
        </div>
        <ArchitectureContent
          key={model}
          model={model}
          arch={arch}
          isExpanded
          locale={locale}
          inset={false}
        />
      </div>
    );
  }

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    track('model_architecture_toggled', { model, enabled: newState });
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-border/30 ${className}`}>
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
            className="size-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="9" x2="9" y2="21" />
          </svg>
          <span className="text-sm font-medium">{t.heading}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {architectureSummary(arch)}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      <ArchitectureContent
        key={model}
        model={model}
        arch={arch}
        isExpanded={isExpanded}
        locale={locale}
        inset
      />
    </div>
  );
}
