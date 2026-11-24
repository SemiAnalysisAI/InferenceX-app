import { isIPv6 } from 'node:net';

/**
 * Sanitization shared with InferenceX's Python uploader (test vectors in
 * `log-redaction.vectors.json`). Every class here is ASCII-only, so the Python port compiles its
 * patterns with `re.ASCII`, and its variable-length lookbehinds need the `regex` module.
 */

export const REDACTED = '***REDACTED***';

/**
 * Lookbehind for a token that may follow an ANSI SGR colour code (`\x1b[0m` ends in the word
 * character `m`) or an escaped `\n`, `\r` or `\t` in a repr, as well as a non-word character.
 */
const AFTER_ESCAPE = String.raw`(?<=\x1b\[[0-9;]{0,16}m|\\[nrt])`;
const START = String.raw`(?:(?<![A-Za-z0-9_])|${AFTER_ESCAPE})`;
const startingToken = (body: string, flags = 'gu') => new RegExp(START + body, flags);

const SECRET_PATTERNS = [
  startingToken(String.raw`hf_[A-Za-z0-9]{30,}\b`),
  startingToken(String.raw`gh[pousr]_[A-Za-z0-9]{36,}\b`),
  startingToken(String.raw`github_pat_[A-Za-z0-9_]{50,}\b`),
  startingToken(String.raw`(?:AKIA|ASIA)[0-9A-Z]{16}\b`),
  startingToken(String.raw`xox[abprs]-[A-Za-z0-9-]{10,}`),
  startingToken(String.raw`sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}`),
  startingToken(String.raw`nvapi-[A-Za-z0-9_-]{20,}`),
  // A JWT: base64url `{"…` header and payload, then a signature (e.g. HF Xet access tokens).
  startingToken(String.raw`eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`),
];
/** `Authorization: Bearer|Basic|Token <value>`, and a bare `Bearer` with a long token. */
const AUTHORIZATION = startingToken(
  String.raw`(?<prefix>(?:authorization["']?[ \t]{0,4}[:=][ \t]{0,4}["']?(?:bearer|basic|token)|bearer(?=[ \t]{1,4}[A-Za-z0-9._~+/-]{20}))[ \t]{1,4})[^\s"',;]{8,}`,
  'giu',
);
/** `HF_TOKEN=…`, `"OPENAI_API_KEY": "…"` and the like; `sanitizeAssignment` skips placeholders. */
const SECRET_ASSIGNMENT = startingToken(
  String.raw`(?<prefix>[A-Z][A-Z0-9_]{0,63}_(?:TOKEN|API_?KEY|SECRET(?:_KEY)?|ACCESS_KEY|PASSWORD|PASSWD)["']?[ \t]{0,4}[=:][ \t]{0,4}["']?)(?<value>[^\s"',;}]{8,})`,
);
const PLACEHOLDER_VALUE = /^(?:[$<{%*[]|(?:none|null|true|false|unset|changeme|x+|\d+)$)/iu;
/** `scheme://user:password@`, also JSON-escaped as `https:\/\/user:password@`. */
const URL_PASSWORD = startingToken(
  String.raw`(?<userinfo>[A-Za-z][A-Za-z0-9+.-]{0,31}:(?:\/\/|\\\/\\\/)[^\s:/@"',;<>\\]*:)[^\s@/"',;<>]+@`,
);
const LABEL = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?`;
/**
 * An email address with a letters-only TLD, so `pkg@1.2.3`, `root@node-12` and `img@sha256:…`
 * stay. Userinfo right after `://`, scp-style remotes (`git@github.com:org/repo`) and calls such as
 * `q@k.transpose(…)` stay, and the domain must end where the match does, so a remote's host is never
 * cut short to look like one. `sanitizeEmail` keeps internal TLDs.
 */
const EMAIL = new RegExp(
  String.raw`(?:(?<![A-Za-z0-9._%+\\-])(?<!\x1b\[[0-9;]{0,16})|${AFTER_ESCAPE})(?<!:\/\/)` +
    String.raw`[A-Za-z0-9._%+-]{1,64}@${LABEL}(?:\.${LABEL}){0,8}\.[A-Za-z]{2,24}` +
    String.raw`(?![A-Za-z0-9_-]|\.[A-Za-z0-9]|:\S|\()`,
  'gu',
);
const INTERNAL_TLD = /\.(?:internal|local|lan|localdomain)$/iu;
const ORACLE_VCN = new RegExp(
  String.raw`\b(?<host>${LABEL})(?:\.[A-Za-z0-9-]{1,63}){0,8}\.oraclevcn\.com\b`,
  'giu',
);
const ORACLE_VCN_HINT = /oraclevcn\.com/iu;
const IPV6 = new RegExp(
  String.raw`(?:(?<![\w:.])|${AFTER_ESCAPE})(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:]|\.\d)`,
  'gu',
);
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
const IPV4 = new RegExp(
  String.raw`(?:(?<![\w.])|${AFTER_ESCAPE})(?:${OCTET}\.){3}${OCTET}(?![\w]|\.\d)`,
  'gu',
);
const VERSION_OPERATORS = ['==', '!=', '>=', '<=', '~='];
const PACKAGE_NAME_SUFFIX = /[A-Za-z0-9]-$/u;
/** pip ends this line with the installed version in parentheses, `… (9.19.0.56)`. */
const PIP_SATISFIED = 'Requirement already satisfied:';
/**
 * The package column before a version column in `pip list`, `conda list` or torch's
 * `[conda]`/`[pip3]` environment dump: a name with `-` or `_` padded by two or more spaces.
 */
const PACKAGE_TABLE_ROW =
  /^(?:\[(?:conda|pip3?)\][ \t]+[A-Za-z0-9][A-Za-z0-9._+-]*[-_][A-Za-z0-9._+-]*[ \t]+|[A-Za-z0-9][A-Za-z0-9._+-]*[-_][A-Za-z0-9._+-]*[ \t]{2,})$/u;
/** Line rules look this far back, so a huge single-line file costs a bounded slice per match. */
const LINE_WINDOW = 1024;
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

/** Text from the start of the line to `start`, or null when the line is longer than the window. */
function linePrefix(text: string, start: number): string | null {
  const from = Math.max(0, start - LINE_WINDOW);
  const window = text.slice(from, start);
  const newline = window.lastIndexOf('\n');
  if (newline !== -1) return window.slice(newline + 1);
  return from === 0 ? window : null;
}

function isVersionContext(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 2), start);
  if (VERSION_OPERATORS.includes(before) || PACKAGE_NAME_SUFFIX.test(before)) return true;
  const open = text[start - 1];
  const close = text[end];
  if (open === '(' && close === ')') {
    if (linePrefix(text, start)?.includes(PIP_SATISFIED)) return true;
  } else if ((open === ' ' || open === '\t') && (close === undefined || WHITESPACE.test(close))) {
    const prefix = linePrefix(text, start);
    if (prefix !== null && PACKAGE_TABLE_ROW.test(prefix)) return true;
  }
  if (close !== '"') return false;
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
  out = out.replaceAll(AUTHORIZATION, `$<prefix>${REDACTED}`);
  out = out.replaceAll(SECRET_ASSIGNMENT, (match: string, prefix: string, value: string) =>
    PLACEHOLDER_VALUE.test(value) ? match : prefix + REDACTED,
  );
  out = out.replaceAll(URL_PASSWORD, `$<userinfo>${REDACTED}@`);
  if (out.includes('@')) {
    out = out.replaceAll(EMAIL, (match: string) => (INTERNAL_TLD.test(match) ? match : REDACTED));
  }
  if (ORACLE_VCN_HINT.test(out)) out = out.replaceAll(ORACLE_VCN, `$<host>.${REDACTED}`);
  out = out.replaceAll(IPV6, sanitizeIpv6);
  return out.replaceAll(IPV4, (match: string, start: number, whole: string) =>
    sanitizeIpv4(match, start, whole),
  );
}
