const TRANSIENT_CODES = new Set([
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '57P01',
  '57P02',
  '57P03',
]);

const TRANSIENT_MESSAGES = [
  /authentication timed out/iu,
  /connection (?:was )?(?:closed|terminated|reset)/iu,
  /ssl connection has been closed unexpectedly/iu,
  /terminating connection/iu,
  /couldn't connect to compute node/iu,
];

export function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  return typeof message === 'string' && TRANSIENT_MESSAGES.some((re) => re.test(message));
}

export interface TransientRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withTransientDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 2000,
    sleep = defaultSleep,
    log = console.warn,
  }: TransientRetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isTransientDbError(error)) throw error;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      const reason =
        (error as { code?: string; message?: string }).code ?? (error as Error).message;
      log(
        `  [WARN] ${label}: transient DB error (${reason}); retrying in ${delayMs / 1000}s ` +
          `(attempt ${attempt + 1}/${attempts})`,
      );
      await sleep(delayMs);
    }
  }
}
