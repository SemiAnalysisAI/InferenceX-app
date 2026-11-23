// Post-deploy smoke check. It requests a deployment's key APIs, pages and share images with a
// raw HTTP client that never decompresses on its own, so a body whose bytes disagree with its
// Content-Encoding header fails here the way it fails in a browser. `scripts/smoke-check.ts` is the
// command line entry, and docs/testing.md describes what it covers.
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { setTimeout as sleep } from 'node:timers/promises';
import zlib from 'node:zlib';

import type { AvailabilityRow } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { getAllChipPages } from '@/lib/catalog/chip-pages';
import { prerenderedCompareSlugs } from '@/lib/compare/compare-availability';
import {
  getAllComparablePrecisionSlugs,
  getAllComparableSpecDecodeSlugs,
} from '@/lib/compare/compare-variant-availability';
import { COMPARE_MODEL_SLUGS, parseCompareSlug } from '@/lib/compare/compare-slug';
import {
  canonicalPrecisionCompareSlug,
  canonicalSpecDecodeCompareSlug,
} from '@/lib/compare/compare-variant-slug';
import { getAllRankingPageEntries, rankingPageHeading } from '@/lib/live-seo/rankings';
import { getAllRunPageEntries, runPageHeading } from '@/lib/live-seo/run-pages';
import { DEFAULT_INFERENCE_MODEL_SLUG } from '@/lib/routing/inference-model-redirects';
import { getInferenceModelBySlug, inferenceModelPath } from '@/lib/routing/inference-model-slug';
import { isFeatureGatedModelPath } from '@/lib/routing/model-feature-visibility';

export type AcceptedEncoding = 'br' | 'gzip' | 'identity';

/** Accept-Encoding a page or image request sends. It covers both codings the server offers. */
export const BROWSER_ENCODINGS: readonly AcceptedEncoding[] = ['br', 'gzip'];

export const SMOKE_USER_AGENT = 'inferencex-smoke-check/1';

export const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

/**
 * Titles `src/app/error.tsx` renders. React does not run error boundaries during server
 * rendering, so today they only appear after hydration. They are checked in case a later Next.js
 * release renders the boundary on the server. `smoke-check.test.ts` keeps this list in sync.
 */
export const ERROR_BOUNDARY_TITLES: readonly string[] = ['Something Went Wrong', '页面出了点问题'];

export interface JsonShape {
  type: 'array' | 'object';
  /** An array must hold at least one item. */
  nonEmpty?: boolean;
  /** Keys the object, or the first array item, must have. */
  keys?: readonly string[];
}

export interface JsonCheck {
  kind: 'json';
  path: string;
  encoding: AcceptedEncoding;
  shape: JsonShape;
}

export interface PageCheck {
  kind: 'page';
  path: string;
  /** Pathname the redirects must end on, when it differs from `path`. */
  finalPath?: string;
  /** Raw HTML fragments the page must contain, besides the shared header, footer and h1. */
  contains: readonly string[];
}

export interface PngCheck {
  kind: 'png';
  path: string;
}

export type SmokeCheck = JsonCheck | PageCheck | PngCheck;

export interface HttpResponse {
  /** URL that answered, after any redirects. */
  url: string;
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface CheckResult {
  check: SmokeCheck;
  label: string;
  problems: string[];
  status?: number;
  ms: number;
  /** Decoded size. */
  bytes?: number;
  /** Parsed body of a JSON check that passed. */
  json?: unknown;
}

/** A transport failure (DNS, refused or reset connection, timeout). Only these are retried. */
export class NetworkError extends Error {
  override name = 'NetworkError';
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export interface GetOptions {
  headers: Record<string, string>;
  timeoutMs: number;
  followRedirects: boolean;
}

function getOnce(url: URL, headers: Record<string, string>, timeoutMs: number) {
  const { promise, resolve, reject } = Promise.withResolvers<HttpResponse>();
  const client = url.protocol === 'https:' ? https : http;
  const request = client.get(url, { headers }, (response) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('error', (error) => reject(new NetworkError(error.message)));
    response.on('end', () =>
      resolve({
        url: url.href,
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }),
    );
  });
  // A deadline for the whole exchange, body included.
  const deadline = setTimeout(
    () => request.destroy(new NetworkError(`no complete response within ${timeoutMs} ms`)),
    timeoutMs,
  );
  request.on('error', (error) =>
    reject(error instanceof NetworkError ? error : new NetworkError(error.message)),
  );
  return promise.finally(() => clearTimeout(deadline));
}

/**
 * GET without automatic decompression. Redirects are followed only within the origin, so the
 * protection bypass header never leaves the deployment.
 */
export async function rawGet(url: string, options: GetOptions): Promise<HttpResponse> {
  let current = new URL(url);
  for (let hop = 0; ; hop++) {
    const response = await getOnce(current, options.headers, options.timeoutMs);
    const location = response.headers.location;
    if (!options.followRedirects || !REDIRECT_STATUSES.has(response.status) || !location) {
      return response;
    }
    if (hop === MAX_REDIRECTS) {
      throw new Error(`more than ${MAX_REDIRECTS} redirects from ${url}`);
    }
    const next = new URL(location, current);
    if (next.origin !== current.origin) {
      throw new Error(`redirected off the deployment to ${next.href}`);
    }
    current = next;
  }
}

/** Runs `attempt`, repeating it after a network error only. A wrong answer is never retried. */
export async function withNetworkRetry<T>(
  attempt: () => Promise<T>,
  retries: number,
  delayMs: number,
): Promise<T> {
  for (let tries = 0; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof NetworkError) || tries >= retries) throw error;
      await sleep(delayMs);
    }
  }
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return (Array.isArray(value) ? value.join(', ') : (value ?? '')).trim();
}

const GZIP_MAGIC = Buffer.from('1f8b', 'hex');
const ZSTD_MAGIC = Buffer.from('28b52ffd', 'hex');

function decompress(body: Buffer, coding: string): Buffer {
  switch (coding) {
    case 'gzip':
    case 'x-gzip': {
      return zlib.gunzipSync(body);
    }
    case 'br': {
      return zlib.brotliDecompressSync(body);
    }
    case 'deflate': {
      return zlib.inflateSync(body);
    }
    case 'zstd': {
      return zlib.zstdDecompressSync(body);
    }
    default: {
      throw new Error(`unknown coding ${coding}`);
    }
  }
}

/** Starts like JSON, HTML or a PNG, the bodies this check expects. */
function looksUncompressed(body: Buffer): boolean {
  if (body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return true;
  const first = body.toString('latin1').trimStart()[0];
  return first === undefined || '{["<'.includes(first);
}

/** The coding a body actually decodes with, when it is compressed at all. */
export function sniffCompression(body: Buffer): string | null {
  if (body.subarray(0, 2).equals(GZIP_MAGIC)) return 'gzip';
  if (body.subarray(0, 4).equals(ZSTD_MAGIC)) return 'zstd';
  if (looksUncompressed(body)) return null;
  try {
    zlib.brotliDecompressSync(body);
    return 'br';
  } catch {
    return null;
  }
}

export interface DecodeResult {
  body?: Buffer;
  problems: string[];
}

/** Decodes the body by its Content-Encoding and reports any disagreement with the bytes. */
export function decodeBody(
  response: Pick<HttpResponse, 'headers' | 'body'>,
  accepted: readonly AcceptedEncoding[],
): DecodeResult {
  const coding = header(response.headers, 'content-encoding').toLowerCase() || 'identity';
  const asked = accepted.join(', ');
  if (coding === 'identity') {
    const actual = sniffCompression(response.body);
    if (actual) {
      return {
        problems: [
          `the body is ${actual}-compressed but the response has no Content-Encoding header (asked for ${asked}), so clients cannot decode it`,
        ],
      };
    }
    return { body: response.body, problems: [] };
  }
  const normalized = coding === 'x-gzip' ? 'gzip' : coding;
  if (!accepted.includes(normalized as AcceptedEncoding)) {
    return {
      problems: [`Content-Encoding is ${coding}, which the request did not accept (${asked})`],
    };
  }
  try {
    return { body: decompress(response.body, normalized), problems: [] };
  } catch {
    const actual = sniffCompression(response.body);
    const found = actual
      ? `${actual}-compressed`
      : looksUncompressed(response.body)
        ? 'uncompressed'
        : 'not decodable';
    return { problems: [`Content-Encoding is ${coding} but the body is ${found}`] };
  }
}

export function jsonShapeProblems(value: unknown, shape: JsonShape): string[] {
  if (shape.type === 'array') {
    if (!Array.isArray(value)) return [`expected a JSON array, got ${describe(value)}`];
    if (value.length === 0) return shape.nonEmpty ? ['expected a non-empty JSON array'] : [];
    return missingKeys(value[0], shape.keys, 'the first item');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [`expected a JSON object, got ${describe(value)}`];
  }
  return missingKeys(value, shape.keys, 'the object');
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
}

function missingKeys(value: unknown, keys: readonly string[] | undefined, what: string): string[] {
  if (!keys?.length) return [];
  if (value === null || typeof value !== 'object') {
    return [`${what} is ${describe(value)}, expected an object with ${keys.join(', ')}`];
  }
  const missing = keys.filter((key) => !(key in value));
  return missing.length > 0 ? [`${what} is missing ${missing.join(', ')}`] : [];
}

/** Escapes text the way React writes it into HTML. */
export function escapeHtmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

const SHARED_PAGE_MARKERS = ['data-testid="header"', 'data-testid="footer"', '<h1'];

/**
 * Signs that rendering failed. Next serves a failed shell as `<html id="__next_error__">`. An
 * error inside a Suspense boundary leaves a `<template data-dgst="…">` carrying the error digest,
 * and the browser then renders `error.tsx`. Client-side rendering bailouts leave an empty digest
 * or `BAILOUT_TO_CLIENT_SIDE_RENDERING`, which are normal.
 */
export function pageErrorMarkers(html: string): string[] {
  const found: string[] = [];
  if (html.includes('id="__next_error__"')) found.push('the Next.js error document');
  for (const title of ERROR_BOUNDARY_TITLES) {
    if (html.includes(title)) found.push(`the error boundary title "${title}"`);
  }
  const digests = new Set<string>();
  for (const match of html.matchAll(/data-dgst="(?<digest>[^"]*)"/g)) {
    const digest = match.groups!.digest!;
    if (digest && digest !== 'BAILOUT_TO_CLIENT_SIDE_RENDERING') digests.add(digest);
  }
  for (const digest of digests) found.push(`a server render error (digest ${digest})`);
  return found;
}

function bodySnippet(body: Buffer): string {
  const text = looksUncompressed(body) ? body.toString('utf8') : '';
  const snippet = text.replaceAll(/\s+/g, ' ').trim().slice(0, 160);
  return snippet ? ` (${snippet})` : '';
}

/** Problems with Cache-Control. APIs and images must be publicly cacheable, and no page private. */
export function cacheControlProblems(value: string, kind: SmokeCheck['kind']): string[] {
  const directives = new Set(
    value
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim().split('=')[0]),
  );
  const problems: string[] = [];
  if (!value) return [`no Cache-Control header`];
  for (const forbidden of ['private', 'no-store']) {
    if (directives.has(forbidden))
      problems.push(`Cache-Control is "${value}", which contains ${forbidden}`);
  }
  if (kind !== 'page' && !directives.has('public')) {
    problems.push(`Cache-Control is "${value}", expected public caching`);
  }
  return problems;
}

/** Everything wrong with a response to `check`, plus the parsed body of a JSON check. */
export function evaluateResponse(
  check: SmokeCheck,
  response: HttpResponse,
): { problems: string[]; bytes?: number; json?: unknown } {
  if (response.status !== 200) {
    return { problems: [`HTTP ${response.status}, expected 200${bodySnippet(response.body)}`] };
  }
  const problems: string[] = [];
  if (check.kind === 'page') {
    const expected = check.finalPath ?? check.path;
    const finalPath = new URL(response.url).pathname;
    if (finalPath !== expected) problems.push(`ended on ${finalPath}, expected ${expected}`);
  }
  const contentType = header(response.headers, 'content-type').toLowerCase();
  const expectedType = { json: 'application/json', page: 'text/html', png: 'image/png' }[
    check.kind
  ];
  if (!contentType.startsWith(expectedType)) {
    problems.push(`Content-Type is "${contentType}", expected ${expectedType}`);
  }
  problems.push(...cacheControlProblems(header(response.headers, 'cache-control'), check.kind));

  const decoded = decodeBody(
    response,
    check.kind === 'json' ? [check.encoding] : BROWSER_ENCODINGS,
  );
  problems.push(...decoded.problems);
  const body = decoded.body;
  if (!body) return { problems };

  if (check.kind === 'png') {
    if (!body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      problems.push('the body does not start with the PNG signature');
    }
    return { problems, bytes: body.length };
  }
  if (check.kind === 'page') {
    const html = body.toString('utf8');
    for (const marker of pageErrorMarkers(html)) problems.push(`the page contains ${marker}`);
    for (const fragment of [...SHARED_PAGE_MARKERS, ...check.contains]) {
      if (!html.includes(fragment)) problems.push(`the page is missing ${fragment}`);
    }
    return { problems, bytes: body.length };
  }
  let json: unknown;
  try {
    json = JSON.parse(body.toString('utf8'));
  } catch (error) {
    problems.push(`the body is not valid JSON (${(error as Error).message})${bodySnippet(body)}`);
    return { problems, bytes: body.length };
  }
  problems.push(...jsonShapeProblems(json, check.shape));
  return { problems, bytes: body.length, json: problems.length > 0 ? undefined : json };
}

export interface RunOptions {
  /** Extra request headers, such as the Vercel protection bypass. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export async function runCheck(
  origin: string,
  check: SmokeCheck,
  options: RunOptions = {},
): Promise<CheckResult> {
  const label =
    check.kind === 'json'
      ? `${check.path} [${check.encoding}]`
      : check.kind === 'page' && check.finalPath
        ? `${check.path} -> ${check.finalPath}`
        : check.path;
  const encodings = check.kind === 'json' ? [check.encoding] : BROWSER_ENCODINGS;
  const headers = {
    'user-agent': SMOKE_USER_AGENT,
    'accept-encoding': encodings.join(', '),
    ...options.headers,
  };
  const start = performance.now();
  try {
    const response = await withNetworkRetry(
      () =>
        rawGet(new URL(check.path, origin).href, {
          headers,
          timeoutMs: options.timeoutMs ?? 20_000,
          followRedirects: check.kind === 'page',
        }),
      options.retries ?? 1,
      options.retryDelayMs ?? 1000,
    );
    const ms = Math.round(performance.now() - start);
    return { check, label, status: response.status, ms, ...evaluateResponse(check, response) };
  } catch (error) {
    const ms = Math.round(performance.now() - start);
    return { check, label, ms, problems: [(error as Error).message] };
  }
}

/** Runs the checks with at most `concurrency` requests in flight, keeping their order. */
export async function runChecks(
  origin: string,
  checks: readonly SmokeCheck[],
  options: RunOptions & { concurrency?: number } = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = Array.from({ length: checks.length });
  let next = 0;
  const worker = async () => {
    while (next < checks.length) {
      const index = next++;
      results[index] = await runCheck(origin, checks[index]!, options);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(options.concurrency ?? 6, checks.length) }, worker),
  );
  return results;
}

/** Each API is requested once per coding, because the CDN caches every coding separately. */
const API_ENCODINGS: readonly AcceptedEncoding[] = ['br', 'gzip', 'identity'];

function apiChecks(path: string, shape: JsonShape): JsonCheck[] {
  return API_ENCODINGS.map((encoding) => ({ kind: 'json', path, encoding, shape }));
}

export const AVAILABILITY_PATH = '/api/v1/availability';

/** Availability goes first, because the other targets are derived from its rows. */
export function availabilityChecks(): JsonCheck[] {
  return apiChecks(AVAILABILITY_PATH, {
    type: 'array',
    nonEmpty: true,
    keys: ['model', 'hardware', 'precision', 'spec_method', 'date'],
  });
}

function defaultInferenceModel() {
  const entry = getInferenceModelBySlug(DEFAULT_INFERENCE_MODEL_SLUG);
  if (!entry)
    throw new Error(
      `DEFAULT_INFERENCE_MODEL_SLUG ${DEFAULT_INFERENCE_MODEL_SLUG} is not an Inference model`,
    );
  return entry;
}

/** Newest run date of the default model, or of any model when it has none. */
export function latestRunDate(rows: readonly AvailabilityRow[]): string | null {
  const dbKeys = new Set(
    COMPARE_MODEL_SLUGS.find((entry) => entry.slug === DEFAULT_INFERENCE_MODEL_SLUG)?.dbKeys,
  );
  let latest: string | null = null;
  let latestAny: string | null = null;
  for (const row of rows) {
    if (!latestAny || row.date > latestAny) latestAny = row.date;
    if (dbKeys.has(row.model) && (!latest || row.date > latest)) latest = row.date;
  }
  return latest ?? latestAny;
}

/** Checks that need no data from the deployment. */
export function staticChecks(): SmokeCheck[] {
  const model = defaultInferenceModel();
  const inferencePath = inferenceModelPath(model.slug);
  const barePath = inferencePath.slice(0, inferencePath.lastIndexOf('/'));
  const landing = ['data-testid="intro-section"'];
  const chart = ['data-testid="inference-chart-display"'];
  return [
    ...apiChecks('/api/v1/availability/compact', {
      type: 'object',
      keys: ['models', 'hardware', 'dates', 'lines'],
    }),
    ...apiChecks('/api/v1/overview', { type: 'object', keys: ['models', 'tier'] }),
    ...apiChecks('/api/v1/reliability', {
      type: 'array',
      nonEmpty: true,
      keys: ['date', 'hardware', 'n_success', 'total'],
    }),
    ...apiChecks(`/api/v1/benchmarks?${new URLSearchParams({ model: model.model })}`, {
      type: 'array',
      keys: ['model', 'hardware', 'precision', 'metrics', 'date'],
    }),
    ...apiChecks('/api/v1/datasets', { type: 'array', keys: ['slug', 'label'] }),
    ...apiChecks('/api/v1/benchmark-presence', { type: 'object', keys: ['trace', 'log'] }),
    { kind: 'page', path: '/', contains: landing },
    { kind: 'page', path: '/zh', contains: landing },
    // The bare route redirects to the featured model, so this covers both.
    { kind: 'page', path: barePath, finalPath: inferencePath, contains: chart },
    { kind: 'page', path: `/zh${inferencePath}`, contains: chart },
    { kind: 'page', path: '/blog', contains: ['data-testid="blog-index-page"'] },
  ];
}

/**
 * Checks whose slugs come from the deployment's availability rows, picked the way the build
 * picks prerendered pages. A deployment without comparable chips yields none.
 */
export async function derivedChecks(rows: readonly AvailabilityRow[]): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const date = latestRunDate(rows);
  if (date) {
    checks.push(
      ...apiChecks(`/api/v1/workflow-info?${new URLSearchParams({ date })}`, {
        type: 'object',
        keys: ['runs', 'changelogs', 'configs', 'runConfigs'],
      }),
    );
  }
  const [compareSlug] = prerenderedCompareSlugs(rows, 1);
  const compare = compareSlug ? parseCompareSlug(compareSlug) : null;
  if (compare) {
    const modelSlug = compare.model.slug;
    checks.push(
      {
        kind: 'page',
        path: `/compare/${compareSlug}`,
        contains: ['data-testid="compare-narrative"'],
      },
      { kind: 'png', path: `/compare-per-dollar/${compareSlug}/performance-per-dollar.png` },
    );
    const chip = getAllChipPages().find((page) => page.hwKey === compare.a);
    const run = getAllRunPageEntries().find(
      (entry) => entry.model.slug === modelSlug && entry.chip.slug === chip?.slug,
    );
    if (run) {
      checks.push({
        kind: 'page',
        path: `/run/${run.slug}`,
        contains: [escapeHtmlText(runPageHeading(run))],
      });
    }
    const ranking = getAllRankingPageEntries().find((entry) => entry.model.slug === modelSlug);
    if (ranking) {
      checks.push({
        kind: 'page',
        path: `/rankings/${ranking.slug}`,
        contains: [escapeHtmlText(rankingPageHeading(ranking))],
      });
    }
  }
  // Prefer the compare page's model, then any public one.
  const preferred = <T extends { modelSlug: string }>(items: T[]) =>
    items.toSorted(
      (x, y) =>
        Number(y.modelSlug === compare?.model.slug) - Number(x.modelSlug === compare?.model.slug),
    );
  const precision = preferred(await getAllComparablePrecisionSlugs(rows))
    .map(
      ({ modelSlug, gpu, precA, precB }) =>
        `/compare-precision/${canonicalPrecisionCompareSlug(modelSlug, gpu, precA, precB)}`,
    )
    .find((path) => !isFeatureGatedModelPath(path));
  if (precision) checks.push({ kind: 'png', path: `${precision}/precision-comparison.png` });
  const specDecode = preferred(await getAllComparableSpecDecodeSlugs(rows))
    .map(
      ({ modelSlug, gpu, precision: prec, method }) =>
        `/compare-spec-decode/${canonicalSpecDecodeCompareSlug(modelSlug, gpu, prec, method)}`,
    )
    .find((path) => !isFeatureGatedModelPath(path));
  if (specDecode) checks.push({ kind: 'png', path: `${specDecode}/spec-decode-comparison.png` });
  return checks;
}

/** Escapes a GitHub Actions workflow command message. */
export function escapeAnnotation(message: string): string {
  return message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}
