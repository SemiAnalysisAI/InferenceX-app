/** True when the field shows a positive finite number strictly outside [min, max]. */
export function isInteractivityInputOutOfRange(
  inputValue: string,
  min: number,
  max: number,
): boolean {
  const parsed = parseFloat(inputValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  return parsed < min || parsed > max;
}
