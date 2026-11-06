import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

const SOLID = 'none';
const DASH = '5 3';
const DOT = '2 3';
const DASH_DOT = '5 3 2 3';
const DASH_DOT_DOT = '5 3 2 3 2 3';
const LONG = '10 3';
const LONG_DASH = '10 3 4 3';
const LONG_DOT = '10 3 2 3';
const LONG_DOT_DOT = '10 3 2 3 2 3';

const FRAMEWORK_DASH: Record<string, string> = {
  vllm: SOLID,
  teacup: SOLID,
  sglang: DASH,
  trt: DOT,
  atom: DASH_DOT,
  tilert: DASH_DOT,
  'mooncake-atom': DASH_DOT_DOT,
  tokenspeed: DASH_DOT_DOT,
  'dynamo-vllm': LONG,
  'vllm-disagg': LONG,
  'dynamo-sglang': LONG_DASH,
  'mori-sglang': LONG_DASH,
  'dynamo-trt': LONG_DOT,
  'llmd-vllm': LONG_DOT_DOT,
};

export function frameworkDasharray(hwKey: string): string | undefined {
  for (const part of hwKey.split('_').slice(1)) {
    const framework = resolveFrameworkAlias(part);
    if (Object.hasOwn(FRAMEWORK_DASH, framework)) return FRAMEWORK_DASH[framework];
  }
  return undefined;
}
