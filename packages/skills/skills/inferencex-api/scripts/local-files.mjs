import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { CliError, responseError } from './cli-contract.mjs';

export function formatByteLimit(limit) {
  if (limit % (1024 * 1024) === 0) return `${limit / (1024 * 1024)} MiB`;
  return `${limit} byte`;
}

export async function readBoundedRegular(path, limit, label, { signal } = {}) {
  let handle;
  try {
    signal?.throwIfAborted();
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw responseError(`${label} must be a regular file, not a symbolic link`);
    }
    if (entry.size > limit) {
      throw responseError(`${label} exceeds the ${formatByteLimit(limit)} byte limit`);
    }
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > limit) {
      throw responseError(`${label} exceeds the ${formatByteLimit(limit)} byte limit`);
    }
    const bytes = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        Math.min(64 * 1024, bytes.length - offset),
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    signal?.throwIfAborted();
    const extra = Buffer.allocUnsafe(1);
    const { bytesRead: extraBytes } = await handle.read(extra, 0, 1, opened.size);
    const after = await handle.stat();
    if (
      offset !== opened.size ||
      extraBytes !== 0 ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.mode !== opened.mode ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    ) {
      throw responseError(`${label} changed while it was being read`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (signal?.aborted) throw signal.reason ?? error;
    throw responseError(`Could not read ${label}: ${error.message}`, error);
  } finally {
    await handle?.close();
  }
}
