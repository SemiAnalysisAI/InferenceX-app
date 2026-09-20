export interface ApiPriceReference {
  /** USD an API bills per generated video-second at the captured tier. */
  pricePerVideoSecondUsd: number;
  /** Listed range across the captured tiers, USD per video-second. */
  rangeUsd: readonly [number, number];
  /** ISO date the price was captured. */
  capturedOn: string;
  /** Where the price was seen, including what was not verified. */
  label: { en: string; zh: string };
}

/**
 * Dated, sourced API list price the dashboard compares self-hosted TCO against.
 * It is a reference input, not a measurement: the reader can override it
 * (`v_api`) and every derived number is labelled as list price. Change the
 * numbers only together with a new capture date and source text.
 */
export const H3_API_REFERENCE: ApiPriceReference = {
  pricePerVideoSecondUsd: 0.034,
  rangeUsd: [0.034, 0.047],
  capturedOn: '2026-09-19',
  label: {
    en: 'MiniMax Design · H3 768p subscription tier (web search, not verified on the pay-as-you-go page; H3 was listed as not yet supported on the API packages page)',
    zh: 'MiniMax Design · H3 768p 订阅档（价格来自网页搜索，未在按量付费页面核实；API 套餐页当时标注 H3 尚未支持）',
  },
};

/** `$0.034` style USD per video-second: at least the three decimals the input steps by. */
export function formatApiPrice(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`;
}
