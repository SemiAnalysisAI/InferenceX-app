import { describe, expect, it } from 'vitest';

import {
  COLLECTIVEX_KNOWN_FOOTNOTES,
  COLLECTIVEX_KNOWN_LIBRARIES,
  COLLECTIVEX_KNOWN_SKUS,
  COLLECTIVEX_KNOWN_SUPPORT,
  collectiveXKnownFootnoteOrder,
  collectiveXKnownVersions,
  collectiveXShortLibraryVersion,
} from './known-support';

const MODES = ['normal', 'low-latency'] as const;

describe('COLLECTIVEX_KNOWN_SUPPORT', () => {
  it('covers the full SKU × library cross product in both modes', () => {
    for (const mode of MODES) {
      for (const sku of COLLECTIVEX_KNOWN_SKUS) {
        for (const library of COLLECTIVEX_KNOWN_LIBRARIES) {
          expect(COLLECTIVEX_KNOWN_SUPPORT[mode][sku][library]).toBeDefined();
        }
      }
    }
  });

  it('never leaves a broken or not-applicable degree without a why', () => {
    for (const mode of MODES) {
      for (const sku of COLLECTIVEX_KNOWN_SKUS) {
        for (const library of COLLECTIVEX_KNOWN_LIBRARIES) {
          const kase = COLLECTIVEX_KNOWN_SUPPORT[mode][sku][library];
          for (const ep of [kase.ep8, kase.ep16]) {
            if (ep.status !== 'works') expect(ep.note, `${mode} ${sku} ${library}`).toBeTruthy();
            if (ep.note) {
              expect(
                COLLECTIVEX_KNOWN_FOOTNOTES[ep.note],
                `dangling footnote ${ep.note}`,
              ).toBeDefined();
            }
          }
        }
      }
    }
  });

  it('localizes every footnote in both locales', () => {
    for (const [id, footnote] of Object.entries(COLLECTIVEX_KNOWN_FOOTNOTES)) {
      expect(footnote.en, id).toBeTruthy();
      expect(footnote.zh, id).toBeTruthy();
    }
  });

  it('orders footnotes by first use and only lists referenced ones', () => {
    for (const mode of MODES) {
      const order = collectiveXKnownFootnoteOrder(mode);
      expect(new Set(order).size).toBe(order.length);
      for (const note of order) expect(COLLECTIVEX_KNOWN_FOOTNOTES[note]).toBeDefined();
    }
  });

  it('keeps at least one known-broken cell explained (the table is not vacuous)', () => {
    const order = collectiveXKnownFootnoteOrder('normal');
    expect(order.length).toBeGreaterThan(0);
    const cell = COLLECTIVEX_KNOWN_SUPPORT.normal.mi355x.mori;
    expect(cell.ep8.status).toBe('works');
    expect(cell.ep16).toEqual({ status: 'broken', note: 'mi355x-ainic-a77' });
  });

  it('shows no working DeepEP V2 low-latency degree on B300, which registers none', () => {
    // InferenceX collectivex/configs/platform_config.json: b300 `ll_backends` is {"nccl-ep": [8]}.
    const lowLatency = COLLECTIVEX_KNOWN_SUPPORT['low-latency'].b300;
    expect(lowLatency['deepep-v2'].ep8).toEqual({ status: 'broken', note: 'b300-efa-nvshmem' });
    expect(lowLatency['deepep-v2'].ep16).toEqual({ status: 'broken', note: 'b300-efa-nvshmem' });
    expect(COLLECTIVEX_KNOWN_FOOTNOTES['b300-efa-nvshmem'].en).toContain('EFA');
    // The pool's one registered low-latency library and its throughput DeepEP V2 are untouched.
    expect(lowLatency['nccl-ep'].ep8.status).toBe('works');
    expect(lowLatency['nccl-ep'].ep16.status).toBe('na');
    expect(COLLECTIVEX_KNOWN_SUPPORT.normal.b300['deepep-v2'].ep8.status).toBe('works');
    expect(COLLECTIVEX_KNOWN_SUPPORT.normal.b300['deepep-v2'].ep16.status).toBe('works');
    // The notes that described the retired B300 pool's rails are no longer served.
    expect(Object.keys(COLLECTIVEX_KNOWN_FOOTNOTES)).not.toContain('b300-ll-single-node-pin');
    expect(Object.keys(COLLECTIVEX_KNOWN_FOOTNOTES)).not.toContain('b300-ll-create-ah');
  });
});

const series = (
  sku: string,
  backend: string,
  library_version: string | null,
  mode: 'normal' | 'low-latency' = 'normal',
) => ({ mode, backend, library_version, system: { sku } });

describe('collectiveXKnownVersions', () => {
  it('groups the recorded versions by mode, matrix SKU and library', () => {
    const versions = collectiveXKnownVersions([
      series('b200-nscale', 'deepep-v2', '2.1.0+local@01dc3aaac82068020353dce2c302e38153c0bfaa'),
      series('b200-nscale', 'deepep-v2', '2.1.0+local@01dc3aaac82068020353dce2c302e38153c0bfaa'),
      series('h100-dgxc', 'nccl-ep', '0.2.0.dev20261021', 'low-latency'),
      series('gb300', 'nccl-ep', '0.2.0.dev20261021'),
      series('gb300', 'nccl-ep', '0.2.0.dev20261013'),
      series('h200-dgxc', 'uccl-ep', null),
      series('unknown-pool', 'mori', '1.0'),
    ]);
    expect(Object.fromEntries(versions)).toEqual({
      'normal/b200/deepep-v2': ['2.1.0+local@01dc3aaac82068020353dce2c302e38153c0bfaa'],
      'low-latency/h100/nccl-ep': ['0.2.0.dev20261021'],
      'normal/gb300/nccl-ep': ['0.2.0.dev20261013', '0.2.0.dev20261021'],
    });
  });

  it('shortens commit hashes and drops build flags', () => {
    expect(
      collectiveXShortLibraryVersion('2.1.0+local@01dc3aaac82068020353dce2c302e38153c0bfaa'),
    ).toBe('2.1.0+local@01dc3aa');
    expect(
      collectiveXShortLibraryVersion(
        'uccl@df000fd3001d deep_ep==0.1.0 USE_DMABUF=1 PER_EXPERT_BATCHING=1',
      ),
    ).toBe('uccl@df000fd');
    expect(collectiveXShortLibraryVersion('0.2.0.dev20261021')).toBe('0.2.0.dev20261021');
  });
});
