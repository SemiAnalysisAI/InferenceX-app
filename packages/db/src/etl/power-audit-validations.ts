/** Pure normalization of legacy and retained AgentX power-audit documents. */
const LEGACY_VALIDATION = /^power_validation_[^/]+\.json$/u;
const AGENTX_VALIDATION = /^LOGS\/agentic\/conc_(?<concurrency>[1-9]\d*)\/power_validation\.json$/u;
const AGENTX_WINDOW = /^LOGS\/power\/windows\/agentic_power_concurrency_[1-9]\d*\.json$/u;
const RESULT_FILE = /^(?<stem>[^/]+)_conc(?<concurrency>[1-9]\d*)\.json$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseObject(text: string | undefined): Record<string, unknown> | null {
  if (text === undefined) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function hasWindowTimes(value: unknown): value is Record<string, unknown> & {
  start_time_unix: number;
  end_time_unix: number;
} {
  return (
    isRecord(value) &&
    typeof value.start_time_unix === 'number' &&
    Number.isFinite(value.start_time_unix) &&
    value.start_time_unix > 0 &&
    typeof value.end_time_unix === 'number' &&
    Number.isFinite(value.end_time_unix) &&
    value.end_time_unix > value.start_time_unix
  );
}

/** Only documents needed to identify a validation and its recorded result/window. */
export function isPowerAuditValidationEntry(name: string): boolean {
  return (
    LEGACY_VALIDATION.test(name) ||
    AGENTX_VALIDATION.test(name) ||
    AGENTX_WINDOW.test(name) ||
    RESULT_FILE.test(name)
  );
}

/**
 * Legacy top-level documents keep their names and contents. A nested AgentX
 * document gains a canonical alias only when its result and retained window
 * agree; path annotations retain the original document's provenance.
 */
export function normalizePowerAuditValidations(
  artifactName: string,
  files: ReadonlyMap<string, string>,
): Map<string, Record<string, unknown>> {
  const validations = new Map<string, Record<string, unknown>>();
  for (const [name, text] of files) {
    if (!LEGACY_VALIDATION.test(name)) continue;
    const validation = parseObject(text);
    if (validation) validations.set(name, validation);
  }
  const artifactStem = /^power_audit_(?<stem>[^/]+)$/u.exec(artifactName)?.groups?.stem;
  if (!artifactStem) return validations;

  for (const [validationPath, text] of files) {
    const match = AGENTX_VALIDATION.exec(validationPath);
    if (!match?.groups) continue;
    const concurrency = Number(match.groups.concurrency);
    if (!Number.isSafeInteger(concurrency)) continue;
    const resultFile = `${artifactStem}_conc${concurrency}.json`;
    const source = `power_validation_${resultFile.slice(0, -5)}.json`;
    if (validations.has(source)) continue;
    const validation = parseObject(text);
    const result = parseObject(files.get(resultFile));
    const selected = validation?.selected_window;
    const resultPath = `agentic/conc_${concurrency}/agentic_power_concurrency_${concurrency}.json`;
    const windowFile = `windows/agentic_power_concurrency_${concurrency}.json`;
    const window = parseObject(files.get(`LOGS/power/${windowFile}`));
    if (
      !validation ||
      result?.conc !== concurrency ||
      !hasWindowTimes(selected) ||
      selected.concurrency !== concurrency ||
      selected.result_path !== resultPath ||
      selected.window_file !== windowFile ||
      window?.concurrency !== concurrency ||
      window.result_path !== resultPath ||
      window.benchmark_start_time_unix !== selected.start_time_unix ||
      window.benchmark_end_time_unix !== selected.end_time_unix
    )
      continue;
    validations.set(source, {
      ...validation,
      validation_path: validationPath,
      result_file: resultFile,
    });
  }
  return validations;
}

/** Recover source/window metadata only from a normalized nested validation. */
export function recoveredPowerAudit(
  source: string,
  validation: Record<string, unknown>,
): { source: string; window_start_unix: number; window_end_unix: number } | null {
  const path = validation.validation_path;
  const result = validation.result_file;
  if (typeof path !== 'string' || typeof result !== 'string') return null;
  const nested = AGENTX_VALIDATION.exec(path)?.groups;
  const file = RESULT_FILE.exec(result)?.groups;
  const selected = validation.selected_window;
  if (
    !nested ||
    !file ||
    nested.concurrency !== file.concurrency ||
    source !== `power_validation_${result.slice(0, -5)}.json` ||
    !hasWindowTimes(selected) ||
    selected.concurrency !== Number(nested.concurrency)
  )
    return null;
  return {
    source,
    window_start_unix: selected.start_time_unix,
    window_end_unix: selected.end_time_unix,
  };
}
