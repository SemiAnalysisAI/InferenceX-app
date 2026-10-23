// SPDX-License-Identifier: GPL-3.0-only

import { formatG, type PowerComponentBreakdown, type PowerEstimate, ValueError } from './base';

type Row = [string, string, string, string];

function formatWatts(value: number): string {
  const magnitude = Math.abs(value);
  const tie = Number.isInteger(magnitude * 8) && !Number.isInteger(magnitude * 4);
  const cents = Math.floor(magnitude * 100);
  const text = tie
    ? ((cents % 2 === 0 ? cents : cents + 1) / 100).toFixed(2)
    : magnitude.toFixed(2);
  const [whole, fraction] = text.split('.');
  const grouped = whole.replaceAll(/\B(?=(?:\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}${grouped}.${fraction}`;
}

function _component_rows(
  component: PowerComponentBreakdown,
  system_count: number,
  {
    allow_fractional_quantities = false,
    label_prefix = '',
    child_prefix = '',
  }: { allow_fractional_quantities?: boolean; label_prefix?: string; child_prefix?: string } = {},
): Row[] {
  let quantity_per_system = Math.floor(component.quantity / system_count);
  const remainder = component.quantity - quantity_per_system * system_count;
  if (remainder && !allow_fractional_quantities) {
    throw new ValueError('Component quantity cannot be normalized to one chassis');
  }
  if (allow_fractional_quantities) quantity_per_system = component.quantity / system_count;
  const rows: Row[] = [
    [
      label_prefix + component.name,
      formatWatts(component.power_w / component.quantity),
      formatG(quantity_per_system),
      formatWatts(component.power_w / system_count),
    ],
  ];
  component.children.forEach((child, index) => {
    const last = index === component.children.length - 1;
    rows.push(
      ..._component_rows(child, system_count, {
        allow_fractional_quantities,
        label_prefix: child_prefix + (last ? '└─ ' : '├─ '),
        child_prefix: child_prefix + (last ? '   ' : '│  '),
      }),
    );
  });
  return rows;
}

function _format_table(rows: Row[]): string {
  const header: Row = ['Component', 'Power / unit (W)', 'Quantity', 'Extended power (W)'];
  const all = [header, ...rows];
  const widths = [0, 1, 2, 3].map((index) => Math.max(...all.map((row) => row[index].length)));
  const line = (row: Row) =>
    row
      .map((value, index) =>
        index === 0 ? value.padEnd(widths[index]) : value.padStart(widths[index]),
      )
      .join('  ');
  return [
    line(header),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map(line),
  ].join('\n');
}

const unitOf = (system: PowerComponentBreakdown) =>
  String(system.detail('system_unit') ?? 'chassis');

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

export function format_power_breakdown_per_chassis(estimate: PowerEstimate): string {
  if (estimate.scope !== 'cluster') {
    throw new ValueError('--power-breakdown-per-chassis requires the oss model');
  }
  const [systems, networking] = estimate.components;
  const units = new Set(systems.children.map(unitOf));
  const unit = units.size === 1 ? [...units][0] : 'system';
  const socket = estimate.cpu_and_dram_measured_power_per_socket;
  const x86_cpu = estimate.cpu_measured_power_per_socket;
  const sections = [
    `Power BoM per ${unit}`,
    `GPU input: ${formatWatts(estimate.gpu_level_power_per_gpu)} W/GPU | ${
      socket === null ? '' : `CPU+DRAM input (measured): ${formatWatts(socket)} W/socket | `
    }${
      x86_cpu === null ? '' : `CPU input (measured): ${formatWatts(x86_cpu)} W/socket | `
    }Workload: ${estimate.workload_state} | ` +
      `Scale-out: ${estimate.using_scale_out ? 'on' : 'off'}`,
  ];
  for (const system of systems.children) {
    sections.push(
      '',
      `${system.name} — one ${unitOf(system)} (configured quantity: ${system.quantity})`,
      _format_table(_component_rows(system, system.quantity)),
    );
  }
  const system_count = systems.children.reduce((total, system) => total + system.quantity, 0);
  if (networking.power_w) {
    const network_rows = networking.children.flatMap((gear) =>
      _component_rows(gear, system_count, { allow_fractional_quantities: true }),
    );
    sections.push(
      '',
      `Allocated external network per ${unit} (cluster average)`,
      _format_table(network_rows),
    );
  }
  sections.push(
    '',
    `Parent rows are subtotals. Quantities are expanded to one ${unit}.`,
    `${capitalize(unit)} power includes conversion loss, before shared networking and PUE.`,
    '',
    `Cluster totals (${system_count} ` +
      `${unit === 'chassis' || system_count === 1 ? unit : `${unit}s`}, ` +
      `${estimate.gpu_count} GPUs)`,
    `Shared external network AC power: ${formatWatts(networking.power_w)} W`,
    `IT AC power: ${formatWatts(estimate.it_power_w)} W`,
    `PUE: ${formatG(estimate.pue)}`,
    `Facility overhead: ${formatWatts(estimate.facility_overhead_w)} W`,
    `All in Utility Power: ${formatWatts(estimate.facility_power_w)} W`,
    `AllInPower_per_gpu: ${formatWatts(estimate.AllInPower_per_gpu)} W/GPU`,
  );
  return sections.join('\n');
}
