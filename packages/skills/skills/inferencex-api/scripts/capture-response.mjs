import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  argumentError,
  CliError,
  httpError,
  outputBoundary,
  requestBoundary,
  responseBoundary,
  responseError,
} from './cli-contract.mjs';
import { createResponseBudget } from './response-budget.mjs';

const API_ORIGIN = 'https://inferencex.semianalysis.com';

// Raw recipes need failure bodies too; createHttpClient validates and parses before returning.
export function createResponseCapture({
  timeoutMs = 30_000,
  responseBytes = 32 * 1024 * 1024,
  totalBytes = 128 * 1024 * 1024,
} = {}) {
  for (const [name, value, maximum] of [
    ['timeoutMs', timeoutMs, 30_000],
    ['responseBytes', responseBytes, 32 * 1024 * 1024],
    ['totalBytes', totalBytes, 128 * 1024 * 1024],
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw argumentError(`${name} must be a positive integer no greater than ${maximum}.`);
    }
  }
  let captureDir;
  try {
    captureDir = mkdtempSync('api-evidence-');
  } catch (error) {
    throw new CliError('OUTPUT_ERROR', error.message, { cause: error });
  }
  const budget = createResponseBudget({ responseBytes, totalBytes, timeoutMs });
  const requests = [];
  let ordinal = 0;

  async function read(path) {
    let url;
    try {
      url = new URL(path, API_ORIGIN);
    } catch (error) {
      throw argumentError('Request URL is invalid.', error);
    }
    if (url.origin !== API_ORIGIN || url.username || url.password || url.hash) {
      throw argumentError(`Request URL must use ${API_ORIGIN} without credentials or a fragment.`);
    }
    const query_url = url.href;
    const stem = join(captureDir, String(++ordinal));
    let response, bytes;
    try {
      response = await requestBoundary(() => {
        budget.signal.throwIfAborted();
        if (budget.consumedBytes >= totalBytes) {
          throw responseError(`Operation exhausted total ${totalBytes}-byte budget`);
        }
        return fetch(query_url, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: budget.signal,
          redirect: 'error',
        });
      }, budget.signal);
      if (!(response instanceof Response))
        throw responseError('Fetch returned an invalid response object.');
      bytes = await requestBoundary(() => budget.read(response), budget.signal);
    } catch (error) {
      const failed = {
        query_url,
        failed_at: new Date().toISOString(),
        status: response?.status ?? null,
        error: error.message,
      };
      await outputBoundary(() =>
        writeFileSync(`${stem}.json`, JSON.stringify(failed), { flag: 'wx' }),
      );
      requests.push(failed);
      throw error;
    }
    const record = {
      query_url,
      retrieved_at: new Date().toISOString(),
      status: response.status,
      body_path: `${stem}.body`,
      decoded_bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    // Finish both writes before status validation or decoding; never replace earlier attempts.
    await outputBoundary(() => {
      writeFileSync(record.body_path, bytes, { flag: 'wx' });
      writeFileSync(`${stem}.json`, JSON.stringify(record), { flag: 'wx' });
    });
    requests.push(record);
    if (!response.ok) throw httpError(response.status, `HTTP ${response.status}: ${query_url}`);
    return responseBoundary(
      () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      budget.signal,
    );
  }

  return { read, requests, captureDir };
}
