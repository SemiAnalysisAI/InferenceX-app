'use client';

import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { playOcSfx } from './orange-chicken-audio';
import { BoxPanel, MenuTabBar, OrdersPanel, WokPanel, type Tab } from './orange-chicken-menu';
import { emitLine } from './orange-chicken-lines';
import { MENU } from './orange-chicken-menu-strings';
import { emitMeme, scoopPayoff } from './orange-chicken-memes';
import { emitOcEffect, type SecretId } from './orange-chicken-store';
import { STRINGS, fill } from './orange-chicken-strings';

const LOGO = '/decorative/orange-chicken/oc-panda-express-logo.svg';
const PHOTO = '/decorative/orange-chicken/oc-orange-chicken-box.webp';
const TIERS = ['bowl', 'plate', 'bigger', 'sandwich'] as const;
type Tier = (typeof TIERS)[number];
type Side = 'chow' | 'fried' | 'half';
const SIDES: readonly Side[] = ['chow', 'fried', 'half'];
/** Illustration numbers for the plate card: batch size and how full the KV cache box is. */
const BATCH: Record<Tier, number> = { bowl: 1, plate: 4, bigger: 16, sandwich: 1 };
const FILL: Record<Tier, number> = { bowl: 15, plate: 40, bigger: 70, sandwich: 8 };
/** Extra scoops after the Bigger Plate: batch doubles, the box fills, then it will not close. */
const SCOOPS = [
  { batch: 32, kv: 85 },
  { batch: 64, kv: 100 },
] as const;
const PRECISION: Record<Side, string> = { chow: 'FP8', fried: 'FP4', half: 'FP8 + FP4' };

const say = (text: string) => emitOcEffect({ type: 'toast', text });

const pair = (en: string, zh: string) => ({ en, zh });

export function BannerLogo({ compact = false }: { compact?: boolean }) {
  const t = STRINGS[useLocale()];
  const size = compact ? 44 : 104;
  return (
    <button
      type="button"
      className="oc-logo-btn"
      onClick={() =>
        emitLine('kitchen', {
          en: 'The roundel: red ring, white field, black panda.',
          zh: '红色标志：红圈、白底、黑熊猫。',
        })
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oc-logo" src={LOGO} alt={t.ip.logoAlt} width={size} height={size} />
    </button>
  );
}

/** The hero photo of the dish with its red caption. */
export function BannerHero() {
  const ip = STRINGS[useLocale()].ip;
  return (
    <figure className="oc-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PHOTO} alt={ip.photoAlt} width={900} height={675} />
      <figcaption>{ip.caption}</figcaption>
    </figure>
  );
}

/** The Bowl / Plate / Bigger Plate card and the menu tabs. a real photo of the dish and the Bowl / Plate / Bigger Plate card. */
export function BannerPlate({ trigger }: { trigger: (id: SecretId) => void }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const ip = t.ip;
  const [tier, setTier] = useState<Tier>('plate');
  const [side, setSide] = useState<Side>('chow');
  const [scoops, setScoops] = useState(0);
  const [tab, setTab] = useState<Tab>('plate');
  const menu = MENU[locale];

  const overflow = scoops > SCOOPS.length;
  const scoop = scoops > 0 ? SCOOPS[Math.min(scoops, SCOOPS.length) - 1] : undefined;
  const batch = scoop?.batch ?? BATCH[tier];
  const kv = overflow ? 100 : (scoop?.kv ?? FILL[tier]);
  const status = overflow
    ? ip.plate.full
    : tier === 'sandwich'
      ? menu.sandwich.status
      : fill(ip.plate.status, {
          tier: ip.plate.tiers[tier],
          entrees: ip.plate.entrees[tier],
          batch,
          kv,
          prec: PRECISION[side],
        });

  const pickTier = (next: Tier) => {
    setTier(next);
    setScoops(0);
    playOcSfx('pop');
    if (next === 'sandwich') say(menu.sandwich.quote);
    if (next === 'bowl' || next === 'plate' || next === 'bigger') {
      const base = BATCH[next];
      const entrees = {
        en: STRINGS.en.ip.plate.entrees[next],
        zh: STRINGS.zh.ip.plate.entrees[next],
      };
      emitLine(
        next,
        next === 'plate'
          ? pair(
              `${entrees.en}, batch ${base}. ${STRINGS.en.ip.quotes.think}`,
              `${entrees.zh}，批量 ${base}。${STRINGS.zh.ip.quotes.think}`,
            )
          : pair(
              `${entrees.en}, batch ${base}, KV cache ${FILL[next]}%.`,
              `${entrees.zh}，批量 ${base}，KV 缓存 ${FILL[next]}%。`,
            ),
      );
    }
  };
  const pickSide = (next: Side) => {
    setSide(next);
    playOcSfx('tap');
    if (next === 'half') say(ip.quotes.half);
    if (next === 'fried') say(ip.quotes.bone);
  };
  const pile = () => {
    if (overflow) return;
    const next = scoops + 1;
    setScoops(next);
    if (next > SCOOPS.length) {
      playOcSfx('splat');
      say(ip.quotes.overflow);
      trigger('box');
    } else {
      playOcSfx('sizzle');
      if (next === 1) say(ip.quotes.keep);
      else emitMeme('scoop', scoopPayoff(SCOOPS[next - 1]?.batch ?? 0, SCOOPS[next - 1]?.kv ?? 0));
    }
  };
  const empty = () => {
    setScoops(0);
    playOcSfx('pop');
  };

  return (
    <div className="oc-plate-col">
      <MenuTabBar tab={tab} onTab={setTab} />
      {tab !== 'plate' && (
        <section
          className="oc-plate"
          role="tabpanel"
          id={`oc-panel-${tab}`}
          aria-labelledby={`oc-tab-${tab}`}
        >
          <h3 className="oc-plate-title">
            {tab === 'wok' ? menu.wok.title : tab === 'orders' ? menu.orders.title : menu.box.title}
          </h3>
          {tab === 'wok' && <WokPanel />}
          {tab === 'orders' && <OrdersPanel />}
          {tab === 'box' && <BoxPanel />}
        </section>
      )}
      <section
        className="oc-plate"
        role="tabpanel"
        id="oc-panel-plate"
        aria-labelledby="oc-tab-plate"
        hidden={tab !== 'plate'}
      >
        <h3 className="oc-plate-title">{ip.plate.label}</h3>
        <div className="oc-plate-row" role="group" aria-label={ip.plate.label}>
          {TIERS.map((id) => (
            <button
              key={id}
              type="button"
              className="oc-chip oc-chip-caps"
              aria-pressed={tier === id}
              onClick={() => pickTier(id)}
            >
              {id === 'sandwich' ? menu.sandwich.chip : ip.plate.tiers[id]}
            </button>
          ))}
        </div>
        <div className="oc-plate-row" role="group" aria-label={ip.plate.sideLabel}>
          {SIDES.map((id) => (
            <button
              key={id}
              type="button"
              className="oc-chip oc-chip-caps"
              aria-pressed={side === id}
              onClick={() => pickSide(id)}
            >
              {ip.plate.sides[id]}
            </button>
          ))}
        </div>
        <div
          className="oc-plate-meter"
          role="meter"
          aria-label="KV cache"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={kv}
          data-full={kv >= 100 ? 'true' : 'false'}
        >
          <span style={{ width: `${kv}%` }} />
        </div>
        <p className="oc-plate-status" role="status">
          {status}
        </p>
        <div className="oc-plate-row">
          <button type="button" className="oc-chip oc-chip-caps" onClick={pile} disabled={overflow}>
            {scoops > 0 && !overflow ? ip.plate.scoop : ip.plate.pile}
          </button>
          <button type="button" className="oc-chip oc-chip-caps" onClick={empty}>
            {ip.plate.empty}
          </button>
        </div>
        <p className="oc-plate-note">{ip.plate.note}</p>
      </section>
    </div>
  );
}
