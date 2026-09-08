import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { before } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite } from './packed-skill.mjs';
import { POWERX_BUNDLE_VARIANTS } from './bundle-fixtures.mjs';

function files(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? [path, ...files(root, path)] : [path];
  });
}

function readResult(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const bytes = readFileSync(join(directory, manifest.result.path));
  return manifest.result.format === 'json' ? JSON.parse(bytes) : bytes.toString('utf8');
}

function defaultFixtures() {
  return {
    powerx: Object.fromEntries(
      Object.entries(POWERX_BUNDLE_VARIANTS).map(([name, fixture]) => [
        name,
        {
          args: ['powerx', 'export', '--model', 'GLM-5', '--isl', '8192', '--osl', '1024'],
          responses: [
            {
              operation: 'benchmarks',
              url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5&powerValid=strictV2',
              body: fixture.rows,
              status: 200,
            },
          ],
          expected: fixture.expected,
        },
      ]),
    ),
  };
}

export function bundleSuite(fixtures = {}) {
  const suite = packedSkillSuite();
  const registered = { ...defaultFixtures(), ...fixtures };
  let installed;
  let fixturePreload;
  let offlinePreload;

  before(() => {
    installed = suite.install('codex');
    fixturePreload = join(suite.temporaryRoot, 'bundle-response.mjs');
    offlinePreload = join(suite.temporaryRoot, 'bundle-offline.mjs');
    writeFileSync(
      fixturePreload,
      `
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_BUNDLE_FIXTURE, 'utf8'));
let cursor = 0;
let truncated = false;
globalThis.fetch = async (input) => {
  const url = String(input.url ?? input);
  const operation = new URL(url).pathname.split('/').at(-1);
  appendFileSync(process.env.INFERENCEX_BUNDLE_REQUESTS, JSON.stringify({ operation, url }) + '\\n');
  const expected = fixture.responses[cursor];
  if (!expected) throw new Error('Unexpected extra request ' + operation + ' ' + url);
  if (expected.operation !== operation || expected.url !== url) {
    throw new Error('Request mismatch: expected ' + expected.operation + ' ' + expected.url + '; received ' + operation + ' ' + url);
  }
  if (fixture.truncateOnce && !truncated) {
    truncated = true;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(expected.body).slice(0, 32)));
        setImmediate(() => controller.error(Object.assign(new Error('fixture stream reset'), { code: 'ECONNRESET' })));
      },
    }), { status: expected.status ?? 200, headers: { 'content-type': 'application/json' } });
  }
  cursor++;
  return new Response(JSON.stringify(expected.body), {
    status: expected.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
};
`,
    );
    writeFileSync(
      offlinePreload,
      `globalThis.fetch = () => { throw new Error('offline verification attempted network access'); };\n`,
    );
  });

  function command(preload, args, cwd, env = {}) {
    return suite.node(
      ['--import', pathToFileURL(preload).href, join(installed, 'scripts/inferencex.mjs'), ...args],
      { cwd, env: { ...suite.environment, ...env } },
    );
  }

  function create(kind, variant, { format, policy = [], truncateOnce = false } = {}) {
    const selected = registered[kind]?.[variant];
    assert.ok(selected, `unknown ${kind} bundle fixture: ${variant}`);
    const cwd = suite.project('bundle case-');
    const directory = join(cwd, 'evidence');
    const fixture = join(cwd, 'fixture.json');
    const requestPath = join(cwd, 'requests.txt');
    writeFileSync(fixture, JSON.stringify({ responses: selected.responses, truncateOnce }));
    const result = command(
      fixturePreload,
      [
        ...selected.args,
        ...(format === undefined ? [] : ['--format', format]),
        '--output-dir',
        directory,
        ...policy,
      ],
      cwd,
      {
        INFERENCEX_BUNDLE_FIXTURE: fixture,
        INFERENCEX_BUNDLE_REQUESTS: requestPath,
      },
    );
    assert.ok([0, 3].includes(result.status), `${result.stdout}\n${result.stderr}`);
    const requests = existsSync(requestPath)
      ? readFileSync(requestPath, 'utf8').trimEnd().split('\n').filter(Boolean).map(JSON.parse)
      : [];
    return { directory, requests, expected: selected.expected, result };
  }

  function verify(directory, args = []) {
    return command(offlinePreload, ['verify', directory, ...args], suite.project('verify case-'));
  }

  function invoke(args, { offline = false, cwd = suite.project('invoke case-'), env = {} } = {}) {
    return command(offline ? offlinePreload : fixturePreload, args, cwd, env);
  }

  function fingerprint(directory) {
    return files(directory)
      .map((path) => {
        const entry = lstatSync(path);
        const bytes = entry.isFile() ? readFileSync(path) : Buffer.alloc(0);
        return {
          path: relative(directory, path).split('\\').join('/'),
          mode: entry.mode,
          size: entry.size,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
      })
      .toSorted((left, right) => left.path.localeCompare(right.path));
  }

  return { create, verify, fingerprint, invoke, readResult };
}
