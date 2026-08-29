import { describe, expect, it } from 'vitest';

import { buildParsePrompt, buildSummaryPrompt } from './prompt-templates';

describe('AI chart locale instructions', () => {
  it('keeps English chart fields and prose instructions unchanged by default', () => {
    const prompt = buildParsePrompt();
    const summaryPrompt = buildSummaryPrompt(
      [
        {
          title: 'B200 throughput',
          yAxisLabel: 'Throughput/Chip',
          model: 'DeepSeek-R1-0528',
          sequence: '8k/1k',
        },
      ],
      'B200: 12345.67 tok/s',
    );

    expect(prompt).toContain('"title": "short chart title"');
    expect(prompt).not.toContain('Simplified Chinese');
    expect(summaryPrompt)
      .toBe(`You are an expert performance analyst. Based on the following benchmark data, provide a concise 2-3 sentence summary highlighting the key takeaway.

Chart: B200 throughput | Metric: Throughput/Chip | Model: DeepSeek-R1-0528, Seq: 8k/1k

Data:
B200: 12345.67 tok/s

Rules:
- Be technical and precise. Mention specific values and percentage differences.
- Focus on the most interesting comparison or finding.
- No markdown formatting, just plain text.`);
  });

  it('asks for Simplified Chinese presentation fields on Chinese routes', () => {
    const prompt = buildParsePrompt('zh');

    expect(prompt).toContain(
      'Write title, description, and yAxisLabel in natural Simplified Chinese',
    );
    expect(prompt).toContain('Keep identifiers, model names, hardware SKUs, and units unchanged');
  });

  it('asks for a Chinese summary while preserving the benchmark data', () => {
    const prompt = buildSummaryPrompt(
      [
        {
          title: 'B200 vs H100',
          yAxisLabel: 'Throughput/Chip',
          model: 'DeepSeek-R1-0528',
          sequence: '8k/1k',
        },
      ],
      'B200: 12345.67 tok/s',
      'zh',
    );

    expect(prompt).toContain('用自然、准确的简体中文回答');
    expect(prompt).toContain('B200: 12345.67 tok/s');
  });
});
