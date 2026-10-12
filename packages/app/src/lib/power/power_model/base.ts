// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** Shared inputs, auditable results, and the per-GPU estimation contract. */
// Port of power_model/src/power_model/base.py at the revision in manifest.ts.

import type { CoolingMode, CoolingProfile } from './cooling';

export const MODEL_VERSION = '0.1.0';

/** Python's ValueError: a domain or input error raised by a model method. */
export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

/**
 * pydantic's ValidationError (a ValueError subclass): a field constraint or a
 * model validator rejected a constructed value. `message` is the validator's
 * own text, without pydantic's "Value error, " prefix.
 */
export class ValidationError extends ValueError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;
export type DetailValue = string | number;
export type Details = readonly (readonly [string, DetailValue])[];
export type Scope = 'per_gpu_reference' | 'cluster';

/** Watts: a finite, non-negative number (pydantic `Field(strict=True, ge=0, allow_inf_nan=False)`). */
export function validate_watts(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError('Input should be a finite number');
  }
  if (!(value >= 0)) throw new ValidationError('Input should be greater than or equal to 0');
  return value;
}

/** Require a boolean even when evaluating a system directly. */
export function validate_cpu_offload(value: boolean): boolean {
  if (typeof value !== 'boolean') throw new ValidationError('Input should be a valid boolean');
  return value;
}

/** A positive integer or a positive finite float (PositiveQuantity). */
export function validate_quantity(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw new ValidationError('Input should be greater than 0');
  }
  return value;
}

/** A positive integer (PositiveCount). */
export function validate_count(value: number): number {
  if (!Number.isSafeInteger(value)) throw new ValidationError('Input should be a valid integer');
  if (!(value > 0)) throw new ValidationError('Input should be greater than 0');
  return value;
}

/**
 * CPython's math.fsum: Shewchuk's exactly rounded floating-point sum. Plain
 * left-to-right addition differs from it in the last bits, and parent/child
 * reconciliation and every published total depend on this summation.
 */
export function fsum(values: readonly number[]): number {
  const partials: number[] = [];
  let specialSum = 0;
  let infSum = 0;
  for (const value of values) {
    let x = value;
    const xsave = x;
    let i = 0;
    for (const partial of partials) {
      let y = partial;
      if (Math.abs(x) < Math.abs(y)) [x, y] = [y, x];
      const hi = x + y;
      const lo = y - (hi - x);
      if (lo !== 0) partials[i++] = lo;
      x = hi;
    }
    partials.length = i;
    if (x !== 0) {
      if (Number.isFinite(x)) {
        partials.push(x);
      } else {
        // A non-finite intermediate from finite inputs is an overflow.
        if (Number.isFinite(xsave)) throw new RangeError('intermediate overflow in fsum');
        if (!Number.isNaN(xsave)) infSum += xsave;
        specialSum += xsave;
        partials.length = 0;
      }
    }
  }
  if (specialSum !== 0) {
    if (Number.isNaN(infSum)) throw new ValueError('-inf + inf in fsum');
    return specialSum;
  }
  let n = partials.length;
  let hi = 0;
  if (n > 0) {
    hi = partials[--n];
    let lo = 0;
    while (n > 0) {
      const x = hi;
      const y = partials[--n];
      hi = x + y;
      const yr = hi - x;
      lo = y - yr;
      if (lo !== 0) break;
    }
    // Round half-even exactly when the remaining partials push past a tie.
    if (n > 0 && ((lo < 0 && partials[n - 1] < 0) || (lo > 0 && partials[n - 1] > 0))) {
      const y = lo * 2;
      const x = hi + y;
      const yr = x - hi;
      if (y === yr) hi = x;
    }
  }
  return hi;
}

export function sum_watts(values: readonly number[]): number {
  let total: number;
  try {
    total = fsum(values);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new ValueError('Power total exceeds the supported finite range');
    }
    throw error;
  }
  return validate_watts(total);
}

/** Consecutive pairs, like Python's `zip(values, values[1:])`. */
export function pairs<T>(values: readonly T[]): [T, T][] {
  return values.slice(1).map((right, index) => [values[index], right]);
}

/** Python's math.isclose. */
export function isclose(a: number, b: number, rel_tol: number, abs_tol: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(b - a);
  return diff <= Math.abs(rel_tol * b) || diff <= Math.abs(rel_tol * a) || diff <= abs_tol;
}

const strip = (text: string) => (text.includes('.') ? text.replace(/\.?0+$/, '') : text);

/** Python's `format(value, 'g')`: six significant digits, trailing zeros removed. */
export function formatG(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const [mantissa, exponentText] = value.toExponential(5).split('e');
  const exponent = Number(exponentText);
  if (exponent < -4 || exponent >= 6) {
    const sign = exponent < 0 ? '-' : '+';
    return `${strip(mantissa)}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
  }
  return strip(value.toFixed(5 - exponent));
}

/** Convert a model value into the JSON pydantic's `model_dump(mode="json")` produces. */
export function dump(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map(dump);
  if (value instanceof FrozenModel) return value.model_dump();
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dump(item)]));
  }
  throw new TypeError(`Cannot serialize ${typeof value}`);
}

/** pydantic's frozen, strict BaseModel: every model serializes its own fields. */
export abstract class FrozenModel {
  /** The Python class name, which also names result nodes; minification-safe. */
  static readonly typeName: string = 'FrozenModel';

  get typeName(): string {
    return (this.constructor as typeof FrozenModel).typeName;
  }

  /** The model's fields in pydantic declaration order. */
  protected abstract fields(): Record<string, unknown>;

  model_dump(): JsonObject {
    return Object.fromEntries(
      Object.entries(this.fields()).map(([key, value]) => [key, dump(value)]),
    );
  }
}

// oxlint-disable-next-line no-redeclare -- a value-and-type pair, like the Python enum
export const WorkloadState = {
  IDLE: 'idle',
  FIXED_SEQ_LEN: 'fixed-seq-len',
  AGENTIC: 'agentic',
  AGENTIC_CPU_OFFLOADING: 'agentic-cpu-offloading',
} as const;
export type WorkloadState = (typeof WorkloadState)[keyof typeof WorkloadState];
const WORKLOAD_STATES: readonly string[] = Object.values(WorkloadState);

export function parse_workload(value: unknown): WorkloadState {
  if (typeof value !== 'string') {
    throw new ValidationError('workload_state must be a supported workload name');
  }
  if (!WORKLOAD_STATES.includes(value)) {
    throw new ValidationError(`'${value}' is not a valid WorkloadState`);
  }
  return value as WorkloadState;
}

export interface OperatingStateFields {
  workload_state?: WorkloadState | string;
  using_scale_out?: boolean;
}

/** One workload and scale-out policy shared by the whole modeled cluster. */
export class OperatingState extends FrozenModel {
  static override readonly typeName: string = 'OperatingState';
  readonly workload_state: WorkloadState;
  readonly using_scale_out: boolean;

  constructor({
    workload_state = WorkloadState.FIXED_SEQ_LEN,
    using_scale_out = false,
  }: OperatingStateFields = {}) {
    super();
    this.workload_state = parse_workload(workload_state);
    if (typeof using_scale_out !== 'boolean') {
      throw new ValidationError('Input should be a valid boolean');
    }
    this.using_scale_out = using_scale_out;
  }

  get cpu_offload(): boolean {
    return this.workload_state === WorkloadState.AGENTIC_CPU_OFFLOADING;
  }

  get nic_state(): 'active' | 'idle' {
    return this.using_scale_out ? 'active' : 'idle';
  }

  protected fields(): Record<string, unknown> {
    return { workload_state: this.workload_state, using_scale_out: this.using_scale_out };
  }
}

export const DEFAULT_OPERATING_STATE = new OperatingState();

export type ProvenanceKind = 'input' | 'assumed' | 'measured' | 'estimated';

export interface ProvenanceFields {
  profile_id: string;
  version: string;
  source: string;
  kind: ProvenanceKind;
  input_boundary: string;
  assumptions?: readonly string[];
}

/** Source and measurement boundary attached to an input or modeling assumption. */
export class Provenance extends FrozenModel {
  static override readonly typeName: string = 'Provenance';
  readonly profile_id: string;
  readonly version: string;
  readonly source: string;
  readonly kind: ProvenanceKind;
  readonly input_boundary: string;
  readonly assumptions: readonly string[];

  constructor({ assumptions = [], ...fields }: ProvenanceFields) {
    super();
    for (const key of ['profile_id', 'version', 'source', 'input_boundary'] as const) {
      if (typeof fields[key] !== 'string' || fields[key].length === 0) {
        throw new ValidationError('String should have at least 1 character');
      }
    }
    this.profile_id = fields.profile_id;
    this.version = fields.version;
    this.source = fields.source;
    this.kind = fields.kind;
    this.input_boundary = fields.input_boundary;
    this.assumptions = assumptions;
  }

  protected fields() {
    return {
      profile_id: this.profile_id,
      version: this.version,
      source: this.source,
      kind: this.kind,
      input_boundary: this.input_boundary,
      assumptions: this.assumptions,
    };
  }
}

export interface PowerComponentBreakdownFields {
  name: string;
  power_w: number;
  quantity?: number;
  children?: readonly PowerComponentBreakdown[];
  provenance?: Provenance | null;
  details?: Details;
  configuration?: JsonObject | null;
}

interface GroupOptions {
  provenance?: Provenance | null;
  details?: Details;
  configuration?: JsonObject | null;
}

/** Totals across this scope; quantities may be fractional shares of external equipment. */
export class PowerComponentBreakdown extends FrozenModel {
  static override readonly typeName: string = 'PowerComponentBreakdown';
  readonly name: string;
  readonly power_w: number;
  readonly quantity: number;
  readonly children: readonly PowerComponentBreakdown[];
  readonly provenance: Provenance | null;
  readonly details: Details;
  readonly configuration: JsonObject | null;

  constructor({
    name,
    power_w,
    quantity = 1,
    children = [],
    provenance = null,
    details = [],
    configuration = null,
  }: PowerComponentBreakdownFields) {
    super();
    if (typeof name !== 'string' || name.length === 0) {
      throw new ValidationError('String should have at least 1 character');
    }
    this.name = name;
    this.power_w = validate_watts(power_w);
    this.quantity = validate_quantity(quantity);
    this.children = children;
    this.provenance = provenance;
    this.details = details;
    this.configuration = configuration;
    if (
      children.length > 0 &&
      !isclose(power_w, sum_watts(children.map((child) => child.power_w)), 1e-12, 1e-9)
    ) {
      throw new ValidationError('Parent power must equal the sum of child power');
    }
  }

  static group(
    name: string,
    children: readonly PowerComponentBreakdown[],
    { provenance = null, details = [], configuration = null }: GroupOptions = {},
  ): PowerComponentBreakdown {
    return new PowerComponentBreakdown({
      name,
      power_w: sum_watts(children.map((child) => child.power_w)),
      children,
      provenance,
      details,
      configuration,
    });
  }

  /** Scale a whole tree so every parent still sums its children exactly once. */
  scaled(quantity: number): PowerComponentBreakdown {
    const count = validate_quantity(quantity);
    return new PowerComponentBreakdown({
      name: this.name,
      power_w: this.power_w * count,
      quantity: this.quantity * count,
      children: this.children.map((child) => child.scaled(count)),
      provenance: this.provenance,
      details: this.details,
      configuration: this.configuration,
    });
  }

  /** The `details` pairs as a lookup, like Python's `dict(component.details)`. */
  detail(key: string): DetailValue | undefined {
    return this.details.find(([name]) => name === key)?.[1];
  }

  protected fields() {
    return {
      name: this.name,
      power_w: this.power_w,
      quantity: this.quantity,
      children: this.children,
      provenance: this.provenance,
      details: this.details,
      configuration: this.configuration,
    };
  }
}

export interface ITPowerBreakdown {
  readonly scope: Scope;
  readonly gpu_count: number;
  readonly components: readonly PowerComponentBreakdown[];
}

export function it_power_w(breakdown: ITPowerBreakdown): number {
  return sum_watts(breakdown.components.map((component) => component.power_w));
}

export interface PowerEstimateFields {
  model_name: string;
  model_version: string;
  cpu_offload: boolean;
  workload_state: WorkloadState;
  using_scale_out: boolean;
  gpu_level_power_per_gpu: number;
  cpu_and_dram_measured_power_per_socket: number | null;
  AllInPower_per_gpu: number;
  scope: Scope;
  gpu_count: number;
  cooling_mode: CoolingMode;
  pue: number;
  it_power_w: number;
  facility_overhead_w: number;
  facility_power_w: number;
  components: readonly PowerComponentBreakdown[];
}

export class PowerEstimate extends FrozenModel {
  static override readonly typeName: string = 'PowerEstimate';
  readonly model_name: string;
  readonly model_version: string;
  readonly cpu_offload: boolean;
  readonly workload_state: WorkloadState;
  readonly using_scale_out: boolean;
  readonly gpu_level_power_per_gpu: number;
  readonly cpu_and_dram_measured_power_per_socket: number | null;
  readonly AllInPower_per_gpu: number;
  readonly scope: Scope;
  readonly gpu_count: number;
  readonly cooling_mode: CoolingMode;
  readonly pue: number;
  readonly it_power_w: number;
  readonly facility_overhead_w: number;
  readonly facility_power_w: number;
  readonly components: readonly PowerComponentBreakdown[];

  constructor(fields: PowerEstimateFields) {
    super();
    this.model_name = fields.model_name;
    this.model_version = fields.model_version;
    this.cpu_offload = fields.cpu_offload;
    this.workload_state = parse_workload(fields.workload_state);
    this.using_scale_out = fields.using_scale_out;
    this.gpu_level_power_per_gpu = validate_watts(fields.gpu_level_power_per_gpu);
    this.cpu_and_dram_measured_power_per_socket =
      fields.cpu_and_dram_measured_power_per_socket === null
        ? null
        : validate_watts(fields.cpu_and_dram_measured_power_per_socket);
    this.AllInPower_per_gpu = validate_watts(fields.AllInPower_per_gpu);
    this.scope = fields.scope;
    this.gpu_count = validate_count(fields.gpu_count);
    this.cooling_mode = fields.cooling_mode;
    if (!Number.isFinite(fields.pue) || !(fields.pue >= 1)) {
      throw new ValidationError('Input should be greater than or equal to 1');
    }
    this.pue = fields.pue;
    this.it_power_w = validate_watts(fields.it_power_w);
    this.facility_overhead_w = validate_watts(fields.facility_overhead_w);
    this.facility_power_w = validate_watts(fields.facility_power_w);
    this.components = fields.components;
    if (this.cpu_offload !== (this.workload_state === WorkloadState.AGENTIC_CPU_OFFLOADING)) {
      throw new ValidationError('CPU offloading must agree with workload_state');
    }
    const checks: [number, number][] = [
      [this.it_power_w, sum_watts(this.components.map((c) => c.power_w))],
      [this.facility_power_w, this.it_power_w * this.pue],
      [this.facility_power_w, this.it_power_w + this.facility_overhead_w],
      [this.facility_power_w, this.AllInPower_per_gpu * this.gpu_count],
    ];
    if (checks.some(([a, b]) => !isclose(a, b, 1e-12, 1e-9))) {
      throw new ValidationError('Power estimate totals do not reconcile');
    }
  }

  protected fields() {
    return {
      model_name: this.model_name,
      model_version: this.model_version,
      cpu_offload: this.cpu_offload,
      workload_state: this.workload_state,
      using_scale_out: this.using_scale_out,
      gpu_level_power_per_gpu: this.gpu_level_power_per_gpu,
      cpu_and_dram_measured_power_per_socket: this.cpu_and_dram_measured_power_per_socket,
      AllInPower_per_gpu: this.AllInPower_per_gpu,
      scope: this.scope,
      gpu_count: this.gpu_count,
      cooling_mode: this.cooling_mode,
      pue: this.pue,
      it_power_w: this.it_power_w,
      facility_overhead_w: this.facility_overhead_w,
      facility_power_w: this.facility_power_w,
      components: this.components,
    };
  }
}

export interface EstimateOptions {
  /** Watts per Grace socket; replaces the socket's modeled loads. */
  cpu_and_dram_measured_power_per_socket?: number | null;
}

export interface PowerModelFields extends OperatingStateFields {
  cooling: CoolingProfile;
}

export abstract class PowerModel extends OperatingState {
  static override readonly typeName: string = 'PowerModel';
  readonly cooling: CoolingProfile;

  constructor({ cooling, ...state }: PowerModelFields) {
    super(state);
    // cooling.ts imports this module; a type-only import keeps the graph acyclic.
    if (!(cooling instanceof FrozenModel) || cooling.typeName !== 'CoolingProfile') {
      throw new ValidationError('Input should be an instance of CoolingProfile');
    }
    this.cooling = cooling;
  }

  get operating_state(): OperatingState {
    return new OperatingState({
      workload_state: this.workload_state,
      using_scale_out: this.using_scale_out,
    });
  }

  /** Return AllInPower_per_gpu in watts per GPU. */
  estimate(gpu_level_power_per_gpu: number, options: EstimateOptions = {}): number {
    return this.estimate_breakdown(gpu_level_power_per_gpu, options).AllInPower_per_gpu;
  }

  /**
   * cpu_and_dram_measured_power_per_socket is watts per Grace socket and
   * replaces its modeled loads.
   */
  estimate_breakdown(
    gpu_level_power_per_gpu: number,
    { cpu_and_dram_measured_power_per_socket = null }: EstimateOptions = {},
  ): PowerEstimate {
    const gpu_power = validate_watts(gpu_level_power_per_gpu);
    const socket_power =
      cpu_and_dram_measured_power_per_socket === null
        ? null
        : validate_watts(cpu_and_dram_measured_power_per_socket);
    const breakdown = this._estimate_it_power(gpu_power, socket_power);
    const it_power = it_power_w(breakdown);
    const facility_power = validate_watts(it_power * this.cooling.pue);
    return new PowerEstimate({
      model_name: this.typeName,
      model_version: MODEL_VERSION,
      cpu_offload: this.cpu_offload,
      workload_state: this.workload_state,
      using_scale_out: this.using_scale_out,
      gpu_level_power_per_gpu: gpu_power,
      cpu_and_dram_measured_power_per_socket: socket_power,
      AllInPower_per_gpu: facility_power / breakdown.gpu_count,
      scope: breakdown.scope,
      gpu_count: breakdown.gpu_count,
      cooling_mode: this.cooling.mode,
      pue: this.cooling.pue,
      it_power_w: it_power,
      facility_overhead_w: facility_power - it_power,
      facility_power_w: facility_power,
      components: breakdown.components,
    });
  }

  /** Return scoped IT watts and the matching GPU count before PUE. */
  protected abstract _estimate_it_power(
    gpu_level_power_per_gpu: number,
    cpu_and_dram_measured_power_per_socket: number | null,
  ): ITPowerBreakdown;

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), cooling: this.cooling };
  }
}
