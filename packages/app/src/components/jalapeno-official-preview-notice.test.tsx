// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  includesJalapenoResult,
  JalapenoOfficialPreviewNotice,
} from '@/components/jalapeno-official-preview-notice';

const localeState = vi.hoisted(() => ({ pathname: '/inference' }));

vi.mock('next/navigation', () => ({
  usePathname: () => localeState.pathname,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localeState.pathname = '/inference';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderNotice() {
  act(() => root.render(<JalapenoOfficialPreviewNotice />));
  return container.querySelector('[data-testid="jalapeno-official-preview-notice"]');
}

describe('JalapenoOfficialPreviewNotice', () => {
  it('recognizes Jalapeño configuration keys without matching unrelated hardware', () => {
    expect(includesJalapenoResult(['h100_vllm', 'jalapeno_teacup'])).toBe(true);
    expect(includesJalapenoResult(['jalapeno_fp4'])).toBe(true);
    expect(includesJalapenoResult(['h100_vllm', 'vr200_rubin-july'])).toBe(false);
  });

  it('identifies Jalapeño data as an official preview in English', () => {
    const notice = renderNotice();

    expect(notice?.getAttribute('role')).toBe('note');
    expect(notice?.getAttribute('aria-label')).toBe('InferenceX Official Preview');
    expect(notice?.textContent).toContain('Jalapeño results are an official preview');
  });

  it('renders natural Simplified Chinese copy under /zh', () => {
    localeState.pathname = '/zh/inference';
    const notice = renderNotice();

    expect(notice?.getAttribute('aria-label')).toBe('InferenceX 官方预览');
    expect(notice?.textContent).toContain('Jalapeño 结果为官方预览');
    expect(notice?.textContent).toContain('随着验证和发布工作的推进');
  });
});
