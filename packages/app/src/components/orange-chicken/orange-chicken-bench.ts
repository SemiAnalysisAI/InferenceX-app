/**
 * Reads what the page is showing right now (the model in the address bar and the first legend
 * entries) so jokes and payoffs can name the real benchmark. Read-only; falls back to plain words.
 */
export interface BenchContext {
  model: string;
  legend: string;
}

export function readBench(fallbackModel: string, fallbackLegend: string): BenchContext {
  if (typeof document === 'undefined') return { model: fallbackModel, legend: fallbackLegend };
  const params = new URLSearchParams(window.location.search);
  const model = params.get('g_model')?.replaceAll(/[_-]/gu, ' ') || fallbackModel;
  const names: string[] = [];
  for (const label of document.querySelectorAll('[data-testid="chart-legend"] li label')) {
    const text = (label.getAttribute('title') || label.textContent || '')
      .trim()
      .replaceAll(/\s+/gu, ' ');
    if (text && text.length <= 40) names.push(text);
    if (names.length > 0) break;
  }
  return { model, legend: names[0] ?? fallbackLegend };
}
