import { track } from '@/lib/analytics';
import type { CommonLegendItemProps } from '@/components/ui/chart-legend';
import type { EvaluationChartData } from '@/components/evaluation/types';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';

interface EvalConfig {
  hwKey: string;
  configLabel: string;
}

interface UnofficialRunInfo {
  id: string | number;
  branch?: string;
  url?: string;
}

export interface BuildEvalLegendItemsArgs {
  configurations: EvalConfig[];
  unofficialConfigurations: EvalConfig[];
  unofficialChartData: EvaluationChartData[];
  unofficialRunInfos: UnofficialRunInfo[];
  runIndexByUrl: Record<string, number>;
  highlightedConfigs: Set<string>;
  effectiveOfficialHardware: Set<string>;
  resolveColor: (configLabel: string, hwKey: string) => string;
  onToggleHardware: (hwKey: string) => void;
}

/**
 * Builds the legend item list for the evaluation bar chart: one entry per
 * loaded unofficial run that contributes points, followed by the official
 * config entries. Extracted from EvalBarChartD3 unchanged.
 */
export function buildEvalLegendItems({
  configurations,
  unofficialConfigurations,
  unofficialChartData,
  unofficialRunInfos,
  runIndexByUrl,
  highlightedConfigs,
  effectiveOfficialHardware,
  resolveColor,
  onToggleHardware,
}: BuildEvalLegendItemsArgs): CommonLegendItemProps[] {
  return [
    // Overlay legend: one entry per loaded unofficial run that contributes
    // points to the current chart. Same palette color as the chart strokes.
    ...(unofficialConfigurations.length > 0 && unofficialRunInfos.length > 0
      ? unofficialRunInfos
          .map((info, idx) => {
            const hasPoints = unofficialChartData.some(
              (d) => overlayRunIndex(d.runUrl ?? null, runIndexByUrl) === idx,
            );
            if (!hasPoints) return null;
            const branch = info.branch || `run ${info.id}`;
            return {
              name: `✕ unofficial-run-${info.id}`,
              label: `✕ ${branch}`,
              color: overlayRunColor(idx),
              title: `UNOFFICIAL: ${branch}`,
              isHighlighted: true,
              hw: `overlay-run-${info.id}`,
              isActive: true,
              onClick: () => {},
              tooltip: (
                <div className="font-normal text-xs">
                  <div className="text-red-500 font-semibold">UNOFFICIAL RUN</div>
                  <div>Branch: {branch}</div>
                  {info.url && (
                    <a
                      href={info.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View workflow run
                    </a>
                  )}
                </div>
              ),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : []),
    ...configurations.map(({ hwKey, configLabel }) => ({
      name: configLabel,
      label: configLabel.replaceAll('\n', ' '),
      color: resolveColor(configLabel, hwKey),
      title: configLabel.replaceAll('\n', ' '),
      isHighlighted: highlightedConfigs.has(configLabel),
      hw: hwKey,
      isActive: effectiveOfficialHardware.has(hwKey),
      onClick: () => {
        onToggleHardware(hwKey);
        track('evaluation_hw_toggled', { hw: hwKey });
      },
    })),
  ];
}
