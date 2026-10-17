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
    // Per-point chips on every agentic point buried the curves; the line
    // labels still name each series and the tooltip carries the parallelism.
    expect(resolveLabelState('agentic', {})).toEqual({
      showPointLabels: false,
      useAdvancedLabels: false,
      showLineLabels: true,
    });
  });

  it('opens wide agentic charts with parallelism chips on every point', () => {
    expect(resolveLabelState('agentic', {}, { wide: true })).toEqual({
      showPointLabels: true,
      useAdvancedLabels: true,
      showLineLabels: true,
    });
    // Fixed-sequence charts stay uncluttered at every width.
    expect(resolveLabelState('fixed-seq', {}, { wide: true })).toMatchObject({
      showPointLabels: false,
      useAdvancedLabels: false,
    });
    // An explicit link still wins on a wide screen.
    expect(
      resolveLabelState('agentic', { i_label: '0', i_advlabel: '0' }, { wide: true }),
    ).toMatchObject({ showPointLabels: false, useAdvancedLabels: false });
  });

  it('restores agentic parallelism chips from a shared link', () => {
    expect(resolveLabelState('agentic', { i_advlabel: '1' })).toEqual({
      showPointLabels: true,
      useAdvancedLabels: true,
      showLineLabels: true,
    });
    expect(resolveLabelState('agentic', { i_label: '1' })).toMatchObject({
      showPointLabels: true,
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

  it('omits the wide agentic defaults and records turning the chips off', () => {
    const wide = { wide: true };
    expect(serializeLabelState('agentic', resolveLabelState('agentic', {}, wide), wide)).toEqual({
      i_label: '',
      i_advlabel: '',
      i_linelabel: '',
    });
    expect(
      serializeLabelState(
        'agentic',
        { showPointLabels: false, useAdvancedLabels: false, showLineLabels: true },
        wide,
      ),
    ).toEqual({ i_label: '0', i_advlabel: '0', i_linelabel: '' });
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
