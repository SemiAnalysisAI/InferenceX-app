import { resolveFrameworkAliasesInString } from '@semianalysisai/inferencex-constants/framework-aliases';

import {
  type GithubArtifact,
  downloadGithubArtifact,
  extractZipEntries,
} from '@/lib/github/github-artifacts';
import {
  mapEvalSamples,
  type EvalSampleParams,
} from '@semianalysisai/inferencex-db/etl/eval-samples-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';

export interface EvalArtifactConfig {
  model: string;
  framework: string;
  hardware: string;
  precision: string;
  specMethod: string;
  disagg: boolean;
  conc: number | null;
}

function artifactConcMatches(artifactName: string, targetConc: number): boolean {
  const m = artifactName.match(/_conc(?<concList>\d+(?:x\d+)*)_/u);
  if (!m) return false;
  return m[1].split('x').includes(String(targetConc));
}

export function findEvalSampleArtifact(
  artifacts: GithubArtifact[],
  config: EvalArtifactConfig,
): GithubArtifact | null {
  const required = [
    `_${config.model}_`,
    `_${config.precision}_`,
    `_${config.framework}_`,
    `_${config.hardware}-`,
    `_spec-${config.specMethod}_`,
  ];
  const preferredDisagg = `_disagg-${config.disagg ? 'true' : 'false'}_`;

  const matches = artifacts.filter((a) => {
    const n = resolveFrameworkAliasesInString(a.name.toLowerCase());
    if (!n.startsWith('eval_')) return false;
    if (n.startsWith('eval_results_') || n.startsWith('eval_gpu_metrics_')) return false;
    if (!required.every((t) => n.includes(t.toLowerCase()))) return false;
    if (config.conc !== null && !artifactConcMatches(n, config.conc)) return false;
    return true;
  });
  if (matches.length === 0) return null;
  return matches.toSorted((a, b) => {
    const aDisagg = a.name.toLowerCase().includes(preferredDisagg) ? 0 : 1;
    const bDisagg = b.name.toLowerCase().includes(preferredDisagg) ? 0 : 1;
    if (aDisagg !== bDisagg) return aDisagg - bDisagg;
    return b.id - a.id;
  })[0];
}

export async function fetchAndParseSamples(
  artifact: GithubArtifact,
  task: string,
  githubToken: string,
): Promise<EvalSampleParams[] | null> {
  const response = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());

  const tracker = createSkipTracker();
  const collected: EvalSampleParams[] = [];
  extractZipEntries(buffer, '.jsonl', (entryName, contents) => {
    const m = entryName.match(/(?:^|\/)samples_(?<task>.+?)_[^_]+\.jsonl$/u);
    if (!m) return [];
    if (m[1].toLowerCase() !== task.toLowerCase()) return [];
    collected.push(...mapEvalSamples(contents, tracker));
    return [];
  });
  if (collected.length === 0) return null;
  const seen = new Map<number, EvalSampleParams>();
  for (const s of collected) if (!seen.has(s.docId)) seen.set(s.docId, s);
  return [...seen.values()].toSorted((a, b) => a.docId - b.docId);
}
