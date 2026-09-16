import { detectTdpFromArtifactName } from './types';

export interface PowerAuditSample {
  timestamp_unix: number;
  scrape_seq: number;
  hostname: string;
  gpu_index: number;
  gpu_uuid: string;
  power_w: number;
}

export interface PowerAuditWindow {
  name: string;
  concurrency: number;
  benchmark_start_time_unix: number;
  benchmark_end_time_unix: number;
  result_path: string;
  status: string;
  validation?: {
    power_valid: boolean;
    reasons?: string[];
    benchmark_window: { start_time_unix: number; end_time_unix: number };
    per_gpu_role: Record<string, string>;
    per_gpu_energy_j: Record<string, number>;
    per_gpu_max_sample_gap_s?: Record<string, number>;
    benchmark_result?: string;
  };
}

export interface PowerAuditArtifact {
  id: number;
  name: string;
  manifest: {
    source_metric: string;
    power_scope: string;
    sample_interval_seconds: number;
    producer: string;
    producer_git_commit: string;
    expected_devices: {
      hostname: string;
      gpu_index: number;
      assignments: { worker_role: string }[];
    }[];
  };
  samples: PowerAuditSample[];
  windows: PowerAuditWindow[];
}

export function parsePowerAuditEntries(
  entries: Record<string, string>,
): Omit<PowerAuditArtifact, 'id' | 'name'> {
  const manifestEntry = Object.keys(entries).find((name) =>
    name.endsWith('LOGS/power/manifest.json'),
  );
  const samplesEntry = Object.keys(entries).find((name) => name.endsWith('LOGS/power/samples.csv'));
  if (!manifestEntry || !samplesEntry) throw new Error('Power audit manifest or samples missing');
  const manifest = JSON.parse(entries[manifestEntry]) as PowerAuditArtifact['manifest'];
  if (!Array.isArray(manifest.expected_devices)) throw new Error('Power audit devices missing');
  const [header, ...lines] = entries[samplesEntry].trim().split(/\r?\n/u);
  const columns = header.split(',');
  const required = ['timestamp_unix', 'scrape_seq', 'hostname', 'gpu_index', 'gpu_uuid', 'power_w'];
  if (required.some((key) => !columns.includes(key)))
    throw new Error('Power audit CSV columns missing');
  const samples = lines
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(',');
      const value = (key: string) => values[columns.indexOf(key)]?.trim();
      const numeric = (key: string) => {
        const raw = value(key);
        const number = raw ? Number(raw) : NaN;
        if (!Number.isFinite(number)) throw new Error(`Invalid power audit ${key}`);
        return number;
      };
      return {
        timestamp_unix: numeric('timestamp_unix'),
        scrape_seq: numeric('scrape_seq'),
        hostname: value('hostname') ?? '',
        gpu_index: numeric('gpu_index'),
        gpu_uuid: value('gpu_uuid') ?? '',
        power_w: numeric('power_w'),
      };
    });
  const validations = Object.entries(entries)
    .filter(([name]) => /(?:^|\/)power_validation_[^/]+\.json$/u.test(name))
    .map(([, contents]) => JSON.parse(contents));
  const windows = Object.entries(entries)
    .filter(([name]) => name.includes('LOGS/power/windows/') && name.endsWith('.json'))
    .map(([name, contents]) => {
      const windowName = name.slice(name.indexOf('windows/'));
      const matches = validations.filter((v) => v.selected_window?.window_file === windowName);
      return {
        ...JSON.parse(contents),
        name: windowName,
        validation: matches.length === 1 ? matches[0] : undefined,
      } as PowerAuditWindow;
    })
    .sort((a, b) => a.concurrency - b.concurrency);
  return { manifest, samples, windows };
}

export interface RolePowerTrace {
  role: string;
  gpuCount: number;
  points: { x: number; y: number; boundary: boolean }[];
  meanWatts: number;
  maxSample: { x: number; y: number };
  tdpWatts?: number;
}

export interface ServingPowerTrace {
  duration: number;
  concurrency: number;
  hardware: string;
  roles: RolePowerTrace[];
}

function at(rows: PowerAuditSample[], time: number): number {
  const upper = rows.findIndex((row) => row.timestamp_unix >= time);
  if (upper === -1 || (upper === 0 && rows[0].timestamp_unix > time)) throw new Error('coverage');
  const right = rows[upper];
  if (right.timestamp_unix === time) return right.power_w;
  const left = rows[upper - 1];
  return (
    left.power_w +
    ((right.power_w - left.power_w) * (time - left.timestamp_unix)) /
      (right.timestamp_unix - left.timestamp_unix)
  );
}

/** Device identity includes the host: separate pools routinely reuse GPU index 0. */
export function buildServingPowerTrace(
  artifact: PowerAuditArtifact,
  window: PowerAuditWindow,
): ServingPowerTrace {
  const start = window.benchmark_start_time_unix;
  const end = window.benchmark_end_time_unix;
  const validation = window.validation;
  if (
    artifact.manifest.source_metric !== 'DCGM_FI_DEV_POWER_USAGE' ||
    artifact.manifest.power_scope !== 'gpu_device_board_as_reported_by_dcgm' ||
    !Number.isFinite(artifact.manifest.sample_interval_seconds) ||
    artifact.manifest.sample_interval_seconds <= 0
  )
    throw new Error('source');
  if (
    window.status !== 'completed' ||
    validation?.power_valid !== true ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    validation.benchmark_window?.start_time_unix !== start ||
    validation.benchmark_window?.end_time_unix !== end
  ) {
    throw new Error('unvalidated');
  }
  const devices = artifact.manifest.expected_devices;
  if (devices.length === 0) throw new Error('devices');
  const deviceRoles = new Map<string, string>();
  for (const device of devices) {
    const roles = new Set(device.assignments?.map((a) => a.worker_role));
    const key = `${device.hostname}/${device.gpu_index}`;
    const role = [...roles][0];
    if (
      !device.hostname ||
      !Number.isInteger(device.gpu_index) ||
      deviceRoles.has(key) ||
      roles.size !== 1 ||
      !['prefill', 'decode', 'aggregated'].includes(role)
    )
      throw new Error('devices');
    deviceRoles.set(key, role);
  }
  const byDevice = new Map<string, PowerAuditSample[]>();
  for (const sample of artifact.samples) {
    const key = `${sample.hostname}/${sample.gpu_index}`;
    if (!deviceRoles.has(key)) continue;
    if (
      !Number.isFinite(sample.timestamp_unix) ||
      !Number.isFinite(sample.power_w) ||
      sample.power_w < 0 ||
      !Number.isInteger(sample.scrape_seq) ||
      !sample.gpu_uuid
    )
      throw new Error('samples');
    const rows = byDevice.get(key) ?? [];
    rows.push(sample);
    byDevice.set(key, rows);
  }

  const physicalDevices = new Set<string>();
  for (const [key, role] of deviceRoles) {
    const rows = byDevice.get(key);
    if (!rows?.length) throw new Error('coverage');
    rows.sort((a, b) => a.timestamp_unix - b.timestamp_unix);
    const uuid = rows[0].gpu_uuid;
    const physicalKey = `${rows[0].hostname}/${uuid}`;
    if (
      physicalDevices.has(physicalKey) ||
      validation.per_gpu_role?.[physicalKey] !== role ||
      rows.some(
        (row, i) =>
          (i > 0 && row.timestamp_unix <= rows[i - 1].timestamp_unix) || row.gpu_uuid !== uuid,
      )
    )
      throw new Error('devices');
    physicalDevices.add(physicalKey);
  }
  for (const coverage of [validation.per_gpu_role, validation.per_gpu_energy_j]) {
    const keys = Object.keys(coverage ?? {});
    if (keys.length !== physicalDevices.size || keys.some((key) => !physicalDevices.has(key)))
      throw new Error('devices');
  }
  const tdp = detectTdpFromArtifactName(artifact.name);
  const roles = [...new Set(deviceRoles.values())].map((role) => {
    const keys = [...deviceRoles].filter(([, assigned]) => assigned === role).map(([key]) => key);
    const scrapes = new Map<number, Map<string, PowerAuditSample>>();
    let energy = 0;
    for (const key of keys) {
      const rows = byDevice.get(key)!;
      const deviceEnergy = validation.per_gpu_energy_j?.[`${rows[0].hostname}/${rows[0].gpu_uuid}`];
      if (!Number.isFinite(deviceEnergy) || deviceEnergy < 0) throw new Error('energy');
      const clipped = [
        { timestamp_unix: start, power_w: at(rows, start) },
        ...rows.filter((r) => r.timestamp_unix > start && r.timestamp_unix < end),
        { timestamp_unix: end, power_w: at(rows, end) },
      ];
      const acceptedGap =
        validation.per_gpu_max_sample_gap_s?.[`${rows[0].hostname}/${rows[0].gpu_uuid}`];
      if (
        acceptedGap !== undefined &&
        (!Number.isFinite(acceptedGap) ||
          acceptedGap <= 0 ||
          clipped.some(
            (row, index) =>
              index > 0 &&
              row.timestamp_unix - clipped[index - 1].timestamp_unix > acceptedGap + 0.000001,
          ))
      )
        throw new Error('coverage');
      const integral = clipped
        .slice(1)
        .reduce(
          (sum, r, i) =>
            sum +
            ((r.power_w + clipped[i].power_w) * (r.timestamp_unix - clipped[i].timestamp_unix)) / 2,
          0,
        );
      if (Math.abs(integral - deviceEnergy) > Math.max(0.05, Math.abs(deviceEnergy) * 0.00003))
        throw new Error('energy');
      energy += deviceEnergy;
      for (const row of rows) {
        if (row.timestamp_unix <= start || row.timestamp_unix >= end) continue;
        const scrape = scrapes.get(row.scrape_seq) ?? new Map<string, PowerAuditSample>();
        if (scrape.has(key)) throw new Error('samples');
        scrape.set(key, row);
        scrapes.set(row.scrape_seq, scrape);
      }
    }
    const measured = [...scrapes.values()]
      .map((scrape) => {
        if (scrape.size !== keys.length) throw new Error('coverage');
        const rows = [...scrape.values()];
        const timestamp = rows[0].timestamp_unix;
        // The collector timestamps all GPUs in one endpoint response identically.
        // A shared sequence across endpoints does not make their samples simultaneous.
        if (rows.some((row) => row.timestamp_unix !== timestamp)) throw new Error('alignment');
        return {
          x: timestamp - start,
          y: rows.reduce((sum, row) => sum + row.power_w, 0),
          boundary: false,
        };
      })
      .sort((a, b) => a.x - b.x);
    if (measured.length === 0) throw new Error('coverage');
    return {
      role,
      gpuCount: keys.length,
      meanWatts: energy / (end - start),
      maxSample: measured.reduce((max, point) => (point.y > max.y ? point : max)),
      tdpWatts: tdp ? tdp.tdp * keys.length : undefined,
      points: [
        {
          x: 0,
          y: keys.reduce((sum, key) => sum + at(byDevice.get(key)!, start), 0),
          boundary: true,
        },
        ...measured,
        {
          x: end - start,
          y: keys.reduce((sum, key) => sum + at(byDevice.get(key)!, end), 0),
          boundary: true,
        },
      ],
    };
  });
  return {
    duration: end - start,
    concurrency: window.concurrency,
    hardware: tdp?.sku ?? '',
    roles,
  };
}
