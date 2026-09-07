import { randomUUID } from 'node:crypto';
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';

const TRANSACTION_SUFFIX = '.inferencex-skills-transaction';
const RECOVERY_SUFFIX = '.recovering-';
const NEXT_MARKER = 'transaction.next.json';
const STAGE = 'stage';
const PREVIOUS = 'previous';
const PHASES = new Set(['staging', 'staged', 'previous_moved', 'activated']);
const UUID_PATTERN = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const OWNER_PATTERN = new RegExp(
  `^owner-(?<transactionId>${UUID_PATTERN})-(?<pid>[1-9]\\d*)-(?<claimId>${UUID_PATTERN})\\.json$`,
  'u',
);
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function canonicalPath(destination) {
  return `${destination}${TRANSACTION_SUFFIX}`;
}

function pathsFor(destination, transaction, markerFileName) {
  return {
    transaction,
    markerName: markerFileName,
    marker: markerFileName === null ? null : join(transaction, markerFileName),
    nextMarker: join(transaction, NEXT_MARKER),
    stage: join(transaction, STAGE),
    previous: join(transaction, PREVIOUS),
  };
}

function markerName(transactionId, ownerPid = process.pid) {
  return `owner-${transactionId}-${ownerPid}-${randomUUID()}.json`;
}

function markerIdentity(name) {
  const match = OWNER_PATTERN.exec(name);
  if (!match || !Number.isSafeInteger(Number(match.groups.pid))) return null;
  return {
    transactionId: match.groups.transactionId,
    ownerPid: Number(match.groups.pid),
  };
}

function recoveryIdentity(name, prefix) {
  const match = new RegExp(`^${prefix}(?<transactionId>${UUID_PATTERN})$`, 'u').exec(name);
  return match?.groups.transactionId ?? null;
}

function transactionLocations(destination) {
  const canonical = canonicalPath(destination);
  const parent = dirname(destination);
  const prefix = `${basename(canonical)}${RECOVERY_SUFFIX}`;
  let names;
  try {
    names = readdirSync(parent);
  } catch (error) {
    if (error.code === 'ENOENT') return { canonical, recoveries: [] };
    throw error;
  }
  return {
    canonical,
    recoveries: names
      .filter((name) => name.startsWith(prefix))
      .map((name) => ({
        path: join(parent, name),
        transactionId: recoveryIdentity(name, prefix),
      })),
  };
}

function blocked(reason) {
  return { state: 'blocked', phase: null, had_destination: null, reason };
}

function failRecovery(reason) {
  throw new Error(`Cannot recover installer transaction: ${reason}.`);
}

function processIsLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function readTransaction(destination, transaction, recoveryTransactionId = null) {
  const directory = lstatSync(transaction, { throwIfNoEntry: false });
  if (!directory) return { state: 'missing' };
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    return blocked('installer transaction path is not an owned directory');
  }

  const names = readdirSync(transaction);
  const markerNames = names.filter((name) => name.startsWith('owner-'));
  if (markerNames.length === 0 && names.length === 0 && recoveryTransactionId !== null) {
    return {
      state: 'cleanup',
      transaction,
      transactionId: recoveryTransactionId,
      projectedDestinationExists: Boolean(lstatSync(destination, { throwIfNoEntry: false })),
    };
  }
  if (markerNames.length !== 1) {
    return blocked('installer transaction marker is missing or ambiguous');
  }
  const identity = markerIdentity(markerNames[0]);
  if (
    !identity ||
    (recoveryTransactionId !== null && recoveryTransactionId !== identity.transactionId)
  ) {
    return blocked('installer transaction marker is foreign or malformed');
  }
  if (names.some((name) => ![markerNames[0], NEXT_MARKER, STAGE, PREVIOUS].includes(name))) {
    return blocked('installer transaction contains unknown data');
  }
  const paths = pathsFor(destination, transaction, markerNames[0]);
  for (const [name, path] of [
    [STAGE, paths.stage],
    [PREVIOUS, paths.previous],
  ]) {
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
      return blocked(`installer transaction ${name} path is not an owned directory`);
    }
  }
  const next = lstatSync(paths.nextMarker, { throwIfNoEntry: false });
  if (next && (!next.isFile() || next.isSymbolicLink())) {
    return blocked('installer transaction update is not a regular file');
  }

  let record;
  try {
    const marker = lstatSync(paths.marker, { throwIfNoEntry: false });
    if (!marker?.isFile() || marker.isSymbolicLink()) {
      return blocked('installer transaction marker is missing or not a regular file');
    }
    record = JSON.parse(readFileSync(paths.marker, 'utf8'));
  } catch (error) {
    return blocked(
      error instanceof SyntaxError
        ? 'installer transaction marker is malformed'
        : `could not read installer transaction marker: ${error.code ?? 'read error'}`,
    );
  }
  if (
    record?.schema_version !== 1 ||
    record.transaction_id !== identity.transactionId ||
    typeof record.package !== 'string' ||
    typeof record.skill !== 'string' ||
    record.destination !== destination ||
    !Number.isSafeInteger(record.owner_pid) ||
    record.owner_pid <= 0 ||
    !PHASES.has(record.phase) ||
    typeof record.had_destination !== 'boolean'
  ) {
    return blocked('installer transaction marker is foreign or malformed');
  }
  return { state: 'valid', identity, paths, record };
}

export function inspectInstallTransaction(destination, packageName, skillName) {
  const locations = transactionLocations(destination);
  const canonicalEntry = lstatSync(locations.canonical, { throwIfNoEntry: false });
  if ((canonicalEntry && locations.recoveries.length > 0) || locations.recoveries.length > 1) {
    return blocked('multiple installer transaction paths require manual inspection');
  }
  const recovery = locations.recoveries[0];
  if (recovery && recovery.transactionId === null) {
    return blocked('installer recovery path is foreign or malformed');
  }
  const transaction = recovery?.path ?? locations.canonical;
  const inspected = readTransaction(destination, transaction, recovery?.transactionId);
  if (inspected.state === 'missing') {
    return { state: 'none', phase: null, had_destination: null, reason: null };
  }
  if (inspected.state === 'blocked') return inspected;
  if (inspected.state === 'cleanup') {
    return {
      state: 'recoverable',
      phase: null,
      had_destination: null,
      transaction,
      cleanup_only: true,
      projected_destination_exists: inspected.projectedDestinationExists,
      reason: 'interrupted installer transaction cleanup needs recovery',
    };
  }
  if (inspected.record.package !== packageName || inspected.record.skill !== skillName) {
    return blocked('installer transaction marker is foreign or malformed');
  }
  const live = processIsLive(inspected.identity.ownerPid);
  return {
    state: live ? 'busy' : 'recoverable',
    phase: inspected.record.phase,
    had_destination: inspected.record.had_destination,
    projected_destination_exists:
      inspected.record.phase === 'activated' || inspected.record.had_destination,
    transaction,
    marker_name: inspected.paths.markerName,
    transaction_id: inspected.identity.transactionId,
    reason: live
      ? `installer transaction is owned by live process ${inspected.identity.ownerPid}`
      : `interrupted installer transaction from process ${inspected.identity.ownerPid} needs recovery`,
  };
}

function markerRecord(destination, packageName, skillName, transactionId, phase, hadDestination) {
  return {
    schema_version: 1,
    transaction_id: transactionId,
    package: packageName,
    skill: skillName,
    destination,
    owner_pid: process.pid,
    phase,
    had_destination: hadDestination,
  };
}

function updateMarker(paths, record) {
  rmSync(paths.nextMarker, { force: true });
  writeFileSync(paths.nextMarker, `${JSON.stringify(record, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  renameSync(paths.nextMarker, paths.marker);
}

function recoveryPath(destination, transactionId) {
  return `${canonicalPath(destination)}${RECOVERY_SUFFIX}${transactionId}`;
}

function moveToRecovery(destination, paths, record) {
  const target = recoveryPath(destination, record.transaction_id);
  if (paths.transaction === target) return paths;
  renameSync(paths.transaction, target);
  return pathsFor(destination, target, paths.markerName);
}

function cleanupOwnedTransaction(paths) {
  rmSync(paths.stage, { recursive: true, force: true });
  rmSync(paths.previous, { recursive: true, force: true });
  rmSync(paths.nextMarker, { force: true });
  rmSync(paths.marker);
  rmdirSync(paths.transaction);
}

function cleanupCommittedTransaction(destination, paths, record) {
  const destinationEntry = lstatSync(destination, { throwIfNoEntry: false });
  const stageEntry = lstatSync(paths.stage, { throwIfNoEntry: false });
  const previousEntry = lstatSync(paths.previous, { throwIfNoEntry: false });
  if (!destinationEntry || stageEntry || (!record.had_destination && previousEntry)) {
    failRecovery('activated transaction paths do not match the owned marker');
  }
  cleanupOwnedTransaction(paths);
}

function recoverOwnedTransaction(destination, paths, record) {
  const destinationExists = Boolean(lstatSync(destination, { throwIfNoEntry: false }));
  const stageExists = Boolean(lstatSync(paths.stage, { throwIfNoEntry: false }));
  const previousExists = Boolean(lstatSync(paths.previous, { throwIfNoEntry: false }));

  if (record.phase === 'activated') {
    cleanupCommittedTransaction(destination, paths, record);
    return;
  }
  if (record.had_destination) {
    if (previousExists) {
      if (destinationExists && stageExists) {
        failRecovery('both the destination and staged installation are present with a backup');
      }
      if (destinationExists) rmSync(destination, { recursive: true });
      renameSync(paths.previous, destination);
    } else if (!destinationExists) {
      failRecovery('the previous installation is missing');
    }
  } else {
    if (previousExists) failRecovery('an unexpected previous installation is present');
    if (destinationExists && stageExists) {
      failRecovery('both a destination and staged new installation are present');
    }
    if (destinationExists) rmSync(destination, { recursive: true });
  }
  cleanupOwnedTransaction(paths);
}

function claimRecovery(destination, packageName, skillName, state) {
  if (state.cleanup_only) {
    try {
      rmdirSync(state.transaction);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    return { cleanupOnly: true };
  }

  const claimedName = markerName(state.transaction_id);
  try {
    renameSync(join(state.transaction, state.marker_name), join(state.transaction, claimedName));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const inspected = readTransaction(destination, state.transaction);
  if (inspected.state !== 'valid' || inspected.paths.markerName !== claimedName) {
    failRecovery(
      inspected.reason ?? 'claimed installer transaction changed before it could be validated',
    );
  }
  if (
    inspected.identity.transactionId !== state.transaction_id ||
    inspected.record.package !== packageName ||
    inspected.record.skill !== skillName
  ) {
    failRecovery('claimed installer transaction identity does not match the observed owner token');
  }
  const record = { ...inspected.record, owner_pid: process.pid };
  updateMarker(inspected.paths, record);
  const paths = moveToRecovery(destination, inspected.paths, record);
  return { cleanupOnly: false, paths, record };
}

function acquireTransaction(destination, packageName, skillName, waitMilliseconds) {
  const deadline = Date.now() + waitMilliseconds;
  let unmarkedDeadline;
  mkdirSync(dirname(destination), { recursive: true });
  for (;;) {
    const state = inspectInstallTransaction(destination, packageName, skillName);
    if (state.state === 'blocked') {
      if (
        [
          'installer transaction marker is missing or ambiguous',
          'installer transaction marker is missing or not a regular file',
        ].includes(state.reason)
      ) {
        unmarkedDeadline ??= Date.now() + 2_000;
        if (Date.now() < Math.min(deadline, unmarkedDeadline)) {
          Atomics.wait(sleepBuffer, 0, 0, 25);
          continue;
        }
      }
      throw new Error(state.reason);
    }
    unmarkedDeadline = undefined;
    if (state.state === 'recoverable') {
      const claimed = claimRecovery(destination, packageName, skillName, state);
      if (!claimed) continue;
      if (!claimed.cleanupOnly) {
        recoverOwnedTransaction(destination, claimed.paths, claimed.record);
      }
      continue;
    }
    if (state.state === 'busy') {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${state.reason}.`);
      Atomics.wait(sleepBuffer, 0, 0, 25);
      continue;
    }

    const transaction = canonicalPath(destination);
    try {
      mkdirSync(transaction, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    const transactionId = randomUUID();
    const ownerName = markerName(transactionId);
    const paths = pathsFor(destination, transaction, ownerName);
    const hadDestination = Boolean(lstatSync(destination, { throwIfNoEntry: false }));
    const record = markerRecord(
      destination,
      packageName,
      skillName,
      transactionId,
      'staging',
      hadDestination,
    );
    try {
      writeFileSync(paths.marker, `${JSON.stringify(record, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      rmSync(transaction, { recursive: true, force: true });
      throw error;
    }
    return { paths, record };
  }
}

export function runInstallTransaction({
  source,
  destination,
  packageName,
  packageVersion,
  skillName,
  receiptName,
  prepare,
  waitMilliseconds = 30_000,
}) {
  const pending = inspectInstallTransaction(destination, packageName, skillName);
  if (pending.state === 'none') {
    const initialPlan = prepare();
    if (initialPlan.outcome === 'skipped') return initialPlan;
  }
  let { paths, record } = acquireTransaction(destination, packageName, skillName, waitMilliseconds);
  let destinationMoved = false;
  let stageMoved = false;
  let committed = false;
  try {
    const plan = prepare();
    if (plan.outcome === 'skipped') {
      paths = moveToRecovery(destination, paths, record);
      cleanupOwnedTransaction(paths);
      return plan;
    }

    if (record.had_destination) {
      cpSync(destination, paths.stage, {
        recursive: true,
        preserveTimestamps: true,
        verbatimSymlinks: true,
      });
    }
    cpSync(source, paths.stage, {
      recursive: true,
      force: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    const stagedReceipt = join(paths.stage, receiptName);
    rmSync(stagedReceipt, { force: true });
    writeFileSync(
      stagedReceipt,
      `${JSON.stringify({ package: packageName, version: packageVersion }, null, 2)}\n`,
      { flag: 'wx' },
    );
    record = { ...record, phase: 'staged' };
    updateMarker(paths, record);

    if (record.had_destination) {
      renameSync(destination, paths.previous);
      destinationMoved = true;
      record = { ...record, phase: 'previous_moved' };
      updateMarker(paths, record);
    }
    renameSync(paths.stage, destination);
    stageMoved = true;
    record = { ...record, phase: 'activated' };
    updateMarker(paths, record);
    committed = true;
    paths = moveToRecovery(destination, paths, record);
    cleanupCommittedTransaction(destination, paths, record);
    return plan;
  } catch (error) {
    if (committed) throw error;
    try {
      if (stageMoved) rmSync(destination, { recursive: true });
      if (destinationMoved) renameSync(paths.previous, destination);
      paths = moveToRecovery(destination, paths, record);
      cleanupOwnedTransaction(paths);
    } catch (rollbackError) {
      throw new Error(`${error.message}; rollback failed: ${rollbackError.message}`, {
        cause: rollbackError,
      });
    }
    throw error;
  }
}
