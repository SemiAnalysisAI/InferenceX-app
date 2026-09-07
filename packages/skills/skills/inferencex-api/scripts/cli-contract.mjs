import { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PACKAGE_VERSION = '1.0.0';
export { PACKAGE_VERSION };
export const PACKAGE_NAME = '@semianalysisai/inferencex-skills';

const CODES = new Set([
  'INVALID_ARGUMENT',
  'HTTP_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT',
  'INVALID_RESPONSE',
  'INVALID_EVIDENCE',
  'UNSUPPORTED_CONTRACT',
  'INSTALLATION_UNHEALTHY',
  'OUTPUT_ERROR',
  'CANCELLED',
  'INTERNAL_ERROR',
]);

export class CliError extends Error {
  constructor(code, message, { cause, httpStatus, details } = {}) {
    super(message, { cause });
    if (!CODES.has(code)) throw new TypeError(`Unknown CLI error code: ${code}`);
    this.name = 'CliError';
    this.code = code;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
    if (details !== undefined) this.details = details;
  }
}

export function argumentError(message, cause) {
  return new CliError('INVALID_ARGUMENT', message, { cause });
}

export function isMain(moduleUrl) {
  if (process.argv[1] === undefined) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === moduleUrl;
  } catch {
    return false;
  }
}

export function httpError(status, message = `HTTP ${status}`) {
  return new CliError('HTTP_ERROR', message, { httpStatus: status });
}

export function responseError(message, cause) {
  return new CliError('INVALID_RESPONSE', message, { cause });
}

function cancellation(error, signal) {
  if (error instanceof CliError) return error;
  if (signal?.aborted && signal.reason instanceof CliError) return signal.reason;
  if (signal?.aborted && signal.reason?.name === 'TimeoutError') {
    return new CliError('TIMEOUT', signal.reason.message, { cause: error });
  }
  return null;
}

export async function requestBoundary(action, signal) {
  try {
    return await action();
  } catch (error) {
    const cancelled = cancellation(error, signal);
    if (cancelled) throw cancelled;
    throw new CliError(
      error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

export async function responseBoundary(action, signal) {
  try {
    signal?.throwIfAborted();
    return await action();
  } catch (error) {
    const cancelled = cancellation(error, signal);
    if (cancelled) throw cancelled;
    if (error instanceof CliError) throw error;
    throw new CliError(
      error?.name === 'TimeoutError' ? 'TIMEOUT' : 'INVALID_RESPONSE',
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

export async function outputBoundary(action, signal) {
  try {
    signal?.throwIfAborted();
    return await action();
  } catch (error) {
    const cancelled = cancellation(error, signal);
    if (cancelled) throw cancelled;
    if (error instanceof CliError) throw error;
    throw new CliError('OUTPUT_ERROR', error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}

export function writeStdout(bytes, { signal, timeoutMs = 5_000 } = {}) {
  return outputBoundary(
    () =>
      new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve();
        };
        const abort = () => {
          process.stdout.destroy();
          finish(signal.reason);
        };
        const timer = setTimeout(() => {
          process.stdout.destroy();
          finish(new Error(`stdout did not drain within ${timeoutMs}ms`));
        }, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        process.stdout.on('error', () => {});
        process.stdout.write(bytes, (error) => finish(error));
      }),
    signal,
  );
}

function requestedErrorFormats(args) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--error-format') values.push(args[++index]);
    else if (value.startsWith('--error-format='))
      values.push(value.slice('--error-format='.length));
  }
  return values;
}

export function diagnostic(error, command, packageVersion = PACKAGE_VERSION) {
  return {
    schema_version: 1,
    package: PACKAGE_NAME,
    package_version: packageVersion,
    command,
    error: {
      code: error.code,
      message: error.message,
      ...(error.httpStatus === undefined ? {} : { http_status: error.httpStatus }),
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

function normalize(error) {
  if (error instanceof CliError) return error;
  if (typeof error?.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS_')) {
    return argumentError(error.message, error);
  }
  return new CliError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

export async function runCli({
  command,
  packageVersion = PACKAGE_VERSION,
  args = process.argv.slice(2),
  run,
  textError = (error) => `${command}: ${error.message}`,
  textUsageExitCode = 1,
  defaultErrorFormat = 'text',
}) {
  let format = defaultErrorFormat;
  const controller = new AbortController();
  const cancel = (signal) => {
    if (!controller.signal.aborted) {
      controller.abort(new CliError('CANCELLED', `Cancelled by ${signal}.`));
    }
  };
  const onInterrupt = () => cancel('SIGINT');
  const onTerminate = () => cancel('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    const formats = requestedErrorFormats(args);
    // Retain an explicit JSON request even when format validation itself fails.
    if (
      args.some(
        (arg, index) =>
          arg === '--error-format=json' || (arg === '--error-format' && args[index + 1] === 'json'),
      )
    ) {
      format = 'json';
    }
    if (formats.length > 1) {
      throw argumentError('Specify --error-format only once; choose json or text.');
    }
    if (formats.length === 1 && !['json', 'text'].includes(formats[0])) {
      throw argumentError('--error-format must be json or text.');
    }
    if (formats.length === 1) format = formats[0];
    await run({ args, signal: controller.signal, errorFormat: format });
  } catch (error) {
    const normalized = normalize(error);
    if (format === 'json') {
      process.stderr.write(`${JSON.stringify(diagnostic(normalized, command, packageVersion))}\n`);
    } else {
      process.stderr.write(`${textError(normalized)}\n`);
    }
    process.exitCode =
      normalized.code === 'CANCELLED'
        ? 130
        : format === 'json' && normalized.code === 'INVALID_ARGUMENT'
          ? 2
          : normalized.code === 'INVALID_ARGUMENT'
            ? textUsageExitCode
            : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}
