import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FAQ_ITEMS_ZH } from './faq-data-zh';
import { FAQ_ITEMS } from './faq-data';

const aboutPageSource = readFileSync(
  new URL('../../app/zh/about/page.tsx', import.meta.url),
  'utf8',
);

describe('localized About FAQ', () => {
  it('keeps every English FAQ item and optional field represented in Chinese', () => {
    expect(FAQ_ITEMS_ZH).toHaveLength(FAQ_ITEMS.length);
    expect(
      FAQ_ITEMS_ZH.map((item) => ({
        hasAnswer: Boolean(item.answer),
        listLength: item.list?.length ?? 0,
        linkHref: item.link?.href ?? null,
      })),
    ).toEqual(
      FAQ_ITEMS.map((item) => ({
        hasAnswer: Boolean(item.answer),
        listLength: item.list?.length ?? 0,
        linkHref: item.link?.href ?? null,
      })),
    );
  });

  it('spells the NeoCloud pricing category correctly', () => {
    const metrics = FAQ_ITEMS_ZH.find((item) => item.question === 'InferenceX 测量哪些指标？');
    expect(metrics?.list?.join('\n')).toContain('NeoCloud');
    expect(metrics?.list?.join('\n')).not.toContain('NeoCoud');
  });

  it('uses natural Chinese for the About introduction without changing its claims', () => {
    expect(aboutPageSource).toContain(
      '持续运行的开源智能体推理基准测试，受到万亿美元级、吉瓦规模 Token 工厂运营方的信赖',
    );
    expect(aboutPageSource).toContain('参与者提交的镜像往往专为基准测试打造');
    expect(aboutPageSource).not.toContain('开源持续智能体推理基准测试');
  });

  it('uses natural, interface-consistent Chinese in audited FAQ answers', () => {
    const chips = FAQ_ITEMS_ZH.find((item) => item.id === 'faq-chips');
    const models = FAQ_ITEMS_ZH.find((item) => item.id === 'faq-models');
    const logs = FAQ_ITEMS_ZH.find((item) => item.id === 'faq-raw-logs');

    expect(chips?.answer).toBe('新加速器可用后，我们会持续将其纳入基准测试。');
    expect(models?.answer).toContain('如果已有对应数据，还会运行 AgentX');
    expect(logs?.answer).toContain('“GitHub Actions 运行记录”');
    expect(logs?.answer).not.toContain('tooltip');
    expect(logs?.answer).not.toContain('"GitHub Actions Run"');
  });
});
