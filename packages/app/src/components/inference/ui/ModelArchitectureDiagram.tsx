'use client';

import { track } from '@/lib/analytics';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

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
}

interface ArchitectureContentProps {
  model: Model;
  arch: ModelArchitecture;
  isExpanded: boolean;
}

interface DiagramRenderState {
  width: number;
  arch: ModelArchitecture;
  isDark: boolean;
  expandedBlocks: Set<string>;
  onBlockClick: (blockId: string) => void;
}

function ArchitectureContent({ model, arch, isExpanded }: ArchitectureContentProps) {
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
      previous.expandedBlocks === expandedBlocks &&
      previous.onBlockClick === toggleBlock
    ) {
      return;
    }

    renderDiagram(svg, arch, isDark, expandedBlocks, toggleBlock);
    lastRenderRef.current = { width, arch, isDark, expandedBlocks, onBlockClick: toggleBlock };
  }, [isExpanded, arch, resolvedTheme, expandedBlocks, toggleBlock]);

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
              className="mt-2 text-[11px] leading-snug text-muted-foreground"
              data-testid="hybrid-attention-note"
            >
              <span className="font-medium text-foreground">Local</span> and{' '}
              <span className="font-medium text-foreground">Compressed</span> are two KV sources,
              not two separate attentions: each query attends in a{' '}
              <span className="font-medium text-foreground">single softmax</span> to the union of
              sliding-window + selected compressed keys, with a learnable per-head attention sink.
            </p>
          )}
        {(arch.hyperConnections ?? 0) > 1 &&
          ['altBlock0', 'altBlock1', 'hashBlock', 'transformer', 'denseTransformer'].some((id) =>
            expandedBlocks.has(id),
          ) && (
            <p
              className="mt-2 text-[11px] leading-snug text-muted-foreground"
              data-testid="mhc-note"
            >
              <span className="font-medium text-foreground">
                Hyper-Connections (mHC ×{arch.hyperConnections})
              </span>{' '}
              replace each residual with {arch.hyperConnections} parallel streams combined by
              learned, Sinkhorn-normalized weights — read ({arch.hyperConnections}→1), output, and a{' '}
              {arch.hyperConnections}×{arch.hyperConnections} stream mix — shown as the mHC ×
              {arch.hyperConnections} nodes.
            </p>
          )}
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
                  Source <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
          </div>
        )}
        {arch.developer && releaseDate && (
          <p className="text-xs text-muted-foreground mt-2">
            Released by {arch.developer} on{' '}
            {new Date(releaseDate).toLocaleDateString('en-US', {
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
}: ModelArchitectureDiagramProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const arch = getModelArchitecture(model);

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
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      <ArchitectureContent key={model} model={model} arch={arch} isExpanded={isExpanded} />
    </div>
  );
}
