// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import {
  describeEngineComparisonConflict,
  EngineComparisonConflictNotice,
  EngineComparisonConflictProvider,
} from './engine-comparison-conflict-notice';
import { useLocale } from '@/lib/i18n/use-locale';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: vi.fn(() => 'en') }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('EngineComparisonConflictNotice', () => {
  it.each([
    ['en', 'vLLM & SGLang on same SKU can’t share a graph'],
    ['zh', '同一 SKU 上的 vLLM 和 SGLang 无法在同一图表中显示'],
  ] as const)('renders the %s title once inline across legends', (locale, title) => {
    vi.mocked(useLocale).mockReturnValue(locale);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(EngineComparisonConflictProvider, {
          detail: { kind: 'blocked', attempted: 'vllm', existing: 'sglang' },
          onDismiss: () => {},
          children: [
            createElement(EngineComparisonConflictNotice, { key: 'first' }),
            createElement(EngineComparisonConflictNotice, { key: 'second' }),
          ],
        }),
      ),
    );
    const notices = container.querySelectorAll('[data-testid="engine-comparison-conflict-notice"]');
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain(title);
    act(() => root.unmount());
  });
});

describe('describeEngineComparisonConflict', () => {
  it.each([
    ['vllm', 'sglang'],
    ['sglang', 'vllm'],
  ])('uses the requested copy when %s conflicts with %s', (attempted, existing) => {
    expect(describeEngineComparisonConflict({ kind: 'blocked', attempted, existing }, 'en')).toBe(
      'vLLM & SGLang take different approaches to inference and so they aren’t directly comparable. Also, we don’t want to start vLLM vs SGLang drama LMFAO',
    );
    expect(describeEngineComparisonConflict({ kind: 'blocked', attempted, existing }, 'zh')).toBe(
      'vLLM 和 SGLang 采用不同的推理方式，因此无法直接比较。另外，我们也不想引发 vLLM 和 SGLang 之间的争论，笑死。',
    );
  });

  it('preserves the fallback when the existing engine is unknown', () => {
    expect(
      describeEngineComparisonConflict(
        { kind: 'blocked', attempted: 'vllm', existing: null },
        'en',
      ),
    ).toBe(
      "vLLM can't be enabled while another engine family is active. Remove the existing configs first.",
    );
  });

  it('describes partial removal without assuming hardware scope', () => {
    const message = describeEngineComparisonConflict(
      {
        kind: 'resolved',
        kept: ['vllm'],
        dropped: [],
        partial: ['sglang'],
      },
      'en',
    );

    expect(message).toContain(
      'Disabled conflicting SGLang configs while compatible SGLang configs remain shown',
    );
    expect(message).not.toContain('SKU');
    expect(message).not.toContain('Kept SGLang');
    expect(message).not.toContain('removed SGLang');
  });

  it('preserves the whole-family resolution message', () => {
    expect(
      describeEngineComparisonConflict(
        {
          kind: 'resolved',
          kept: ['sglang'],
          dropped: ['vllm'],
          partial: [],
        },
        'en',
      ),
    ).toContain('Kept SGLang and removed vLLM configs');
  });
});
