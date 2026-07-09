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

  it('uses parallelism labels instead of line labels for agentic scenarios', () => {
    expect(resolveLabelState('agentic', {})).toEqual({
      showPointLabels: true,
      useAdvancedLabels: true,
      showLineLabels: false,
    });
  });

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
        showPointLabels: false,
        useAdvancedLabels: false,
        showLineLabels: true,
      }),
    ).toEqual({
      i_label: '0',
      i_advlabel: '0',
      i_linelabel: '1',
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
