import { beforeEach, describe, expect, it } from 'bun:test';

import {
  crossTabParams,
  getProfitHardwareSeed,
  recordProfitPick,
  resetCrossTabSelection,
  seededHardwareVisibility,
  selectionTabKind,
  setProfitHardwareSeed,
} from './cross-tab-selection';

const inferenceLive = () =>
  new URLSearchParams({
    g_model: 'DeepSeek-V4-Pro',
    i_seq: 'agentic-traces',
    i_prec: 'fp8',
    i_active: 'b200_sglang,gb300_dynamo-sglang',
    i_metric: 'y_tokensPerDollarH',
    g_rundate: '2026-11-20',
    g_runid: '123',
  });

describe('cross-tab selection', () => {
  beforeEach(() => resetCrossTabSelection());

  it('maps only inference and the profit estimators', () => {
    expect(selectionTabKind('inference')).toBe('inference');
    expect(selectionTabKind('profit-estimator')).toBe('profit');
    expect(selectionTabKind('profit-estimator-per-gigawatt')).toBe('profit');
    expect(selectionTabKind('calculator')).toBeNull();
  });

  it('hands the inference model, precision, date and hardware to the profit estimator', () => {
    const params = crossTabParams('inference', 'profit', inferenceLive());
    expect(params.get('g_model')).toBe('DeepSeek-V4-Pro');
    expect(params.get('i_prec')).toBe('fp8');
    expect(params.get('g_rundate')).toBe('2026-11-20');
    expect(params.has('g_runid')).toBe(false);
    expect(params.has('i_seq')).toBe(false);
    expect(getProfitHardwareSeed()).toEqual({
      model: 'DeepSeek-V4-Pro',
      keys: ['b200_sglang', 'gb300_dynamo-sglang'],
    });
  });

  it('keeps the profit model when inference shows one it does not offer', () => {
    crossTabParams(
      'profit',
      'inference',
      new URLSearchParams({ g_model: 'GLM-5.2', c_ivtarget: '30' }),
    );
    const live = inferenceLive();
    live.set('g_model', 'Not-A-Profit-Model');
    const params = crossTabParams('inference', 'profit', live);
    expect(params.get('g_model')).toBe('GLM-5.2');
    expect(params.get('c_ivtarget')).toBe('30');
  });

  it('restores the full inference view on return when nothing was picked on profit', () => {
    crossTabParams('inference', 'profit', inferenceLive());
    const back = crossTabParams('profit', 'inference', new URLSearchParams({ g_model: 'Kimi-K3' }));
    expect(Object.fromEntries(back)).toEqual(Object.fromEntries(inferenceLive()));
  });

  it('applies picks made on the profit estimator when returning to inference', () => {
    const live = inferenceLive();
    live.set('i_best', '1');
    crossTabParams('inference', 'profit', live);
    recordProfitPick('i_prec', 'fp4');
    recordProfitPick('i_active', 'b200_sglang');
    const back = crossTabParams('profit', 'inference', new URLSearchParams());
    expect(back.get('i_prec')).toBe('fp4');
    expect(back.get('i_active')).toBe('b200_sglang');
    expect(back.has('i_best')).toBe(false);
    expect(back.get('i_seq')).toBe('agentic-traces');
  });

  it('drops inference hardware when the profit estimator picked another model', () => {
    crossTabParams('inference', 'profit', inferenceLive());
    recordProfitPick('i_active', 'b200_sglang');
    recordProfitPick('g_model', 'Kimi-K3');
    const back = crossTabParams('profit', 'inference', new URLSearchParams());
    expect(back.get('g_model')).toBe('Kimi-K3');
    expect(back.has('i_active')).toBe(false);
  });

  it('carries unofficial runs between tabs', () => {
    const live = inferenceLive();
    live.set('unofficialruns', '42');
    expect(crossTabParams('inference', 'profit', live).get('unofficialruns')).toBe('42');
  });

  it('seeds only chips the legend has, for the same model', () => {
    const seed = { model: 'Kimi-K3', keys: ['b200_sglang', 'h100_vllm'] };
    expect(seededHardwareVisibility(seed, 'Kimi-K3', ['b200_sglang', 'mi355x_sglang'])).toEqual(
      new Set(['b200_sglang']),
    );
    expect(seededHardwareVisibility(seed, 'GLM-5.2', ['b200_sglang'])).toBeNull();
    expect(seededHardwareVisibility(seed, 'Kimi-K3', ['mi355x_sglang'])).toBeNull();
    setProfitHardwareSeed({ model: 'Kimi-K3', keys: [] });
    expect(getProfitHardwareSeed()).toBeNull();
  });
});
