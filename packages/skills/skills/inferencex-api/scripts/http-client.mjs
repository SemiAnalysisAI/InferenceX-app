import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';

import {
  argumentError,
  CliError,
  httpError,
  requestBoundary,
  responseBoundary,
  responseError,
} from './cli-contract.mjs';
import { createResponseBudget } from './response-budget.mjs';

const API_ORIGIN = 'https://inferencex.semianalysis.com';
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const BACKOFF_MS = [500, 1_000];

function canonicalRequest(spec) {
  if (
    !spec ||
    typeof spec.operation !== 'string' ||
    spec.operation.length === 0 ||
    !Array.isArray(spec.allowedStatuses) ||
    spec.allowedStatuses.length === 0 ||
    spec.allowedStatuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)
  ) {
    throw argumentError('Request operation and allowed HTTP statuses are required.');
  }
  let url;
  try {
    url = new URL(spec.url);
  } catch (error) {
    throw argumentError('Request URL is invalid.', error);
  }
  if (url.origin !== API_ORIGIN || url.username || url.password || url.hash) {
    throw argumentError(`Request URL must use ${API_ORIGIN} without credentials or a fragment.`);
  }
  return {
    operation: spec.operation,
    url: url.href,
    allowedStatuses: new Set(spec.allowedStatuses),
  };
}

function isoTime(now) {
  return new Date(now()).toISOString();
}

function retryAfterMs(value, now) {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/u.test(trimmed)) return Number(trimmed) * 1_000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function transportCode(error) {
  const cause = error?.cause;
  return typeof cause?.code === 'string'
    ? cause.code
    : typeof cause?.name === 'string'
      ? cause.name
      : 'NETWORK_ERROR';
}

function cancellationError(error, signal, cancellation) {
  if (error instanceof CliError && ['CANCELLED', 'TIMEOUT'].includes(error.code)) return error;
  if (cancellation?.aborted) {
    return cancellation.reason instanceof CliError
      ? cancellation.reason
      : new CliError('CANCELLED', 'Request cancelled.', { cause: error });
  }
  if (signal.aborted && signal.reason?.name === 'TimeoutError') {
    return new CliError('TIMEOUT', signal.reason.message, { cause: error });
  }
  return error;
}

export function createHttpClient({
  timeoutMs = 120_000,
  maxAttempts = 3,
  responseBytes = 32 * 1024 * 1024,
  totalBytes = 128 * 1024 * 1024,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds, options) => wait(milliseconds, undefined, options),
  random = Math.random,
  now = Date.now,
  signal: cancellation,
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw argumentError('maxAttempts must be an integer from 1 to 3.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw argumentError('timeoutMs must be a positive number.');
  }
  const operationTimeoutMs = Math.min(timeoutMs, 120_000);
  const started = now();
  const deadline = started + operationTimeoutMs;
  const budget = createResponseBudget({
    responseBytes,
    totalBytes,
    timeoutMs: operationTimeoutMs,
    signal: cancellation,
  });
  const attempts = [];

  function throwIfStopped(signal = budget.signal) {
    try {
      signal.throwIfAborted();
      if (deadline - now() <= 0) {
        throw new CliError('TIMEOUT', 'Operation deadline exceeded.');
      }
    } catch (error) {
      throw cancellationError(error, signal, cancellation);
    }
  }

  async function pause(milliseconds) {
    try {
      await sleep(milliseconds, { signal: budget.signal });
      throwIfStopped();
    } catch (error) {
      throw cancellationError(error, budget.signal, cancellation);
    }
  }

  async function handleTransportFailure(
    failure,
    { request, ordinal, attemptStartedAt, consumedBefore, status },
  ) {
    const cancelled = failure instanceof CliError && failure.code === 'CANCELLED';
    const delayMs = Math.round(
      (BACKOFF_MS[ordinal - 1] ?? 0) * (1 + Math.max(0, Math.min(1, random())) * 0.2),
    );
    const canRetry =
      !cancelled && ordinal < maxAttempts && delayMs > 0 && delayMs < deadline - now();
    attempts.push({
      operation: request.operation,
      url: request.url,
      ordinal,
      startedAt: attemptStartedAt,
      endedAt: isoTime(now),
      ...(status === undefined ? {} : { status }),
      networkCode: transportCode(failure),
      consumedBytes: budget.consumedBytes - consumedBefore,
      retry: {
        decision: canRetry ? 'retry' : cancelled ? 'not_retryable' : 'stop',
        reason: cancelled
          ? failure.code
          : canRetry
            ? 'transient_network_error'
            : ordinal === maxAttempts
              ? 'attempts_exhausted'
              : 'deadline_exceeded',
        ...(canRetry ? { delayMs } : {}),
      },
    });
    if (!canRetry) throw failure;
    await pause(delayMs);
  }

  async function get(spec) {
    const request = canonicalRequest(spec);
    for (let ordinal = 1; ordinal <= maxAttempts; ordinal++) {
      throwIfStopped();
      const remaining = deadline - now();
      const requestSignal = AbortSignal.any([
        budget.signal,
        AbortSignal.timeout(Math.max(1, Math.min(30_000, Math.ceil(remaining)))),
      ]);
      const attemptStartedAt = isoTime(now);
      const consumedBefore = budget.consumedBytes;
      let response;
      let failure;
      try {
        response = await requestBoundary(
          () =>
            fetchImpl(request.url, {
              method: 'GET',
              headers: { accept: 'application/json' },
              redirect: 'error',
              signal: requestSignal,
            }),
          requestSignal,
        );
      } catch (error) {
        failure = cancellationError(error, requestSignal, cancellation);
      }

      if (failure) {
        await handleTransportFailure(failure, {
          request,
          ordinal,
          attemptStartedAt,
          consumedBefore,
        });
        continue;
      }

      if (!(response instanceof Response)) {
        const error = responseError('Fetch returned an invalid response object.');
        attempts.push({
          operation: request.operation,
          url: request.url,
          ordinal,
          startedAt: attemptStartedAt,
          endedAt: isoTime(now),
          networkCode: 'INVALID_RESPONSE',
          consumedBytes: 0,
          retry: { decision: 'not_retryable', reason: error.code },
        });
        throw error;
      }

      if (!request.allowedStatuses.has(response.status)) {
        void response.body?.cancel().catch(() => {});
        const retryable = RETRYABLE_STATUSES.has(response.status);
        const serverDelay = retryAfterMs(response.headers.get('retry-after'), now());
        const backoff = Math.round(
          (BACKOFF_MS[ordinal - 1] ?? 0) * (1 + Math.max(0, Math.min(1, random())) * 0.2),
        );
        const delayMs = Math.max(backoff, serverDelay ?? 0);
        const canRetry =
          retryable && ordinal < maxAttempts && delayMs > 0 && delayMs < deadline - now();
        attempts.push({
          operation: request.operation,
          url: request.url,
          ordinal,
          startedAt: attemptStartedAt,
          endedAt: isoTime(now),
          status: response.status,
          consumedBytes: budget.consumedBytes - consumedBefore,
          retry: {
            decision: canRetry ? 'retry' : retryable ? 'stop' : 'not_retryable',
            reason: canRetry
              ? serverDelay !== null && serverDelay > backoff
                ? 'retry_after'
                : 'transient_http_status'
              : retryable
                ? ordinal === maxAttempts
                  ? 'attempts_exhausted'
                  : 'deadline_exceeded'
                : 'http_status',
            ...(canRetry ? { delayMs } : {}),
          },
        });
        if (!canRetry) throw httpError(response.status);
        await pause(delayMs);
        continue;
      }

      let bytes;
      let body;
      try {
        bytes = await budget.read(response, { signal: requestSignal });
      } catch (error) {
        const stopped = cancellationError(error, requestSignal, cancellation);
        if (!(stopped instanceof CliError)) {
          await handleTransportFailure(
            new CliError('NETWORK_ERROR', stopped.message, { cause: stopped }),
            {
              request,
              ordinal,
              attemptStartedAt,
              consumedBefore,
              status: response.status,
            },
          );
          continue;
        }
        attempts.push({
          operation: request.operation,
          url: request.url,
          ordinal,
          startedAt: attemptStartedAt,
          endedAt: isoTime(now),
          status: response.status,
          consumedBytes: budget.consumedBytes - consumedBefore,
          retry: { decision: 'not_retryable', reason: stopped.code },
        });
        throw stopped;
      }
      try {
        const text = await responseBoundary(
          () => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          requestSignal,
        );
        body = await responseBoundary(() => JSON.parse(text), requestSignal);
      } catch (error) {
        const normalized = cancellationError(error, requestSignal, cancellation);
        attempts.push({
          operation: request.operation,
          url: request.url,
          ordinal,
          startedAt: attemptStartedAt,
          endedAt: isoTime(now),
          status: response.status,
          consumedBytes: budget.consumedBytes - consumedBefore,
          retry: { decision: 'not_retryable', reason: normalized.code ?? 'INVALID_RESPONSE' },
        });
        throw normalized;
      }

      attempts.push({
        operation: request.operation,
        url: request.url,
        ordinal,
        startedAt: attemptStartedAt,
        endedAt: isoTime(now),
        status: response.status,
        consumedBytes: budget.consumedBytes - consumedBefore,
        retry: { decision: 'accepted', reason: 'allowed_status' },
      });
      return {
        id: createHash('sha256').update(bytes).digest('hex'),
        status: response.status,
        retrievedAt: isoTime(now),
        bytes,
        body,
      };
    }
    throw responseError('Request attempts exhausted.');
  }

  return { get, attempts };
}
