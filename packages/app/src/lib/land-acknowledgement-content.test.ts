import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const englishPage = readFileSync(
  resolve(import.meta.dirname, '../app/land-acknowledgement/page.tsx'),
  'utf8',
);
const chinesePage = readFileSync(
  resolve(import.meta.dirname, '../app/zh/land-acknowledgement/page.tsx'),
  'utf8',
);

describe('Land Acknowledgement translation fidelity', () => {
  it('keeps all three infrastructure relationships operational rather than constructional', () => {
    const englishOperationalRelationships =
      englishPage.match(/benchmark infrastructure operates on/gu) ?? [];
    const chineseAcknowledgements = [
      ...chinesePage.matchAll(/acknowledgement:\s*\n\s*'(?<copy>[^']+)'/gu),
    ].map((match) => match.groups!.copy);

    expect(englishOperationalRelationships).toHaveLength(3);
    expect(chineseAcknowledgements).toHaveLength(englishOperationalRelationships.length);
    for (const acknowledgement of chineseAcknowledgements) {
      expect(acknowledgement).toContain('基准测试基础设施运行于');
      expect(acknowledgement).not.toContain('建在');
    }
  });
});
