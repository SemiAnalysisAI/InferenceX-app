/** InferenceX `result_schema_version` this ingest understands. */
export const RESULT_SCHEMA_VERSION = 1;

/**
 * Whether a published InferenceX row can be ingested. Unstamped rows predate
 * the contract and are read as version 1; any other stamp is refused.
 */
export function hasSupportedResultSchemaVersion(row: object): boolean {
  return !('result_schema_version' in row) || row.result_schema_version === RESULT_SCHEMA_VERSION;
}
