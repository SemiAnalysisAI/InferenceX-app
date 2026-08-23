'use client';

import { track } from '@/lib/analytics';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

import { getModelReleaseDate } from '@semianalysisai/inferencex-constants';

import { Badge } from '@/components/ui/badge';
import type { Model } from '@/lib/data-mappings';
import {
  type ModelArchitecture,
  formatParamCount,
  getModelArchitecture,
} from '@/lib/model-architectures';
import { renderDiagram } from './model-architecture-diagram-renderer';

interface ModelArchitectureDiagramProps {
  model: Model;
  className?: string;
  /**
   * `drawer` (default) renders the collapsible bar used inside dashboard
   * cards. `inline` renders the diagram always-expanded with no toggle —
   * used by the `/model/[slug]` pages where the architecture is the content,
   * not an aside.
   */
  variant?: 'drawer' | 'inline';
}

interface ArchitectureContentProps {
  model: Model;
  arch: ModelArchitecture;
  isExpanded: boolean;
  locale: Locale;
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
    heading: 'Model Architecture',
    features: 'Features:',
    source: 'Source',
    releasedBy: 'Released by',
    releasedOn: ' on',
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
    hybrid:
      '是两路 KV 来源，而非两套独立注意力：每个 query 都通过一次 softmax 同时关注滑动窗口与筛选后的压缩 key，并为每个 attention head 使用可学习的 attention sink。',
    mhc: (count: number) =>
      `将每条残差连接替换为 ${count} 路并行流，并通过学习得到的 Sinkhorn 归一化权重组合：包括读取 (${count}→1)、输出以及 ${count}×${count} 的流混合；图中标为 mHC ×${count} 节点。`,
  },
} as const;

function ArchitectureContent({ model, arch, isExpanded, locale }: ArchitectureContentProps) {
  const t = ARCHITECTURE_STRINGS[locale];
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRenderRef = useRef<DiagramRenderState | null>(null);
  const { resolvedTheme } = useTheme();
  const releaseDate = getModelReleaseDate(model);

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

    // Match the renderer's effective width so ResizeObserver notifications that
    // cannot change the SVG (including its initial callback) stay no-ops.
    const width = Math.min(container.clientWidth || 600, 640);
    const isDark = resolvedTheme === 'dark' || resolvedTheme === 'minecraft';
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
    const observer = new ResizeObserver(renderIfChanged);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isExpanded, renderIfChanged]);

  return (
    <div
      id="architecture-content"
      className={`overflow-hidden transition-all duration-200 ease-in-out ${
        isExpanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div ref={containerRef} className="px-4 pb-4">
        <svg ref={svgRef} className="w-full" data-testid="model-architecture-svg" />
        {/* The drill-down only renders while its parent block is expanded, so gate
              the caption on the parent too — collapsing the parent leaves the child
              id in expandedBlocks (state is restored on re-expand), and the caption
              must not outlive the drawing it explains. */}
        {/* Mirrors `altAttnExpandable` in renderDiagram: the caption describes the
              CSA/HCA local-vs-compressed drill-down, so hybrids that opt out of that
              drill-down must not show it either. */}
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
            <p className="mt-2 text-2xs leading-snug text-muted-foreground" data-testid="mhc-note">
              <span className="font-medium text-foreground">
                Hyper-Connections (mHC ×{arch.hyperConnections})
              </span>{' '}
              {t.mhc(arch.hyperConnections ?? 0)}
            </p>
          )}
        {arch.features && arch.features.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t.features}</span>
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
                  {t.source} <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
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
      <div
        className={`rounded-lg border border-border/50 bg-muted/30 overflow-hidden ${className}`}
        data-testid="model-architecture-inline"
      >
        <div className="px-4 py-2 flex items-center gap-2">
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
        <ArchitectureContent key={model} model={model} arch={arch} isExpanded />
      </div>
    );
  }

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
      />
    </div>
  );
}
