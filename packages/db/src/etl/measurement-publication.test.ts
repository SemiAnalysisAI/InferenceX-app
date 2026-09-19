import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parseMeasurementReceipt } from '../lib/measurement-receipt';
import { expectedPublication, verifyPublishedMeasurements } from './measurement-publication';

const fixture = new URL('../lib/fixtures/measurement-receipt/', import.meta.url);
const hash = '7112fa0765669dc24b375946b136231df3fcff53d756ab1ce56ea6a83914dd4e';
const raw = fs.readFileSync(new URL('receipt.json', fixture));
const config = {
  model: 'dsr1',
  hardware: 'h200',
  framework: 'vllm',
  precision: 'fp8',
  disagg: false,
  is_multinode: false,
  decode_tp: 8,
  decode_ep: 1,
  num_decode_gpu: 8,
  num_prefill_gpu: 8,
};
it('compares hand-worked metric values and point multiplicity independently of power', () => {
  const expected = expectedPublication(
    parseMeasurementReceipt(raw, hash, 'd'.repeat(40)),
    fileURLToPath(fixture),
  );
  expect(expected.map((point) => [point.metrics, point.strictPassed])).toEqual([
    [{ output_tput_tps: 100, duration_seconds: 60 }, null],
    [{ em_strict: 0.5, n_eff: 2 }, 1],
  ]);
  const row = {
    ...config,
    id: 10,
    conc: 1,
    metrics: { output_tput_tps: 100, duration_seconds: 60 },
  };
  expect(verifyPublishedMeasurements(expected, [row], 'throughput', 'API')).toEqual([]);
  expect(
    verifyPublishedMeasurements(
      expected,
      [{ ...row, metrics: { ...row.metrics, output_tput_tps: 90 } }],
      'throughput',
      'API',
    )[0],
  ).toContain('output_tput_tps differs (90 vs 100)');
  expect(verifyPublishedMeasurements(expected, [row, row], 'throughput', 'API')[0]).toContain(
    'found 2',
  );
  expect(verifyPublishedMeasurements(expected, [], 'eval', 'API')[0]).toContain('found 0');
});
it('runs the read-only CLI through exact-run/latest curves and trace/sample detail APIs', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    const url = new URL(request.url!, 'http://localhost');
    const data = url.pathname.endsWith('/benchmarks')
      ? [{ ...config, id: 10, conc: 1, metrics: { output_tput_tps: 100, duration_seconds: 60 } }]
      : url.pathname.endsWith('/evaluations')
        ? [
            {
              ...config,
              id: 20,
              conc: 28,
              task: 'gsm8k',
              metrics: { em_strict: 0.5, n_eff: 2 },
              run_url: 'https://github.com/org/repo/actions/runs/100',
            },
          ]
        : url.pathname.endsWith('/trace-availability')
          ? { '10': true }
          : url.searchParams.get('eval_result_id') === '20'
            ? { total: 2, passedTotal: 1, failedTotal: 1, samples: [] }
            : {};
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(data));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-publication-'));
  try {
    const address = server.address() as { port: number };
    const output = path.join(root, 'verification.json');
    await promisify(execFile)(
      'bun',
      [
        fileURLToPath(new URL('../verify-measurement-publication.ts', import.meta.url)),
        `http://127.0.0.1:${address.port}`,
        output,
      ],
      {
        env: {
          ...process.env,
          INGEST_RECEIPT_REQUIRED: '1',
          INGEST_RECEIPT_PATH: fileURLToPath(new URL('receipt.json', fixture)),
          INGEST_RECEIPT_SHA256: hash,
          INGEST_RECEIPT_ISSUER_SHA: 'd'.repeat(40),
          INGEST_ARTIFACTS_PATH: fileURLToPath(fixture),
        },
      },
    );
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({
      status: 'matched',
      points: 2,
      errors: [],
    });
    expect(requests.some((request) => request.includes('exactRun=true'))).toBe(true);
    expect(requests.some((request) => request.includes('eval_result_id=20'))).toBe(true);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
