// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { MODEL_ARCHITECTURES } from '@/lib/catalog/model-architectures';

import { diagramHeight, renderDiagram } from './model-architecture-diagram-renderer';

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawnHeight(
  arch: NonNullable<(typeof MODEL_ARCHITECTURES)[keyof typeof MODEL_ARCHITECTURES]>,
  expanded: Set<string>,
): number {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.append(svg);
  renderDiagram(svg, arch, false, expanded, () => {}, 'en');
  const height = Number(svg.getAttribute('height'));
  svg.remove();
  return height;
}

const standard = Object.values(MODEL_ARCHITECTURES).filter(
  (arch): arch is NonNullable<typeof arch> => Boolean(arch && !arch.encoderDecoder),
);

describe('diagramHeight', () => {
  it('covers every standard architecture', () => {
    expect(standard.length).toBeGreaterThan(5);
  });

  it.each(standard.map((arch) => [arch.model, arch] as const))(
    'matches the collapsed height the renderer draws for %s',
    (_model, arch) => {
      const expanded = new Set<string>();
      const height = diagramHeight(arch, expanded);
      expect(height).toBeGreaterThan(200);
      expect(height).toBe(drawnHeight(arch, expanded));
    },
  );

  it.each(standard.map((arch) => [arch.model, arch] as const))(
    'matches the drawn height for %s with every block expanded',
    (_model, arch) => {
      const expanded = new Set([
        'transformer',
        'attention',
        'experts',
        'ffn',
        'denseTransformer',
        'denseAttention',
        'denseFFN',
        'hashBlock',
        'hashExperts',
        'altBlock0',
        'altBlock1',
        'altExperts0',
        'altExperts1',
        'altFFN0',
        'altFFN1',
        'altAttention0',
        'altAttention1',
      ]);
      const collapsed = diagramHeight(arch, new Set());
      const height = diagramHeight(arch, expanded);
      expect(height).toBeGreaterThan(collapsed ?? 0);
      expect(height).toBe(drawnHeight(arch, expanded));
    },
  );

  it('returns null for the encoder-decoder layout, whose height depends on width', () => {
    const ced = Object.values(MODEL_ARCHITECTURES).find((arch) => arch?.encoderDecoder);
    expect(ced).toBeDefined();
    expect(diagramHeight(ced!, new Set())).toBeNull();
  });
});
