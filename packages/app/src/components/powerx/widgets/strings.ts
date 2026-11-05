import type { Locale } from '@/lib/i18n/i18n';
import type { LadderCategory } from '@/lib/powerx/ladder';

/** What each part is and how the model treats it; shown as the part's tooltip. */
export const CATEGORY_TITLES: Record<Locale, Record<LadderCategory, string>> = {
  en: {
    gpu: 'Measured: the exporter sample, time-weighted over the serving window',
    cpu: 'Modeled at a fixed level per operating state',
    memory: 'Modeled at a fixed level per operating state',
    nic: 'Modeled: NICs and transceivers, fixed',
    nvswitch: 'Modeled: NVSwitch chips and trays, fixed',
    storage: 'Modeled: NVMe drives, fixed',
    other: 'Modeled: PCIe switches, retimers, shelf controllers and the rest, fixed',
    fans: 'Modeled: follows the GPU load',
    psuLoss: 'Modeled: conversion losses that follow the GPU load',
    network: 'Modeled: the chassis share of the scale-out switch, fixed',
  },
  zh: {
    gpu: '实测：exporter 采样值，在服务窗口内按时间加权',
    cpu: '建模：按工作状态取固定值',
    memory: '建模：按工作状态取固定值',
    nic: '建模：网卡和光模块，固定值',
    nvswitch: '建模：NVSwitch 芯片和托盘，固定值',
    storage: '建模：NVMe 盘，固定值',
    other: '建模：PCIe 交换芯片、retimer、电源架控制器等其他部件，固定值',
    fans: '建模：随 GPU 负载变化',
    psuLoss: '建模：随 GPU 负载变化的电源转换损耗',
    network: '建模：机箱分摊的 scale-out 交换机，固定值',
  },
};
