/**
 * How the results view writes a measured value, so a latency, a cost or an energy reads the same
 * in the readout, the stage sentence, the point sheet, the pinned panel and the deployment detail.
 * Presentation only: the API and the CSV keep every digit.
 */

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * About three significant figures: "35.4", "2.09", "0.0132". From 100 up it is a whole number
 * with every digit kept ("1,118"), so rounding never changes a digit left of the point.
 */
export function figures(value: number): string {
  return value.toLocaleString(
    'en-US',
    Math.abs(value) >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 3 },
  );
}

/** `figures`, or null for a value that was not measured. */
export const reading = (value: number | null | undefined): string | null =>
  finite(value) ? figures(value) : null;

/**
 * A dollar amount without its sign, as the site writes a small cost: three decimals below $1
 * ("0.068"), cents from $1 ("1.23"), and two significant figures below one cent ("0.0046"), so
 * a cost never rounds to 0. For a table column whose heading already says "$".
 */
export function dollarFigures(value: number): string {
  const abs = Math.abs(value);
  return abs >= 1
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs >= 0.01 || abs === 0
      ? value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : value.toLocaleString('en-US', { maximumSignificantDigits: 2 });
}

/** A cost with its sign: "$0.068". */
export const usd = (value: number): string => `$${dollarFigures(value)}`;

/** `usd`, or null for a cost that could not be modelled. */
export const cost = (value: number | null | undefined): string | null =>
  finite(value) ? usd(value) : null;

/** Energy per clip in kJ from joules: "138 kJ". */
export const kilojoules = (joules: number | null | undefined): string | null =>
  finite(joules) ? `${figures(joules / 1000)} kJ` : null;

/** How one lower-is-better value stands against another. */
export type Comparison =
  | { direction: 'same' }
  | {
      direction: 'better' | 'worse';
      /** The difference as a share of the other value: "29". */
      percent: string;
      /** The ratio of the two values, once they are at least twice apart: "2.09". */
      times?: string;
    };

/**
 * A cost or an energy against the pair's, where lower is better: the difference as a percentage
 * of the pair's value ("29%") and, from 2× apart, the ratio as well ("2.09×"), which English
 * then words in place of the percentage. A difference that rounds to 0% is the same. Null unless
 * both are measured and positive.
 */
export function compareLower(
  subject: number | null | undefined,
  pair: number | null | undefined,
): Comparison | null {
  if (!finite(subject) || !finite(pair) || !(subject > 0) || !(pair > 0)) return null;
  const direction = subject < pair ? 'better' : 'worse';
  const ratio = Math.max(subject, pair) / Math.min(subject, pair);
  const percent = Math.round((Math.abs(subject - pair) / pair) * 100);
  if (percent === 0) return { direction: 'same' };
  return ratio >= 2
    ? { direction, percent: String(percent), times: figures(ratio) }
    : { direction, percent: String(percent) };
}
