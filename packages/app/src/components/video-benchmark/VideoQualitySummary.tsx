'use client';

import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import type { VideoPoint } from './metrics';
import { QUALITY_METRICS, qualityEligibility, qualityMeasurement } from './quality';
import type { VideoDashboardState } from './video-url-state';

const STRINGS = {
  en: {
    title: 'Quality evidence',
    higher: 'higher is better; ordinal 0–4',
    missing:
      'No calibrated quality results. Required: completed blinded ratings, evaluator and rubric provenance, and validated frozen rules for all seven dimensions. A/A measures repeatability; integrity and numerical fidelity do not establish perceptual quality.',
    filtered:
      'No deployment meets the quality conditions. All seven dimensions require complete judged coverage and calibrated frozen rules; the reader threshold further restricts the selected dimension.',
    descriptive:
      'The deployment chart is descriptive. Changes in steps, precision or acceleration are not equivalent-quality improvements without this evidence.',
    coverage: 'Selected dimension: assessed / target clips (per deployment)',
    evaluator: 'Evaluator versions',
    unavailable: 'unavailable',
    threshold: 'Reader-selected quality filter',
    off: 'off',
    provenance:
      'Filter provenance: current URL. The evaluator’s frozen calibration rule still applies.',
    eligible: 'Quality-eligible deployments',
  },
  zh: {
    title: '质量证据',
    higher: '越高越好；0–4 级评分',
    missing:
      '暂无经过校准的质量结果。需要已完成的盲评、评估器与 rubric 来源，以及七个维度各自通过验证并预先冻结的判定规则。A/A 衡量重复性；媒体完整性与数值保真度不能证明感知质量。',
    filtered:
      '暂无部署满足质量条件。七个维度均须有完整评审覆盖和经过校准的冻结规则；用户阈值仅进一步限制所选维度。',
    descriptive:
      '部署图仅描述实测性能。改变 steps、precision 或加速方法后，需要上述证据才能声称在相同质量下提速。',
    coverage: '所选维度：已评 / 目标视频数（按部署）',
    evaluator: '评估器版本',
    unavailable: '不可用',
    threshold: '用户选择的质量筛选阈值',
    off: '关闭',
    provenance: '筛选来源：当前 URL。仍须满足评估器预先冻结的校准规则。',
    eligible: '满足质量条件的部署数',
  },
};

export default function VideoQualitySummary({
  points,
  state,
}: {
  points: VideoPoint[];
  state: VideoDashboardState;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const metric = QUALITY_METRICS[state.qualityMetric];
  const results = points.map((p) => qualityMeasurement(p, state.qualityMetric));
  const evaluators = [
    ...new Set(
      results.flatMap((r) =>
        r?.evaluatorId && r.evaluatorVersion ? [`${r.evaluatorId}@${r.evaluatorVersion}`] : [],
      ),
    ),
  ];
  const coverage = [
    ...new Set(
      points.map((p, i) => `${results[i]?.samples ?? '—'}/${results[i]?.total ?? p.samples}`),
    ),
  ].join(', ');
  const eligible = points.filter(
    (p) =>
      qualityEligibility(p, { metric: state.qualityMetric, threshold: state.qualityThreshold })
        .eligible,
  ).length;
  return (
    <details
      className="space-y-1 rounded-lg border p-3 text-xs text-muted-foreground"
      data-testid="video-quality-summary"
      open={state.y === 'quality' || state.qualityThreshold !== null}
      onToggle={(event) =>
        track('video_quality_evidence_toggled', { open: event.currentTarget.open })
      }
    >
      <summary className="cursor-pointer font-medium text-foreground">
        {s.title}: {locale === 'zh' ? metric.labelZh : metric.label} · {s.higher}
        {' · '}
        {s.eligible}: {eligible}
      </summary>
      <p>
        {s.coverage}: {coverage || '—'} · {s.evaluator}: {evaluators.join(', ') || s.unavailable} ·{' '}
        {s.eligible}: {eligible}
      </p>
      <p>
        {s.threshold}: {state.qualityThreshold ?? s.off}. {s.provenance}
      </p>
      {eligible === 0 && (
        <p role="status">
          {results.some((r) => r?.calibration?.status === 'calibrated') ? s.filtered : s.missing}
        </p>
      )}
      <p>{s.descriptive}</p>
    </details>
  );
}
