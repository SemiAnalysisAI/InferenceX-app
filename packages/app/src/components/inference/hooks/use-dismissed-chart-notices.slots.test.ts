// @test-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { KnownIssueAnnotation } from '@/components/inference/utils/knownIssueAnnotations';
import { advanceTimersByTime, useFakeTimers, useRealTimers } from '@/test/helpers';

import { CLOSED_NOTICE_SLOT_MS, useDismissedChartNotices } from './use-dismissed-chart-notices';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const notice = (id: string, label: string): KnownIssueAnnotation => ({
  preview: { id, summary: 'InferenceX Official Preview', detail: '' },
  label,
  color: '#00f',
  points: [],
});

const VERA_RUBIN = notice('vera-rubin-official-preview', 'Vera Rubin NVL72 (Dynamo SGLang)');
const TPU = notice('tpuv7-official-preview', 'TPU7x (vLLM)');
const JALAPENO = notice('jalapeno-official-preview', 'Jalapeño');

let container: HTMLDivElement;
let root: Root;
let hook: ReturnType<typeof useDismissedChartNotices>;

function Probe() {
  hook = useDismissedChartNotices();
  return null;
}

/** The stack a chart would draw: label, plus whether it is a held empty slot. */
const drawn = (annotations: KnownIssueAnnotation[]) =>
  hook.visibleNotices(annotations).map((a) => `${a.label}${a.dismissed ? ' (slot)' : ''}`);

beforeEach(() => {
  localStorage.clear();
  useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Probe)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useRealTimers();
});

describe('closed chart notice slots', () => {
  it('holds a closed notice slot briefly, then lets the stack close up', () => {
    expect(drawn([VERA_RUBIN, TPU])).toEqual(['Vera Rubin NVL72 (Dynamo SGLang)', 'TPU7x (vLLM)']);

    act(() => hook.dismiss(VERA_RUBIN));
    expect(drawn([VERA_RUBIN, TPU])).toEqual([
      'Vera Rubin NVL72 (Dynamo SGLang) (slot)',
      'TPU7x (vLLM)',
    ]);

    act(() => advanceTimersByTime(CLOSED_NOTICE_SLOT_MS - 1));
    expect(drawn([VERA_RUBIN, TPU])).toEqual([
      'Vera Rubin NVL72 (Dynamo SGLang) (slot)',
      'TPU7x (vLLM)',
    ]);

    act(() => advanceTimersByTime(1));
    expect(drawn([VERA_RUBIN, TPU])).toEqual(['TPU7x (vLLM)']);
  });

  it('drops the slot as soon as the chart shows a different set of notices', () => {
    drawn([VERA_RUBIN, TPU]);
    act(() => hook.dismiss(VERA_RUBIN));

    expect(drawn([VERA_RUBIN, TPU, JALAPENO])).toEqual(['TPU7x (vLLM)', 'Jalapeño']);
    expect(drawn([VERA_RUBIN, TPU])).toEqual(['TPU7x (vLLM)']);
  });

  it('keeps every slot closed in the same stack until each one expires', () => {
    drawn([VERA_RUBIN, TPU, JALAPENO]);
    act(() => hook.dismiss(VERA_RUBIN));
    act(() => advanceTimersByTime(CLOSED_NOTICE_SLOT_MS / 2));
    act(() => hook.dismiss(TPU));

    expect(drawn([VERA_RUBIN, TPU, JALAPENO])).toEqual([
      'Vera Rubin NVL72 (Dynamo SGLang) (slot)',
      'TPU7x (vLLM) (slot)',
      'Jalapeño',
    ]);

    act(() => advanceTimersByTime(CLOSED_NOTICE_SLOT_MS / 2));
    expect(drawn([VERA_RUBIN, TPU, JALAPENO])).toEqual(['TPU7x (vLLM) (slot)', 'Jalapeño']);
  });
});
