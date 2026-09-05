import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

const packageRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'inferencex-lookup-test-'));
const environment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  npm_config_cache: join(temporaryRoot, 'npm-cache'),
  npm_config_update_notifier: 'false',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};

function npm(args, cwd) {
  const result = spawnSync('npm', args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

function observation(id, date, overrides = {}) {
  return {
    id,
    date,
    model: 'dsv4',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}/attempts/2`,
    curve_date: '2026-09-04',
    curve_workflow_run_id: '900719925474099399999',
    curve_run_started_at: '2026-09-04T09:00:00Z',
    metrics: { output_throughput: 123.5 },
    ...overrides,
  };
}

after(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

test('the installed basic lookup limits the newest scoped observation dates and preserves provenance', () => {
  const packed = npm(['pack', '--json', '--pack-destination', temporaryRoot], packageRoot);
  const archive = join(temporaryRoot, JSON.parse(packed.stdout)[0].filename);
  const project = mkdtempSync(join(temporaryRoot, 'project with spaces-'));
  npm(
    [
      'exec',
      '--yes',
      '--offline',
      '--package',
      archive,
      '--',
      'inferencex-skills',
      'install',
      '--target',
      'claude',
    ],
    project,
  );
  const skill = readFileSync(join(project, '.claude/skills/inferencex-api/SKILL.md'), 'utf8');
  const section = skill.split('## Basic benchmark lookup\n')[1];
  assert.ok(section, 'the installed skill contains the worked lookup');
  const snippet = section.match(
    /```bash\nnode --input-type=module <<'JS'\n(?<code>[\s\S]*?)\nJS\n```/,
  );
  assert.ok(snippet, 'execute the installed example instead of copying its selection logic');

  const newest = [
    observation('900719925474099312345', '2026-09-03'),
    observation('900719925474099312346', '2026-09-03'),
    observation('900719925474099312347', '2026-09-02'),
    observation('900719925474099312348', '2026-09-01'),
    observation('900719925474099312349', '2026-08-31'),
  ];
  const rows = [
    observation('older-first', '2026-07-14', { model: 'dsv4-older-release' }),
    newest[4],
    observation('wrong-workload', '2026-09-04', { benchmark_type: 'agentic_traces' }),
    newest[2],
    observation('wrong-input', '2026-09-04', { isl: 1024 }),
    newest[0],
    observation('wrong-output', '2026-09-04', { osl: 8192 }),
    newest[3],
    observation('second-old', '2026-08-30'),
    newest[1],
  ];
  const fixturePath = join(temporaryRoot, 'rows.json');
  const requestsPath = join(temporaryRoot, 'requests.jsonl');
  const preload = join(temporaryRoot, 'http-response.mjs');
  writeFileSync(fixturePath, JSON.stringify(rows));
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
  const url = String(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, JSON.stringify(url) + '\\n');
  if (url === 'https://inferencex.semianalysis.com/api/openapi.json') {
    return Response.json({ paths: { '/api/v1/benchmarks': { get: { parameters: [
      { name: 'model', schema: { enum: ['DeepSeek-V4-Pro'] } },
    ] } } } });
  }
  if (url === 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-V4-Pro') {
    return new Response(readFileSync(process.env.INFERENCEX_TEST_ROWS, 'utf8'));
  }
  throw new Error('Unexpected request: ' + url);
};
`,
  );
  const result = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(preload).href, '--input-type=module'],
    {
      cwd: project,
      env: {
        ...environment,
        INFERENCEX_TEST_ROWS: fixturePath,
        INFERENCEX_TEST_REQUESTS: requestsPath,
      },
      input: snippet.groups.code,
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(readFileSync(requestsPath, 'utf8').trimEnd().split('\n').map(JSON.parse), [
    'https://inferencex.semianalysis.com/api/openapi.json',
    'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-V4-Pro',
  ]);
  assert.equal(
    output.query_url,
    'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-V4-Pro',
  );
  assert.ok(Number.isFinite(Date.parse(output.retrieved_at)));
  assert.equal(output.requested_model, 'DeepSeek-V4-Pro');
  assert.deepEqual(output.scope, {
    date: 'latest available',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
  });
  assert.equal(
    output.matching_rows,
    7,
    'the count includes scoped rows beyond the five-row sample',
  );
  assert.deepEqual(output.returned_models.toSorted(), ['dsv4', 'dsv4-older-release']);
  assert.deepEqual(
    output.sample_rows,
    newest,
    'newest dates win regardless of array order or shared curve date',
  );
});
