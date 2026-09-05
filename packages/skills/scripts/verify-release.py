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
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import ProxyHandler, Request, build_opener

PACKAGE = '@semianalysisai/inferencex-skills'
REGISTRY = 'https://registry.npmjs.org'
API = 'https://inferencex.semianalysis.com/api/v1/benchmarks'
# Only the exact-version npm ETARGET propagation symptom is retryable. No HTTP,
# publication, data-validation, or candidate-install retries.
PUBLIC_INSTALL_ATTEMPTS = 3
PUBLIC_RETRY_DELAYS = (5, 10)
PUBLIC_DEADLINE_SECONDS = 300
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


def remaining_seconds(deadline, limit):
    if deadline is None:
        return limit
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Public verification deadline exceeded')
    return min(limit, remaining)


def deadline_expired(signum, frame):
    raise TimeoutError('Public verification deadline exceeded during HTTP response')


def fetch_public(url, destination, report, deadline=None):
    parsed = urlsplit(url)
    require(parsed.scheme == 'https' and parsed.hostname in ['registry.npmjs.org', 'inferencex.semianalysis.com']
            and not parsed.username and not parsed.password, 'Unexpected public URL')
    request = Request(url, headers={'User-Agent': 'InferenceX-skill-release-check', 'Accept-Encoding': 'identity'})
    request_record = {'query_url': url, 'started_at': now(), 'status': 'running'}
    report['requests'].append(request_record)
    timeout = remaining_seconds(deadline, 30)
    previous_handler = None
    if deadline is not None:
        # Socket timeouts alone reset while a slow body keeps delivering bytes.
        # This Unix maintainer script also bounds the complete open/read operation.
        previous_handler = signal.signal(signal.SIGALRM, deadline_expired)
        signal.setitimer(signal.ITIMER_REAL, remaining_seconds(deadline, PUBLIC_DEADLINE_SECONDS))
    try:
        with build_opener(ProxyHandler({})).open(request, timeout=timeout) as response:
            request_record['response_status'] = response.status
            require(response.status == 200 and urlsplit(response.url).hostname == parsed.hostname, 'Unexpected HTTP response')
            wire = response.read()
            encoding = (response.headers.get('Content-Encoding') or 'identity').strip().lower()
        remaining_seconds(deadline, 30)
        request_record.update(retrieved_at=now(), content_encoding=encoding,
                              wire_sha256=hashlib.sha256(wire).hexdigest())
        if encoding != 'identity':
            wire_path = destination.with_name(destination.name + '.wire')
            wire_path.write_bytes(wire)
            request_record['wire_response_file'] = str(wire_path)
        require(encoding in ['identity', 'gzip'], f'Unsupported Content-Encoding: {encoding}')
        # Content-Type application/gzip describes a tarball, not HTTP transfer encoding.
        body = gzip.decompress(wire) if encoding == 'gzip' else wire
        destination.write_bytes(body)
        request_record.update(status='passed', response_file=str(destination), sha256=hashlib.sha256(body).hexdigest())
        return body
    except Exception as error:
        request_record.update(status='failed', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        if previous_handler is not None:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)
        request_record['completed_at'] = now()


def run(command, project, environment, label, deadline=None):
    timeout = remaining_seconds(deadline, 180)
    started, started_at = time.monotonic(), now()
    error, returncode = None, None
    stdout_path, stderr_path = project / f'{label}.stdout.log', project / f'{label}.stderr.log'
    try:
        # Files avoid pipe-draining waits when an npm descendant keeps stdout open.
        with stdout_path.open('w') as stdout_log, stderr_path.open('w') as stderr_log:
            process = subprocess.Popen([str(part) for part in command], cwd=project, env=environment,
                                       stdout=stdout_log, stderr=stderr_log, start_new_session=True)
            try:
                timeout = remaining_seconds(deadline, timeout)
                returncode = process.wait(timeout=timeout)
            except (subprocess.TimeoutExpired, TimeoutError):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.poll()  # Reap if already exited; never add an unbounded cleanup wait.
                raise
    except Exception as caught:
        error = caught
    stdout, stderr = stdout_path.read_text(errors='replace'), stderr_path.read_text(errors='replace')
    with (project / 'commands.jsonl').open('a') as log:
        log.write(json.dumps({'command': [str(part) for part in command], 'cwd': str(project),
                              'started_at': started_at, 'completed_at': now(), 'returncode': returncode,
                              'elapsed_seconds': time.monotonic() - started,
                              'timed_out': isinstance(error, (subprocess.TimeoutExpired, TimeoutError)),
                              'timeout_seconds': timeout}) + '\n')
    if error is not None:
        raise error
    if returncode != 0:
        raise subprocess.CalledProcessError(returncode, command, output=stdout, stderr=stderr)
    remaining_seconds(deadline, 180)
    return stdout


def transient_install_error(error, version):
    if not isinstance(error, subprocess.CalledProcessError):
        return False
    stderr = error.stderr or ''
    codes = re.findall(r'^npm (?:error|ERR!) code (\S+)\s*$', stderr, re.MULTILINE)
    expected = f'No matching version found for {PACKAGE}@{version}.'
    return codes == ['ETARGET'] and any(
        line in [f'npm error notarget {expected}', f'npm ERR! notarget {expected}']
        for line in stderr.splitlines())


def install_target(clean_root, target, node, npm, archive, version, public, report, deadline=None):
    target_root = clean_root / target
    for attempt in range(1, (PUBLIC_INSTALL_ATTEMPTS if public else 1) + 1):
        remaining_seconds(deadline, 180)
        project = target_root / f'attempt-{attempt}' if public else target_root
        project.mkdir(parents=True)
        config = clean_root / f'{target}-npm-{attempt}'
        config.mkdir()
        for name in ['user.npmrc', 'global.npmrc']:
            (config / name).write_text('')
        env = {'PATH': str(Path(node).parent) + os.pathsep + os.defpath, 'LANG': 'en_US.UTF-8',
               'npm_config_registry': REGISTRY, 'npm_config_userconfig': str(config / 'user.npmrc'),
               'npm_config_globalconfig': str(config / 'global.npmrc'), 'npm_config_cache': str(config / 'cache'),
               'npm_config_update_notifier': 'false', 'npm_config_audit': 'false', 'npm_config_fund': 'false',
               'npm_config_fetch_retries': '0'}
        spec = f'{PACKAGE}@{version}' if public else str(archive)
        command = [npm, 'exec', '--yes', *([] if public else ['--offline']), '--package', spec,
                   '--', 'inferencex-skills', 'install', '--target', target]
        started = time.monotonic()
        entry = {'target': target, 'attempt': attempt, 'project': str(project), 'package': spec,
                 'started_at': now(), 'status': 'running'}
        report.setdefault('install_attempts', []).append(entry)
        try:
            run(command, project, env, 'install', deadline)
            entry['status'] = 'passed'
            return project, env
        except Exception as error:
            retryable = public and transient_install_error(error, version)
            entry.update(status='failed', error=f'{type(error).__name__}: {error}',
                         retryable=retryable, returncode=getattr(error, 'returncode', None))
            if not retryable or attempt == PUBLIC_INSTALL_ATTEMPTS:
                raise
            delay = PUBLIC_RETRY_DELAYS[attempt - 1]
            if remaining_seconds(deadline, delay + 1) <= delay:
                raise TimeoutError('Public verification deadline cannot accommodate the next retry') from error
            entry['retry_delay_seconds'] = delay
        finally:
            entry.update(completed_at=now(), elapsed_seconds=time.monotonic() - started)
            logs = config / 'cache/_logs'
            if logs.exists():
                shutil.copytree(logs, project / 'npm-logs')
            save(project / 'install-attempt.json', entry)
        time.sleep(delay)


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


def captured_export(project, name, output, args, version, isl=None, osl=None):
    capture = json.loads((project / name / 'manifest.json').read_text())
    require(capture['schema_version'] == 1 and capture['status'] == 'complete'
            and capture['package_version'] == version, 'Export evidence is incomplete or belongs to another version')
    request, response, exported = capture['request'], capture['response'], capture['export']
    require(request['method'] == 'GET' and same_url(request['url'], args.strict_url), 'Captured request differs')
    require(request['filters'] == {'model': args.model, 'date': args.date, 'powerValid': 'strictV2',
            'benchmark_type': 'single_turn', 'isl': isl or args.isl, 'osl': osl or args.osl,
            'raw_model': args.raw_model}, 'Captured filters differ')
    require(response['status'] == 200 and response['body_file'] == 'response.json' and
            response['checksum_covers'] == 'saved decoded response body', 'Captured response identity differs')
    body = (project / name / response['body_file']).read_bytes()
    require(hashlib.sha256(body).hexdigest() == response['sha256'], 'Captured body checksum differs')
    require(datetime.fromisoformat(response['retrieved_at'].replace('Z', '+00:00')).tzinfo,
            'Missing capture retrieval timezone')
    require(exported['format'] == Path(output).suffix.removeprefix('.') and
            Path(exported['destination']).is_absolute() and
            Path(exported['destination']).resolve() == (project / output).resolve() and
            exported['sha256'] == hashlib.sha256((project / output).read_bytes()).hexdigest(),
            'Captured export link differs')
    rows = json.loads(body)
    check_metadata(exported['metadata'], rows, args, version, isl, osl)
    require(response['retrieved_at'] == exported['metadata']['retrieved_at'], 'Capture and extraction timestamps differ')
    if exported['format'] == 'json':
        require(json.loads((project / output).read_text())['metadata'] == exported['metadata'],
                'Captured extraction metadata differs')
    else:
        with (project / output).open(newline='') as handle:
            for row in csv.DictReader(handle):
                for field in REQUEST_COLUMNS:
                    value = exported['metadata'][field]
                    require(row[field] == ('' if value is None else str(value)),
                            f'CSV extraction metadata differs from its captured response: {field}')
    return rows


def captured_request(project, name, expected_url, metadata):
    context = json.loads((project / 'raw-responses' / f'{name}.request.json').read_text())
    body = (project / 'raw-responses' / f'{name}.response.json').read_bytes()
    require(context['status'] == 200 and same_url(context['query_url'], expected_url) and
            context['sha256'] == hashlib.sha256(body).hexdigest(), 'Original request evidence differs')
    require(datetime.fromisoformat(context['retrieved_at'].replace('Z', '+00:00')).tzinfo,
            'Missing original response retrieval timezone')
    require(same_url(metadata['query_url'], context['query_url']) and
            metadata['retrieved_at'] == context['retrieved_at'], 'Output and original request context differ')
    return json.loads(body)


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


def prompt(args, target, archive):
    cutoff = f'as of {args.date}' if args.date else 'using the latest available observations'
    raw = f' Keep only the exact returned model key {args.raw_model}; record this filter as scope.raw_model in lookup.json.' if args.raw_model else ''
    return f'''Use only the installed inferencex-api skill and public HTTP data in this clean project.

The exact candidate archive is available at {archive}. Using its offline npm installer for target {target}, inspect the installed version with JSON output and save status.json. Preview a forced installation with JSON output and save preview.json. Do not perform the installation or change the installed skill files. Explain the executing package version, installed version, proposed writes, and preserved files. The npm command is npm exec --yes --offline --package <archive> -- inferencex-skills <command>.

For {args.model} {cutoff}, show five latest single-turn benchmark observations with {args.isl} input and {args.osl} output tokens, regardless of power validation. Save lookup.json using the installed lookup example's output shape.{raw} Do not introduce additional filters.

Export validated measured PowerX data for that exact scope to powerx.csv and powerx.json. Explain mean watts per GPU, whole-deployment J/output token, prefill watts per GPU, missing requested metrics, exclusions, and extraction context. Preserve source/configuration details and real zeroes.

Attempt the same validated export for exactly {args.empty_isl} input and {args.empty_osl} output tokens as unavailable.json; save its request report, retain the original result, and use the installed bounded diagnostic guidance to save diagnostic.json and explain availability without changing the requested scope.

There is no repository or database access in this project. Do not read another checkout, call private services, install dependencies, or run benchmarks. Save complete public responses and request URLs with retrieval times locally. Do not assume row counts or reconstruct data from webpage summaries. Write the final explanation to result.md. Keep command output compact.

The complete response files are required deliverables. Use the exporter's built-in --evidence-dir with separate fresh directories powerx-csv-evidence, powerx-json-evidence, and unavailable-evidence for the corresponding outputs. For lookup and diagnosis, save each complete consumed body as raw-responses/lookup.response.json and raw-responses/diagnostic.response.json before selecting rows. Beside each body save a .request.json record with query_url, status, retrieved_at, and sha256 of the saved body; use that same retrieved_at value in the corresponding lookup or diagnostic output. The five-row lookup, selected export rows, and diagnostic summary are not substitutes for original responses. Before finishing, verify these files exist alongside result.md.

Each lookup, CSV export, JSON export, empty export, and diagnostic must be traceable to the complete response from the very same HTTP request it consumed. A separate request to the same URL does not satisfy this requirement. Keep installed skill files unchanged. Matching row counts alone do not establish original-response capture.
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
    deadline = time.monotonic() + PUBLIC_DEADLINE_SECONDS if args.mode == 'public' else None
    if deadline is not None:
        report['public_retry_policy'] = {'install_attempts_per_target': PUBLIC_INSTALL_ATTEMPTS,
                                         'delays_seconds': PUBLIC_RETRY_DELAYS,
                                         'total_deadline_seconds': PUBLIC_DEADLINE_SECONDS,
                                         'retryable': 'exact requested package/version npm ETARGET only'}
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
            json_source = captured_export(args.project, 'powerx-json-evidence', 'powerx.json', args, record['version'])
            csv_source = captured_export(args.project, 'powerx-csv-evidence', 'powerx.csv', args, record['version'])
            result = check_exports(args.project, json_source, csv_source, args, record['version'])
            lookup = json.loads((args.project / 'lookup.json').read_text())
            unfiltered = captured_request(args.project, 'lookup', args.base_url, lookup)
            available = scoped(unfiltered, args.isl, args.osl, args.raw_model)
            check_lookup(lookup, available, args)
            empty = json.loads((args.project / 'unavailable.json').read_text())
            source = captured_export(args.project, 'unavailable-evidence', 'unavailable.json', args,
                                     record['version'], args.empty_isl, args.empty_osl)
            require(check_metadata(empty['metadata'], source, args, record['version'], args.empty_isl, args.empty_osl) == empty['rows'] == [],
                    'Empty example now has eligible observations; choose another exact unavailable workload')
            diagnostic = json.loads((args.project / 'diagnostic.json').read_text())
            diagnostic_source = captured_request(args.project, 'diagnostic', args.base_url, diagnostic['diagnostic'])
            require(not scoped(diagnostic_source, args.empty_isl, args.empty_osl, args.raw_model), 'Empty example has observations; review diagnostic manually')
            check_empty_diagnostic(diagnostic, empty['metadata'], len(diagnostic_source), args)
            require((args.project / 'result.md').read_text().strip(), 'Native-agent narrative is missing')
            report.update(status='data-checks-passed', narrative_review='required', targets=[result])
            return
        if args.mode == 'public':
            metadata = json.loads(fetch_public(f'{REGISTRY}/@semianalysisai%2finferencex-skills/{record["version"]}', args.evidence / 'registry.json', report, deadline))
            require(metadata['name'] == PACKAGE and metadata['version'] == record['version'] and
                    metadata['dist']['integrity'] == record['integrity'], 'Public metadata differs from candidate')
            public = fetch_public(metadata['dist']['tarball'], args.evidence / 'public-package.tgz', report, deadline)
            require(public == body, 'Public tarball differs from the accepted archive')
        node, npm = shutil.which('node'), shutil.which('npm')
        require(node and npm, 'Node 24 and npm must be on PATH')
        clean_root = Path(tempfile.mkdtemp(prefix='inferencex-skill-acceptance-'))
        report['clean_root'] = str(clean_root)
        for target in ['codex', 'claude']:
            project, env = install_target(clean_root, target, node, npm, archive, record['version'],
                                          args.mode == 'public', report, deadline)
            installed = project / ('.agents' if target == 'codex' else '.claude') / 'skills/inferencex-api'
            check_installed(installed, skill_files, record['version'])
            if args.mode == 'agents':
                (project / 'prompt.txt').write_text(prompt(args, target, archive))
                report['targets'].append({'target': target, 'project': str(project), 'status': 'awaiting-native-agent'})
                continue
            for output_format in ['json', 'csv']:
                flags = ['--model', args.model, '--isl', str(args.isl), '--osl', str(args.osl), '--format', output_format,
                         '--output', f'powerx.{output_format}', '--evidence-dir', f'powerx-{output_format}-evidence']
                if args.date:
                    flags += ['--date', args.date]
                if args.raw_model:
                    flags += ['--raw-model', args.raw_model]
                run([node, installed / 'scripts/export-powerx.mjs', *flags], project, env,
                    f'powerx-{output_format}', deadline)
            sources = [captured_export(project, f'powerx-{fmt}-evidence', f'powerx.{fmt}', args, record['version'])
                       for fmt in ['json', 'csv']]
            result = check_exports(project, *sources, args, record['version'])
            result.update(target=target, project=str(project))
            report['targets'].append(result)
        remaining_seconds(deadline, PUBLIC_DEADLINE_SECONDS)
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
