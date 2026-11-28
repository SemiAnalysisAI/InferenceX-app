'use client';

import { useEffect, useRef, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import GtaGarage from './gta-garage';
import type { GtaStrings } from './gta-strings';
import {
  CITY_NAME,
  DISTRICTS,
  JOB_COPY,
  JOB_IDS,
  SOUTH_BAY_NAME,
  type Point,
  type World,
} from './gta-world';

const BASE = '/decorative/gta/sf/';
/** Metres across each panel; the map canvas is drawn at `scale` metres per pixel. */
const SPAN = 3600;
const SIZE = 300;

/** The named district a point is in: the nearest centre whose radius reaches it. */
function districtOf(point: Point): (typeof DISTRICTS)[number] | undefined {
  let best: (typeof DISTRICTS)[number] | undefined;
  let nearest = Infinity;
  for (const district of DISTRICTS) {
    const d = Math.hypot(point.x - district.x, point.z - district.z);
    if (d <= district.r && d < nearest) {
      nearest = d;
      best = district;
    }
  }
  return best;
}

/**
 * Paints one square of the flat city map around a group of jobs: the streets as the game's
 * map screen draws them, a numbered marker per job and the names of the districts in view.
 */
function paintPanel(
  out: HTMLCanvasElement,
  map: HTMLCanvasElement,
  world: World,
  scale: number,
  jobs: { index: number; point: Point; done: boolean; next: boolean }[],
  locale: 'en' | 'zh',
) {
  const ctx = out.getContext('2d');
  if (!ctx || jobs.length === 0) return;
  const cx = jobs.reduce((sum, job) => sum + job.point.x, 0) / jobs.length;
  const cz = jobs.reduce((sum, job) => sum + job.point.z, 0) / jobs.length;
  const reach = Math.max(
    SPAN,
    ...jobs.map((job) => 2.6 * Math.max(Math.abs(job.point.x - cx), Math.abs(job.point.z - cz))),
  );
  const x0 = cx - reach / 2;
  const z0 = cz - reach / 2;
  const k = out.width / reach;
  ctx.fillStyle = '#76a6c4';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    map,
    (x0 - world.x0) / scale,
    (z0 - world.z0) / scale,
    reach / scale,
    reach / scale,
    0,
    0,
    out.width,
    out.height,
  );
  const at = (point: Point) => ({ x: (point.x - x0) * k, y: (point.z - z0) * k });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = '700 11px system-ui, sans-serif';
  for (const district of DISTRICTS) {
    const spot = at(district);
    if (spot.x < 30 || spot.y < 12 || spot.x > out.width - 30 || spot.y > out.height - 12) continue;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeText(district[locale], spot.x, spot.y);
    ctx.fillStyle = '#1f2933';
    ctx.fillText(district[locale], spot.x, spot.y);
  }
  ctx.font = '700 13px system-ui, sans-serif';
  for (const job of jobs) {
    const spot = at(job.point);
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = job.done ? '#72cc72' : job.next ? '#f0c850' : '#d6d6d6';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.fillText(String(job.index + 1), spot.x, spot.y + 0.5);
  }
}

/**
 * The phone's Jobs page: the five jobs of the heist on the flat map, in the two parts of the
 * map they are in, with the district each one is in. It is drawn in 2D from the same city
 * data as the 3D heist and needs no WebGL. The city data loads when this page is opened.
 */
export default function GtaPhoneMap({ strings, passed }: { strings: GtaStrings; passed: number }) {
  const locale = useLocale();
  const t = strings.phone;
  const north = useRef<HTMLCanvasElement>(null);
  const south = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [districts, setDistricts] = useState<string[]>([]);
  const done = passed > 0 ? JOB_IDS.length : 0;

  useEffect(() => {
    const abort = new AbortController();
    let live = true;
    void (async () => {
      try {
        const [{ loadWorld }, { drawCityMap, MAP_SCALE }] = await Promise.all([
          import('./gta-world'),
          import('./gta-minimap'),
        ]);
        const world = await loadWorld(BASE, abort.signal);
        if (!live) return;
        const map = drawCityMap(world);
        const jobs = JOB_IDS.map((id, index) => ({
          index,
          point: world.landmarks[id],
          done: index < done,
          next: index === done,
        }));
        const inSouth = (point: Point) => world.southBay(point);
        if (north.current)
          paintPanel(
            north.current,
            map,
            world,
            MAP_SCALE,
            jobs.filter((job) => !inSouth(job.point)),
            locale,
          );
        if (south.current)
          paintPanel(
            south.current,
            map,
            world,
            MAP_SCALE,
            jobs.filter((job) => inSouth(job.point)),
            locale,
          );
        setDistricts(jobs.map((job) => districtOf(job.point)?.[locale] ?? ''));
        setStatus('ready');
      } catch {
        if (live) setStatus('error');
      }
    })();
    return () => {
      live = false;
      abort.abort();
    };
  }, [done, locale]);

  return (
    <div className="gta-jobs" data-testid="gta-jobs" data-status={status}>
      <GtaGarage strings={strings} />
      <p className="gta-phone-note">{t.mapIntro}</p>
      <div className="gta-jobs-maps">
        <figure>
          <canvas
            ref={north}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={CITY_NAME[locale]}
          />
          <figcaption>{CITY_NAME[locale]}</figcaption>
        </figure>
        <figure>
          <canvas
            ref={south}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={SOUTH_BAY_NAME[locale]}
          />
          <figcaption>{SOUTH_BAY_NAME[locale]}</figcaption>
        </figure>
      </div>
      <p className="gta-jobs-status" role="status">
        {status === 'loading' ? t.mapLoading : status === 'error' ? t.mapError : ''}
      </p>
      <ol className="gta-jobs-list">
        {JOB_IDS.map((id, index) => (
          <li key={id} data-state={index < done ? 'done' : index === done ? 'next' : 'locked'}>
            <span className="gta-jobs-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="gta-jobs-copy">
              {JOB_COPY[id][locale]}
              {districts[index] && <span className="gta-jobs-district">{districts[index]}</span>}
            </span>
            <span className="gta-jobs-state">
              {index < done ? t.jobDone : index === done ? t.jobNext : t.jobLocked}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
