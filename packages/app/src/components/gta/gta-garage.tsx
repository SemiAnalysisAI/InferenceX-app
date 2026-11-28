'use client';

import { useState, useSyncExternalStore } from 'react';

import { SPECS } from './gta-engine';
import {
  BATCHES,
  batchAllowed,
  buyUpgrade,
  DEFAULT_LOADOUT,
  heistPay,
  cruiseTop,
  launchSeconds,
  PRECISIONS,
  precisionAllowed,
  readLoadout,
  saveLoadout,
  tuningOf,
  UPGRADES,
  type Loadout,
} from './gta-loadout';
import { getGtaState, getServerGtaState, subscribeGta } from './gta-store';
import type { GtaStrings } from './gta-strings';
import { JOB_IDS } from './gta-world';

const money = (amount: number) => `$${new Intl.NumberFormat('en-US').format(amount)}`;

/**
 * The phone's garage, on the Jobs page: parts bought with site cash between runs, the batch
 * size and precision the heist car will run, and what that tune does to the plan (take,
 * launch, top speed, crash damage) worked out from the same numbers the game drives with.
 */
export default function GtaGarage({ strings }: { strings: GtaStrings }) {
  const t = strings.phone.garage;
  const cash = useSyncExternalStore(subscribeGta, getGtaState, getServerGtaState).cash;
  const [loadout, setLoadout] = useState<Loadout>(readLoadout);
  const [bought, setBought] = useState('');
  const car = SPECS.buffalo;
  const plan = (from: Loadout) => {
    const tune = tuningOf(from);
    return {
      tune,
      take: heistPay(JOB_IDS.length, tune),
      launch: launchSeconds(car.accel * tune.accel, car.top * tune.top),
      top: Math.round(cruiseTop(car.accel * tune.accel, car.top * tune.top) * 3.6),
    };
  };
  const now = plan(loadout);
  const stock = plan(DEFAULT_LOADOUT);
  const change = (next: Loadout) => setLoadout(saveLoadout(next));

  return (
    <section
      className="gta-garage"
      data-testid="gta-garage"
      data-batch={loadout.batch}
      data-precision={loadout.precision}
      aria-label={t.title}
    >
      <h3 className="gta-garage-title">
        {t.title}
        <span data-testid="gta-garage-cash">{money(cash)}</span>
      </h3>
      <p className="gta-phone-note">{t.intro}</p>
      <ul className="gta-garage-parts">
        {UPGRADES.map((upgrade) => {
          const owned = loadout.owned.includes(upgrade.id);
          return (
            <li key={upgrade.id} data-owned={owned ? 'true' : 'false'}>
              <span className="gta-garage-part">
                <b>{t.parts[upgrade.id].name}</b>
                <span>{t.parts[upgrade.id].effect}</span>
              </span>
              {owned ? (
                <span className="gta-garage-owned" data-testid={`gta-garage-owned-${upgrade.id}`}>
                  {t.owned}
                </span>
              ) : (
                <button
                  type="button"
                  className="gta-phone-action gta-garage-buy"
                  data-testid={`gta-garage-buy-${upgrade.id}`}
                  disabled={cash < upgrade.price}
                  onClick={() => {
                    const next = buyUpgrade(upgrade.id);
                    if (!next) return;
                    setLoadout(next);
                    setBought(`${t.parts[upgrade.id].name}: -${money(upgrade.price)}`);
                  }}
                >
                  {t.buy} {money(upgrade.price)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="gta-garage-receipt" role="status" data-testid="gta-garage-receipt">
        {bought}
      </p>
      <div className="gta-garage-picks">
        <div role="group" aria-label={t.batch}>
          <span>{t.batch}</span>
          {BATCHES.map((batch) => (
            <button
              key={batch}
              type="button"
              className="gta-phone-action"
              data-testid={`gta-garage-batch-${batch}`}
              aria-pressed={loadout.batch === batch}
              disabled={!batchAllowed(loadout, batch)}
              onClick={() => change({ ...loadout, batch })}
            >
              {batch}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t.precision}>
          <span>{t.precision}</span>
          {PRECISIONS.map((precision) => (
            <button
              key={precision}
              type="button"
              className="gta-phone-action"
              data-testid={`gta-garage-precision-${precision}`}
              aria-pressed={loadout.precision === precision}
              disabled={!precisionAllowed(loadout, precision)}
              onClick={() => change({ ...loadout, precision })}
            >
              {precision.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <table className="gta-garage-plan" data-testid="gta-garage-plan">
        <caption>{t.plan}</caption>
        <thead>
          <tr>
            <td />
            <th scope="col">{t.thisTune}</th>
            <th scope="col">{t.stock}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t.planTake}</th>
            <td data-plan="take">{money(now.take)}</td>
            <td>{money(stock.take)}</td>
          </tr>
          <tr>
            <th scope="row">{t.planLaunch}</th>
            <td data-plan="launch">{now.launch.toFixed(1)} s</td>
            <td>{stock.launch.toFixed(1)} s</td>
          </tr>
          <tr>
            <th scope="row">{t.planTop}</th>
            <td data-plan="top">{now.top} km/h</td>
            <td>{stock.top} km/h</td>
          </tr>
          <tr>
            <th scope="row">{t.planDamage}</th>
            <td data-plan="damage">×{now.tune.damage}</td>
            <td>×{stock.tune.damage}</td>
          </tr>
          <tr>
            <th scope="row">{t.planRepair}</th>
            <td data-plan="repair">+{now.tune.repair}</td>
            <td>+{stock.tune.repair}</td>
          </tr>
        </tbody>
      </table>
      <p className="gta-phone-note">{t.hint}</p>
    </section>
  );
}
