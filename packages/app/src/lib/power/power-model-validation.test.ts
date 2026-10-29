import { describe, expect, it } from 'vitest';

import {
  formatG,
  parse_workload,
  PowerComponentBreakdown,
  Provenance,
  py_repr,
  ValidationError,
} from './power_model/base';
import { GB300BiancaBoard } from './power_model/models/advanced/components/bianca/gb300';
import { NormalizedHGXFanPower } from './power_model/models/advanced/components/hgx_fans';
import { MI325PSUEfficiency } from './power_model/models/advanced/components/psu';
import { ConnectX7NICCard } from './power_model/models/advanced/components/scaleoutnic/connectx7';
import { ConnectX8NICCard } from './power_model/models/advanced/components/scaleoutnic/connectx8';
import { Thor2NICCard } from './power_model/models/advanced/components/scaleoutnic/thor2';
import { B300HGXBoard } from './power_model/models/advanced/components/ubb/b300_hgx';
import { HopperHGXBoard } from './power_model/models/advanced/components/ubb/hopper_hgx';
import { MI300UBB } from './power_model/models/advanced/components/ubb/mi300_ubb';
import {
  HopperHGXSystemChassis,
  MI300HGXSystemChassis,
} from './power_model/models/advanced/systems/hgx';
import {
  GB200ComputeTray,
  GB300ComputeTray,
} from './power_model/models/advanced/systems/rack_scale/compute_tray';
import { GB300NVL72RackScaleSystem } from './power_model/models/advanced/systems/rack_scale/gb300';

const PYTHON_G: [number, string][] = [
  [1234565, '1.23456e+06'],
  [1234575, '1.23458e+06'],
  [100000.5, '100000'],
  [123456.5, '123456'],
  [999999.5, '1e+06'],
  [-1234565, '-1.23456e+06'],
  [12345650000, '1.23456e+10'],
  [1.234565e-5, '1.23456e-05'],
  [1234567, '1.23457e+06'],
  [0.1234565, '0.123456'],
  [0.0001234565, '0.000123457'],
  [1.0000005, '1'],
  [9.9999995, '10'],
  [99999.95, '99999.9'],
  [123456.49999999999, '123456'],
  [123456789, '1.23457e+08'],
  [0.000123456789, '0.000123457'],
  [2.5, '2.5'],
  [-0.5, '-0.5'],
  [9.5, '9.5'],
  [100000, '100000'],
  [999999, '999999'],
  [1000000, '1e+06'],
  [1e15, '1e+15'],
  [1e16, '1e+16'],
  [1e21, '1e+21'],
  [1e300, '1e+300'],
  [Number.MAX_VALUE, '1.79769e+308'],
  [0.0001, '0.0001'],
  [1e-5, '1e-05'],
  [1e-7, '1e-07'],
  [2.5e-7, '2.5e-07'],
  [5e-324, '4.94066e-324'],
  [0, '0'],
  [-0, '-0'],
  [Number.POSITIVE_INFINITY, 'inf'],
  [Number.NEGATIVE_INFINITY, '-inf'],
  [Number.NaN, 'nan'],
];

const modelType = (name: string) => `Input should be a valid dictionary or instance of ${name}`;

const child = (power_w: number) => new PowerComponentBreakdown({ name: 'c', power_w });

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('power model port: wrong-family parts', () => {
  it.each([
    [
      'B300 board with a ConnectX-7 NIC',
      () => new B300HGXBoard({ nic: new ConnectX7NICCard({ state: 'idle' }) }),
      'ConnectX8NICCard',
    ],
    [
      'MI300 chassis on a Hopper board',
      () => new MI300HGXSystemChassis({ ubb: new HopperHGXBoard() }),
      'MI300UBB',
    ],
    [
      'GB200 tray with a GB300 board',
      () => new GB200ComputeTray({ board: new GB300BiancaBoard() }),
      'GB200BiancaBoard',
    ],
    [
      'GB300 rack with a GB200 tray',
      () => new GB300NVL72RackScaleSystem({ compute_tray: new GB200ComputeTray() }),
      'GB300ComputeTray',
    ],
  ])('rejects a %s like pydantic', (_, build, expected) => {
    const error = thrown(build);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toBe(modelType(expected));
  });

  it('still accepts the matching family', () => {
    expect(new MI300HGXSystemChassis({ ubb: new MI300UBB() }).ubb).toBeInstanceOf(MI300UBB);
    expect(new GB300ComputeTray({ board: new GB300BiancaBoard() }).board).toBeInstanceOf(
      GB300BiancaBoard,
    );
    expect(new B300HGXBoard({ nic: new ConnectX8NICCard({ state: 'active' }) }).nic.state).toBe(
      'active',
    );
  });
});

describe('power model port: HGX chassis provenance', () => {
  it('keeps a caller-supplied provenance on the system node', () => {
    const provenance = new Provenance({
      profile_id: 'fuzz-r1',
      version: '1',
      source: 'test',
      kind: 'input',
      input_boundary: 'chassis',
    });
    const chassis = new HopperHGXSystemChassis({ provenance });
    expect(chassis.provenance).toBe(provenance);
    const dumped = chassis.model_dump() as { provenance: { profile_id: string } };
    expect(dumped.provenance.profile_id).toBe('fuzz-r1');
  });
});

describe('power model port: Python text formatting', () => {
  it.each(PYTHON_G)('formatG(%s) is %s', (value, expected) => {
    expect(formatG(value)).toBe(expected);
  });

  it('rounds the PSU over-capacity load like Python', () => {
    expect(() => new MI325PSUEfficiency().efficiency(1234565)).toThrow(
      'DC load 1.23456e+06 W exceeds modeled PSU capacity 15750 W (N+N / 3+3)',
    );
  });

  it.each([
    ['a\nb', String.raw`'a\nb'`],
    ["it's", `"it's"`],
    ['say "hi"', `'say "hi"'`],
    ['\'"', `'\\'"'`],
    [String.raw`back\slash`, String.raw`'back\\slash'`],
    ['tab\t', String.raw`'tab\t'`],
    ['\u007F', String.raw`'\x7f'`],
    ['é', "'é'"],
  ])('py_repr(%j) is %s', (text, expected) => {
    expect(py_repr(text)).toBe(expected);
  });

  it('quotes an invalid NIC or workload state with repr', () => {
    expect(() => new Thor2NICCard({ state: "it's" })).toThrow(`"it's" is not a valid NICState`);
    expect(() => parse_workload('a\nb')).toThrow(String.raw`'a\nb' is not a valid WorkloadState`);
  });
});

describe('power model port: validator errors', () => {
  it('reports an overflow inside a model validator as a ValidationError', () => {
    const fan = thrown(
      () =>
        new NormalizedHGXFanPower({
          gpu_tdp_w: Number.MAX_VALUE,
          gpu_count: 1,
          design_non_gpu_power_w: 1e300,
        }),
    );
    expect(fan).toBeInstanceOf(ValidationError);
    expect((fan as Error).message).toBe('Power total exceeds the supported finite range');
    const parent = thrown(
      () =>
        new PowerComponentBreakdown({
          name: 'p',
          power_w: 1e308,
          children: [child(1.7e308), child(1.7e308)],
        }),
    );
    expect(parent).toBeInstanceOf(ValidationError);
    expect((parent as Error).message).toBe('Power total exceeds the supported finite range');
  });

  it('rejects an unknown provenance kind', () => {
    expect(
      () =>
        new Provenance({
          profile_id: 'x',
          version: '1',
          source: 's',
          kind: 'bogus' as 'input',
          input_boundary: 'b',
        }),
    ).toThrow("Input should be 'input', 'assumed', 'measured' or 'estimated'");
  });

  it('reads the last duplicate detail like dict(details)', () => {
    const node = new PowerComponentBreakdown({
      name: 'p',
      power_w: 1,
      details: [
        ['k', 1],
        ['k', 2],
      ],
    });
    expect(node.detail('k')).toBe(2);
  });
});
