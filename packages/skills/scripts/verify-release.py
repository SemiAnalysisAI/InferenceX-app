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
import stat
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
AGENTX_ORIGIN = 'https://inferencex.semianalysis.com'
AGENTX_EXCLUDED_RAW_MODEL = '__inferencex_release_verification_no_match__'
MAX_SAFE_INTEGER = 9_007_199_254_740_991
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
AGENTX_FILTERS = (
    ('raw_model', 'model'), ('hardware', 'hardware'), ('framework', 'framework'),
    ('precision', 'precision'), ('spec_method', 'spec_method'),
    ('offload_mode', 'offload_mode'), ('concurrency', 'conc'))
AGENTX_GROUPS = ('isl', 'osl', 'kvCacheUtil', 'prefixCacheHitRate')
AGENTX_PERCENTILES = ('mean', 'p50', 'p75', 'p90', 'p95', 'p99')
AGENTX_CONTEXT_COLUMNS = '''package_version query_url retrieved_at requested_model requested_date
date_selection requested_benchmark_type filter.raw_model filter.hardware filter.framework filter.precision
filter.spec_method filter.offload_mode filter.concurrency'''.split()
AGENTX_BENCHMARK_COLUMNS = '''id model hardware framework image precision spec_method benchmark_type conc
offload_mode recipe_fingerprint disagg is_multinode prefill_tp prefill_ep prefill_dp_attention
prefill_num_workers decode_tp decode_ep decode_dp_attention decode_num_workers num_prefill_gpu
num_decode_gpu isl osl date workflow_run_id run_started_at run_url curve_date curve_workflow_run_id
curve_run_started_at'''.split()
AGENTX_ENRICHMENT_COLUMNS = [
    *[f'aggregate.{group}.{field}' for group in AGENTX_GROUPS for field in (*AGENTX_PERCENTILES, 'n')],
    'derived.p75_e2e_norm_intvty', 'derived.p90_e2e_norm_intvty', 'trace.available',
    'trace.response_key_present', 'enrichment.status', 'enrichment.aggregates_status',
    'enrichment.derived_metrics_status', 'enrichment.trace_availability_status']
AGENTX_REQUIRED_STRINGS = ('hardware', 'framework', 'model', 'precision', 'spec_method',
                           'benchmark_type', 'offload_mode', 'date')
AGENTX_REQUIRED_BOOLEANS = ('disagg', 'is_multinode', 'prefill_dp_attention', 'decode_dp_attention')
AGENTX_REQUIRED_INTEGERS = ('prefill_tp', 'prefill_ep', 'prefill_num_workers', 'decode_tp', 'decode_ep',
                            'decode_num_workers', 'num_prefill_gpu', 'num_decode_gpu', 'conc')
POINT_OPERATIONS = (
    ('openapi', '/api/openapi.json', None),
    ('benchmark-siblings', '/api/v1/benchmark-siblings', 'id'),
    ('trace-availability', '/api/v1/trace-availability', 'ids'),
    ('request-timeline', '/api/v1/request-timeline', 'id'),
    ('trace-histograms', '/api/v1/trace-histograms', 'ids'),
    ('trace-server-metrics', '/api/v1/trace-server-metrics', 'id'))


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
                    pass  # The process group already exited before cleanup.
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
    raise RuntimeError('Installation attempts exhausted without returning or raising')


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


def timestamp(value, message):
    require(type(value) is str, message)
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ValueError(message) from error
    require(parsed.tzinfo is not None, message)
    return parsed


def integer(value):
    return finite(value) and float(value).is_integer()


def safe_result_id(value):
    if finite(value) and integer(value):
        number = int(value)
        return number if 0 < number <= MAX_SAFE_INTEGER else None
    if type(value) is not str or re.fullmatch(r'[1-9]\d*', value) is None:
        return None
    number = int(value)
    return number if number <= MAX_SAFE_INTEGER and str(number) == value else None


def js_text(value):
    if type(value) is bool:
        return str(value).lower()
    if integer(value):
        return str(int(value))
    return str(value)


def js_sorted(values):
    return sorted(set(values), key=lambda value: js_text(value).encode('utf-16-be', errors='surrogatepass'))


def strict_json(body):
    def reject(value):
        raise ValueError(f'Non-standard JSON number: {value}')
    return json.loads(body.decode('utf-8-sig'), parse_constant=reject)


def same_json(actual, expected):
    if finite(actual) and finite(expected):
        return actual == expected
    if type(actual) is not type(expected):
        return False
    if type(actual) is dict:
        return actual.keys() == expected.keys() and all(same_json(actual[key], expected[key]) for key in actual)
    if type(actual) is list:
        return len(actual) == len(expected) and all(same_json(a, b) for a, b in zip(actual, expected))
    return actual == expected


def agentx_benchmark(row):
    if type(row) is not dict or 'id' not in row or \
            type(row['id']) is not str and safe_result_id(row['id']) is None:
        return False
    if not all(type(row.get(key)) is str for key in AGENTX_REQUIRED_STRINGS):
        return False
    if not all(type(row.get(key)) is bool for key in AGENTX_REQUIRED_BOOLEANS):
        return False
    if not all(integer(row.get(key)) for key in AGENTX_REQUIRED_INTEGERS):
        return False
    if not all(row.get(key) is None or finite(row.get(key)) for key in ('isl', 'osl')):
        return False
    if not all(row.get(key) is None or type(row.get(key)) is str for key in ('image', 'recipe_fingerprint', 'run_url')):
        return False
    if type(row.get('metrics')) is not dict:
        return False
    try:
        return datetime.strptime(row['date'], '%Y-%m-%d').strftime('%Y-%m-%d') == row['date']
    except ValueError:
        return False


def sanitized(value):
    if type(value) is float and not math.isfinite(value):
        return None, 1
    if type(value) is list:
        result, count = [], 0
        for item in value:
            clean, changed = sanitized(item)
            result.append(clean)
            count += changed
        return result, count
    if type(value) is dict:
        result, count = {}, 0
        for key, item in value.items():
            clean, changed = sanitized(item)
            result[key] = clean
            count += changed
        return result, count
    return value, 0


def agentx_scope(args, excluded=False):
    raw_model = AGENTX_EXCLUDED_RAW_MODEL if excluded else None
    requested = {
        'display_model': args.agentx_model, 'date': None, 'date_selection': 'latest',
        'raw_model': raw_model, 'hardware': None, 'framework': None, 'precision': None,
        'spec_method': None, 'offload_mode': None, 'concurrency': None,
        'benchmark_type': 'agentic_traces'}
    applied = {
        'display_model': {'status': 'applied', 'value': args.agentx_model},
        'date': {'status': 'omitted', 'value': None},
        'benchmark_type': {'status': 'applied', 'value': 'agentic_traces'}}
    applied.update({name: {'status': 'applied' if value is not None else 'omitted', 'value': value}
                    for name, value in ((name, requested[name]) for name, _field in AGENTX_FILTERS)})
    filters = {name: applied[name] for name, _field in AGENTX_FILTERS}
    return requested, applied, filters


def agentx_response(evidence, record, number, operation, expected_url, chunk):
    require(set(record) == {'operation', 'request_number', 'url', 'method', 'retrieved_at', 'http_status',
                            'decoded_body_sha256', 'body_file', 'requested_chunk_ids', 'checksum_covers'},
            f'AgentX response manifest is incomplete: {number}')
    expected_file = f'response-{number:04d}-{operation}.json'
    require(record['operation'] == operation and type(record['request_number']) is int and
            record['request_number'] == number and record['method'] == 'GET' and
            type(record['http_status']) is int and record['http_status'] == 200 and
            same_json(record['requested_chunk_ids'], chunk) and record['body_file'] == expected_file and
            record['checksum_covers'] == 'saved decoded response body' and
            same_url(record['url'], expected_url), f'AgentX response identity differs: {number}')
    timestamp(record['retrieved_at'], f'AgentX response time is invalid: {number}')
    body = (evidence / expected_file).read_bytes()
    require(hashlib.sha256(body).hexdigest() == record['decoded_body_sha256'],
            f'AgentX response checksum differs: {number}')
    return strict_json(body)


def agentx_map(value, requested_ids, operation):
    require(type(value) is dict, f'Unexpected {operation} response shape')
    requested = set(requested_ids)
    result = {}
    for key, entry in value.items():
        result_id = safe_result_id(key)
        require(result_id is not None and str(result_id) == key and result_id in requested,
                f'Unexpected {operation} result ID: {key}')
        if operation == 'agentic-aggregates':
            valid = type(entry) is dict and integer(entry.get('id')) and int(entry['id']) == result_id
            for group in AGENTX_GROUPS:
                group_value = entry.get(group)
                valid = valid and group in entry and (group_value is None or
                    type(group_value) is dict and
                    all(finite(group_value.get(field)) for field in AGENTX_PERCENTILES) and
                    integer(group_value.get('n')) and group_value['n'] >= 0)
        elif operation == 'derived-agentic-metrics':
            valid = type(entry) is dict and integer(entry.get('id')) and int(entry['id']) == result_id and all(
                field in entry and (entry[field] is None or finite(entry[field]))
                for field in ('p75_e2e_norm_intvty', 'p90_e2e_norm_intvty'))
        else:
            valid = type(entry) is bool
        require(valid, f'Unexpected {operation} response shape for result ID: {key}')
        result[result_id] = entry
    return result


def agentx_coverage(rows):
    supported = [row for row in rows if row['agentx']['status'] != 'unsupported_id']
    unsupported = len(rows) - len(supported)
    aggregates = {}
    for group in AGENTX_GROUPS:
        aggregates[group] = {
            'available_rows': sum(row['agentx']['aggregates']['status'] == 'available' and
                                  row['agentx']['aggregates']['value'][group] is not None for row in supported),
            'null_rows': sum(row['agentx']['aggregates']['status'] == 'available' and
                             row['agentx']['aggregates']['value'][group] is None for row in supported),
            'missing_entry_rows': sum(row['agentx']['aggregates']['status'] == 'not_returned' for row in supported),
            'unsupported_id_rows': unsupported}
    return {
        'safe_id_rows': len(supported), 'unsupported_id_rows': unsupported,
        'unique_safe_ids': len({row['agentx']['result_id'] for row in supported}),
        'aggregates': aggregates,
        'derived_metrics': {
            'available_rows': sum(row['agentx']['derived_metrics']['status'] == 'available' for row in supported),
            'missing_entry_rows': sum(row['agentx']['derived_metrics']['status'] == 'not_returned' for row in supported),
            'unsupported_id_rows': unsupported},
        'trace_availability': {
            'stored_trace_rows': sum(row['agentx']['trace_availability']['value'] is True for row in supported),
            'no_stored_trace_rows': sum(row['agentx']['trace_availability']['value'] is False for row in supported),
            'response_key_rows': sum(row['agentx']['trace_availability']['response_key_present'] for row in supported),
            'missing_key_rows': sum(not row['agentx']['trace_availability']['response_key_present'] for row in supported),
            'unsupported_id_rows': unsupported}}


def check_agentx_cell(cell, value, location):
    if value is None:
        require(cell == '', f'AgentX CSV value mismatch: {location}')
    elif type(value) is bool:
        require(cell == str(value).lower(), f'AgentX CSV value mismatch: {location}')
    elif integer(value):
        require(cell == str(int(value)), f'AgentX CSV value mismatch: {location}')
    elif finite(value):
        try:
            equal = float(cell) == value
        except ValueError:
            equal = False
        require(equal, f'AgentX CSV value mismatch: {location}')
    else:
        require(cell == str(value), f'AgentX CSV value mismatch: {location}')


def check_agentx_capture(project, name, output, args, version, excluded=False):
    evidence = project / name
    capture = strict_json((evidence / 'manifest.json').read_bytes())
    require(set(capture) == {'schema_version', 'package_version', 'status', 'started_at', 'finished_at',
                            'outcome', 'requested_filters', 'applied_filters', 'counts', 'responses',
                            'export', 'error'} and type(capture['schema_version']) is int and capture['schema_version'] == 1 and
            capture['package_version'] == version and capture['status'] == 'complete' and capture['error'] is None,
            'AgentX evidence manifest is incomplete or belongs to another version')
    started = timestamp(capture['started_at'], 'AgentX evidence start time is invalid')
    finished = timestamp(capture['finished_at'], 'AgentX evidence finish time is invalid')
    require(finished >= started, 'AgentX evidence times are reversed')
    requested, applied, filters = agentx_scope(args, excluded)
    require(capture['requested_filters'] == requested and capture['applied_filters'] == applied,
            'AgentX evidence filters differ')
    responses = capture['responses']
    require(type(responses) is list and responses, 'AgentX evidence has no complete response')
    benchmark_url = API + '?' + urlencode({'model': args.agentx_model})
    benchmarks = agentx_response(evidence, responses[0], 1, 'benchmarks', benchmark_url, None)
    require(type(benchmarks) is list and all(agentx_benchmark(row) for row in benchmarks),
            'Unexpected AgentX benchmark response shape')
    agentx_rows = [row for row in benchmarks if row['benchmark_type'] == 'agentic_traces']
    selected = [row for row in agentx_rows if all(requested[name] is None or row[field] == requested[name]
                                                  for name, field in AGENTX_FILTERS)]
    ids = []
    for row in selected:
        result_id = safe_result_id(row['id'])
        if result_id is not None and result_id not in ids:
            ids.append(result_id)
    specs = [('benchmarks', benchmark_url, None)]
    for operation, limit in (('agentic-aggregates', 200), ('derived-agentic-metrics', 200),
                             ('trace-availability', 500)):
        for offset in range(0, len(ids), limit):
            chunk = ids[offset:offset + limit]
            specs.append((operation, AGENTX_ORIGIN + f'/api/v1/{operation}?' +
                          urlencode({'ids': ','.join(map(str, chunk))}), chunk))
    require(len(responses) == len(specs), 'AgentX evidence response count differs from exact chunks')
    joined = {operation: {} for operation in ('agentic-aggregates', 'derived-agentic-metrics', 'trace-availability')}
    for number, (record, (operation, url, chunk)) in enumerate(zip(responses, specs), 1):
        body = benchmarks if number == 1 else agentx_response(evidence, record, number, operation, url, chunk)
        if number > 1:
            joined[operation].update(agentx_map(body, chunk, operation))
    actual_files = {str(path.relative_to(evidence)) for path in evidence.rglob('*') if path.is_file()}
    expected_files = {'manifest.json', *(record['body_file'] for record in responses)}
    require(actual_files == expected_files, 'Unexpected or missing AgentX evidence files')

    rows, non_finite = [], 0
    for row in selected:
        benchmark, changed = sanitized(row)
        non_finite += changed
        result_id = safe_result_id(row['id'])
        if result_id is None:
            agentx = {
                'status': 'unsupported_id', 'result_id': None,
                'aggregates': {'status': 'unsupported_id', 'value': None},
                'derived_metrics': {'status': 'unsupported_id', 'value': None},
                'trace_availability': {'status': 'unsupported_id', 'value': None,
                                       'response_key_present': None}}
        else:
            has_aggregates = result_id in joined['agentic-aggregates']
            has_derived = result_id in joined['derived-agentic-metrics']
            has_trace = result_id in joined['trace-availability']
            available = joined['trace-availability'].get(result_id, False)
            agentx = {
                'status': 'complete' if has_aggregates and has_derived else 'partial',
                'result_id': result_id,
                'aggregates': {'status': 'available' if has_aggregates else 'not_returned',
                               'value': joined['agentic-aggregates'].get(result_id)},
                'derived_metrics': {'status': 'available' if has_derived else 'not_returned',
                                    'value': joined['derived-agentic-metrics'].get(result_id)},
                'trace_availability': {'status': 'stored_trace' if available else 'no_stored_trace',
                                       'value': available, 'response_key_present': has_trace}}
        rows.append({'benchmark': benchmark, 'agentx': agentx})
    outcome = 'no_agentx_rows' if not agentx_rows else 'no_matching_rows' if not selected else 'selected_rows'
    counts = {'returned_rows': len(benchmarks), 'returned_agentx_rows': len(agentx_rows),
              'selected_rows': len(selected)}
    require(capture['outcome'] == outcome and capture['counts'] == counts and
            all(type(value) is int for value in capture['counts'].values()),
            'AgentX evidence outcome or counts differ')
    export = capture['export']
    require(set(export) == {'format', 'destination', 'sha256', 'metadata', 'source_request_numbers'},
            'AgentX export manifest is incomplete')
    output_path = project / output
    output_bytes = output_path.read_bytes()
    expected_format = output_path.suffix.removeprefix('.')
    require(export['format'] == expected_format and Path(export['destination']).is_absolute() and
            Path(export['destination']).resolve() == output_path.resolve() and
            export['sha256'] == hashlib.sha256(output_bytes).hexdigest() and
            export['source_request_numbers'] == list(range(1, len(responses) + 1)) and
            all(type(value) is int for value in export['source_request_numbers']),
            'AgentX export link differs')
    retrieved_at = export['metadata'].get('retrieved_at') if type(export['metadata']) is dict else None
    retrieved = timestamp(retrieved_at, 'AgentX export retrieval time is invalid')
    require(all(retrieved >= timestamp(record['retrieved_at'], 'AgentX response time is invalid')
                for record in responses), 'AgentX export time predates a response')
    require(finished >= retrieved and all(started <= timestamp(record['retrieved_at'], 'AgentX response time is invalid')
                                          <= finished for record in responses),
            'AgentX evidence times do not cover the requests and export')
    available_values = {
        'raw_model': js_sorted(row['model'] for row in agentx_rows),
        'hardware': js_sorted(row['hardware'] for row in agentx_rows),
        'framework': js_sorted(row['framework'] for row in agentx_rows),
        'precision': js_sorted(row['precision'] for row in agentx_rows),
        'spec_method': js_sorted(row['spec_method'] for row in agentx_rows),
        'offload_mode': js_sorted(row['offload_mode'] for row in agentx_rows),
        'concurrency': js_sorted(row['conc'] for row in agentx_rows)}
    metadata = {
        'package_version': version, 'retrieved_at': retrieved_at,
        'request_urls': [{'operation': record['operation'], 'url': record['url']} for record in responses],
        'requested_scope': requested, 'filters': filters, 'outcome': outcome,
        **counts, 'available_filter_values': available_values,
        'returned_model_keys': js_sorted(row['model'] for row in benchmarks),
        'selected_model_keys': js_sorted(row['model'] for row in selected),
        'enrichment_coverage': agentx_coverage(rows), 'non_finite_values': non_finite,
        'observation_context': 'Existing observations were read; no new benchmark was run.'}
    require(same_json(export['metadata'], metadata), 'AgentX export metadata differs from complete responses')
    if expected_format == 'json':
        document = strict_json(output_bytes)
        require(set(document) == {'schema_version', 'metadata', 'rows'} and
                type(document['schema_version']) is int and document['schema_version'] == 1 and
                same_json(document['metadata'], metadata) and same_json(document['rows'], rows),
                'AgentX JSON differs from complete responses')
    else:
        require(output_bytes.endswith(b'\r\n') and output_bytes.count(b'\n') == output_bytes.count(b'\r\n'),
                'AgentX CSV must use CRLF records')
        metric_columns = js_sorted(f'metrics.{key}' for row in rows for key, value in row['benchmark']['metrics'].items()
                                   if value is None or type(value) in (str, int, float, bool))
        columns = [*AGENTX_CONTEXT_COLUMNS, *AGENTX_BENCHMARK_COLUMNS, *metric_columns,
                   *AGENTX_ENRICHMENT_COLUMNS]
        with io.StringIO(output_bytes.decode()) as handle:
            reader = csv.DictReader(handle)
            require(reader.fieldnames == columns, 'AgentX CSV header differs from published contract')
            records = list(reader)
        require(len(records) == len(rows), 'AgentX CSV row count differs from complete response')
        require(all(None not in record and set(record) == set(columns) and
                    all(value is not None for value in record.values()) for record in records),
                'AgentX CSV row width differs from its header')
        context = {
            'package_version': version, 'query_url': responses[0]['url'], 'retrieved_at': retrieved_at,
            'requested_model': args.agentx_model, 'requested_date': None, 'date_selection': 'latest',
            'requested_benchmark_type': 'agentic_traces',
            **{f'filter.{name}': requested[name] for name, _field in AGENTX_FILTERS}}
        for record, row in zip(records, rows):
            benchmark, agentx = row['benchmark'], row['agentx']
            values = {**context, **{field: benchmark.get(field) for field in AGENTX_BENCHMARK_COLUMNS}}
            values.update({column: benchmark['metrics'].get(column.removeprefix('metrics.'))
                           if benchmark['metrics'].get(column.removeprefix('metrics.')) is None or
                           type(benchmark['metrics'].get(column.removeprefix('metrics.'))) in (str, int, float, bool)
                           else None for column in metric_columns})
            for group in AGENTX_GROUPS:
                for field in (*AGENTX_PERCENTILES, 'n'):
                    group_value = (agentx['aggregates']['value'] or {}).get(group)
                    values[f'aggregate.{group}.{field}'] = None if group_value is None else group_value.get(field)
            derived = agentx['derived_metrics']['value'] or {}
            values.update({
                'derived.p75_e2e_norm_intvty': derived.get('p75_e2e_norm_intvty'),
                'derived.p90_e2e_norm_intvty': derived.get('p90_e2e_norm_intvty'),
                'trace.available': agentx['trace_availability']['value'],
                'trace.response_key_present': agentx['trace_availability']['response_key_present'],
                'enrichment.status': agentx['status'],
                'enrichment.aggregates_status': agentx['aggregates']['status'],
                'enrichment.derived_metrics_status': agentx['derived_metrics']['status'],
                'enrichment.trace_availability_status': agentx['trace_availability']['status']})
            for column in columns:
                check_agentx_cell(record[column], values.get(column), f'{benchmark["id"]}/{column}')
    require((outcome == 'no_matching_rows' and len(agentx_rows) > 0) if excluded else len(rows) > 0,
            'AgentX verification scope no longer exercises the intended selection')
    return {'selected_rows': len(rows), 'outcome': outcome, 'enrichment_coverage': metadata['enrichment_coverage']}


POINT_CAPTURE_PRELOAD = r"""import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.env.INFERENCEX_POINT_EVIDENCE;
const selectedResultId = process.env.INFERENCEX_POINT_ID;
const destination = process.env.INFERENCEX_POINT_OUTPUT;
const operations = new Map([
  ['/api/openapi.json', 'openapi'],
  ['/api/v1/benchmark-siblings', 'benchmark-siblings'],
  ['/api/v1/trace-availability', 'trace-availability'],
  ['/api/v1/request-timeline', 'request-timeline'],
  ['/api/v1/trace-histograms', 'trace-histograms'],
  ['/api/v1/trace-server-metrics', 'trace-server-metrics'],
]);
const manifest = {
  schema_version: 1,
  package_version: process.env.INFERENCEX_PACKAGE_VERSION,
  selected_result_id: selectedResultId,
  status: 'pending',
  started_at: new Date().toISOString(),
  finished_at: null,
  responses: [],
  output: { format: 'json', destination, sha256: null, source_request_numbers: [] },
  error: null,
};
mkdirSync(directory);
function save() {
  const temporary = join(directory, 'manifest.tmp');
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  renameSync(temporary, join(directory, 'manifest.json'));
}
save();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.method !== 'GET') {
    throw new Error(`Point diagnostics allow only GET requests, received ${request.method}`);
  }
  if (request.redirect !== 'error') {
    throw new Error('Point diagnostics must reject redirects');
  }
  const url = request.url;
  const operation = operations.get(new URL(url).pathname);
  if (!operation) throw new Error(`Unexpected point diagnostic request: ${url}`);
  const response = await originalFetch(request);
  if (response.url !== url) throw new Error(`Point diagnostic response URL changed: ${response.url}`);
  const bytes = Buffer.from(await response.clone().arrayBuffer());
  const requestNumber = manifest.responses.length + 1;
  const bodyFile = `response-${String(requestNumber).padStart(4, '0')}-${operation}.json`;
  writeFileSync(join(directory, bodyFile), bytes, { flag: 'wx' });
  manifest.responses.push({
    operation,
    request_number: requestNumber,
    url,
    method: request.method,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    decoded_body_sha256: createHash('sha256').update(bytes).digest('hex'),
    body_file: bodyFile,
    checksum_covers: 'saved decoded response body',
  });
  save();
  return response;
};
"""


def point_url(path, parameter, selected_id):
    return AGENTX_ORIGIN + path + ('' if parameter is None else '?' + urlencode({parameter: selected_id}))


def point_response(evidence, record, number, operation, expected_url):
    require(set(record) == {'operation', 'request_number', 'url', 'method', 'retrieved_at', 'http_status',
                            'decoded_body_sha256', 'body_file', 'checksum_covers'},
            f'Point response manifest is incomplete: {number}')
    expected_file = f'response-{number:04d}-{operation}.json'
    require(record['operation'] == operation and type(record['request_number']) is int and
            record['request_number'] == number and record['method'] == 'GET' and
            type(record['http_status']) is int and record['http_status'] == 200 and
            record['body_file'] == expected_file and
            record['checksum_covers'] == 'saved decoded response body' and
            same_url(record['url'], expected_url), f'Point response identity differs: {number}')
    timestamp(record['retrieved_at'], f'Point response time is invalid: {number}')
    body = (evidence / expected_file).read_bytes()
    require(hashlib.sha256(body).hexdigest() == record['decoded_body_sha256'],
            f'Point response checksum differs: {number}')
    return strict_json(body)


def check_point_shapes(selected_id, timeline, histograms, server_metrics):
    require(type(timeline) is dict and integer(timeline.get('version')) and integer(timeline.get('startNs')) and
            integer(timeline.get('endNs')) and finite(timeline.get('durationS')) and
            type(timeline.get('requests')) is list, 'Unexpected request timeline response')
    for request in timeline['requests']:
        valid = type(request) is dict and all(key in request for key in (
            'cid', 'ti', 'wid', 'ad', 'phase', 'credit', 'start', 'ack', 'end', 'ttftMs', 'tpotMs',
            'isl', 'osl', 'cancelled')) and type(request.get('cid')) is str and integer(request.get('ti')) and \
            type(request.get('wid')) is str and integer(request.get('ad')) and type(request.get('phase')) is str and \
            integer(request.get('credit')) and integer(request.get('start')) and \
            (request.get('ack') is None or finite(request.get('ack'))) and integer(request.get('end')) and \
            (request.get('ttftMs') is None or finite(request.get('ttftMs'))) and \
            (request.get('tpotMs') is None or finite(request.get('tpotMs'))) and \
            (request.get('isl') is None or finite(request.get('isl'))) and \
            (request.get('osl') is None or finite(request.get('osl'))) and type(request.get('cancelled')) is bool
        valid = valid and ('ri' not in request or integer(request['ri'])) and \
            ('srcTrace' not in request or type(request['srcTrace']) is str) and \
            ('srcOuter' not in request or integer(request['srcOuter'])) and \
            ('srcInner' not in request or integer(request['srcInner'])) and \
            ('srcKind' not in request or type(request['srcKind']) is str)
        require(valid, 'Unexpected request timeline response')
    require(type(histograms) is dict and set(histograms) == {selected_id},
            'Unexpected one-result trace histogram response')
    histogram = histograms[selected_id]
    require(type(histogram) is dict and integer(histogram.get('id')) and int(histogram['id']) == int(selected_id) and
            type(histogram.get('isl')) is list and all(finite(value) for value in histogram['isl']) and
            type(histogram.get('osl')) is list and all(finite(value) for value in histogram['osl']),
            'Unexpected one-result trace histogram response')
    series = ('kvCacheUsage', 'prefixCacheHitRate', 'queueDepth', 'prefillTps', 'decodeTps',
              'prefixCacheHitsTps', 'hostKvCacheUsage', 'kvCacheUsageByEngine')
    valid_server = type(server_metrics) is dict and type(server_metrics.get('meta')) is dict and \
        integer(server_metrics.get('startNs')) and integer(server_metrics.get('endNs')) and \
        finite(server_metrics.get('durationS')) and integer(server_metrics.get('timeslicesCount')) and \
        server_metrics['timeslicesCount'] >= 0 and all(type(server_metrics.get(key)) is list and
        all(type(entry) is dict for entry in server_metrics[key]) for key in series) and \
        type(server_metrics.get('promptTokensBySource')) is dict and all(type(entries) is list and
        all(type(entry) is dict for entry in entries) for entries in server_metrics['promptTokensBySource'].values()) and \
        'kvCachePoolTokens' in server_metrics and \
        (server_metrics.get('kvCachePoolTokens') is None or finite(server_metrics.get('kvCachePoolTokens'))) and \
        type(server_metrics.get('metricSources')) is list and \
        all(type(entry) is dict for entry in server_metrics['metricSources'])
    valid_server = valid_server and ('id' not in server_metrics['meta'] or
                                     integer(server_metrics['meta']['id']) and
                                     int(server_metrics['meta']['id']) == int(selected_id))
    require(valid_server, 'Unexpected aggregate server metrics response')


def check_agentx_point(project, name, output, selected_id, version):
    require(type(selected_id) is str and safe_result_id(selected_id) is not None and
            str(safe_result_id(selected_id)) == selected_id, 'Point result ID must be a canonical safe integer string')
    evidence = project / name
    capture = strict_json((evidence / 'manifest.json').read_bytes())
    require(set(capture) == {'schema_version', 'package_version', 'selected_result_id', 'status', 'started_at',
                            'finished_at', 'responses', 'output', 'error'} and
            type(capture['schema_version']) is int and capture['schema_version'] == 1 and
            capture['package_version'] == version and capture['selected_result_id'] == selected_id and
            capture['status'] == 'complete' and capture['error'] is None,
            'Point evidence manifest is incomplete or belongs to another selection')
    started = timestamp(capture['started_at'], 'Point evidence start time is invalid')
    finished = timestamp(capture['finished_at'], 'Point evidence finish time is invalid')
    require(finished >= started, 'Point evidence times are reversed')
    responses = capture['responses']
    require(type(responses) is list and len(responses) >= 3, 'Point evidence is missing required responses')
    bodies = [point_response(evidence, record, number, operation,
                             point_url(path, parameter, selected_id))
              for number, (record, (operation, path, parameter)) in
              enumerate(zip(responses, POINT_OPERATIONS[:3]), 1)]
    openapi, siblings, availability = bodies
    for _operation, path, parameter in POINT_OPERATIONS[1:]:
        operation = openapi.get('paths', {}).get(path, {}).get('get') if type(openapi) is dict else None
        require(type(operation) is dict and type(operation.get('parameters')) is list and any(
            type(item) is dict and item.get('name') == parameter and item.get('in') == 'query' and
            item.get('required') is True for item in operation['parameters']),
            'Point OpenAPI contract is incomplete')
    require(type(siblings) is dict and type(siblings.get('sku')) is dict and
            type(siblings.get('siblings')) is list and all(type(row) is dict for row in siblings['siblings']),
            'Unexpected benchmark sibling response')
    selected = next((row for row in siblings['siblings'] if js_text(row.get('id')) == selected_id), None)
    require(selected is not None, 'Sibling response does not identify the selected result')
    require(type(availability) is dict and all(key == selected_id and type(value) is bool
                                               for key, value in availability.items()),
            'Unexpected trace availability response')
    trace_available = availability.get(selected_id) is True
    specs = POINT_OPERATIONS if trace_available else POINT_OPERATIONS[:3]
    require(len(responses) == len(specs), 'Point recipe made an unexpected or missing request')
    bodies.extend(point_response(evidence, record, number, operation,
                                 point_url(path, parameter, selected_id))
                  for number, (record, (operation, path, parameter)) in
                  enumerate(zip(responses[3:], specs[3:]), 4))
    actual_files = {str(path.relative_to(evidence)) for path in evidence.rglob('*') if path.is_file()}
    require(actual_files == {'manifest.json', *(record['body_file'] for record in responses)},
            'Unexpected or missing point evidence files')
    export = capture['output']
    output_path = project / output
    output_bytes = output_path.read_bytes()
    require(export == {'format': 'json', 'destination': str(output_path.resolve()),
                       'sha256': hashlib.sha256(output_bytes).hexdigest(),
                       'source_request_numbers': list(range(1, len(responses) + 1))} and
            all(type(value) is int for value in export['source_request_numbers']),
            'Point output link differs')
    document = strict_json(output_bytes)
    require(set(document) == {'schema_version', 'metadata', 'benchmark_siblings', 'selected_point',
                              'trace_availability', 'outcome', 'timeline', 'histograms', 'server_metrics'} and
            type(document['schema_version']) is int and document['schema_version'] == 1,
            'Point diagnostic output shape differs')
    metadata = document['metadata']
    require(set(metadata) == {'selected_result_id', 'retrieved_at', 'requests', 'ran_new_benchmark',
                              'event_timestamp_unit', 'event_timestamp_origin'} and
            metadata['selected_result_id'] == selected_id and metadata['ran_new_benchmark'] is False and
            metadata['event_timestamp_unit'] == 'nanoseconds' and
            metadata['event_timestamp_origin'] == 'offset from timeline.startNs; not wall-clock' and
            type(metadata['requests']) is list and len(metadata['requests']) == len(responses),
            'Point diagnostic metadata differs')
    completed = timestamp(metadata['retrieved_at'], 'Point diagnostic retrieval time is invalid')
    captured_times = [timestamp(response['retrieved_at'], 'Point capture time is invalid')
                      for response in responses]
    request_times = []
    for request, response in zip(metadata['requests'], responses):
        request_time = timestamp(request.get('retrieved_at'), 'Point request time is invalid') \
            if type(request) is dict else None
        require(type(request) is dict and set(request) == {'query_url', 'retrieved_at'} and
                same_url(request['query_url'], response['url']) and request_time is not None,
                'Point output is not linked to its captured request')
        request_times.append(request_time)
    ordered_times = [started]
    for captured, requested in zip(captured_times, request_times):
        ordered_times.extend((captured, requested))
    ordered_times.extend((completed, finished))
    require(ordered_times == sorted(ordered_times), 'Point evidence timestamps are not chronological')
    require(same_json(document['benchmark_siblings'], siblings) and same_json(document['selected_point'], selected) and
            same_json(document['trace_availability'], {'response': availability,
                                                       'key_present': selected_id in availability,
                                                       'available': trace_available}),
            'Point diagnostic differs from complete responses')
    if trace_available:
        timeline, histograms, server_metrics = bodies[3:]
        check_point_shapes(selected_id, timeline, histograms, server_metrics)
        require(document['outcome'] == 'trace_diagnostics' and same_json(document['timeline'], timeline) and
                same_json(document['histograms'], histograms) and same_json(document['server_metrics'], server_metrics),
                'Trace diagnostic differs from complete responses')
    else:
        require(document['outcome'] == 'trace_unavailable' and
                all(document[field] is None for field in ('timeline', 'histograms', 'server_metrics')),
                'No-trace diagnostic must stop before heavy responses')
    return document['outcome']


def point_recipe(installed, selected_id):
    text = (installed / 'references/agentx.md').read_text()
    matches = re.findall(r"```bash\nnode --input-type=module <<'JS'\n([\s\S]*?)\nJS\n```", text)
    require(len(matches) == 1, 'Installed skill must contain exactly one maintained AgentX point recipe')
    needle = "const selectedResultId = '421';"
    require(matches[0].count(needle) == 1, 'Installed AgentX point recipe selection seam changed')
    return matches[0].replace(needle, f"const selectedResultId = '{selected_id}';")


def run_point(node, installed, project, environment, label, selected_id, version, deadline=None):
    script = project / f'{label}-recipe.mjs'
    preload = project / f'{label}-capture.mjs'
    output = project / f'{label}.json'
    evidence = project / f'{label}-evidence'
    script.write_text(point_recipe(installed, selected_id))
    preload.write_text(POINT_CAPTURE_PRELOAD)
    point_environment = dict(environment)
    point_environment.update(INFERENCEX_POINT_EVIDENCE=str(evidence), INFERENCEX_POINT_ID=selected_id,
                             INFERENCEX_POINT_OUTPUT=str(output.resolve()), INFERENCEX_PACKAGE_VERSION=version)
    stdout = run([node, '--import', preload.as_uri(), script], project, point_environment, label, deadline)
    output.write_text(stdout)
    strict_json(output.read_bytes())
    capture = strict_json((evidence / 'manifest.json').read_bytes())
    require(capture['status'] == 'pending', 'Point capture completed before verifier output validation')
    capture['status'] = 'complete'
    capture['finished_at'] = now()
    capture['output']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
    capture['output']['source_request_numbers'] = list(range(1, len(capture['responses']) + 1))
    save(evidence / 'manifest.json', capture)
    return check_agentx_point(project, f'{label}-evidence', f'{label}.json', selected_id, version)


def check_point_outcomes(outcomes):
    require(outcomes == ['trace_diagnostics', 'trace_unavailable'],
            'AgentX release verification must exercise one traced and one no-trace point')
    return outcomes


def prompt(args, target, archive):
    archive = archive.resolve()
    project = archive.parent
    installed = project / ('.agents' if target == 'codex' else '.claude') / 'skills/inferencex-api'
    cutoff = f'as of {args.date}' if args.date else 'using the latest available observations'
    raw = f' Keep only the exact returned model key {args.raw_model}; record this filter as scope.raw_model in lookup.json.' if args.raw_model else ''
    return f'''Use only the exact candidate archive and public HTTP data in this clean project.

The prepared project root is {project}. The exact candidate archive is available at {archive}. Run all three install, status, and preview commands from that exact directory. Do not change directories or pass --dir or --cwd; do not select any other installation root. Run these commands in order:

1. npm exec --yes --offline --package {archive} -- inferencex-skills install --target {target}
2. npm exec --yes --offline --package {archive} -- inferencex-skills status --target {target} --json > status.json
3. npm exec --yes --offline --package {archive} -- inferencex-skills install --target {target} --force --dry-run --json > preview.json

The installed skill must be exactly {installed}. Do not apply the forced reinstall or manually change the installed skill files. Explain the executing package version, installed version, proposed writes, and preserved files.

For {args.model} {cutoff}, show five latest single-turn benchmark observations with {args.isl} input and {args.osl} output tokens, regardless of power validation. Save lookup.json using the installed lookup example's output shape.{raw} Do not introduce additional filters.

Export validated measured PowerX data for that exact scope to powerx.csv and powerx.json. Explain mean watts per GPU, whole-deployment J/output token, prefill watts per GPU, missing requested metrics, exclusions, and extraction context. Preserve source/configuration details and real zeroes.

Attempt the same validated export for exactly {args.empty_isl} input and {args.empty_osl} output tokens as unavailable.json; save its request report, retain the original result, and use the installed bounded diagnostic guidance to save diagnostic.json and explain availability without changing the requested scope.

For {args.agentx_model} using the latest public observations, export AgentX summaries to agentx.csv and agentx.json with separate fresh evidence directories agentx-csv-evidence and agentx-json-evidence. Use only the display-model filter. Preserve every selected benchmark object, summary enrichment, missing state, zero, false value, request URL, and retrieval time. Also request the exact raw-model key {AGENTX_EXCLUDED_RAW_MODEL} as agentx-excluded.json with evidence in agentx-excluded-evidence, and explain the resulting empty or excluded selection without changing its scope.

Use the maintained installed one-point AgentX recipe for exactly result ID {args.agentx_point_id} and save its JSON as agentx-point.json. Run it separately for exactly result ID {args.agentx_no_trace_id} and save that JSON as agentx-second-point.json. Do not expand either selection to sibling IDs or make bulk diagnostic reads. For each run, transparently clone the same public fetch responses consumed by the recipe into agentx-point-evidence or agentx-second-point-evidence. Keep the full OpenAPI, sibling, availability, and any recipe-requested diagnostic response bodies; a later request to the same URL is not evidence for the recipe output.

Each point evidence directory must contain manifest.json with exactly these top-level fields: `schema_version`, `package_version`, `selected_result_id`, `status`, `started_at`, `finished_at`, `responses`, `output`, and `error`. Start capture with schema_version 1, the exact package version and selected ID, `status: "pending"`, `finished_at: null`, and `error: null`. The final manifest is accepted only with `status: "complete"` and `error: null`; set finished_at only after the output is complete. Do not add or rename fields, and never relabel a failed or incomplete run as complete.

Every ordered responses item must contain exactly `operation`, `request_number`, `url`, `method`, `retrieved_at`, `http_status`, `decoded_body_sha256`, `body_file`, and `checksum_covers`. Use one-based request numbers, method GET, integer http_status 200, and checksum_covers `saved decoded response body`. The body filename must be `response-NNNN-<operation>.json`: the first three are `response-0001-openapi.json`, `response-0002-benchmark-siblings.json`, and `response-0003-trace-availability.json`; when trace data is available, continue with `response-0004-request-timeline.json`, `response-0005-trace-histograms.json`, and `response-0006-trace-server-metrics.json`. A no-trace run must stop after response 3.

The output record must contain exactly `format`, `destination`, `sha256`, and `source_request_numbers`. Use format json; set destination to the corresponding absolute resolved path {project / 'agentx-point.json'} or {project / 'agentx-second-point.json'}; hash the final output bytes; and set source_request_numbers to every one-based response number in order. While capture is pending, use sha256 null and an empty source_request_numbers list.

There is no repository or database access in this project. Do not read another checkout, call private services, install other dependencies, or run benchmarks. Save complete public responses and request URLs with retrieval times locally. Do not assume row counts or reconstruct data from webpage summaries. Write the final explanation to result.md. Keep command output compact.

The complete response files are required deliverables. Use the exporter's built-in --evidence-dir with separate fresh directories powerx-csv-evidence, powerx-json-evidence, and unavailable-evidence for the corresponding outputs. For lookup and diagnosis, save each complete consumed body as raw-responses/lookup.response.json and raw-responses/diagnostic.response.json before selecting rows. Beside each body save a .request.json record with query_url, status, retrieved_at, and sha256 of the saved body; use that same retrieved_at value in the corresponding lookup or diagnostic output. The five-row lookup, selected export rows, and diagnostic summary are not substitutes for original responses. Before finishing, verify these files exist alongside result.md.

Each lookup, CSV export, JSON export, empty export, and diagnostic must be traceable to the complete response from the very same HTTP request it consumed. A separate request to the same URL does not satisfy this requirement. Keep installed skill files unchanged. Matching row counts alone do not establish original-response capture.
'''


def check_installed(installed, skill_files, version):
    require(stat.S_ISDIR(installed.lstat().st_mode), 'Installed skill root must be a real directory')
    actual_files, actual_dirs = set(), set()
    pending = [installed]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                entry_stat = entry.stat(follow_symlinks=False)
                name = str(Path(entry.path).relative_to(installed))
                require(not stat.S_ISLNK(entry_stat.st_mode), f'Installed entry must not be a symlink: {name}')
                if stat.S_ISDIR(entry_stat.st_mode):
                    actual_dirs.add(name)
                    pending.append(Path(entry.path))
                else:
                    require(stat.S_ISREG(entry_stat.st_mode),
                            f'Installed entry must be a regular file: {name}')
                    actual_files.add(name)
    expected_files = set(skill_files) | {'.inferencex-skills.json'}
    expected_dirs = set()
    for name in expected_files:
        parent = Path(name).parent
        while parent != Path('.'):
            expected_dirs.add(str(parent))
            parent = parent.parent
    require(actual_files == expected_files and actual_dirs == expected_dirs,
            'Unexpected installed files or directories')
    for name, content in skill_files.items():
        require((installed / name).read_bytes() == content, f'Installed file differs from archive: {name}')
    receipt = json.loads((installed / '.inferencex-skills.json').read_text())
    require(receipt == {'package': PACKAGE, 'version': version}, 'Installed-version receipt differs')


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
    parser.add_argument('--agentx-model', required=True)
    parser.add_argument('--agentx-point-id', required=True)
    parser.add_argument('--agentx-no-trace-id', required=True)
    parser.add_argument('--evidence', type=Path, required=True, help='New directory; previous attempts are never overwritten')
    parser.add_argument('--project', type=Path, help='Prepared native-agent project, for check-agent')
    args = parser.parse_args()
    require(args.isl > 0 and args.osl > 0 and args.empty_isl > 0 and args.empty_osl > 0, 'Token counts must be positive')
    for option in ('agentx_point_id', 'agentx_no_trace_id'):
        value = getattr(args, option)
        require(type(value) is str and safe_result_id(value) is not None and str(safe_result_id(value)) == value,
                f'--{option.replace("_", "-")} must be a canonical positive safe integer string')
    require(args.agentx_point_id != args.agentx_no_trace_id, 'AgentX point IDs must be distinct')
    if args.date:
        require(datetime.strptime(args.date, '%Y-%m-%d').strftime('%Y-%m-%d') == args.date, 'Use a YYYY-MM-DD cutoff')
    record = json.loads(args.manifest.read_text())
    require(type(record.get('filename')) is str and
            re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*\.tgz', record['filename']) is not None,
            'Archive filename must be a safe .tgz basename')
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
              'scope': {key: getattr(args, key) for key in ['model', 'date', 'isl', 'osl', 'raw_model', 'empty_isl',
                                                           'empty_osl', 'agentx_model', 'agentx_point_id',
                                                           'agentx_no_trace_id']}}
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
            require(prepared.get('mode') == 'agents' and prepared.get('status') == 'prepared',
                    'Acceptance preparation state differs')
            require(prepared['candidate'] == record, 'Agent project belongs to another candidate')
            require(prepared['scope'] == report['scope'], 'Check scope differs from prepared prompt')
            targets = prepared.get('targets')
            require(type(targets) is list and len(targets) == 2 and all(
                type(target) is dict and set(target) == {'target', 'project', 'status', 'prompt_sha256'} and
                target['target'] in {'codex', 'claude'} and target['status'] == 'awaiting-native-agent' and
                type(target['project']) is str and type(target['prompt_sha256']) is str and
                re.fullmatch(r'[0-9a-f]{64}', target['prompt_sha256']) is not None for target in targets) and
                {target['target'] for target in targets} == {'codex', 'claude'} and
                len({Path(target['project']).resolve() for target in targets}) == 2,
                'Prepared target set differs')
            matches = [target for target in targets if Path(target['project']).resolve() == args.project.resolve()]
            require(len(matches) == 1, 'Project was not prepared for this acceptance run')
            prepared_target = matches[0]
            local_archive = args.project / record['filename']
            require(local_archive.read_bytes() == body, 'Native-agent archive differs from accepted candidate')
            prompt_bytes = (args.project / 'prompt.txt').read_bytes()
            require(prepared_target['prompt_sha256'] == hashlib.sha256(prompt_bytes).hexdigest() and
                    prompt_bytes == prompt(args, prepared_target['target'], local_archive).encode(),
                    'Native-agent prompt differs from prepared target')
            installed = args.project / ('.agents' if prepared_target['target'] == 'codex' else '.claude') / 'skills/inferencex-api'
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
            agentx = [
                check_agentx_capture(args.project, 'agentx-json-evidence', 'agentx.json', args, record['version']),
                check_agentx_capture(args.project, 'agentx-csv-evidence', 'agentx.csv', args, record['version']),
                check_agentx_capture(args.project, 'agentx-excluded-evidence', 'agentx-excluded.json', args,
                                     record['version'], excluded=True)]
            points = check_point_outcomes([
                check_agentx_point(args.project, 'agentx-point-evidence', 'agentx-point.json',
                                   args.agentx_point_id, record['version']),
                check_agentx_point(args.project, 'agentx-second-point-evidence', 'agentx-second-point.json',
                                   args.agentx_no_trace_id, record['version'])])
            require((args.project / 'result.md').read_text().strip(), 'Native-agent narrative is missing')
            result.update(agentx=agentx, agentx_points=points)
            report.update(status='data-checks-passed', narrative_review='required', targets=[result])
            return
        if args.mode == 'public':
            metadata = json.loads(fetch_public(f'{REGISTRY}/@semianalysisai%2finferencex-skills/{record["version"]}', args.evidence / 'registry.json', report, deadline))
            require(metadata['name'] == PACKAGE and metadata['version'] == record['version'] and
                    metadata['dist']['integrity'] == record['integrity'], 'Public metadata differs from candidate')
            public = fetch_public(metadata['dist']['tarball'], args.evidence / 'public-package.tgz', report, deadline)
            require(public == body, 'Public tarball differs from the accepted archive')
        node = npm = None
        if args.mode != 'agents':
            node, npm = shutil.which('node'), shutil.which('npm')
            require(node and npm, 'Node 24 and npm must be on PATH')
        clean_root = Path(tempfile.mkdtemp(prefix='inferencex-skill-acceptance-')).resolve()
        report['clean_root'] = str(clean_root)
        for target in ['codex', 'claude']:
            if args.mode == 'agents':
                project = (clean_root / target).resolve()
                project.mkdir()
                local_archive = (project / record['filename']).resolve()
                local_archive.write_bytes(body)
                prompt_bytes = prompt(args, target, local_archive).encode()
                (project / 'prompt.txt').write_bytes(prompt_bytes)
                require({path.name for path in project.iterdir()} == {record['filename'], 'prompt.txt'} and
                        all(stat.S_ISREG(path.lstat().st_mode) for path in project.iterdir()),
                        'Native-agent project is not a fresh prompt-and-archive boundary')
                report['targets'].append({
                    'target': target, 'project': str(project), 'status': 'awaiting-native-agent',
                    'prompt_sha256': hashlib.sha256(prompt_bytes).hexdigest()})
                continue
            project, env = install_target(clean_root, target, node, npm, archive, record['version'],
                                          args.mode == 'public', report, deadline)
            installed = project / ('.agents' if target == 'codex' else '.claude') / 'skills/inferencex-api'
            check_installed(installed, skill_files, record['version'])
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
            agentx = []
            for output_format in ['json', 'csv']:
                run([node, installed / 'scripts/export-agentx.mjs', '--model', args.agentx_model,
                     '--format', output_format, '--output', f'agentx.{output_format}',
                     '--evidence-dir', f'agentx-{output_format}-evidence'], project, env,
                    f'agentx-{output_format}', deadline)
                agentx.append(check_agentx_capture(project, f'agentx-{output_format}-evidence',
                                                   f'agentx.{output_format}', args, record['version']))
            run([node, installed / 'scripts/export-agentx.mjs', '--model', args.agentx_model,
                 '--raw-model', AGENTX_EXCLUDED_RAW_MODEL, '--format', 'json',
                 '--output', 'agentx-excluded.json', '--evidence-dir', 'agentx-excluded-evidence'],
                project, env, 'agentx-excluded', deadline)
            agentx.append(check_agentx_capture(project, 'agentx-excluded-evidence', 'agentx-excluded.json',
                                               args, record['version'], excluded=True))
            points = check_point_outcomes([
                run_point(node, installed, project, env, 'agentx-point', args.agentx_point_id,
                          record['version'], deadline),
                run_point(node, installed, project, env, 'agentx-second-point', args.agentx_no_trace_id,
                          record['version'], deadline)])
            check_installed(installed, skill_files, record['version'])
            result.update(agentx=agentx, agentx_points=points)
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
