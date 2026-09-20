'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/use-locale';
import { hardwareLabel, VIDEO_HARDWARE_ROSTER } from './hardware';
import { formatMetric, metricValue, type MetricId, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';
import type { VideoDashboardState } from './video-url-state';

const CARD_METRICS = [
  'p50Latency',
  'videosPerGpuHour',
  'dollarsPerVideo',
  'kjPerVideo',
  'powerPctCap',
] as const satisfies readonly MetricId[];
const STRINGS = {
  en: {
    p50Latency: 'P50 time to video (s)',
    videosPerGpuHour: 'Videos / GPU-hr',
    dollarsPerVideo: 'TCO / video',
    kjPerVideo: 'kJ / video',
    powerPctCap: 'Board power / limit',
    p90: 'P90',
    gpus: 'GPUs',
    of: 'of',
    unavailable: 'Not measured',
    why: 'Failed run',
  },
  zh: {
    p50Latency: 'P50 出片时间（s）',
    videosPerGpuHour: '视频数 / GPU 小时',
    dollarsPerVideo: 'TCO / 条视频',
    kjPerVideo: 'kJ / 条视频',
    powerPctCap: '板卡功率 / 上限',
    p90: 'P90',
    gpus: '张 GPU',
    of: '/',
    unavailable: '未测得',
    why: '失败的运行',
  },
};

/** One card per campaign hardware at C1; hardware without a valid run says so instead of vanishing. */
export default function VideoKpiCards({
  points,
  state,
  colorFor,
  loading = false,
}: {
  points: VideoPoint[];
  state: VideoDashboardState;
  colorFor: (hardwareKey: string) => string;
  /** While the published history loads, show placeholders rather than a false "Not measured". */
  loading?: boolean;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const options = { tier: state.tier, basis: state.basis };
  const cells = latestVideoCells(points);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="video-kpi-cards">
      {VIDEO_HARDWARE_ROSTER.map(({ key, unavailable }) => {
        const point = cells.find((p) => p.hardwareKey === key && p.concurrency === 1);
        return (
          <Card key={key} className="gap-2 p-4" data-testid="video-kpi-card" data-hardware={key}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(key) }}
              />
              <span className="font-semibold">{hardwareLabel(key)}</span>
              {point && (
                <span className="text-2xs text-muted-foreground">
                  {point.participating ?? '—'} {s.of} {point.allocated ?? '—'} {s.gpus}
                </span>
              )}
            </div>
            {!point && loading ? (
              <div className="space-y-2" data-testid="video-kpi-skeleton" aria-busy="true">
                {CARD_METRICS.map((id) => (
                  <Skeleton key={id} className="h-3 w-full" />
                ))}
              </div>
            ) : point ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {CARD_METRICS.map((id) => (
                  <div key={id} className="contents">
                    <dt className="text-muted-foreground">{s[id]}</dt>
                    <dd className="text-right font-medium tabular-nums">
                      {formatMetric(metricValue(point, id, options), id)}
                      {id === 'powerPctCap' && metricValue(point, id, options) !== null && '%'}
                      {id === 'p50Latency' && (
                        <span className="ml-1 text-2xs font-normal text-muted-foreground">
                          {s.p90}{' '}
                          {formatMetric(metricValue(point, 'p90Latency', options), 'p90Latency')}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="video-kpi-unavailable">
                <span className="font-medium text-foreground">{s.unavailable}.</span>{' '}
                {unavailable && (
                  <>
                    {unavailable[locale]}{' '}
                    <a
                      className="underline underline-offset-2"
                      href={unavailable.runUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.why}
                    </a>
                  </>
                )}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
