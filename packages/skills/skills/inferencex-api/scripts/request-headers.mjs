import { readFileSync } from 'node:fs';

let version;
try {
  version = JSON.parse(
    readFileSync(new URL('../integrity.json', import.meta.url), 'utf8'),
  ).package_version;
} catch {
  // Attribution must not prevent queries or installation diagnostics.
}

export function requestHeaders(url, { source = 'cli', env = process.env } = {}) {
  if (env.INFERENCEX_TELEMETRY === '0' || env.DO_NOT_TRACK === '1') return {};
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }
  if (
    parsed.origin !== 'https://inferencex.semianalysis.com' ||
    parsed.username ||
    parsed.password ||
    !['cli', 'skill'].includes(source) ||
    typeof version !== 'string' ||
    !/^(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})$/u.test(version)
  )
    return {};
  const explicit = env.INFERENCEX_TRAFFIC;
  if (explicit && !['normal', 'ci', 'validation'].includes(explicit)) return {};
  const ci = env.CI && !['0', 'false'].includes(env.CI.toLowerCase());
  const traffic =
    explicit === 'validation' ? 'validation' : ci || explicit === 'ci' ? 'ci' : 'normal';
  return { 'user-agent': `inferencex-${source}/${version}`, 'x-inferencex-traffic': traffic };
}
