import { argumentError, responseError } from './cli-contract.mjs';

const COMPARISON_KINDS = new Set(['releases', 'collectivex']);
const HARDWARE_KINDS = new Set(['powerx', 'agentx', 'result', 'tco']);

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateCoverage(coverage) {
  if (
    coverage === null ||
    typeof coverage !== 'object' ||
    !['complete', 'partial', 'empty', 'unknown'].includes(coverage.status) ||
    !nonnegativeInteger(coverage.selected_records) ||
    !(coverage.comparable_pairs === null || nonnegativeInteger(coverage.comparable_pairs)) ||
    !Array.isArray(coverage.hardware) ||
    coverage.hardware.some(
      (item) =>
        item === null ||
        typeof item !== 'object' ||
        typeof item.hardware !== 'string' ||
        item.hardware.length === 0 ||
        !nonnegativeInteger(item.valid_records),
    ) ||
    !Array.isArray(coverage.reasons) ||
    coverage.reasons.some(
      (reason) =>
        reason === null ||
        typeof reason !== 'object' ||
        typeof reason.code !== 'string' ||
        reason.code.length === 0 ||
        !nonnegativeInteger(reason.count),
    )
  ) {
    throw responseError('Collector returned invalid coverage');
  }
  const keys = coverage.hardware.map(({ hardware }) => hardware);
  if (new Set(keys).size !== keys.length) throw responseError('Coverage repeats a hardware key');
  return coverage;
}

export function evaluatePolicy(kind, coverage, requirements = {}) {
  validateCoverage(coverage);
  const requireHardware = requirements.requireHardware ?? requirements.require_hardware ?? [];
  const minComparablePairs =
    requirements.minComparablePairs ?? requirements.min_comparable_pairs ?? null;
  if (
    !Array.isArray(requireHardware) ||
    requireHardware.some((key) => typeof key !== 'string' || key.length === 0)
  ) {
    throw argumentError('--require-hardware requires a non-empty hardware key');
  }
  if (new Set(requireHardware).size !== requireHardware.length) {
    throw argumentError('Specify each --require-hardware key only once');
  }
  if (
    minComparablePairs !== null &&
    (!Number.isSafeInteger(minComparablePairs) || minComparablePairs < 0)
  ) {
    throw argumentError('--min-comparable-pairs must be a nonnegative integer');
  }
  if (minComparablePairs !== null && !COMPARISON_KINDS.has(kind)) {
    throw argumentError(`--min-comparable-pairs is not supported for ${kind}`);
  }
  if (requireHardware.length > 0 && !HARDWARE_KINDS.has(kind)) {
    throw argumentError(`--require-hardware is not supported for ${kind}`);
  }
  const normalized = {
    require_hardware: requireHardware,
    min_comparable_pairs: minComparablePairs,
  };
  if (requireHardware.length === 0 && minComparablePairs === null) {
    return { status: 'not_requested', requirements: normalized, reasons: [] };
  }

  const validByHardware = new Map(
    coverage.hardware.map(({ hardware, valid_records }) => [hardware, valid_records]),
  );
  const reasons = requireHardware.flatMap((hardware) => {
    const actual = validByHardware.get(hardware) ?? 0;
    return actual > 0 ? [] : [{ code: 'REQUIRED_HARDWARE_MISSING', hardware, required: 1, actual }];
  });
  if (minComparablePairs !== null) {
    if (coverage.comparable_pairs === null) {
      throw responseError(`${kind} coverage did not report comparable pairs`);
    }
    if (coverage.comparable_pairs < minComparablePairs) {
      reasons.push({
        code: 'MIN_COMPARABLE_PAIRS_UNMET',
        required: minComparablePairs,
        actual: coverage.comparable_pairs,
      });
    }
  }
  return {
    status: reasons.length === 0 ? 'passed' : 'failed',
    requirements: normalized,
    reasons,
  };
}
