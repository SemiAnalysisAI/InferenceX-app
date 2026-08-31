import { describe, expect, it } from 'vitest';

import {
  COLLECTIVEX_KNOWN_FOOTNOTES,
  COLLECTIVEX_KNOWN_LIBRARIES,
  COLLECTIVEX_KNOWN_SKUS,
  COLLECTIVEX_KNOWN_SUPPORT,
  collectiveXKnownFootnoteOrder,
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
    // The whole point of the table: red (and gray) must explain themselves.
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
    // A canary for the highest-traffic wall: mori EP16 on mi355x is red with
    // the upstream-issue note until ROCm/mori#610 resolves.
    const cell = COLLECTIVEX_KNOWN_SUPPORT.normal.mi355x.mori;
    expect(cell.ep8.status).toBe('works');
    expect(cell.ep16).toEqual({ status: 'broken', note: 'mori-inter-node-corruption' });
  });
});
