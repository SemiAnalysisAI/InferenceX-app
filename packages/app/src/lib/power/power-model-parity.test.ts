/**
 * The TypeScript power model (./power_model) is a file-for-file port of the
 * InferenceX Python package. These tests hold it to the pinned upstream revision:
 * every module has a counterpart, and the port reproduces upstream's own output
 * (scripts/generate-power-model-parity.py) for every catalog system and state.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from './power-model.manifest.json';
import { create_power_model, ValidationError, ValueError } from './power_model';
import type { JsonValue, PowerEstimate } from './power_model/base';
import { system_name, SYSTEMS } from './power_model/models/advanced/systems/catalog';
import { format_power_breakdown_per_chassis } from './power_model/reporting';

const PORT_DIR = join(__dirname, 'power_model');
const REL_TOL = 1e-12;

interface CompactNode {
  name: string;
  power_w: number;
  quantity: number;
  provenance: number | null;
  details: JsonValue[];
  configuration: number | null;
  children: CompactNode[];
}

interface ParityCase {
  model: string;
  system: string;
  workload_state: string;
  using_scale_out: boolean;
  systems: number;
  gpu_level_power_per_gpu: number;
  cpu_and_dram_measured_power_per_socket: number | null;
  error?: { kind: 'validation' | 'value'; message: string | null };
  estimate?: Record<string, JsonValue> & { components: CompactNode[] };
  summary?: Record<string, number | number[]> & { component_power_w: number[] };
}

interface ParityReport {
  system: string;
  workload_state: string;
  using_scale_out: boolean;
  systems: number;
  gpu_level_power_per_gpu: number;
  cpu_and_dram_measured_power_per_socket: number | null;
  text: string;
}

// Read rather than import: a typed import of the 1.4 MB fixture slows type-checking.
const parity = JSON.parse(readFileSync(join(__dirname, 'power-model.parity.json'), 'utf8')) as {
  modelRevision: string;
  provenances: JsonValue[];
  configurations: JsonValue[];
  catalog: { systems: Record<string, string>; aliases: Record<string, string> };
  cases: ParityCase[];
  reports: ParityReport[];
};
const { cases } = parity;

/** Upstream modules by port path: `a/b.py` → `a/b.ts`, `a/__init__.py` → `a/index.ts`. */
function portPath(pythonFile: string): string {
  return pythonFile.replace(/(?<dir>^|\/)__init__\.py$/, '$<dir>index.ts').replace(/\.py$/, '.ts');
}

function portFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? portFiles(path) : [relative(PORT_DIR, path)];
  });
}

function expand(node: CompactNode): JsonValue {
  return {
    name: node.name,
    power_w: node.power_w,
    quantity: node.quantity,
    children: node.children.map(expand),
    provenance: node.provenance === null ? null : parity.provenances[node.provenance],
    details: node.details,
    configuration: node.configuration === null ? null : parity.configurations[node.configuration],
  };
}

/** Structural equality, with numbers equal to a relative 1e-12. */
function expectClose(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const tolerance = Math.max(Math.abs(expected), Math.abs(actual)) * REL_TOL;
    if (Math.abs(actual - expected) > tolerance) {
      expect.fail(`${path}: ${actual} != ${expected}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} is an array`).toBe(true);
    expect((actual as unknown[]).length, `${path} length`).toBe(expected.length);
    expected.forEach((item, index) =>
      expectClose((actual as unknown[])[index], item, `${path}[${index}]`),
    );
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', `${path} is an object`).toBe(true);
    const actualObject = actual as Record<string, unknown>;
    expect(Object.keys(actualObject).toSorted(), `${path} keys`).toEqual(
      Object.keys(expected).toSorted(),
    );
    for (const [key, value] of Object.entries(expected)) {
      expectClose(actualObject[key], value, `${path}.${key}`);
    }
    return;
  }
  expect(actual, path).toEqual(expected);
}

function powers(node: { power_w: number; children: readonly unknown[] }): number[] {
  return [node.power_w, ...node.children.flatMap((child) => powers(child as typeof node))];
}

function run(testCase: ParityCase): PowerEstimate {
  return create_power_model({
    system: testCase.system,
    model: testCase.model,
    workload_state: testCase.workload_state,
    using_scale_out: testCase.using_scale_out,
    systems: testCase.systems,
  }).estimate_breakdown(testCase.gpu_level_power_per_gpu, {
    cpu_and_dram_measured_power_per_socket: testCase.cpu_and_dram_measured_power_per_socket,
  });
}

function label(testCase: ParityCase): string {
  return [
    testCase.model,
    testCase.system,
    testCase.workload_state,
    testCase.using_scale_out ? 'scale-out' : 'no-scale-out',
    `x${testCase.systems}`,
    `${testCase.gpu_level_power_per_gpu}W`,
    `socket=${testCase.cpu_and_dram_measured_power_per_socket ?? 'modeled'}`,
  ].join(' ');
}

describe('power model port: file mapping', () => {
  const skipped = Object.keys(manifest.skipped);
  const expected = manifest.pythonFiles.filter((file) => !skipped.includes(file)).map(portPath);
  const actual = portFiles(PORT_DIR).filter((file) => file.endsWith('.ts'));

  it('pins the revision the fixture was generated from', () => {
    expect(parity.modelRevision).toBe(manifest.modelRevision);
    expect(manifest.sourceUrl).toContain(manifest.modelRevision);
  });

  it('ports every upstream module', () => {
    expect(expected.filter((file) => !actual.includes(file))).toEqual([]);
  });

  it('has no module without an upstream counterpart', () => {
    expect(actual.filter((file) => !expected.includes(file))).toEqual([]);
  });

  it('keeps only TypeScript modules in the mirrored tree', () => {
    expect(portFiles(PORT_DIR).filter((file) => !file.endsWith('.ts'))).toEqual([]);
  });
});

describe('power model port: catalog', () => {
  it('lists the upstream systems', () => {
    expect(
      Object.fromEntries(Object.entries(SYSTEMS).map(([name, cls]) => [name, cls.typeName])),
    ).toEqual(parity.catalog.systems);
  });

  it('resolves the upstream aliases', () => {
    for (const [name, resolved] of Object.entries(parity.catalog.aliases)) {
      expect(system_name(name), name).toBe(resolved);
    }
  });
});

describe('power model port: upstream parity', () => {
  it('covers every catalog system, workload, and rejection path', () => {
    expect(new Set(cases.map((c) => c.system))).toEqual(new Set(Object.keys(SYSTEMS)));
    expect(new Set(cases.map((c) => c.workload_state)).size).toBe(4);
    expect(cases.some((c) => c.error?.kind === 'validation')).toBe(true);
    expect(cases.some((c) => c.error?.kind === 'value')).toBe(true);
  });

  it.each(cases.map((testCase) => [label(testCase), testCase] as const))('%s', (_, testCase) => {
    if (testCase.error) {
      const { kind, message } = testCase.error;
      let thrown: unknown;
      try {
        run(testCase);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, 'rejects the input').toBeInstanceOf(ValueError);
      expect(thrown instanceof ValidationError ? 'validation' : 'value').toBe(kind);
      if (message !== null) expect((thrown as Error).message).toBe(message);
      return;
    }
    const estimate = run(testCase);
    if (testCase.estimate) {
      const { components, ...fields } = testCase.estimate;
      expectClose(estimate.model_dump(), { ...fields, components: components.map(expand) });
      return;
    }
    const { component_power_w, ...totals } = testCase.summary!;
    const dumped = estimate.model_dump();
    for (const [key, value] of Object.entries(totals)) expectClose(dumped[key], value, key);
    expectClose(estimate.components.flatMap(powers), component_power_w, 'component_power_w');
  });
});

describe('power model port: per-system report', () => {
  it.each(parity.reports.map((report) => [report.system, report] as const))('%s', (_, report) => {
    const estimate = create_power_model({
      system: report.system,
      workload_state: report.workload_state,
      using_scale_out: report.using_scale_out,
      systems: report.systems,
    }).estimate_breakdown(report.gpu_level_power_per_gpu, {
      cpu_and_dram_measured_power_per_socket: report.cpu_and_dram_measured_power_per_socket,
    });
    expect(format_power_breakdown_per_chassis(estimate)).toBe(report.text);
  });
});
