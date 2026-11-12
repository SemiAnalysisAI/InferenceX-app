import { isIPv6 } from 'node:net';

/**
 * Sanitization shared with InferenceX's Python uploader (test vectors in
 * `log-redaction.vectors.json`).
 */

export const REDACTED = '***REDACTED***';

const SECRET_PATTERNS = [
  /\bhf_[A-Za-z0-9]{30,}\b/gu,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/gu,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/gu,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/gu,
];
const URL_PASSWORD = /(?<userinfo>\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@"',;<>]*:)[^\s@/"',;<>]+@/gu;
const ORACLE_VCN =
  /\b(?<host>[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)(?:\.[A-Za-z0-9-]+)*\.oraclevcn\.com\b/giu;
const ORACLE_VCN_HINT = /oraclevcn\.com/iu;
const IPV6 = /(?<![\w:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:]|\.\d)/gu;
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
const IPV4 = new RegExp(String.raw`(?<![\w.])(?:${OCTET}\.){3}${OCTET}(?![\w]|\.\d)`, 'gu');
const VERSION_OPERATORS = ['==', '!=', '>=', '<=', '~='];
const PACKAGE_NAME_SUFFIX = /[A-Za-z0-9]-$/u;
const ADDRESS_KEY = /host|addr|ip|url|uri|endpoint|server|peer|remote|bind|master|node|target/iu;
const WHITESPACE = /\s/u;

/**
 * Key of the quoted JSON value that opens right before `start`, equivalent to
 * matching `"([^"]+)"\s*:\s*"$` against `text.slice(0, start)` without
 * rescanning the whole prefix for every match.
 */
function jsonValueKey(text: string, start: number): string | null {
  let at = start - 1;
  if (text[at] !== '"') return null;
  at--;
  while (at >= 0 && WHITESPACE.test(text[at]!)) at--;
  if (text[at] !== ':') return null;
  at--;
  while (at >= 0 && WHITESPACE.test(text[at]!)) at--;
  if (text[at] !== '"') return null;
  const open = text.lastIndexOf('"', at - 1);
  if (open === -1 || open === at - 1) return null;
  return text.slice(open + 1, at);
}

function isVersionContext(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 2), start);
  if (VERSION_OPERATORS.includes(before) || PACKAGE_NAME_SUFFIX.test(before)) return true;
  if (text[end] !== '"') return false;
  const key = jsonValueKey(text, start);
  return key !== null && !ADDRESS_KEY.test(key);
}

function sanitizeIpv4(match: string, start: number, text: string): string {
  const [a, b] = match.split('.').map(Number) as [number, number];
  const kept =
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
  if (kept || isVersionContext(text, start, start + match.length)) return match;
  return REDACTED;
}

function sanitizeIpv6(match: string): string {
  if (!isIPv6(match)) return match;
  const first = Number.parseInt(match.split(':')[0] || '0', 16);
  return first >> 13 === 1 ? REDACTED : match;
}

/** Sanitize `text`. The output is a fixed point: sanitizing it again changes nothing. */
export function redactText(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replaceAll(pattern, REDACTED);
  out = out.replaceAll(URL_PASSWORD, `$<userinfo>${REDACTED}@`);
  if (ORACLE_VCN_HINT.test(out)) out = out.replaceAll(ORACLE_VCN, `$<host>.${REDACTED}`);
  out = out.replaceAll(IPV6, sanitizeIpv6);
  return out.replaceAll(IPV4, (match: string, start: number, whole: string) =>
    sanitizeIpv4(match, start, whole),
  );
}
