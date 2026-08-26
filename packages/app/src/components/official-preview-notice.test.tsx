// @vitest-environment jsdom
import React, { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  includesJalapenoResult,
  includesVeraRubinResult,
  JalapenoOfficialPreviewNotice,
  VeraRubinOfficialPreviewNotice,
} from '@/components/official-preview-notice';

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

function renderNotice(element: ReactElement, testId: string) {
  act(() => root.render(element));
  return container.querySelector(`[data-testid="${testId}"]`);
}

describe('official preview notices', () => {
  it('recognizes each preview hardware family without cross-matching', () => {
    expect(includesJalapenoResult(['h100_vllm', 'jalapeno_teacup'])).toBe(true);
    expect(includesJalapenoResult(['jalapeno_fp4'])).toBe(true);
    expect(includesJalapenoResult(['h100_vllm', 'vr200_rubin-july'])).toBe(false);

    expect(includesVeraRubinResult(['h100_vllm', 'vr200_rubin-july'])).toBe(true);
    expect(includesVeraRubinResult(['vr200_coreweave-vera-rubin'])).toBe(true);
    expect(includesVeraRubinResult(['h100_vllm', 'jalapeno_teacup'])).toBe(false);
  });

  it('identifies Jalapeño and Vera Rubin data as official previews in English', () => {
    const jalapenoNotice = renderNotice(
      <JalapenoOfficialPreviewNotice />,
      'jalapeno-official-preview-notice',
    );
    expect(jalapenoNotice?.getAttribute('role')).toBe('note');
    expect(jalapenoNotice?.getAttribute('aria-label')).toBe('InferenceX Official Preview');
    expect(jalapenoNotice?.textContent).toContain('Jalapeño results are an official preview');

    const rubinNotice = renderNotice(
      <VeraRubinOfficialPreviewNotice />,
      'vera-rubin-official-preview-notice',
    );
    expect(rubinNotice?.getAttribute('role')).toBe('note');
    expect(rubinNotice?.textContent).toContain('Vera Rubin (July) results are an official preview');
  });

  it('renders natural Simplified Chinese copy under /zh', () => {
    localeState.pathname = '/zh/inference';
    const notice = renderNotice(
      <VeraRubinOfficialPreviewNotice />,
      'vera-rubin-official-preview-notice',
    );

    expect(notice?.getAttribute('aria-label')).toBe('InferenceX 官方预览');
    expect(notice?.textContent).toContain('Vera Rubin (July) 结果为官方预览');
    expect(notice?.textContent).toContain('随着验证和发布工作的推进');
  });
});
