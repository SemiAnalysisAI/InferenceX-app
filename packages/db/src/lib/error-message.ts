/** The message of a thrown value, whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
