import { describe, expect, it } from 'vitest';

import { resolveLabelState, serializeLabelState } from './label-defaults';

describe('resolveLabelState', () => {
  it('uses uncluttered fixed-sequence defaults', () => {
    expect(resolveLabelState('fixed-seq', {})).toEqual({
      showPointLabels: false,
      useAdvancedLabels: false,
      showLineLabels: true,
    });
  });

  it('opens agentic scenarios with curve names but without per-point parallelism chips', () => {
    expect(resolveLabelState('agentic', {})).toEqual({
      showPointLabels: false,
      useAdvancedLabels: false,
      showLineLabels: true,
    });
  });

  it('restores agentic parallelism chips from a shared link', () => {
    expect(resolveLabelState('agentic', { i_advlabel: '1' })).toEqual({
      showPointLabels: true,
      useAdvancedLabels: true,
      showLineLabels: true,
    });
    expect(resolveLabelState('agentic', { i_label: '1' })).toEqual({
      showPointLabels: true,
      useAdvancedLabels: false,
      showLineLabels: true,
    });
  });

  it.each([{ i_label: '0' }, { i_nolabel: '1' }])(
    'preserves explicit label suppression over an advanced-label override: %j',
    (params) => {
      expect(resolveLabelState('agentic', { ...params, i_advlabel: '1' })).toEqual({
        showPointLabels: false,
        useAdvancedLabels: true,
        showLineLabels: true,
      });
    },
  );

  it('preserves explicit and legacy URL overrides', () => {
    expect(
      resolveLabelState('agentic', {
        i_nolabel: '1',
        i_advlabel: '0',
        i_linelabel: '1',
      }),
    ).toEqual({
      showPointLabels: false,
      useAdvancedLabels: false,
      showLineLabels: true,
    });
  });
});

describe('serializeLabelState', () => {
  it('omits the scenario defaults', () => {
    expect(serializeLabelState('agentic', resolveLabelState('agentic', {}))).toEqual({
      i_label: '',
      i_advlabel: '',
      i_linelabel: '',
    });
  });

  it('serializes deviations from agentic defaults', () => {
    expect(
      serializeLabelState('agentic', {
        showPointLabels: true,
        useAdvancedLabels: true,
        showLineLabels: false,
      }),
    ).toEqual({
      i_label: '1',
      i_advlabel: '1',
      i_linelabel: '0',
    });
  });

  it('preserves fixed-sequence defaults and serializes their deviations', () => {
    expect(serializeLabelState('fixed-seq', resolveLabelState('fixed-seq', {}))).toEqual({
      i_label: '',
      i_advlabel: '',
      i_linelabel: '',
    });
    expect(
      serializeLabelState('fixed-seq', {
        showPointLabels: true,
        useAdvancedLabels: true,
        showLineLabels: false,
      }),
    ).toEqual({
      i_label: '1',
      i_advlabel: '1',
      i_linelabel: '0',
    });
  });
});
