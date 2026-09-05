"""Read-only candidate/public verification and clean native-agent acceptance preparation.

Python 3 standard library plus Node 24/npm on PATH. Never publishes a package.
"""

import argparse
import base64
import csv
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import ProxyHandler, Request, build_opener

PACKAGE = '@semianalysisai/inferencex-skills'
REGISTRY = 'https://registry.npmjs.org'
API = 'https://inferencex.semianalysis.com/api/v1/benchmarks'
REQUEST_COLUMNS = set('package_version query_url retrieved_at requested_model requested_date date_selection raw_model'.split())
METRIC_COLUMNS = set('power_valid power_metric_schema_version avg_power_w prefill_avg_power_w decode_avg_power_w joules_per_successful_query joules_per_input_token joules_per_output_token joules_per_total_token prefill_joules_per_input_token decode_joules_per_output_token avg_temp_c peak_temp_c avg_util_pct avg_mem_used_mb'.split())
# Independent copy of the public CSV contract, not imported from the exporter under test.
CSV_COLUMNS = '''package_version query_url retrieved_at requested_model requested_date date_selection raw_model
id model hardware framework image precision spec_method benchmark_type isl osl conc disagg is_multinode
offload_mode recipe_fingerprint prefill_tp prefill_ep prefill_dp_attention prefill_num_workers
decode_tp decode_ep decode_dp_attention decode_num_workers num_prefill_gpu num_decode_gpu date
workflow_run_id run_started_at run_url curve_date curve_workflow_run_id curve_run_started_at
power_valid power_metric_schema_version avg_power_w prefill_avg_power_w decode_avg_power_w
joules_per_successful_query joules_per_input_token joules_per_output_token joules_per_total_token
prefill_joules_per_input_token decode_joules_per_output_token avg_temp_c peak_temp_c avg_util_pct avg_mem_used_mb'''.split()
CAPTURE = """import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input.url ?? input);
  if (new URL(url).origin !== 'https://inferencex.semianalysis.com') throw Error('Unexpected origin');
  const response = await originalFetch(input, init);
  const body = Buffer.from(await response.clone().arrayBuffer());
  const prefix = process.env.INFERENCEX_CAPTURE;
  writeFileSync(`${prefix}.response.json`, body);
  writeFileSync(`${prefix}.request.json`, JSON.stringify({query_url:url, status:response.status,
    retrieved_at:new Date().toISOString(), sha256:createHash('sha256').update(body).digest('hex')}, null, 2));
  return response;
};
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same_url(actual, expected):
    a, b = urlsplit(actual), urlsplit(expected)
    return (a.scheme, a.netloc, a.path, parse_qs(a.query, keep_blank_values=True)) == \
        (b.scheme, b.netloc, b.path, parse_qs(b.query, keep_blank_values=True))


def fetch_public(url, destination, report):
    parsed = urlsplit(url)
    require(parsed.scheme == 'https' and parsed.hostname in ['registry.npmjs.org', 'inferencex.semianalysis.com']
            and not parsed.username and not parsed.password, 'Unexpected public URL')
    request = Request(url, headers={'User-Agent': 'InferenceX-skill-release-check', 'Accept-Encoding': 'identity'})
    with build_opener(ProxyHandler({})).open(request, timeout=30) as response:
        require(response.status == 200 and urlsplit(response.url).hostname == parsed.hostname, 'Unexpected HTTP response')
        wire = response.read()
        encoding = (response.headers.get('Content-Encoding') or 'identity').strip().lower()
    request_record = {'query_url': url, 'retrieved_at': now(), 'content_encoding': encoding,
                      'wire_sha256': hashlib.sha256(wire).hexdigest()}
    report['requests'].append(request_record)
    if encoding != 'identity':
        wire_path = destination.with_name(destination.name + '.wire')
        wire_path.write_bytes(wire)
        request_record['wire_response_file'] = str(wire_path)
    require(encoding in ['identity', 'gzip'], f'Unsupported Content-Encoding: {encoding}')
    # Content-Type application/gzip describes a tarball, not HTTP transfer encoding.
    body = gzip.decompress(wire) if encoding == 'gzip' else wire
    destination.write_bytes(body)
    request_record.update(response_file=str(destination), sha256=hashlib.sha256(body).hexdigest())
    return body


def run(command, project, environment, label):
    timeout_error = None
    try:
        result = subprocess.run([str(part) for part in command], cwd=project, env=environment,
                                capture_output=True, text=True, timeout=180)
        returncode = result.returncode
    except subprocess.TimeoutExpired as error:
        result, timeout_error, returncode = error, error, None
    # TimeoutExpired may carry bytes even when subprocess.run(text=True) was used.
    stdout = result.stdout.decode('utf-8', errors='replace') if isinstance(result.stdout, bytes) else result.stdout or ''
    stderr = result.stderr.decode('utf-8', errors='replace') if isinstance(result.stderr, bytes) else result.stderr or ''
    (project / f'{label}.stdout.log').write_text(stdout)
    (project / f'{label}.stderr.log').write_text(stderr)
    with (project / 'commands.jsonl').open('a') as log:
        log.write(json.dumps({'command': [str(part) for part in command], 'cwd': str(project),
                              'completed_at': now(), 'returncode': returncode,
                              'timed_out': timeout_error is not None, 'timeout_seconds': 180}) + '\n')
    if timeout_error is not None:
        raise timeout_error
    require(returncode == 0, f'{label} failed; inspect {project}/{label}.stderr.log')
    return stdout


def scoped(rows, isl, osl, raw_model=None):
    return [row for row in rows if row['benchmark_type'] == 'single_turn' and row['isl'] == isl
            and row['osl'] == osl and (raw_model is None or row['model'] == raw_model)]


def strict(row):
    metrics = row['metrics']
    return finite(metrics.get('power_valid')) and metrics['power_valid'] == 1 and \
        finite(metrics.get('power_metric_schema_version')) and metrics['power_metric_schema_version'] == 2


def check_metadata(metadata, source, args, version, isl=None, osl=None):
    isl, osl = isl or args.isl, osl or args.osl
    scope = scoped(source, isl, osl, args.raw_model)
    selected = [row for row in scope if strict(row)]
    for key, value in {'package_version': version, 'requested_model': args.model,
                       'requested_date': args.date, 'date_selection': 'as-of' if args.date else 'latest',
                       'benchmark_type': 'single_turn', 'isl': isl, 'osl': osl, 'raw_model': args.raw_model,
                       'returned_rows': len(source), 'selected_rows': len(selected),
                       'returned_models': sorted({row['model'] for row in source}),
                       'selected_models': sorted({row['model'] for row in selected}),
                       'excluded_rows': {'outside_requested_scope': len(source) - len(scope),
                                         'not_strict_v2': len(scope) - len(selected)}}.items():
        require(metadata.get(key) == value, f'Metadata mismatch: {key}')
    require(same_url(metadata['query_url'], args.strict_url), 'Query URL differs from requested scope')
    require(datetime.fromisoformat(metadata['retrieved_at'].replace('Z', '+00:00')).tzinfo, 'Missing retrieval timezone')
    required = METRIC_COLUMNS - {'power_valid', 'power_metric_schema_version'}
    require(required <= metadata['metric_coverage'].keys(), 'Missing metric coverage')
    for field in required:
        available = sum(finite(row['metrics'].get(field)) for row in selected)
        require(metadata['metric_coverage'][field] == {'available_rows': available, 'unavailable_rows': len(selected) - available},
                f'Coverage mismatch: {field}')
    return selected


def check_exports(project, json_source, csv_source, args, version):
    document = json.loads((project / 'powerx.json').read_text())
    expected = check_metadata(document['metadata'], json_source, args, version)
    require(expected, 'Positive example has no validated observations; choose another documented workload')
    require(document['rows'] == expected, 'JSON observations differ from complete public response')
    csv_expected = [row for row in scoped(csv_source, args.isl, args.osl, args.raw_model) if strict(row)]
    with (project / 'powerx.csv').open(newline='') as handle:
        reader = csv.DictReader(handle)
        require(reader.fieldnames == CSV_COLUMNS, 'CSV header differs from the complete published column contract')
        records = list(reader)
    require(len(records) == len(csv_expected), 'CSV row count differs from public response')
    for record, row in zip(records, csv_expected):
        for field, cell in record.items():
            if field == 'retrieved_at':
                require(datetime.fromisoformat(cell.replace('Z', '+00:00')).tzinfo, 'Missing CSV retrieval timezone')
                continue
            if field == 'query_url':
                require(same_url(cell, args.strict_url), 'CSV query URL differs')
                continue
            value = row['metrics'].get(field) if field in METRIC_COLUMNS else \
                document['metadata'][field] if field in REQUEST_COLUMNS else row.get(field)
            if finite(value):
                require(float(cell) == value, f'CSV value mismatch: {row["id"]}/{field}')
            else:
                expected_cell = '' if value is None or field in METRIC_COLUMNS else \
                    str(value).lower() if isinstance(value, bool) else str(value)
                require(cell == expected_cell, f'CSV value mismatch: {row["id"]}/{field}')
    return {'selected_rows': len(expected), 'metric_coverage': document['metadata']['metric_coverage']}


def check_lookup(lookup, available, args):
    require(same_url(lookup['query_url'], args.base_url), 'Lookup URL differs from requested scope')
    require(datetime.fromisoformat(lookup['retrieved_at'].replace('Z', '+00:00')).tzinfo, 'Missing lookup retrieval timezone')
    require(lookup['requested_model'] == args.model, 'Lookup requested model differs')
    for key, value in {'date': args.date or 'latest available', 'benchmark_type': 'single_turn',
                       'isl': args.isl, 'osl': args.osl}.items():
        require(lookup['scope'].get(key) == value, f'Lookup scope differs: {key}')
    require(lookup['scope'].get('raw_model') == args.raw_model, 'Lookup raw model scope differs')
    returned_models = lookup['returned_models']
    require(isinstance(returned_models, list) and len(set(returned_models)) == len(returned_models)
            and set(returned_models) == {row['model'] for row in available}, 'Lookup returned model keys differ')
    sample = lookup['sample_rows']
    expected = sorted(available, key=lambda row: row['date'], reverse=True)[:5]
    require(lookup['matching_rows'] == len(available) and len(sample) == len(expected), 'Lookup count mismatch')
    require(len({str(row['id']) for row in sample}) == len(sample), 'Lookup repeats an observation ID')
    # The installed example sorts by observation date descending, retaining API order for ties.
    require(sample == expected, 'Lookup differs from the latest matching observations in stable date order')


def check_empty_diagnostic(diagnostic, empty_metadata, returned_rows, args):
    detail = diagnostic['diagnostic']
    require(diagnostic['strict'] == empty_metadata and detail['outcome'] == 'no_observations' and
            detail['scoped_rows'] == 0 and detail['rows'] == [] and same_url(detail['query_url'], args.base_url),
            'Empty diagnostic differs from public evidence')
    require(datetime.fromisoformat(detail['retrieved_at'].replace('Z', '+00:00')).tzinfo, 'Missing diagnostic retrieval timezone')
    require(detail['scope'] == {'requested_model': args.model, 'requested_date': args.date, 'raw_model': args.raw_model,
            'benchmark_type': 'single_turn', 'isl': args.empty_isl, 'osl': args.empty_osl}, 'Diagnostic changed scope')
    expected_counts = dict.fromkeys(['invalid', 'unknown', 'unsupported_schema', 'legacy_unverified', 'strictV2_eligible'], 0)
    counts = detail['validation_counts']
    require(detail['returned_rows'] == returned_rows and counts == expected_counts
            and all(type(value) is int for value in counts.values())
            and detail['measurement_counts'] == {'some_recorded': 0, 'missing': 0}, 'Diagnostic counts differ')


def prompt(args):
    cutoff = f'as of {args.date}' if args.date else 'using the latest available observations'
    raw = f' Keep only the exact returned model key {args.raw_model}; record this filter as scope.raw_model in lookup.json.' if args.raw_model else ''
    return f'''Use only the installed inferencex-api skill and public HTTP data in this clean project.

For {args.model} {cutoff}, show five latest single-turn benchmark observations with {args.isl} input and {args.osl} output tokens, regardless of power validation. Save lookup.json using the installed lookup example's output shape.{raw} Do not introduce additional filters.

Export validated measured PowerX data for that exact scope to powerx.csv and powerx.json. Explain mean watts per GPU, whole-deployment J/output token, prefill watts per GPU, missing requested metrics, exclusions, and extraction context. Preserve source/configuration details and real zeroes.

Attempt the same validated export for exactly {args.empty_isl} input and {args.empty_osl} output tokens as unavailable.json; save its request report, retain the original result, and use the installed bounded diagnostic guidance to save diagnostic.json and explain availability without changing the requested scope.

There is no repository or database access in this project. Do not read another checkout, call private services, install dependencies, or run benchmarks. Save complete public responses and request URLs with retrieval times locally. Do not assume row counts or reconstruct data from webpage summaries. Write the final explanation to result.md. Keep command output compact.

The complete response files are required deliverables: save the entire unfiltered benchmark response, the entire strict response before local filtering, and the complete diagnostic response under raw-responses/, each with its own URL and retrieval timestamp. The five-row lookup, selected export rows, and diagnostic summary are not substitutes for the original responses. Capture the responses used by this extraction before selecting rows; do not reconstruct them from exported subsets. Before finishing, verify these response files exist alongside result.md.
'''


def check_installed(installed, skill_files, version):
    for name, content in skill_files.items():
        require((installed / name).read_bytes() == content, f'Installed file differs from archive: {name}')
    receipt = json.loads((installed / '.inferencex-skills.json').read_text())
    require(receipt == {'package': PACKAGE, 'version': version}, 'Installed-version receipt differs')
    actual_files = {str(path.relative_to(installed)) for path in installed.rglob('*') if path.is_file()}
    require(actual_files == set(skill_files) | {'.inferencex-skills.json'}, 'Unexpected installed files')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['candidate', 'public', 'agents', 'check-agent'])
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--model', required=True)
    parser.add_argument('--date')
    parser.add_argument('--isl', type=int, required=True)
    parser.add_argument('--osl', type=int, required=True)
    parser.add_argument('--raw-model')
    parser.add_argument('--empty-isl', type=int, default=7)
    parser.add_argument('--empty-osl', type=int, default=13)
    parser.add_argument('--evidence', type=Path, required=True, help='New directory; previous attempts are never overwritten')
    parser.add_argument('--project', type=Path, help='Prepared native-agent project, for check-agent')
    args = parser.parse_args()
    require(args.isl > 0 and args.osl > 0 and args.empty_isl > 0 and args.empty_osl > 0, 'Token counts must be positive')
    if args.date:
        require(datetime.strptime(args.date, '%Y-%m-%d').strftime('%Y-%m-%d') == args.date, 'Use a YYYY-MM-DD cutoff')
    record = json.loads(args.manifest.read_text())
    require(Path(record['filename']).name == record['filename'], 'Archive must be beside its manifest')
    archive = args.manifest.resolve().parent / record['filename']
    body = archive.read_bytes()
    require(record['name'] == PACKAGE and hashlib.sha256(body).hexdigest() == record['sha256'], 'Candidate identity mismatch')
    require('sha512-' + base64.b64encode(hashlib.sha512(body).digest()).decode() == record['integrity'], 'Candidate integrity mismatch')
    with tarfile.open(fileobj=io.BytesIO(body), mode='r:gz') as packed:
        prefix = 'package/skills/inferencex-api/'
        skill_files = {member.name.removeprefix(prefix): packed.extractfile(member).read()
                       for member in packed.getmembers() if member.isfile() and member.name.startswith(prefix)}
    require('SKILL.md' in skill_files, 'Archive is missing its skill')
    args.evidence = args.evidence.resolve()
    args.evidence.mkdir(parents=True)
    query = {'model': args.model}
    if args.date:
        query['date'] = args.date
    args.base_url = API + '?' + urlencode(query)
    args.strict_url = args.base_url + '&powerValid=strictV2'
    report = {'status': 'running', 'mode': args.mode, 'started_at': now(), 'candidate': record,
              'new_benchmark_runs': False, 'requests': [], 'targets': [],
              'scope': {key: getattr(args, key) for key in ['model', 'date', 'isl', 'osl', 'raw_model', 'empty_isl', 'empty_osl']}}
    save(args.evidence / 'verification.json', report)
    try:
        if args.mode == 'check-agent':
            require(args.project is not None, '--project is required for check-agent')
            prepared = json.loads((args.project.parent / 'acceptance.json').read_text())
            require(prepared['candidate']['sha256'] == record['sha256'], 'Agent project belongs to another candidate')
            require(prepared['scope'] == report['scope'], 'Check scope differs from prepared prompt')
            matches = [target for target in prepared['targets'] if Path(target['project']).resolve() == args.project.resolve()]
            require(len(matches) == 1, 'Project was not prepared for this acceptance run')
            installed = args.project / ('.agents' if matches[0]['target'] == 'codex' else '.claude') / 'skills/inferencex-api'
            check_installed(installed, skill_files, record['version'])
            source = json.loads(fetch_public(args.strict_url, args.evidence / 'strict.json', report))
            result = check_exports(args.project, source, source, args, record['version'])
            unfiltered = json.loads(fetch_public(args.base_url, args.evidence / 'unfiltered.json', report))
            available = scoped(unfiltered, args.isl, args.osl, args.raw_model)
            lookup = json.loads((args.project / 'lookup.json').read_text())
            check_lookup(lookup, available, args)
            empty = json.loads((args.project / 'unavailable.json').read_text())
            require(check_metadata(empty['metadata'], source, args, record['version'], args.empty_isl, args.empty_osl) == empty['rows'] == [],
                    'Empty example now has eligible observations; choose another exact unavailable workload')
            require(not scoped(unfiltered, args.empty_isl, args.empty_osl, args.raw_model), 'Empty example has observations; review diagnostic manually')
            diagnostic = json.loads((args.project / 'diagnostic.json').read_text())
            check_empty_diagnostic(diagnostic, empty['metadata'], len(unfiltered), args)
            require((args.project / 'result.md').read_text().strip(), 'Native-agent narrative is missing')
            report.update(status='data-checks-passed', narrative_review='required', targets=[result])
            return
        if args.mode == 'public':
            metadata = json.loads(fetch_public(f'{REGISTRY}/@semianalysisai%2finferencex-skills/{record["version"]}', args.evidence / 'registry.json', report))
            require(metadata['name'] == PACKAGE and metadata['version'] == record['version'] and
                    metadata['dist']['integrity'] == record['integrity'], 'Public metadata differs from candidate')
            public = fetch_public(metadata['dist']['tarball'], args.evidence / 'public-package.tgz', report)
            require(public == body, 'Public tarball differs from the accepted archive')
        node, npm = shutil.which('node'), shutil.which('npm')
        require(node and npm, 'Node 24 and npm must be on PATH')
        clean_root = Path(tempfile.mkdtemp(prefix='inferencex-skill-acceptance-'))
        report['clean_root'] = str(clean_root)
        for target in ['codex', 'claude']:
            project = clean_root / target
            project.mkdir()
            config = clean_root / f'{target}-npm'
            config.mkdir()
            for name in ['user.npmrc', 'global.npmrc']:
                (config / name).write_text('')
            env = {'PATH': str(Path(node).parent) + os.pathsep + os.defpath, 'LANG': 'en_US.UTF-8',
                   'npm_config_registry': REGISTRY, 'npm_config_userconfig': str(config / 'user.npmrc'),
                   'npm_config_globalconfig': str(config / 'global.npmrc'), 'npm_config_cache': str(config / 'cache'),
                   'npm_config_update_notifier': 'false', 'npm_config_audit': 'false', 'npm_config_fund': 'false'}
            spec = f'{PACKAGE}@{record["version"]}' if args.mode == 'public' else str(archive)
            offline = [] if args.mode == 'public' else ['--offline']
            run([npm, 'exec', '--yes', *offline, '--package', spec, '--', 'inferencex-skills', 'install', '--target', target], project, env, 'install')
            installed = project / ('.agents' if target == 'codex' else '.claude') / 'skills/inferencex-api'
            check_installed(installed, skill_files, record['version'])
            if args.mode == 'agents':
                (project / 'prompt.txt').write_text(prompt(args))
                report['targets'].append({'target': target, 'project': str(project), 'status': 'awaiting-native-agent'})
                continue
            (project / 'capture-http.mjs').write_text(CAPTURE)
            for output_format in ['json', 'csv']:
                flags = ['--model', args.model, '--isl', str(args.isl), '--osl', str(args.osl), '--format', output_format,
                         '--output', f'powerx.{output_format}']
                if args.date:
                    flags += ['--date', args.date]
                if args.raw_model:
                    flags += ['--raw-model', args.raw_model]
                run([node, '--import', project / 'capture-http.mjs', installed / 'scripts/export-powerx.mjs', *flags],
                    project, env | {'INFERENCEX_CAPTURE': f'powerx-{output_format}'}, f'powerx-{output_format}')
            sources = []
            for output_format in ['json', 'csv']:
                capture = json.loads((project / f'powerx-{output_format}.request.json').read_text())
                data = (project / f'powerx-{output_format}.response.json').read_bytes()
                require(capture['status'] == 200 and same_url(capture['query_url'], args.strict_url) and
                        hashlib.sha256(data).hexdigest() == capture['sha256'], 'Captured HTTP evidence differs')
                sources.append(json.loads(data))
            result = check_exports(project, *sources, args, record['version'])
            result.update(target=target, project=str(project))
            report['targets'].append(result)
        report['status'] = 'prepared' if args.mode == 'agents' else 'passed'
        if args.mode == 'agents':
            save(clean_root / 'acceptance.json', report)
            report['native_agent_acceptance'] = 'not run'
    except Exception as error:
        report.update(status='failed', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        # Keep failed exports/install logs as well as successful evidence, without npm caches.
        if args.mode not in ['agents', 'check-agent'] and report.get('clean_root'):
            for target in ['codex', 'claude']:
                project = Path(report['clean_root']) / target
                if project.exists():
                    shutil.copytree(project, args.evidence / target)
        report['completed_at'] = now()
        save(args.evidence / 'verification.json', report)
        print(json.dumps({'status': report['status'], 'evidence': str(args.evidence / 'verification.json'),
                          'clean_root': report.get('clean_root')}))


if __name__ == '__main__':
    main()
