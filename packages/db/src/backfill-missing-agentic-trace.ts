import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { createAdminSql } from './etl/db-utils.js';
import { prepareTraceReplay, persistPreparedTraceReplay } from './etl/trace-replay-ingest.js';
import { confirmProceed, parseRunIdFlag, runBackfillMain } from './lib/backfill-runner.js';

// The later evaluation artifact reused this name but omitted the trace files.
// Recover the original benchmark artifact, not the smaller evaluation upload.
const recovery = {
  runId: 31581562219,
  artifactId: 9140323247,
  artifactName:
    'agentic_qwen3.5_tp4_conc40_kvnone_spec-mtp_fp4_sglang_tp4-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-mtp_conc40_mi355x-amds_00',
};
const sql = createAdminSql({ max: 1, onnotice: () => {} });
const hash = (data: Buffer) => createHash('md5').update(data).digest('hex');

async function main(): Promise<void> {
  if (parseRunIdFlag() !== recovery.runId)
    throw new Error('No registered trace recovery for this run');
  const rows = await sql<{ id: number; trace_replay_id: number | null; fingerprint: string }[]>`
    select br.id, br.trace_replay_id,
      md5((to_jsonb(br)-'trace_replay_id')::text) as fingerprint
    from benchmark_results br
    join workflow_runs w on w.id=br.workflow_run_id
    join configs c on c.id=br.config_id
    where w.github_run_id=${recovery.runId} and w.run_attempt=1
      and c.hardware='mi355x' and c.framework='sglang' and c.model='qwen3.5'
      and c.precision='fp4' and c.spec_method='mtp' and not c.disagg
      and c.prefill_tp=4 and c.decode_tp=4 and c.prefill_ep=1 and c.decode_ep=1
      and not c.prefill_dp_attention and not c.decode_dp_attention
      and br.benchmark_type='agentic_traces' and br.conc=40
      and br.isl is null and br.osl is null and br.offload_mode='off'
      and br.recipe_fingerprint is null
  `;
  if (rows.length !== 1) throw new Error(`Expected one recovery target, found ${rows.length}`);
  const row = rows[0]!;
  if (row.trace_replay_id !== null) {
    console.log(`Point ${row.id} already has a trace; no changes`);
    return;
  }
  if (
    !(await confirmProceed(
      `Restore missing trace for point ${row.id} from artifact ${recovery.artifactId}`,
    ))
  )
    return;
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const api = `https://api.github.com/repos/SemiAnalysisAI/InferenceX/actions/artifacts/${recovery.artifactId}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const response = await fetch(api, { headers });
  if (!response.ok) throw new Error(`Artifact lookup failed: ${response.status}`);
  const artifact = (await response.json()) as {
    name: string;
    expired: boolean;
    workflow_run: { id: number };
  };
  if (
    artifact.name !== recovery.artifactName ||
    artifact.expired ||
    artifact.workflow_run.id !== recovery.runId
  ) {
    throw new Error('Artifact does not match the registered benchmark source');
  }
  const download = await fetch(`${api}/zip`, { headers });
  if (!download.ok) throw new Error(`Artifact download failed: ${download.status}`);
  const zip = new AdmZip(Buffer.from(await download.arrayBuffer()));
  const profile = zip.readFile('aiperf_artifacts/profile_export.jsonl');
  const metrics = zip.readFile('aiperf_artifacts/server_metrics_export.json');
  const csv = zip.readFile('aiperf_artifacts/server_metrics_export.csv');
  if (!profile || !metrics || !csv) throw new Error('Original trace files are missing');
  const prepared = await prepareTraceReplay(profile, csv, metrics, {
    framework: 'sglang',
    disagg: false,
  });
  if (!prepared.timelineRequests || !prepared.chartWindows)
    throw new Error('Recovered trace is empty');
  // Attach only the missing sidecar; published benchmark measurements remain immutable.
  prepared.cacheHitRates = null;
  prepared.fullResponseMetrics = {};
  prepared.atomKvCacheBlocks = null;
  await persistPreparedTraceReplay(sql, [row.id], prepared);
  const [after] = await sql<{ fingerprint: string; profile_hash: string; server_hash: string }[]>`
    select md5((to_jsonb(br)-'trace_replay_id')::text) as fingerprint,
      md5(a.profile_export_jsonl_gz) as profile_hash, md5(a.server_metrics_json_gz) as server_hash
    from benchmark_results br join agentic_trace_replay a on a.id=br.trace_replay_id
    where br.id=${row.id}
  `;
  if (
    !after ||
    after.fingerprint !== row.fingerprint ||
    after.profile_hash !== hash(prepared.profileGz!) ||
    after.server_hash !== hash(prepared.serverMetricsJsonGz!)
  ) {
    throw new Error('Recovered trace failed source/benchmark integrity verification');
  }
  console.log(
    `PASS: restored point ${row.id} from artifact ${recovery.artifactId}; benchmark fields unchanged`,
  );
}

runBackfillMain('backfill-missing-agentic-trace', sql, main);
