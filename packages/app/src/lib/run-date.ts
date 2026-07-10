/** Resolve a selected run date against the dates available for the active scenario. */
export function resolveRunDate(
  availableDates: string[],
  selectedDate: string,
  preserveSelected: boolean,
): string {
  if (availableDates.length === 0) return selectedDate;
  if (preserveSelected && availableDates.includes(selectedDate)) return selectedDate;
  return availableDates.at(-1)!;
}
