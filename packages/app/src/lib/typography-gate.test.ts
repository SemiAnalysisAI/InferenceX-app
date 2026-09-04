import { describe, expect, it } from 'vitest';

import { compareToAllowlist, countViolations, isExemptPath, scanSource } from './typography-gate';

describe('scanSource', () => {
  it('flags arbitrary font sizes with a token suggestion', () => {
    const source = '<span className="font-mono text-[11px] text-muted-foreground" />';
    const violations = scanSource('src/components/foo.tsx', source);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      rule: 'arbitrary-text-size',
      line: 1,
      match: 'text-[11px]',
    });
    expect(violations[0].suggestion).toContain('text-2xs');
  });

  it('counts multiple matches on one line and reports line numbers', () => {
    const source = ['const a = 1;', '"text-[10px] text-[0.65rem]"'].join('\n');
    const violations = scanSource('src/components/foo.tsx', source);
    expect(violations.map((v) => v.line)).toEqual([2, 2]);
    expect(violations.map((v) => v.match)).toEqual(['text-[10px]', 'text-[0.65rem]']);
  });

  it('ignores arbitrary text colors and slash line-height modifiers on scale classes', () => {
    const source = '"text-[#ed1c24] text-2xl/[1.8rem] text-2xs text-3xs"';
    expect(scanSource('src/components/foo.tsx', source)).toHaveLength(0);
  });

  it('flags arbitrary tracking but not the named tokens', () => {
    const source = '"tracking-[0.16em] tracking-eyebrow tracking-heading tracking-widest"';
    const violations = scanSource('src/components/foo.tsx', source);
    expect(violations).toHaveLength(1);
    expect(violations[0].match).toBe('tracking-[0.16em]');
    expect(violations[0].suggestion).toContain('tracking-eyebrow');
  });

  it('flags quoted chart font-size literals only inside src/lib/d3-chart', () => {
    const literal = ".attr('font-size', '12px')";
    expect(scanSource('src/lib/d3-chart/layers/foo.ts', literal)).toHaveLength(1);
    expect(scanSource('src/components/foo.ts', literal)).toHaveLength(0);
  });

  it('lets computed and CHART_TYPE-based chart font sizes through', () => {
    const source = [
      ".attr('font-size', px(CHART_TYPE.axisLabel))",
      `.attr('font-size', \`\${fontSize}px\`)`,
      ".style('font-size', sizeVar)",
    ].join('\n');
    expect(scanSource('src/lib/d3-chart/layers/foo.ts', source)).toHaveLength(0);
  });

  it('exempts OG renderers, tests, and the gate itself', () => {
    expect(isExemptPath('src/app/model/[slug]/opengraph-image.tsx')).toBe(true);
    expect(isExemptPath('src/app/blog/[slug]/og-image-render.tsx')).toBe(true);
    expect(isExemptPath('src/lib/compare-og.tsx')).toBe(true);
    expect(isExemptPath('src/lib/typography-gate.ts')).toBe(true);
    expect(isExemptPath('src/components/foo.test.tsx')).toBe(true);
    expect(isExemptPath('src/components/foo.tsx')).toBe(false);
    expect(scanSource('src/lib/compare-og.tsx', '"text-[11px]"')).toHaveLength(0);
  });
});

const files = (source: string) => [{ relPath: 'src/components/foo.tsx', source }];

describe('compareToAllowlist', () => {
  it('passes when counts match the allowlist exactly', () => {
    const counts = countViolations(files('"text-[11px]"'));
    const result = compareToAllowlist(counts, {
      'src/components/foo.tsx': { 'arbitrary-text-size': 1 },
    });
    expect(result.errors).toHaveLength(0);
    expect(result.stale).toHaveLength(0);
  });

  it('fails when a file grows past its allowance', () => {
    const counts = countViolations(files('"text-[11px] text-[10px]"'));
    const result = compareToAllowlist(counts, {
      'src/components/foo.tsx': { 'arbitrary-text-size': 1 },
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('src/components/foo.tsx');
  });

  it('fails on offenders in files the allowlist does not know', () => {
    const counts = countViolations(files('"tracking-[0.5em]"'));
    const result = compareToAllowlist(counts, {});
    expect(result.errors).toHaveLength(1);
  });

  it('reports stale entries when violations were fixed, so the ratchet only shrinks', () => {
    const result = compareToAllowlist(
      {},
      { 'src/components/foo.tsx': { 'arbitrary-text-size': 1 } },
    );
    expect(result.errors).toHaveLength(0);
    expect(result.stale).toHaveLength(1);
  });
});
