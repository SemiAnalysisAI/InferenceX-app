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
    boundary: 'Boundary',
    boundaryHelp:
      'Choose measured GPU-board power, GPU TDP, provisioned facility power, or facility power modeled from measured GPU power. Facility estimates include PUE once; they are not meter measurements.',
    'gpu-measured': 'GPU measured',
    'gpu-provisioned': 'GPU provisioned (TDP)',
    'utility-provisioned': 'All-in utility provisioned',
    'utility-modeled': 'All-in utility modeled',
    powerAssumptions: 'Whole deployment, normalized per chip (W/chip).',
    energyAssumptions: 'Whole-deployment energy per output token (J/output token).',
    provisionedAssumptions: 'Provisioned energy is power divided by all-GPU output throughput.',
    modeledAssumptions:
      'Facility power is a model estimate, not a meter measurement. Energy scales measured GPU J/output token by the modeled-to-measured power ratio.',
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
    boundary: '功耗口径',
    boundaryHelp:
      '选择 GPU 板卡实测功率、GPU TDP、设施配置功率，或根据 GPU 实测功率估算的设施功率。设施功率已计入一次 PUE，属于估算值。',
    'gpu-measured': 'GPU 实测',
    'gpu-provisioned': 'GPU 额定（TDP）',
    'utility-provisioned': '全设施配置',
    'utility-modeled': '全设施估算',
    powerAssumptions: '整个部署的功率，按芯片数归一化（W/芯片）。',
    energyAssumptions: '整个部署的能耗，按输出 token 归一化（J/输出 token）。',
    provisionedAssumptions: '配置能耗由配置功率除以全部 GPU 的输出吞吐量得到。',
    modeledAssumptions:
      '设施功率为模型估算值。能耗按设施估算功率与 GPU 实测功率的比值，对 GPU 实测 J/输出 token 换算。',
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
  const basis = config.basis ?? 'gpu-measured';
  const boundaryId = `measured-${config.family}-boundary`;
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
      className="col-span-full grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="measured-metric-controls"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <LabelWithTooltip htmlFor={boundaryId} label={t.boundary} tooltip={t.boundaryHelp} />
        <Select value={basis} onValueChange={(value) => change({ basis: value as typeof basis })}>
          <SelectTrigger id={boundaryId} data-testid={boundaryId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent portalled={false}>
            {(
              ['gpu-measured', 'gpu-provisioned', 'utility-provisioned', 'utility-modeled'] as const
            ).map((value) => (
              <SelectItem key={value} value={value} data-value={value}>
                {t[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {basis === 'gpu-measured' ? (
        <>
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
              <LabelWithTooltip
                htmlFor="measured-energy-unit"
                label={t.unit}
                tooltip={t.unitHelp}
              />
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
        </>
      ) : (
        <p
          className="self-end text-xs text-muted-foreground xl:col-span-3"
          data-testid="measured-boundary-assumptions"
        >
          {config.family === 'power' ? t.powerAssumptions : t.energyAssumptions}{' '}
          {basis === 'utility-modeled'
            ? t.modeledAssumptions
            : config.family === 'energy'
              ? t.provisionedAssumptions
              : null}
        </p>
      )}
    </div>
  );
}
