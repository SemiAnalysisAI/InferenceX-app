import { describe, expect, it } from 'vitest';

import { Sequence } from '@/lib/data-mappings';
import {
  isSeqSynthKey,
  makeSeqSynthHardwareEntry,
  makeSeqSynthKey,
  makeSequenceFilter,
  parseSeqSynthKey,
  sequenceCompact,
  stripSeqSuffix,
} from '@/lib/sequence-synth-key';

describe('sequence-synth-key', () => {
  describe('sequenceCompact', () => {
    it('maps known sequences to compact form', () => {
      expect(sequenceCompact(Sequence.OneK_OneK)).toBe('1k1k');
      expect(sequenceCompact(Sequence.OneK_EightK)).toBe('1k8k');
      expect(sequenceCompact(Sequence.EightK_OneK)).toBe('8k1k');
      expect(sequenceCompact(Sequence.EightK_256)).toBe('8k256');
      expect(sequenceCompact(Sequence.EightK_625)).toBe('8k625');
    });
  });

  describe('makeSeqSynthKey / parseSeqSynthKey', () => {
    it('round-trips a base hwKey through compact form', () => {
      const key = makeSeqSynthKey('b200_vllm', Sequence.OneK_OneK);
      expect(key).toBe('b200_vllm__seq1k1k');
      expect(parseSeqSynthKey(key)).toEqual({
        origHwKey: 'b200_vllm',
        sequence: Sequence.OneK_OneK,
      });
    });

    it('preserves the base GPU prefix so vendor-color helpers keep working', () => {
      // getModelSortIndex / isKnownGpu split on '_' and read [0]; this must
      // still be the canonical base for any synth key shape we produce.
      const key = makeSeqSynthKey('gb300_dynamo-trt_mtp', Sequence.EightK_OneK);
      expect(key.split('_')[0]).toBe('gb300');
    });

    it('returns null when the suffix is absent', () => {
      expect(parseSeqSynthKey('b200_vllm')).toBeNull();
    });

    it('returns null when the compact form is unknown', () => {
      // A made-up suffix shouldn't be silently accepted — better to fall back
      // to "no parse" so callers can keep treating the key as opaque.
      expect(parseSeqSynthKey('b200_vllm__seqbogus')).toBeNull();
    });

    it('still parses when the seq suffix is followed by a __uorun chain', () => {
      // Composing with the unofficial-merge `__uorun<id>` shape is supported.
      // parseSeqSynthKey strips the trailing chain before resolving the
      // compact form.
      const composed = `${makeSeqSynthKey('b200_vllm', Sequence.OneK_OneK)}__uorun123`;
      expect(parseSeqSynthKey(composed)).toEqual({
        origHwKey: 'b200_vllm',
        sequence: Sequence.OneK_OneK,
      });
    });
  });

  describe('isSeqSynthKey / stripSeqSuffix', () => {
    it('isSeqSynthKey reports presence of the delimiter', () => {
      expect(isSeqSynthKey('b200_vllm')).toBe(false);
      expect(isSeqSynthKey('b200_vllm__seq1k1k')).toBe(true);
    });

    it('stripSeqSuffix is a no-op when absent', () => {
      expect(stripSeqSuffix('b200_vllm')).toBe('b200_vllm');
    });

    it('stripSeqSuffix removes the seq tail (and anything chained after)', () => {
      expect(stripSeqSuffix('b200_vllm__seq1k1k')).toBe('b200_vllm');
      expect(stripSeqSuffix('b200_vllm__seq1k1k__uorun42')).toBe('b200_vllm');
    });
  });

  describe('makeSeqSynthHardwareEntry', () => {
    it('appends the sequence label so the legend can distinguish lines', () => {
      const entry = makeSeqSynthHardwareEntry(
        {
          name: 'b200-vllm',
          label: 'B200',
          suffix: '(vLLM)',
          gpu: "NVIDIA 'Blackwell' B200 vLLM",
          framework: 'vllm',
        },
        'b200_vllm',
        Sequence.OneK_OneK,
        'b200_vllm__seq1k1k',
      );
      expect(entry.label).toBe('B200 — 1K / 1K');
      // suffix and framework are preserved so the legend line still renders
      // its parens-tagged framework label.
      expect(entry.suffix).toBe('(vLLM)');
      expect(entry.framework).toBe('vllm');
      // gpu tooltip carries the sequence too so a hover reveals which seq
      // the line came from.
      expect(entry.gpu).toContain('1K / 1K');
    });

    it('falls back to the orig hwKey when the entry is missing', () => {
      const entry = makeSeqSynthHardwareEntry(undefined, 'b200_vllm', Sequence.OneK_OneK, 'syn');
      expect(entry.label).toBe('b200_vllm — 1K / 1K');
    });
  });

  describe('makeSequenceFilter', () => {
    it('returns a predicate matching exact (isl, osl)', () => {
      const filter = makeSequenceFilter(Sequence.EightK_OneK);
      expect(filter).not.toBeNull();
      expect(filter!({ isl: 8192, osl: 1024 })).toBe(true);
      expect(filter!({ isl: 8192, osl: 256 })).toBe(false);
      expect(filter!({ isl: 1024, osl: 1024 })).toBe(false);
    });
  });
});
