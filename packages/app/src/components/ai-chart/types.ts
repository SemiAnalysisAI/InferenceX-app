export type AiProvider = 'openai' | 'anthropic' | 'xai' | 'google';

export type AiChartType = 'bar' | 'scatter';

export type AiDataSource = 'benchmarks' | 'evaluations' | 'reliability' | 'history';

export interface AiChartSpec {
  chartType: AiChartType;
  dataSource: AiDataSource;
  model: string;
  sequence: string;
  precisions: string[];
  hardwareKeys: string[];
  yAxisMetric: string;
  yAxisLabel: string;
  targetInteractivity?: number;
  title: string;
  description: string;
}

export interface AiChartBarPoint {
  hwKey: string;
  label: string;
  value: number;
  color: string;
}
