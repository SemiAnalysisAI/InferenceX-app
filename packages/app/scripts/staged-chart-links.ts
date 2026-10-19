import { appendFileSync } from 'node:fs';
import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getStagedChartScopes } from '@semianalysisai/inferencex-db/queries/staged-chart-links';
import { buildStagedChartLinks } from '../src/lib/benchmarks/staged-chart-links';

async function main() {
  const runId = process.env.RUN_ID ?? '';
  if (!/^[1-9]\d*$/u.test(runId)) throw new Error('RUN_ID must be a positive integer');
  const links = buildStagedChartLinks(runId, await getStagedChartScopes(getDb(), runId));
  const json = JSON.stringify(links);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `chart-links=${json}\n`);
  console.log(json);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
