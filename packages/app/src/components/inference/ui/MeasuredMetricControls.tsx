import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/use-locale';
import {
  changeMeasuredMetricConfig,
  getMeasuredMetricConfig,
  type MeasuredMetricConfigChange,
} from '../measured-metric-config';

const STRINGS = {
  en: {
    scope: 'Scope',
    scopeHelp:
      'All GPUs measures the whole deployment. Prefill and decode select only GPUs serving that role.',
    all: 'All GPUs',
    prefill: 'Prefill GPUs',
    decode: 'Decode GPUs',
    statistic: 'Statistic',
    statisticHelp:
      'P75 and P90 are time-weighted percentiles of synchronized fleet power, divided by chip count. They are available for all GPUs only.',
    average: 'Average',
    roleHint: 'Prefill and decode power support Average only.',
    display: 'Display',
    displayHelp:
      'Power per chip in watts, or average power as a percentage of chip TDP. Percent of TDP is available for the all-GPU average only.',
    denominator: 'Per',
    denominatorHelp:
      'Choose the energy denominator. All-GPU energy per input or output token includes the whole deployment; role energy is selected separately under Scope.',
    input: 'Input token',
    output: 'Output token',
    total: 'All tokens (incl. prompt)',
    query: 'Successful query',
    unit: 'Unit',
    unitHelp:
      'Energy is shown in joules. Energy per successful query can also be shown in watt-hours.',
  },
  zh: {
    scope: '统计范围',
    scopeHelp: '全部 GPU 对应整个部署；预填充和解码仅统计承担相应任务的 GPU。',
    all: '全部 GPU',
    prefill: '预填充 GPU',
    decode: '解码 GPU',
    statistic: '统计量',
    statisticHelp:
      'P75 和 P90 是同步采样的集群总功率按时间加权得到的分位数，再除以芯片数。仅支持全部 GPU。',
    average: '平均值',
    roleHint: '预填充和解码功率仅支持平均值。',
    display: '显示方式',
    displayHelp:
      '显示单芯片功率（瓦），或平均功率占芯片 TDP 的百分比。TDP 百分比仅支持全部 GPU 的平均功率。',
    denominator: '能耗分母',
    denominatorHelp:
      '选择能耗的分母。按输入或输出 token 归一化的全部 GPU 能耗仍包含整个部署；预填充或解码能耗需在统计范围中单独选择。',
    input: '输入 token',
    output: '输出 token',
    total: '全部 token（含提示词）',
    query: '成功请求',
    unit: '单位',
    unitHelp: '能耗以焦耳显示；每个成功请求的能耗也可显示为瓦时。',
  },
} as const;

export function MeasuredMetricControls({
  metric,
  onChange,
}: {
  metric: string;
  onChange: (metric: string) => void;
}) {
  const t = STRINGS[useLocale()];
  const config = getMeasuredMetricConfig(metric);
  if (!config) return null;
  const change = (next: MeasuredMetricConfigChange) =>
    onChange(changeMeasuredMetricConfig(metric, next));
  const scopeId = `measured-${config.family}-scope`;
  const roleScope =
    config.family === 'energy'
      ? config.denominator === 'input'
        ? 'prefill'
        : config.denominator === 'output'
          ? 'decode'
          : undefined
      : undefined;

  return (
    <div
      className="col-span-full grid min-w-0 gap-3 sm:grid-cols-3"
      data-testid="measured-metric-controls"
    >
      {config.family === 'energy' && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <LabelWithTooltip
            htmlFor="measured-energy-denominator"
            label={t.denominator}
            tooltip={t.denominatorHelp}
          />
          <Select
            value={config.denominator}
            onValueChange={(denominator) =>
              change({ denominator: denominator as typeof config.denominator })
            }
          >
            <SelectTrigger
              id="measured-energy-denominator"
              data-testid="measured-energy-denominator"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent portalled={false}>
              {(['input', 'output', 'total', 'query'] as const).map((value) => (
                <SelectItem key={value} value={value} data-value={value}>
                  {t[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <LabelWithTooltip htmlFor={scopeId} label={t.scope} tooltip={t.scopeHelp} />
        <Select
          value={config.scope}
          disabled={config.family === 'energy' && !roleScope}
          onValueChange={(scope) => change({ scope: scope as typeof config.scope })}
        >
          <SelectTrigger id={scopeId} data-testid={scopeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent portalled={false}>
            <SelectItem value="all" data-value="all">
              {t.all}
            </SelectItem>
            {(config.family === 'power' || roleScope === 'prefill') && (
              <SelectItem value="prefill" data-value="prefill">
                {t.prefill}
              </SelectItem>
            )}
            {(config.family === 'power' || roleScope === 'decode') && (
              <SelectItem value="decode" data-value="decode">
                {t.decode}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      {config.family === 'power' ? (
        <>
          <div className="flex min-w-0 flex-col gap-1.5">
            <LabelWithTooltip label={t.statistic} tooltip={t.statisticHelp} />
            <SegmentedToggle
              role="group"
              size="default"
              className="w-full"
              buttonClassName="flex-1 justify-center"
              ariaLabel={t.statistic}
              value={config.statistic}
              onValueChange={(statistic) => change({ statistic })}
              options={(
                [
                  { value: 'average', label: t.average },
                  { value: 'p75', label: 'P75' },
                  { value: 'p90', label: 'P90' },
                ] as const
              ).map((option) => ({
                ...option,
                testId: `measured-power-statistic-${option.value}`,
                disabled: config.scope !== 'all' && option.value !== 'average',
              }))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <LabelWithTooltip
              htmlFor="measured-power-display"
              label={t.display}
              tooltip={t.displayHelp}
            />
            <Select
              value={config.display}
              onValueChange={(display) => change({ display: display as typeof config.display })}
            >
              <SelectTrigger
                id="measured-power-display"
                data-testid="measured-power-display"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent portalled={false}>
                <SelectItem value="watts" data-value="watts">
                  W/chip
                </SelectItem>
                <SelectItem
                  value="tdp"
                  data-value="tdp"
                  disabled={config.scope !== 'all' || config.statistic !== 'average'}
                >
                  % TDP
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {config.scope !== 'all' && (
            <p className="col-span-full text-xs text-muted-foreground">{t.roleHint}</p>
          )}
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <LabelWithTooltip htmlFor="measured-energy-unit" label={t.unit} tooltip={t.unitHelp} />
          <Select
            value={config.unit}
            disabled={config.denominator !== 'query'}
            onValueChange={(unit) => change({ unit: unit as typeof config.unit })}
          >
            <SelectTrigger
              id="measured-energy-unit"
              data-testid="measured-energy-unit"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent portalled={false}>
              <SelectItem value="joules" data-value="joules">
                J
              </SelectItem>
              <SelectItem value="wattHours" data-value="wattHours">
                Wh
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
