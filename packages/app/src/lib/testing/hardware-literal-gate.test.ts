import { describe, expect, it } from 'vitest';

import { compareToBaseline, scanHardwareLiterals } from './hardware-literal-gate';

describe('scanHardwareLiterals', () => {
  it('counts whole keys in any case in strings and property names, not comments, JSX text or imports', () => {
    const keys = new Set(['b200', 'gb200', 'h100', 'h200']);
    const source = [
      "import { x } from './h100-specs';",
      '// b200 only',
      "const TDP = { h100: 700, 'gb200-nv': 1200, 'gh200x/b2000': 1 };",
      `const label = <span title={\`\${run}-h200_tp8\`}>b200</span>;`,
      "const tdp = TDP.h100 + h100Tdp + (gpu === 'H200' ? TDP.B200 : 0);",
    ].join('\n');

    expect(scanHardwareLiterals('x.tsx', source, keys)).toEqual([
      { line: 3, text: 'h100' },
      { line: 3, text: 'gb200-nv' },
      { line: 4, text: '-h200_tp8' },
      { line: 5, text: 'h100' },
      { line: 5, text: 'H200' },
      { line: 5, text: 'B200' },
    ]);
  });
});

describe('compareToBaseline', () => {
  it('reports new and grown files as grown, dropped and removed files as shrunk', () => {
    const counts = { added: 1, dropped: 1, grew: 2, same: 1 };
    const baseline = { dropped: 2, grew: 1, removed: 3, same: 1 };

    expect(compareToBaseline(counts, baseline)).toEqual({
      grown: ['added', 'grew'],
      shrunk: ['dropped', 'removed'],
    });
  });
});
