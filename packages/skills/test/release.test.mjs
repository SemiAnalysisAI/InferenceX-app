import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { PACKAGE, requireUnpublished, verifyArchive, verifyContents } from '../scripts/release.mjs';

test('public verification retries only exact-version ETARGET within its deadline', () => {
  const result = spawnSync('python3', ['-B', 'test/verify-release.test.py'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('release refuses mismatched or existing versions and registry failures', async () => {
  const manifest = { name: PACKAGE, version: '0.3.0' };
  let requests = 0;
  const request = () => {
    requests++;
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  await assert.rejects(requireUnpublished('0.1.0', manifest, request), /differs/);
  await assert.rejects(requireUnpublished('latest', manifest, request), /exact stable version/);
  assert.equal(requests, 0, 'Invalid versions must fail before network access');
  await requireUnpublished('0.3.0', manifest, request);
  for (const [status, message] of [
    [200, /already published/],
    [429, /Cannot establish/],
    [503, /Cannot establish/],
  ]) {
    await assert.rejects(
      requireUnpublished('0.3.0', manifest, () => Promise.resolve(new Response(null, { status }))),
      message,
    );
  }
});

test('release rejects changed bytes and a different reviewed archive', () => {
  const bytes = Buffer.from('exact reviewed archive');
  const record = {
    name: PACKAGE,
    filename: 'package.tgz',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  verifyArchive(record, bytes, record.sha256);
  assert.throws(() => verifyArchive(record, Buffer.from('changed')), /SHA-256 differs/);
  assert.throws(() => verifyArchive(record, bytes, '0'.repeat(64)), /reviewed candidate/);
  assert.throws(() => verifyArchive({ ...record, filename: '../package.tgz' }, bytes), /beside/);
  assert.throws(() => verifyArchive({ ...record, integrity: 'sha512-other' }, bytes), /integrity/);
});

test('release content boundary excludes maintainer tools, tests and hidden files', () => {
  const files = [
    'package.json',
    'README.md',
    'LICENSE',
    'bin/install.mjs',
    'skills/inferencex-api/SKILL.md',
  ];
  verifyContents([...files, 'skills/inferencex-api/references/examples.md']);
  for (const path of [
    'scripts/release.mjs',
    'test/release.test.mjs',
    '.env',
    'skills/inferencex-api/.secret',
  ]) {
    assert.throws(() => verifyContents([...files, path]), /public archive|hidden file/);
  }
  assert.throws(() => verifyContents(files.slice(1)), /missing package.json/);
});

test('public verification decodes gzip HTTP JSON but preserves raw npm tarball bytes', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      String.raw`
import gzip, hashlib, importlib.util, io, json, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
assertions = TestCase()
spec = importlib.util.spec_from_file_location('release_check', 'scripts/verify-release.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
class Response(io.BytesIO):
    status = 200
    def __init__(self, body, headers, url):
        super().__init__(body)
        self.headers, self.url = headers, url
payload = b'{"rows":[{"avg_power_w":0}]}'
compressed = gzip.compress(payload)
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for name, wire, headers, expected in [
        ('compressed.json', compressed, {'Content-Encoding':'gzip','Content-Type':'application/json'}, payload),
        ('plain.json', payload, {'Content-Encoding':'identity','Content-Type':'application/json'}, payload),
        ('package.tgz', compressed, {'Content-Type':'application/gzip'}, compressed),
    ]:
        url = 'https://registry.npmjs.org/' + name
        report = {'requests':[]}
        opener = SimpleNamespace(open=lambda *a, **kw: Response(wire, headers, url))
        with patch.object(check, 'build_opener', return_value=opener):
            assert check.fetch_public(url, root / name, report) == expected
        assert (root / name).read_bytes() == expected
        record = report['requests'][0]
        assert record['content_encoding'] == headers.get('Content-Encoding','identity')
        assert record['wire_sha256'] == hashlib.sha256(wire).hexdigest()
        assert record['sha256'] == hashlib.sha256(expected).hexdigest()
        if headers.get('Content-Encoding') == 'gzip':
            assert Path(record['wire_response_file']).read_bytes() == compressed
            assert json.loads((root / name).read_bytes()) == {'rows':[{'avg_power_w':0}]}
    for encoding, wire in [('br', b'unsupported wire bytes'), ('gzip', b'broken gzip')]:
        url = 'https://registry.npmjs.org/bad-' + encoding
        report = {'requests':[]}
        opener = SimpleNamespace(open=lambda *a, **kw: Response(wire, {'Content-Encoding':encoding}, url))
        with patch.object(check, 'build_opener', return_value=opener):
            with assertions.assertRaises((ValueError, gzip.BadGzipFile), msg='Unsupported or malformed encoding must fail'):
                check.fetch_public(url, root / ('bad-' + encoding), report)
        assert Path(report['requests'][0]['wire_response_file']).read_bytes() == wire
        assert 'response_file' not in report['requests'][0]
`,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 10_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('read-only verification rejects incomplete or altered exports', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      String.raw`
import csv, importlib.util, json, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
assertions = TestCase()
spec = importlib.util.spec_from_file_location('release_check', 'scripts/verify-release.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
url = check.API + '?model=Example&powerValid=strictV2'
args = SimpleNamespace(model='Example', date=None, isl=8192, osl=1024, raw_model=None, strict_url=url,
                       base_url=check.API + '?model=Example', empty_isl=7, empty_osl=13)
row = {'id':'9007199254740993', 'model':'example', 'hardware':'h200', 'date':'2026-01-01',
       'benchmark_type':'single_turn', 'isl':8192, 'osl':1024,
       'metrics': {'power_valid':1, 'power_metric_schema_version':2, 'avg_power_w':0}}
metadata = {'package_version':'0.3.0', 'query_url':url, 'requested_model':'Example',
            'requested_date':None, 'date_selection':'latest', 'benchmark_type':'single_turn',
            'isl':8192, 'osl':1024, 'raw_model':None, 'returned_rows':1, 'selected_rows':1,
            'returned_models':['example'], 'selected_models':['example'],
            'excluded_rows':{'outside_requested_scope':0, 'not_strict_v2':0},
            'retrieved_at':'2026-01-02T00:00:00Z', 'metric_coverage':{}}
for key in check.METRIC_COLUMNS - {'power_valid', 'power_metric_schema_version'}:
    count = int(key == 'avg_power_w')
    metadata['metric_coverage'][key] = {'available_rows':count, 'unavailable_rows':1-count}
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    check.save(root / 'powerx.json', {'metadata':metadata, 'rows':[row]})
    columns = check.CSV_COLUMNS
    record = {key: metadata.get(key) if key in check.REQUEST_COLUMNS else
              row['metrics'].get(key) if key in check.METRIC_COLUMNS else row.get(key) for key in columns}
    def write(headers=columns):
        with (root / 'powerx.csv').open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerow({key:record[key] for key in headers})
    write()
    assert check.check_exports(root, [row], [row], args, '0.3.0')['selected_rows'] == 1
    for key, value in [('prefill_avg_power_w', 0), ('avg_power_w', 1), ('id', '9007199254740992')]:
        old = record[key]
        record[key] = value
        write()
        with assertions.assertRaises(ValueError, msg='Verifier accepted changed ' + key):
            check.check_exports(root, [row], [row], args, '0.3.0')
        record[key] = old
    for headers in [[key for key in columns if key != 'framework'], list(reversed(columns)), columns + ['extra']]:
        record['extra'] = 'not in the published contract'
        write(headers)
        with assertions.assertRaisesRegex(ValueError, 'CSV header', msg='Verifier accepted an incomplete or changed CSV contract'):
            check.check_exports(root, [row], [row], args, '0.3.0')
    assert not check.strict({'metrics': {'power_valid': True, 'power_metric_schema_version':2}})
    assert not check.same_url(url, url + '&date=2026-01-01')
    assert not check.same_url(url, url + '&date=')
available = [{'id':str(i), 'date':'2026-01-01', 'model':'example'} for i in range(6)]
lookup = {'matching_rows':6, 'sample_rows':available[:5], 'query_url':args.base_url,
          'retrieved_at':'2026-01-02T00:00:00Z', 'requested_model':'Example', 'returned_models':['example'],
          'scope':{'date':'latest available', 'benchmark_type':'single_turn', 'isl':8192, 'osl':1024}}
check.check_lookup(lookup, available, args)
for sample in [[available[0]] * 5, list(reversed(available[:5])), available[1:6]]:
    with assertions.assertRaises(ValueError, msg='Verifier accepted repeated or incorrectly ordered lookup observations'):
        check.check_lookup(lookup | {'sample_rows':sample}, available, args)
for key, value in [('query_url',url), ('retrieved_at','2026-01-02T00:00:00'), ('requested_model','Other'),
                   ('returned_models',[]), ('returned_models',['example','example']),
                   ('scope',lookup['scope'] | {'isl':1024}), ('scope',lookup['scope'] | {'date':'2026-01-01'})]:
    with assertions.assertRaises(ValueError, msg='Verifier accepted changed lookup provenance: ' + key):
        check.check_lookup(lookup | {key:value}, available, args)
detail = {'outcome':'no_observations', 'scoped_rows':0, 'rows':[], 'query_url':args.base_url,
          'retrieved_at':'2026-01-02T00:00:00+00:00', 'returned_rows':6,
          'scope':{'requested_model':'Example', 'requested_date':None, 'raw_model':None,
                   'benchmark_type':'single_turn','isl':7,'osl':13},
          'validation_counts':{'invalid':0,'unknown':0,'unsupported_schema':0,'legacy_unverified':0,'strictV2_eligible':0},
          'measurement_counts':{'some_recorded':0,'missing':0}}
check.check_empty_diagnostic({'strict':metadata,'diagnostic':detail}, metadata, 6, args)
for key, value in [('rows',[row]), ('retrieved_at','2026-01-02T00:00:00'), ('validation_counts',{}),
                   ('validation_counts',detail['validation_counts'] | {'invalid':False}),
                   ('validation_counts',detail['validation_counts'] | {'extra':0})]:
    with assertions.assertRaises(ValueError, msg='Verifier accepted changed empty diagnostic evidence: ' + key):
        check.check_empty_diagnostic({'strict':metadata,'diagnostic':detail | {key:value}}, metadata, 6, args)
`,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 10_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
