import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

const TRANSACTION_SUFFIX = '.inferencex-skills-transaction';
const MARKER = 'transaction.json';
const NEXT_MARKER = 'transaction.next.json';
const STAGE = 'stage';
const PREVIOUS = 'previous';
const PHASES = new Set(['staging', 'staged', 'previous_moved', 'activated']);
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function pathsFor(destination) {
  const transaction = `${destination}${TRANSACTION_SUFFIX}`;
  return {
    transaction,
    marker: join(transaction, MARKER),
    nextMarker: join(transaction, NEXT_MARKER),
    stage: join(transaction, STAGE),
    previous: join(transaction, PREVIOUS),
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

export function inspectInstallTransaction(destination, packageName, skillName) {
  const paths = pathsFor(destination);
  const directory = lstatSync(paths.transaction, { throwIfNoEntry: false });
  if (!directory) return { state: 'none', phase: null, had_destination: null, reason: null };
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    return blocked('installer transaction path is not an owned directory');
  }

  let marker;
  try {
    const entry = lstatSync(paths.marker, { throwIfNoEntry: false });
    if (!entry?.isFile() || entry.isSymbolicLink()) {
      return blocked('installer transaction marker is missing or not a regular file');
    }
    marker = JSON.parse(readFileSync(paths.marker, 'utf8'));
  } catch (error) {
    return blocked(
      error instanceof SyntaxError
        ? 'installer transaction marker is malformed'
        : `could not read installer transaction marker: ${error.code ?? 'read error'}`,
    );
  }

  if (
    marker?.schema_version !== 1 ||
    marker.package !== packageName ||
    marker.skill !== skillName ||
    marker.destination !== destination ||
    !Number.isSafeInteger(marker.owner_pid) ||
    marker.owner_pid <= 0 ||
    !PHASES.has(marker.phase) ||
    typeof marker.had_destination !== 'boolean'
  ) {
    return blocked('installer transaction marker is foreign or malformed');
  }

  const names = readdirSync(paths.transaction);
  if (names.some((name) => ![MARKER, NEXT_MARKER, STAGE, PREVIOUS].includes(name))) {
    return blocked('installer transaction contains unknown data');
  }
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

  const live = processIsLive(marker.owner_pid);
  return {
    state: live ? 'busy' : 'recoverable',
    phase: marker.phase,
    had_destination: marker.had_destination,
    reason: live
      ? `installer transaction is owned by live process ${marker.owner_pid}`
      : `interrupted installer transaction from process ${marker.owner_pid} needs recovery`,
  };
}

function markerRecord(destination, packageName, skillName, phase, hadDestination) {
  return {
    schema_version: 1,
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

function recoverOwnedTransaction(destination, state) {
  const paths = pathsFor(destination);
  const destinationEntry = () => lstatSync(destination, { throwIfNoEntry: false });
  const stageEntry = () => lstatSync(paths.stage, { throwIfNoEntry: false });
  const previousEntry = () => lstatSync(paths.previous, { throwIfNoEntry: false });

  if (state.state !== 'recoverable') failRecovery(state.reason);
  const destinationExists = Boolean(destinationEntry());
  const stageExists = Boolean(stageEntry());
  const previousExists = Boolean(previousEntry());

  if (state.phase === 'activated') {
    if (!destinationExists || stageExists || previousExists !== state.had_destination) {
      failRecovery('activated transaction paths do not match the owned marker');
    }
    rmSync(paths.transaction, { recursive: true });
    return;
  }

  if (state.had_destination) {
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
  rmSync(paths.transaction, { recursive: true });
}

function acquireTransaction(destination, packageName, skillName, waitMilliseconds) {
  const paths = pathsFor(destination);
  const deadline = Date.now() + waitMilliseconds;
  let unmarkedDeadline;
  mkdirSync(dirname(destination), { recursive: true });
  for (;;) {
    try {
      mkdirSync(paths.transaction, { mode: 0o700 });
      const hadDestination = Boolean(lstatSync(destination, { throwIfNoEntry: false }));
      const record = markerRecord(destination, packageName, skillName, 'staging', hadDestination);
      try {
        writeFileSync(paths.marker, `${JSON.stringify(record, null, 2)}\n`, {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        rmSync(paths.transaction, { recursive: true, force: true });
        throw error;
      }
      return { paths, record };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const state = inspectInstallTransaction(destination, packageName, skillName);
      if (state.state === 'blocked') {
        if (state.reason === 'installer transaction marker is missing or not a regular file') {
          unmarkedDeadline ??= Date.now() + 2_000;
          if (Date.now() < Math.min(deadline, unmarkedDeadline)) {
            Atomics.wait(sleepBuffer, 0, 0, 25);
            continue;
          }
        }
        throw new Error(state.reason, { cause: error });
      }
      if (state.state === 'recoverable') {
        recoverOwnedTransaction(destination, state);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for ${state.reason}.`, { cause: error });
      }
      Atomics.wait(sleepBuffer, 0, 0, 25);
    }
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
  const { paths, record } = acquireTransaction(
    destination,
    packageName,
    skillName,
    waitMilliseconds,
  );
  let destinationMoved = false;
  let stageMoved = false;
  let committed = false;
  try {
    const plan = prepare();
    if (plan.outcome === 'skipped') {
      rmSync(paths.transaction, { recursive: true });
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
    updateMarker(paths, { ...record, phase: 'staged' });

    if (record.had_destination) {
      renameSync(destination, paths.previous);
      destinationMoved = true;
      updateMarker(paths, { ...record, phase: 'previous_moved' });
    }
    renameSync(paths.stage, destination);
    stageMoved = true;
    updateMarker(paths, { ...record, phase: 'activated' });
    committed = true;
    rmSync(paths.transaction, { recursive: true });
    return plan;
  } catch (error) {
    if (committed) throw error;
    try {
      if (stageMoved) rmSync(destination, { recursive: true });
      if (destinationMoved) renameSync(paths.previous, destination);
      rmSync(paths.transaction, { recursive: true });
    } catch (rollbackError) {
      throw new Error(`${error.message}; rollback failed: ${rollbackError.message}`, {
        cause: rollbackError,
      });
    }
    throw error;
  }
}
