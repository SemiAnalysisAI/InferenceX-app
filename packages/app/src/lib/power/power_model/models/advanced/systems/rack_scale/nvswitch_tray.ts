// SPDX-License-Identifier: GPL-3.0-only
/** Internal NVLink fabric tray with management CPU, fans, and DC/DC conversion. */

import { FrozenModel, PowerComponentBreakdown, Provenance, sum_watts } from '../../../../base';
import { BlackwellNVSwitch } from '../../components/blackwell_nvswitch';
import { DCConverterAssembly } from '../../components/dc_converter';
import { EPYCEmbedded3151CPU } from '../../components/epyc3151';
import { RackFanAssembly, solve_cooling } from '../../components/rack_fans';

const NVL72_NVSWITCH_TRAY = new Provenance({
  profile_id: 'nvl72-nvswitch-tray',
  version: '1',
  kind: 'estimated',
  source: 'User inventory with provisional fan and converter assembly',
  input_boundary: 'One switch-tray rack-bus input, before rack AC/DC',
  assumptions: [
    'Two liquid-cooled switch electrical budgets plus one 45 W management CPU.',
    'Four representative fan modules and a 250 W air-heat anchor are provisional.',
    'Management CPU and tray converter heat are air cooled.',
    'Switch local regulation is included in its electrical budget; management CPU ' +
      '45 W is treated as an intermediate-rail budget for this tray profile.',
    'Unspecified management DRAM, storage and other auxiliaries are outside this BoM.',
  ],
});

export interface NVSwitchTrayFields {
  switch?: BlackwellNVSwitch;
  cpu?: EPYCEmbedded3151CPU;
  fans?: RackFanAssembly;
  converter?: DCConverterAssembly;
  provenance?: Provenance;
}

export class NVSwitchTray extends FrozenModel {
  static override readonly typeName: string = 'NVSwitchTray';
  readonly switch: BlackwellNVSwitch;
  readonly cpu: EPYCEmbedded3151CPU;
  readonly fans: RackFanAssembly;
  readonly converter: DCConverterAssembly;
  readonly provenance: Provenance;

  constructor({
    switch: nvswitch = new BlackwellNVSwitch(),
    cpu = new EPYCEmbedded3151CPU(),
    fans = new RackFanAssembly({ fan_count: 4, design_air_heat_w: 250 }),
    converter = new DCConverterAssembly(),
    provenance = NVL72_NVSWITCH_TRAY,
  }: NVSwitchTrayFields = {}) {
    super();
    this.switch = nvswitch;
    this.cpu = cpu;
    this.fans = fans;
    this.converter = converter;
    this.provenance = provenance;
  }

  estimate_breakdown(): PowerComponentBreakdown {
    const switches = this.switch.estimate_breakdown().scaled(2);
    const cpu = this.cpu.estimate_breakdown();
    const load = sum_watts([switches.power_w, cpu.power_w]);
    const fans = solve_cooling(load, cpu.power_w, this.fans, (output) =>
      this.converter.loss_w(output),
    );
    const loss = this.converter.estimate_loss_breakdown(load + fans.power_w);
    return PowerComponentBreakdown.group('NVSwitchTray', [switches, cpu, fans, loss], {
      provenance: this.provenance,
    });
  }

  protected fields() {
    return {
      switch: this.switch,
      cpu: this.cpu,
      fans: this.fans,
      converter: this.converter,
      provenance: this.provenance,
    };
  }
}
