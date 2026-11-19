import { describe, expect, it } from 'vitest';

import { OperatingState, WorkloadState } from './power_model';
import { OSSAllinPowerModel } from './power_model/models/advanced/model';
import { SYSTEMS } from './power_model/models/advanced/systems/catalog';

type CpuInputs = [cpuAndDram: number | null, cpu: number | null];

function itPower(
  model: OSSAllinPowerModel,
  watts: number,
  state: OperatingState,
  [cpuAndDram, cpu]: CpuInputs,
): unknown {
  try {
    return model.cluster
      .estimate_it_power(watts, {
        cpu_and_dram_measured_power_per_socket: cpuAndDram,
        cpu_measured_power_per_socket: cpu,
        operating_state: state,
      })
      .components.map((component) => component.model_dump());
  } catch (error) {
    return String(error);
  }
}

describe('power model port: reused systems', () => {
  const states = Object.values(WorkloadState).flatMap((workload_state) =>
    [false, true].map((using_scale_out) => new OperatingState({ workload_state, using_scale_out })),
  );
  const inputs: CpuInputs[] = [
    [null, null],
    [96.25, null],
    [null, 180.5],
  ];

  it.each(Object.keys(SYSTEMS))('%s', (system) => {
    const reused = OSSAllinPowerModel.for_system(system);
    let compared = 0;
    for (const watts of [250.5, 700]) {
      for (const state of states) {
        for (const cpu of inputs) {
          expect(itPower(reused, watts, state, cpu)).toEqual(
            itPower(OSSAllinPowerModel.for_system(system), watts, state, cpu),
          );
          compared++;
        }
      }
    }
    expect(compared).toBe(2 * 8 * 3);
  });
});
