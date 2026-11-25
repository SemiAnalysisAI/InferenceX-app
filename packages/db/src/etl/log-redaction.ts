import { isIPv6 } from 'node:net';

/**
 * Sanitization shared with InferenceX's Python uploader (test vectors in
 * `log-redaction.vectors.json`). Every class here is ASCII-only, so the Python port compiles its
 * patterns with `re.ASCII`, and its variable-length lookbehinds need the `regex` module.
 */

export const REDACTED = '***REDACTED***';

/**
 * The introducer of an ANSI CSI sequence: the ESC character, or its escaped spelling in a repr
 * or JSON (`\x1b`, `\u001b`, `\033`), then `[`.
 */
const CSI_INTRO = String.raw`(?:\x1b|\\x1b|\\u001b|\\033)\[`;
/**
 * Lookbehind for a token that may follow an ANSI CSI sequence (colour `\x1b[0m`, erase `\x1b[2K`,
 * cursor `\x1b[1A`, all ending in a letter) or an escaped `\n`, `\r` or `\t`, as well as a
 * non-word character.
 */
const AFTER_ESCAPE = String.raw`(?<=${CSI_INTRO}[0-9;?]{0,16}[A-Za-z]|\\[nrt])`;
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
/** `Authorization: Bearer|Basic|Token <value>`, quoted or JSON-escaped. */
const AUTHORIZATION = startingToken(
  String.raw`(?<prefix>authorization\\?["']?[ \t]{0,4}[:=][ \t]{0,4}\\?["']?(?:bearer|basic|token)[ \t]{1,4})[^\s"',;\\]{8,}`,
  'giu',
);
/** A bare `Bearer <value>`; `sanitizeBearer` keeps values that do not look like tokens. */
const BEARER = startingToken(
  String.raw`(?<prefix>bearer[ \t]{1,4})(?<value>[A-Za-z0-9._~+/=-]{20,})`,
  'giu',
);
const UPPER_SECRET_KEY = String.raw`(?:TOKEN|API_?KEY|SECRET(?:_KEY)?|ACCESS_KEY|PASSWORD|PASSWD)`;
const LOWER_SECRET_KEY = String.raw`(?:token|api_?key|secret|secret_key|password|passwd)`;
/**
 * `HF_TOKEN=…`, `"OPENAI_API_KEY": "…"`, `\"MY_SECRET_TOKEN\":\"…\"`, lower-case `hf_token=…`,
 * `api_key: …` and the like; `sanitizeSecretValue` keeps placeholders. The match starts at the key
 * word and checks the rest of the key with a lookbehind, which keeps the scan cheap.
 */
const SECRET_ASSIGNMENT = new RegExp(
  String.raw`(?:${UPPER_SECRET_KEY}(?<=${START}(?:[A-Z][A-Z0-9_]{0,63}_)?${UPPER_SECRET_KEY})` +
    String.raw`|${LOWER_SECRET_KEY}(?<=${START}(?:[a-z][a-z0-9]{0,31}_){0,3}${LOWER_SECRET_KEY}))` +
    String.raw`\\?["']?[ \t]{0,4}[=:][ \t]{0,4}\\?["']?(?<value>[^\s"',;}\\]{8,})`,
  'gu',
);
/** `--hf-token <value>`, `--api-key=<value>` and other command-line secrets. */
const SECRET_FLAG = startingToken(
  String.raw`--(?:[a-z0-9]{1,32}-){0,4}(?:token|api-key|secret|password)(?:=|[ \t]{1,4})["']?(?<value>[^\s"',;}\\]{8,})`,
);
const PLACEHOLDER_VALUE = /^(?:[$<{%*[]|(?:none|null|true|false|unset|changeme|x+|[\d.]+)$)/iu;
/**
 * `scheme://user:password@`, also JSON-escaped as `https:\/\/user:password@`. The match starts at
 * the `:` and checks the scheme with a lookbehind, so long runs without `://` cost nothing.
 */
const URL_PASSWORD = new RegExp(
  String.raw`(?<=${START}[A-Za-z][A-Za-z0-9+.-]{0,31})(?<userinfo>:(?:\/\/|\\\/\\\/)[^\s:/@"',;<>\\]*:)[^\s@/"',;<>]+@`,
  'gu',
);
const LABEL = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?`;
/**
 * An email address with a letters-only TLD, so `pkg@1.2.3`, `root@node-12` and `img@sha256:…`
 * stay. Userinfo right after `://`, scp-style remotes (`git@github.com:org/repo`) and calls such as
 * `q@k.transpose(…)` stay, and the domain must end where the match does, so a remote's host is never
 * cut short to look like one. `sanitizeEmail` keeps internal TLDs.
 */
const EMAIL = new RegExp(
  String.raw`(?:(?<![A-Za-z0-9._%+\\-])(?<!${CSI_INTRO}[0-9;?]{0,16})|${AFTER_ESCAPE})(?<!:\/\/)` +
    String.raw`[A-Za-z0-9._%+-]{1,64}@${LABEL}(?:\.${LABEL}){0,8}\.[A-Za-z]{2,24}` +
    String.raw`(?![A-Za-z0-9_-]|\.[A-Za-z0-9]|:\S|\()`,
  'gu',
);
const INTERNAL_TLD = /\.(?:internal|local|lan|localdomain)$/iu;
/** Text with no `@` followed by a dotted domain holds no email, so `EMAIL` is skipped. */
const EMAIL_HINT = /@[A-Za-z0-9-]{1,63}\.[A-Za-z]/u;
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
 * `isVersionContext` also requires a lower-case letter and no address-like word in the name, so
 * aligned key/value lines such as `MASTER_ADDR   203.0.113.7` or `node-a   203.0.113.9` do not pass.
 */
const PACKAGE_TABLE_ROW =
  /^(?:\[(?:conda|pip3?)\][ \t]+(?<listed>[A-Za-z0-9][A-Za-z0-9._+-]*[-_][A-Za-z0-9._+-]*)[ \t]+|(?<name>[A-Za-z0-9][A-Za-z0-9._+-]*[-_][A-Za-z0-9._+-]*)[ \t]{2,})$/u;
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
    const row = prefix === null ? null : PACKAGE_TABLE_ROW.exec(prefix);
    const name = row?.groups?.['listed'] ?? row?.groups?.['name'];
    if (name !== undefined && /[a-z]/u.test(name) && !ADDRESS_KEY.test(name)) return true;
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

/** A bare `Bearer` value is a token unless it is a slash path without digits (`src/auth/…`). */
function sanitizeBearer(match: string, prefix: string, value: string): string {
  return value.includes('/') && !/\d/u.test(value) ? match : prefix + REDACTED;
}

/**
 * Keep placeholders. Lower-case keys and flags also name ordinary settings (`initial-cluster-token`,
 * `bytes_per_full_token`), so their values count as secrets only when they mix letters and digits.
 */
function sanitizeSecretValue(match: string, value: string): string {
  if (PLACEHOLDER_VALUE.test(value)) return match;
  if (!/^[A-Z]/u.test(match) && !(/[A-Za-z]/u.test(value) && /\d/u.test(value))) return match;
  return match.slice(0, match.length - value.length) + REDACTED;
}

/** Sanitize `text`. The output is a fixed point: sanitizing it again changes nothing. */
export function redactText(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replaceAll(pattern, REDACTED);
  out = out.replaceAll(AUTHORIZATION, `$<prefix>${REDACTED}`);
  out = out.replaceAll(BEARER, sanitizeBearer);
  out = out.replaceAll(SECRET_ASSIGNMENT, sanitizeSecretValue);
  out = out.replaceAll(SECRET_FLAG, sanitizeSecretValue);
  out = out.replaceAll(URL_PASSWORD, `$<userinfo>${REDACTED}@`);
  if (EMAIL_HINT.test(out)) {
    out = out.replaceAll(EMAIL, (match: string) => (INTERNAL_TLD.test(match) ? match : REDACTED));
  }
  if (ORACLE_VCN_HINT.test(out)) out = out.replaceAll(ORACLE_VCN, `$<host>.${REDACTED}`);
  out = out.replaceAll(IPV6, sanitizeIpv6);
  return out.replaceAll(IPV4, (match: string, start: number, whole: string) =>
    sanitizeIpv4(match, start, whole),
  );
}
