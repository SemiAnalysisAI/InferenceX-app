import { readFile } from 'node:fs/promises';

export function evaluateAcceptance(matrix) {
  const reasons = [];
  if (matrix.state !== 'approved' || !matrix.approvedBy)
    reasons.push('Acceptance baseline is not approved');
  if (!matrix.referenceBuild || !/^[a-f0-9]{64}$/.test(matrix.referenceMapSha256 ?? '')) {
    reasons.push('Reference CS:GO build and map digest are not pinned');
  }
  if (matrix.requiredPercent !== 95) reasons.push('Required threshold must remain 95%');
  const checks = matrix.checks ?? [];
  const ids = checks.map((check) => check.id);
  if (checks.length === 0 || new Set(ids).size !== checks.length)
    reasons.push('Empty or duplicate checklist');
  let total = 0;
  let passed = 0;
  for (const check of checks) {
    if (!Number.isFinite(check.weight) || check.weight <= 0) {
      reasons.push(`Invalid weight: ${check.id}`);
      continue;
    }
    total += check.weight;
    const evidence =
      Array.isArray(check.evidence) &&
      check.evidence.length > 0 &&
      check.evidence.every((item) => typeof item === 'string' && item.startsWith('https://'));
    if (check.status === 'pass' && evidence) passed += check.weight;
    if (check.status === 'pass' && !evidence) reasons.push(`Missing evidence: ${check.id}`);
    if (check.required && (check.status !== 'pass' || !evidence))
      reasons.push(`Required check not passed: ${check.id}`);
  }
  if (total !== 100) reasons.push('Checklist weights must total 100');
  const percent = total ? (passed / total) * 100 : 0;
  if (percent < 95) reasons.push(`Evidence-backed checklist coverage is ${percent}%, below 95%`);
  return { eligible: reasons.length === 0, checklistPercent: percent, reasons };
}

if (process.argv[1] === import.meta.filename) {
  const matrix = JSON.parse(await readFile(new URL('acceptance.json', import.meta.url), 'utf8'));
  const report = evaluateAcceptance(matrix);
  console.log(JSON.stringify(report, null, 2));
  if (!report.eligible) process.exitCode = 1;
}
