import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { interpolateMetricAtInteractivity } from '@/components/inference/hooks/interpolated-trend-core';
import type { InferenceData } from '@/components/inference/types';

import evidence from './__fixtures__/glm5-cost-2026-05-20.json';

const SLUG = 'mi355x-glm5-fp8-sglang-40-cheaper-than-b200';
const CONTENT = path.resolve(import.meta.dirname, '../../../content/blog');
type Hardware = keyof typeof evidence.tcoUsdPerGpuHour;
type Mode = 'mtp' | 'none';

const metric = (y: number) => ({ y, roof: false });

function points(hardware: Hardware, mode: Mode): InferenceData[] {
  return evidence.rows
    .filter((row) => row.hardware === hardware && row.spec_method === mode)
    .map((row) => {
      const throughput = row.metrics.tput_per_gpu;
      const pointCost = (evidence.tcoUsdPerGpuHour[hardware] * 1e6) / (3600 * throughput);
      return {
        x: row.metrics.median_intvty,
        y: throughput,
        hwKey: `${hardware}_sglang${mode === 'mtp' ? '_mtp' : ''}`,
        date: row.date,
        tp: row.decode_tp,
        conc: row.conc,
        precision: row.precision,
        tpPerGpu: metric(throughput),
        tpPerMw: metric(0),
        costh: metric(pointCost),
        costr: metric(0),
        costhi: metric(0),
        costri: metric(0),
      };
    });
}

function cost(hardware: Hardware, mode: Mode, target: number): number | null {
  return interpolateMetricAtInteractivity(points(hardware, mode), target, 'costh');
}

function comparison(mode: Mode, target: number): string[] {
  const b200 = cost('b200', mode, target);
  const mi355x = cost('mi355x', mode, target);
  if (b200 === null || mi355x === null) throw new Error('Target outside common measured range');
  return [
    String(target),
    `$${b200.toFixed(4)}`,
    `$${mi355x.toFixed(4)}`,
    `${(b200 / mi355x).toFixed(3)}x`,
    `${((1 - mi355x / b200) * 100).toFixed(1)}%`,
  ];
}

function tableRows(source: string): string[][][] {
  return source
    .split(/\n\s*\n/u)
    .filter((block) => /^\|.*B200 \/ MI355X/u.test(block))
    .map((block) =>
      block
        .split('\n')
        .slice(2)
        .map((line) =>
          line
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.replaceAll('**', '').trim()),
        ),
    );
}

it('retains the exact historical population and original producer identities', () => {
  expect(evidence.rows).toHaveLength(29);
  expect(new Set(evidence.rows.map((row) => row.id)).size).toBe(29);
  for (const row of evidence.rows) {
    expect(row).toMatchObject({
      model: 'glm5',
      framework: 'sglang',
      precision: 'fp8',
      benchmark_type: 'single_turn',
      isl: 8192,
      osl: 1024,
      disagg: false,
      offload_mode: 'off',
    });
    expect([row.date, row.run_url]).toEqual(
      row.hardware === 'b200'
        ? [
            '2026-05-18',
            'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26047946365/attempts/1',
          ]
        : [
            '2026-05-19',
            'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26046385161/attempts/1',
          ],
    );
  }
});

it('rejects the former extrapolated comparisons instead of manufacturing a saving', () => {
  expect(cost('mi355x', 'mtp', 18)).toBeNull();
  expect(cost('b200', 'mtp', 18)).toBeGreaterThan(0);
  expect(cost('b200', 'none', 10)).toBeNull();
  expect(cost('mi355x', 'none', 10)).toBeGreaterThan(0);
});

it('keeps the non-MTP saving positive across the complete common measured range', () => {
  const low = 10.721980046228646;
  const high = 42.03240852199166;
  for (let sample = 0; sample <= 100; sample += 1) {
    const target = low + ((high - low) * sample) / 100;
    expect(cost('b200', 'none', target)! - cost('mi355x', 'none', target)!).toBeGreaterThan(0);
  }
});

it('uses unrounded costs and the reference-cost denominator for percentage savings', () => {
  const b200 = cost('b200', 'mtp', 24.3195310505088)!;
  const mi355x = cost('mi355x', 'mtp', 24.3195310505088)!;
  expect(b200).toBeCloseTo(0.33889205243689297, 12);
  expect(mi355x).toBeCloseTo(0.23850119029670874, 12);
  expect(b200 / mi355x).toBeCloseTo(1.4209239459781833, 12);
  expect((1 - mi355x / b200) * 100).toBeCloseTo(29.62325655567818, 10);
  expect(comparison('mtp', 90)).toEqual(['90', '$1.0475', '$1.0765', '0.973x', '-2.8%']);
});

for (const locale of ['en', 'zh'] as const) {
  describe(`${locale} GLM-5 article numerical parity`, () => {
    const source = fs.readFileSync(
      path.join(CONTENT, locale === 'zh' ? 'zh' : '', `${SLUG}.mdx`),
      'utf8',
    );

    it('publishes only reachable table rows computed by the dashboard interpolation', () => {
      expect(tableRows(source)).toEqual([
        [18.1, 24, 24.3, 35, 55, 77, 90].map((target) => comparison('mtp', target)),
        [11.2, 15, 20, 30, 40].map((target) => comparison('none', target)),
      ]);
    });

    it('keeps metadata and structured answers aligned with the recomputed costs', () => {
      const title = source.match(/^title: (?<value>.*)$/mu)!.groups!.value;
      const description = source.match(/^seoDescription: (?<value>.*)$/mu)!.groups!.value;
      const saving = comparison('mtp', 24.3)[4];
      expect(title).toContain(saving);
      expect(description).toContain(saving);
      const jsonLd = source.split('<JsonLd>{`')[1].split('`}</JsonLd>')[0];
      const faq = JSON.parse(jsonLd).mainEntity;
      for (const index of [0, 2]) {
        const answer: string = faq[index].acceptedAnswer.text;
        for (const figure of comparison('mtp', 24.3).slice(0, 3)) {
          expect(answer).toContain(figure);
        }
        expect(answer).toContain(saving);
      }
      expect(faq[3].acceptedAnswer.text).toContain(comparison('none', 11.2)[4]);
      expect(source).not.toContain('g_runid=26187777287');
    });
  });
}
