export interface ApiPriceReference {
  /** USD an API bills per generated video-second at the captured tier. */
  pricePerVideoSecondUsd: number;
  /** Listed range across the captured tiers, USD per video-second. */
  rangeUsd: readonly [number, number];
  /** ISO date the price was captured. */
  capturedOn: string;
  /** Where the price was seen, including what the page leaves unstated. */
  label: { en: string; zh: string };
}

/**
 * Dated, sourced API list price the dashboard compares self-hosted TCO against.
 * It is a reference input, not a measurement: the reader can override it
 * (`v_api`) and every derived number is labelled as list price. Change the
 * numbers only together with a new capture date and source text.
 */
export const H3_API_REFERENCE: ApiPriceReference = {
  pricePerVideoSecondUsd: 0.08,
  rangeUsd: [0.08, 0.13],
  capturedOn: '2026-09-24',
  label: {
    en: 'MiniMax platform pay-as-you-go pricing page · H3 768P output $0.08/s, 2K output $0.13/s (page shows no effective date)',
    zh: 'MiniMax 开放平台按量付费价格页 · H3 768P 输出 $0.08/s，2K 输出 $0.13/s（页面未标注生效日期）',
  },
};

/** `$0.080` style USD per video-second: at least the three decimals the input steps by. */
export function formatApiPrice(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`;
}
