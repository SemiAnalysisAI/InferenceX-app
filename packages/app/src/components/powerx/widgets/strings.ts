import type { Locale } from '@/lib/i18n/i18n';
import type { LadderSegmentGroup } from '@/lib/powerx/ladder';

/** Names shared by the ladder, the load strip and the worked example. */
export const GROUP_LABELS: Record<Locale, Record<LadderSegmentGroup, string>> = {
  en: {
    gpu: 'GPU',
    cpu: 'CPUs',
    memory: 'Memory',
    network: 'NICs and scale-out',
    nvswitch: 'NVSwitch',
    pcie: 'PCIe switches',
    storage: 'Storage',
    fans: 'Fans',
    psu: 'PSU loss',
    other: 'Other',
  },
  zh: {
    gpu: 'GPU',
    cpu: 'CPU',
    memory: '内存',
    network: 'NIC 与 scale-out 网络',
    nvswitch: 'NVSwitch',
    pcie: 'PCIe 交换芯片',
    storage: '存储',
    fans: '风扇',
    psu: 'PSU 损耗',
    other: '其他',
  },
};

export const GROUP_TITLES: Record<Locale, Record<LadderSegmentGroup, string>> = {
  en: {
    gpu: 'Measured: the exporter sample, time-weighted over the serving window',
    cpu: 'Modeled at a fixed level per operating state',
    memory: 'Modeled at a fixed level per operating state',
    network: 'Modeled: NICs, transceivers and the chassis share of the scale-out switch, fixed',
    nvswitch: 'Modeled at a fixed level',
    pcie: 'Modeled: PCIe switches and retimers, fixed',
    storage: 'Modeled: NVMe drives, fixed',
    fans: 'Modeled: follows the GPU load',
    psu: 'Modeled: conversion losses that follow the GPU load',
    other: 'Modeled: shelf controllers and the rest',
  },
  zh: {
    gpu: '实测：exporter 采样值，在服务窗口内按时间加权',
    cpu: '建模：按工作状态取固定值',
    memory: '建模：按工作状态取固定值',
    network: '建模：NIC、光模块和机箱分摊的 scale-out 交换机，固定值',
    nvswitch: '建模：固定值',
    pcie: '建模：PCIe 交换芯片和 retimer，固定值',
    storage: '建模：NVMe 盘，固定值',
    fans: '建模：随 GPU 负载变化',
    psu: '建模：随 GPU 负载变化的电源转换损耗',
    other: '建模：电源架控制器等其他部件',
  },
};
