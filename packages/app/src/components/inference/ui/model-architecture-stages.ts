import * as d3 from 'd3';

import { formatParamCount, type ModelArchitecture } from '@/lib/catalog/model-architectures';
import type { Locale } from '@/lib/i18n/i18n';

/** Wrap CJK and Latin text without shrinking the diagram on narrow screens. */
function wrapText(text: string, capacity: number): string[] {
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (const char of text.match(/[\p{Script=Latin}\d.,]+|./gu) ?? []) {
    const units = [...char].reduce(
      (sum, unit) => sum + ((unit.codePointAt(0) ?? 0) > 255 ? 2 : 1),
      0,
    );
    if (used + units > capacity && line) {
      lines.push(line.trim());
      line = '';
      used = 0;
    }
    line += char;
    used += units;
  }
  if (line) lines.push(line.trim());
  return lines;
}

/** Explicit source-backed stages, without imposing a generic decoder residual graph. */
export function renderArchitectureStages(
  svgEl: SVGSVGElement,
  arch: ModelArchitecture,
  isDark: boolean,
  locale: Locale,
) {
  const width = Math.min(svgEl.parentElement?.clientWidth || 600, 640);
  const capacity = Math.max(16, Math.floor((width - 64) / 7));
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('role', 'img').attr('aria-label', arch.model);
  const fg = isDark ? '#eaebec' : '#131416';
  const muted = isDark ? '#9ca3af' : '#6b7280';
  let y = 16;

  function textLines(lines: string[], startY: number, strong: boolean) {
    for (const [index, line] of lines.entries()) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', startY + index * 18)
        .attr('text-anchor', 'middle')
        .attr('class', strong ? 'text-xs font-semibold' : 'text-xs')
        .attr('fill', strong ? fg : muted)
        .text(line);
    }
  }

  const params =
    arch.activeParamsPrefill === undefined
      ? locale === 'zh'
        ? `总参数 ${formatParamCount(arch.totalParams)}；激活参数 ${formatParamCount(arch.activeParams)}`
        : `${formatParamCount(arch.totalParams)} total · ${formatParamCount(arch.activeParams)} active`
      : locale === 'zh'
        ? `主干参数 ${formatParamCount(arch.totalParams)}；prefill 激活 ${formatParamCount(arch.activeParamsPrefill)}；decode 激活 ${formatParamCount(arch.activeParams)}`
        : `${formatParamCount(arch.totalParams)} · prefill ${formatParamCount(arch.activeParamsPrefill)} · decode ${formatParamCount(arch.activeParams)}`;
  const parameterLines = wrapText(params, capacity);
  textLines(parameterLines, y + 12, true);
  y += 22 + parameterLines.length * 18;
  for (const [index, stage] of (arch.diagramStages ?? []).entries()) {
    const title = wrapText(locale === 'zh' ? stage.labelZh : stage.label, capacity);
    const detail = wrapText(locale === 'zh' ? stage.detailZh : stage.detail, capacity);
    const height = 24 + (title.length + detail.length) * 18;
    svg
      .append('rect')
      .attr('data-testid', `architecture-stage-${index}`)
      .attr('x', 12)
      .attr('y', y)
      .attr('width', width - 24)
      .attr('height', height)
      .attr('rx', 8)
      .attr('fill', isDark ? '#1e293b' : '#f1f5f9')
      .attr('stroke', isDark ? '#475569' : '#cbd5e1');
    textLines(title, y + 24, true);
    textLines(detail, y + 24 + title.length * 18, false);
    y += height;
    if (index < (arch.diagramStages?.length ?? 0) - 1) {
      y += 12;
    }
  }
  svg.attr('viewBox', `0 0 ${width} ${y + 16}`).attr('height', y + 16);
}
