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
OPENAPI = f'{AGENTX_ORIGIN}/api/openapi.json'
AGENTX_EXCLUDED_RAW_MODEL = '__inferencex_release_verification_no_match__'
COLLECTIVEX_POSITIVE_RUN_IDS = ('33378604574', '33412478973')
COLLECTIVEX_RUN_LIST_URL = f'{AGENTX_ORIGIN}/api/v1/collectivex/runs?version=1'
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
CONTRACT_POWERX_CSV_COLUMNS = [*CSV_COLUMNS[:7], 'source_response_id', *CSV_COLUMNS[7:]]
CONTRACT_AGENTX_CSV_COLUMNS = [
    *AGENTX_CONTEXT_COLUMNS, 'source_response_ids', *AGENTX_BENCHMARK_COLUMNS,
    'metrics_json', *AGENTX_ENRICHMENT_COLUMNS]
AGENTX_REQUIRED_STRINGS = ('hardware', 'framework', 'model', 'precision', 'spec_method',
                           'benchmark_type', 'offload_mode', 'date')
AGENTX_REQUIRED_BOOLEANS = ('disagg', 'is_multinode', 'prefill_dp_attention', 'decode_dp_attention')
AGENTX_REQUIRED_INTEGERS = ('prefill_tp', 'prefill_ep', 'prefill_num_workers', 'decode_tp', 'decode_ep',
                            'decode_num_workers', 'num_prefill_gpu', 'num_decode_gpu', 'conc')
RELEASE_CONFIGURATION_FIELDS = '''model hardware framework precision spec_method benchmark_type
isl osl conc offload_mode disagg is_multinode prefill_tp prefill_ep prefill_dp_attention
prefill_num_workers decode_tp decode_ep decode_dp_attention decode_num_workers
num_prefill_gpu num_decode_gpu'''.split()
RELEASE_CONFIGURATION_METRICS = '''prefill_pp decode_pp dcp_size pcp_size prefill_dcp_size
decode_dcp_size prefill_pcp_size decode_pcp_size kv_offloading kv_offload_backend
kv_offload_backend_version kv_p2p_transfer router_name router_version'''.split()
POINT_OPERATIONS = (
    ('openapi', '/api/openapi.json', None),
    ('benchmark-siblings', '/api/v1/benchmark-siblings', 'id'),
    ('trace-availability', '/api/v1/trace-availability', 'ids'),
    ('request-timeline', '/api/v1/request-timeline', 'id'),
    ('trace-histograms', '/api/v1/trace-histograms', 'ids'),
    ('trace-server-metrics', '/api/v1/trace-server-metrics', 'id'))
DATA_HELPERS = (
    'export-powerx', 'export-agentx', 'investigate-result', 'compare-tco',
    'compare-releases', 'compare-collectivex')
OFFLINE_CAPTURES = (
    ('powerx-json', 'powerx-json-evidence', 'powerx.json'),
    ('powerx-csv', 'powerx-csv-evidence', 'powerx.csv'),
    ('agentx-json', 'agentx-json-evidence', 'agentx.json'),
    ('agentx-csv', 'agentx-csv-evidence', 'agentx.csv'),
    ('agentx-excluded', 'agentx-excluded-evidence', 'agentx-excluded.json'))


def now():
    return datetime.now(timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version_at_least(version, minimum):
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?', version)
    require(match is not None, 'Package version must be semantic')
    return tuple(map(int, match.groups())) >= minimum


def structured_errors_required(version):
    return version_at_least(version, (0, 10, 0))


def offline_verifier_required(version):
    return version_at_least(version, (0, 11, 0))


def contract_one_required(version):
    return version_at_least(version, (1, 0, 0))


def check_powerx_schema(document, version):
    if structured_errors_required(version):
        require(set(document) == {'schema_version', 'metadata', 'rows'} and
                type(document['schema_version']) is int and document['schema_version'] == 1,
                'PowerX JSON schema version differs')


def check_structured_error(error, command, version):
    require(isinstance(error, subprocess.CalledProcessError) and error.returncode == 2,
            f'{command} invalid argument must exit 2')
    require(error.output == '', f'{command} invalid argument wrote to stdout')
    stderr = error.stderr
    require(type(stderr) is str and stderr.endswith('\n') and stderr.count('\n') == 1,
            f'{command} stderr must contain exactly one JSON envelope')
    try:
        document = json.loads(stderr)
    except json.JSONDecodeError as caught:
        raise ValueError(f'{command} stderr is not one JSON envelope') from caught
    require(type(document) is dict and
            set(document) == {'schema_version', 'package', 'package_version', 'command', 'error'} and
            type(document.get('schema_version')) is int and document['schema_version'] == 1 and
            document['package'] == PACKAGE and document['package_version'] == version and
            document['command'] == command,
            f'{command} structured error identity differs')
    detail = document['error']
    require(type(detail) is dict and set(detail) == {'code', 'message'} and
            detail['code'] == 'INVALID_ARGUMENT' and
            type(detail['message']) is str and bool(detail['message'].strip()),
            f'{command} structured error detail differs')
    return document


def check_structured_errors(node, npm, installed, project, environment, archive, version, public,
                            deadline=None):
    if not structured_errors_required(version):
        return []
    commands = [(name, [node, installed / f'scripts/{name}.mjs']) for name in DATA_HELPERS]
    spec = f'{PACKAGE}@{version}' if public else str(archive)
    commands.append(('inferencex-skills', [npm, 'exec', '--yes', '--offline', '--package', spec,
                                           '--', 'inferencex-skills']))
    evidence = []
    for command_name, prefix in commands:
        command = [*prefix, '--error-format', 'json', '--invalid-argument']
        label = f'structured-error-{command_name}'
        try:
            run(command, project, environment, label, deadline)
        except subprocess.CalledProcessError as error:
            envelope = check_structured_error(error, command_name, version)
        else:
            raise ValueError(f'{command_name} invalid argument unexpectedly succeeded')
        evidence.append({'command': [str(part) for part in command], 'exit_code': 2,
                         'stdout_file': str(project / f'{label}.stdout.log'),
                         'stderr_file': str(project / f'{label}.stderr.log'),
                         'envelope': envelope})
    return evidence


def file_fingerprint(path, label):
    entry = path.lstat()
    require(stat.S_ISREG(entry.st_mode), f'{label} must be a regular file')
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b''):
            digest.update(chunk)
    after = path.lstat()
    require((entry.st_dev, entry.st_ino, entry.st_mode, entry.st_size, entry.st_mtime_ns) ==
            (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns),
            f'{label} changed while it was inspected')
    return {'mode': stat.S_IMODE(entry.st_mode), 'bytes': entry.st_size,
            'sha256': digest.hexdigest()}


def saved_export_fingerprint(evidence, output, label):
    entry = evidence.lstat()
    require(stat.S_ISDIR(entry.st_mode), f'{label} evidence must be a real directory')
    files = {}
    with os.scandir(evidence) as entries:
        for item in entries:
            item_stat = item.stat(follow_symlinks=False)
            require(stat.S_ISREG(item_stat.st_mode),
                    f'{label} evidence entry must be a regular file: {item.name}')
            files[item.name] = file_fingerprint(Path(item.path), f'{label} evidence {item.name}')
    return {'evidence_mode': stat.S_IMODE(entry.st_mode), 'evidence_files': files,
            'export': file_fingerprint(output, f'{label} export')}


def verify_saved_exports(node, installed, project, environment, version, deadline=None):
    if not offline_verifier_required(version):
        return []
    verifier = installed / 'scripts/verify-export.mjs'
    require(verifier.is_file() and not verifier.is_symlink(), 'The installed offline verifier is missing')
    denial = project / 'verify-export-deny-network.mjs'
    denial.write_text("globalThis.fetch = () => { throw new Error('offline verifier attempted HTTP'); };\n")
    results = []
    for label, evidence_name, output_name in OFFLINE_CAPTURES:
        evidence, output = project / evidence_name, project / output_name
        before = saved_export_fingerprint(evidence, output, label)
        reports, stdout_files = [], []
        for attempt in (1, 2):
            run_label = f'verify-{label}-{attempt}'
            run([node, '--import', denial, verifier, '--evidence-dir', evidence, '--export', output],
                project, environment, run_label, deadline)
            stdout = project / f'{run_label}.stdout.log'
            reports.append(stdout.read_bytes())
            stdout_files.append(str(stdout))
            require(saved_export_fingerprint(evidence, output, label) == before,
                    f'Offline verifier modified {label} inputs')
        require(reports[0] and reports[0] == reports[1],
                f'Offline verifier report is not deterministic for {label}')
        results.append({'capture': label, 'runs': 2, 'report_bytes': len(reports[0]),
                        'report_sha256': hashlib.sha256(reports[0]).hexdigest(),
                        'stdout_files': stdout_files})
    return results


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
    check_powerx_schema(document, version)
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


def captured_request(project, name, expected_url, metadata=None):
    context = json.loads((project / 'raw-responses' / f'{name}.request.json').read_text())
    body = (project / 'raw-responses' / f'{name}.response.json').read_bytes()
    require(type(context) is dict and set(context) == {'query_url', 'status', 'retrieved_at', 'sha256'} and
            context['status'] == 200 and same_url(context['query_url'], expected_url) and
            context['sha256'] == hashlib.sha256(body).hexdigest(), 'Original request evidence differs')
    timestamp(context['retrieved_at'], 'Missing original response retrieval timezone')
    if metadata is not None:
        require(same_url(metadata['query_url'], context['query_url']) and
                metadata['retrieved_at'] == context['retrieved_at'], 'Output and original request context differ')
    return json.loads(body)


def check_lookup_openapi(document, model):
    paths = document.get('paths') if type(document) is dict else None
    path = paths.get('/api/v1/benchmarks') if type(paths) is dict else None
    operation = path.get('get') if type(path) is dict else None
    parameters = operation.get('parameters') if type(operation) is dict else None
    model_parameters = [parameter for parameter in parameters if type(parameter) is dict and
                        parameter.get('name') == 'model' and parameter.get('in') == 'query'] \
        if type(parameters) is list else []
    schema = model_parameters[0].get('schema') if len(model_parameters) == 1 else None
    models = schema.get('enum') if type(schema) is dict else None
    require(type(models) is list and model in models, 'Lookup OpenAPI model contract differs')


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


def same_json(actual, expected, *, javascript_numbers=False):
    if finite(actual) and finite(expected):
        return float(actual) == float(expected) if javascript_numbers else actual == expected
    if type(actual) is not type(expected):
        return False
    if type(actual) is dict:
        return actual.keys() == expected.keys() and all(
            same_json(actual[key], expected[key], javascript_numbers=javascript_numbers) for key in actual)
    if type(actual) is list:
        return len(actual) == len(expected) and all(
            same_json(a, b, javascript_numbers=javascript_numbers) for a, b in zip(actual, expected))
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


def point_request(request, response, evidence):
    require(type(request) is dict and set(request) == {'query_url', 'retrieved_at', 'body_utf8'} and
            same_url(request['query_url'], response['url']),
            'Point output request identity differs from its capture')
    require(type(request['body_utf8']) is str and
            request['body_utf8'].encode('utf-8') == (evidence / response['body_file']).read_bytes(),
            'Point output raw response text differs from its capture')
    return timestamp(request['retrieved_at'], 'Point request time is invalid')


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
    request_times = []
    for request, response in zip(metadata['requests'], responses):
        request_time = point_request(request, response, evidence)
        require(request['retrieved_at'] == response['retrieved_at'],
                'Point output is not linked to its captured request')
        request_times.append(request_time)
    ordered_times = [started, *request_times, completed, finished]
    require(ordered_times == sorted(ordered_times), 'Point evidence timestamps are not chronological')
    # Exact source integers are pinned by body_utf8 above; the parsed views use JavaScript Number.
    require(same_json(document['benchmark_siblings'], siblings, javascript_numbers=True) and
            same_json(document['selected_point'], selected, javascript_numbers=True) and
            same_json(document['trace_availability'], {'response': availability,
                                                       'key_present': selected_id in availability,
                                                       'available': trace_available}),
            'Point diagnostic differs from complete responses')
    if trace_available:
        timeline, histograms, server_metrics = bodies[3:]
        check_point_shapes(selected_id, timeline, histograms, server_metrics)
        require(document['outcome'] == 'trace_diagnostics' and
                same_json(document['timeline'], timeline, javascript_numbers=True) and
                same_json(document['histograms'], histograms, javascript_numbers=True) and
                same_json(document['server_metrics'], server_metrics, javascript_numbers=True),
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


def check_point_recipe(project, installed, label, selected_id):
    script = project / f'{label}-recipe.mjs'
    require(script.is_file() and not script.is_symlink() and
            script.read_bytes() == point_recipe(installed, selected_id).encode(),
            f'Native-agent point recipe changed beyond its selected ID: {label}')


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
    document = strict_json(output.read_bytes())
    capture = strict_json((evidence / 'manifest.json').read_bytes())
    require(capture['status'] == 'pending', 'Point capture completed before verifier output validation')
    requests = document.get('metadata', {}).get('requests') if type(document) is dict else None
    require(type(requests) is list and len(requests) == len(capture['responses']),
            'Point output request list differs from its capture')
    for request, response in zip(requests, capture['responses']):
        point_request(request, response, evidence)
        response['retrieved_at'] = request['retrieved_at']
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
    install_command = f'npm exec --yes --offline --package {archive} -- inferencex-skills install --target {target}'
    status_command = f'npm exec --yes --offline --package {archive} -- inferencex-skills status --target {target} --json > status.json'
    preview_command = f'npm exec --yes --offline --package {archive} -- inferencex-skills install --target {target} --force --dry-run --json > preview.json'
    base = f'''Your first three tool calls must be shell calls containing exactly these commands, one per call, in this order:

1. {install_command}
2. {status_command}
3. {preview_command}

Make exactly one shell tool call at a time, and wait for it to finish successfully before issuing the next. Until all three finish, make no tool calls except the next required shell call; in particular, do not call Read, Glob, Grep, or Skill. Do not prefix, suffix, or combine the commands with `pwd`, `ls`, `cat`, `&&`, `;`, a pipe, or any other command.

After those three calls, run every later shell call directly in the existing working directory. Every shell already starts in {project}; a shell call containing `cd` or any path at or below `/dev`, including `/dev/null.txt`, fails acceptance even when `cd` names this exact project, so start each call with the actual operation and never prepend a project-root setup line.

Perform HTTP-producing work strictly in this order: lookup; PowerX CSV; PowerX JSON; unavailable PowerX; diagnostic; AgentX CSV; AgentX JSON; excluded AgentX; traced point; no-trace point. Before issuing an HTTP-producing command, resolve every redirect destination and use its final in-project path in that first command. The first command issued for an operation consumes its only attempt, even if shell parsing, redirection, preload/import, or process startup fails before any HTTP request; never issue a second command for that operation. If one fails, stop and preserve the failure; do not retry it, delete its evidence, or replace its output.

Use only the exact candidate archive and public HTTP data in this clean project.

Before running any command, follow these acceptance boundaries:

- This prepared project is the only writable boundary, even though it lives under system temp. Keep the working directory at {project}, and put every task-created temporary, log, response, script, and redirected-output file there. Every shell redirection destination, including a throwaway check, must resolve inside this project. Every path at or below `/dev` is outside the project and forbidden; use a named file in the project or leave the stream attached. Do not use shell process substitution (`<(...)` or `>(...)`), because it materializes paths below `/dev/fd`; compare data directly or write explicitly named files inside the project. The shell already starts here; do not run `cd`, even back to this same path. Never create, extract, or delete task files in `/tmp`, `$TMPDIR`, `$HOME`, or another directory.
- Do not list or extract the candidate archive. Inspect only the installed skill after the three required commands finish. Do not list or inventory the prepared project root with `ls`, `find`, `tree`, a shell glob, or an equivalent command. Any root listing exposes `.npm-cache` and fails acceptance. Inspect only explicitly named installed-skill files and explicitly named deliverable paths or directories; never list, read, or inspect `.npm-cache`. Do not use owner-bearing listings such as `ls -l` or `ls -la`, even inside an allowed directory; they expose local account names. Plain `ls` is allowed only for an explicitly named deliverable directory.
- Do not run a connectivity or schema preflight with `curl` or any other tool. The task's first two HTTP requests must be the captured OpenAPI request and captured benchmark request; only after both response captures and lookup.json exist may an exporter or diagnostic make an HTTP request. Do not make a preliminary, uncaptured, retry, or evidence-only repeat request for lookup or diagnosis.
- For each AgentX point, keep the installed recipe byte-for-byte except for its one selected-result-ID line. Put response capture only in a separate Node preload and save the recipe's own stdout by shell redirection.

The prepared project root is {project}. The exact candidate archive is available at {archive}. Run the required install, status, and preview commands from that exact directory. Do not change directories or pass --dir or --cwd; do not select any other installation root.

The installed skill must be exactly {installed}. Do not apply the forced reinstall or manually change the installed skill files. Explain the executing package version, installed version, proposed writes, and preserved files.

For {args.model} {cutoff}, show five latest single-turn benchmark observations with {args.isl} input and {args.osl} output tokens, regardless of power validation. Save lookup.json using the installed lookup example's output shape.{raw} Do not introduce additional filters.

The lookup must make exactly two HTTP requests: fetch `/api/openapi.json` once and then the exact benchmark URL once. Save the bodies as raw-responses/lookup-openapi.response.json and raw-responses/lookup.response.json, with matching raw-responses/lookup-openapi.request.json and raw-responses/lookup.request.json records.

Export validated measured PowerX data for that exact scope to powerx.csv and powerx.json. In result.md, report the unweighted arithmetic mean across every selected row with a finite value for `avg_power_w`, `joules_per_output_token`, and `prefill_avg_power_w`, together with each finite and missing count; do not substitute ranges for these means. Report the exact selected-row counts for `disagg: false` and `disagg: true` from powerx.json; never describe a mixed topology as entirely non-disaggregated. Never characterize GPU counts, worker counts, or topology flags from sample rows: either report their complete value-frequency distribution across every selected row or omit that narrative. Explain the metrics' per-GPU or whole-deployment accelerator boundary. Report every other missing-metric count exactly from `powerx.json` metadata without contradictory all-missing claims. Explain exclusions and extraction context. Preserve source/configuration details and real zeroes without inferring deployment design from them.

Attempt the same validated export for exactly {args.empty_isl} input and {args.empty_osl} output tokens as unavailable.json; save its request report and retain the original result. Run the installed bounded diagnostic exactly once. It must make exactly one HTTP request in total, the unfiltered benchmark request, save raw-responses/diagnostic.response.json and raw-responses/diagnostic.request.json, and produce diagnostic.json without changing the requested scope. In result.md, keep the strict export's returned-row count separate from `diagnostic.json`'s unfiltered returned-row count and report each from its own artifact.

For {args.agentx_model} using the latest public observations, export AgentX summaries to agentx.csv and agentx.json with separate fresh evidence directories agentx-csv-evidence and agentx-json-evidence. Use only the display-model filter. Preserve every selected benchmark object, summary enrichment, missing state, zero, false value, request URL, and retrieval time. In result.md, report every aggregate group's available, null, and missing-entry counts and the derived-metric and trace-availability coverage exactly from `agentx.json` metadata; do not infer coverage from one sample row. Also request the exact raw-model key {AGENTX_EXCLUDED_RAW_MODEL} as agentx-excluded.json with evidence in agentx-excluded-evidence, and explain the resulting empty or excluded selection without changing its scope. Describe that key only as unmatched in the current complete response; do not claim it can never appear in real or future data.

Run the installed one-point recipe as written for both points. Extract it exactly from {installed / 'references/agentx.md'} into agentx-point-recipe.mjs for result ID {args.agentx_point_id} and agentx-second-point-recipe.mjs for result ID {args.agentx_no_trace_id}. Extract only the bytes after the `node --input-type=module <<'JS'` line through the final `}}` before the `JS` delimiter; the file must end at that final `}}` byte with no trailing newline or other byte. Do not create an outside-project scratch copy while extracting or comparing the recipe files. In each file, change only the exact `const selectedResultId = '421';` line to its requested ID; every other recipe byte must remain identical. Run each recipe with a separate Node `--import` capture preload, and redirect that recipe process's stdout directly to agentx-point.json or agentx-second-point.json. The recipe files must not write their output or evidence, replace `response.json()`, replace `console.log()`, or contain capture logic. Do not reimplement the request flow or reconstruct the JSON output. Do not expand either selection to sibling IDs or make bulk diagnostic reads. For each run, transparently clone the same public fetch responses consumed by the recipe into agentx-point-evidence or agentx-second-point-evidence. Keep the full OpenAPI, sibling, availability, and any recipe-requested diagnostic response bodies; a later request to the same URL is not evidence for the recipe output.

Read the recipe-owned `metadata.requests` only after that run's final fetch has completed. Each item contains exactly `query_url`, `retrieved_at`, and `body_utf8` for every manifest response in identical order (six for a traced run and three for a no-trace run); each `query_url` must match the corresponding manifest response `url`, and each manifest response `retrieved_at` must equal the recipe output's corresponding `metadata.requests` value byte-for-byte. Preserve `body_utf8` exactly: its UTF-8 bytes must equal the captured response file, including large-integer digits and whitespace. Do not rebuild it from parsed JSON. Keep the manifest pending until the redirected recipe output exists, then finalize it using those recipe-owned request times rather than a parallel capture timestamp.

Each point evidence directory must contain manifest.json with exactly these top-level fields: `schema_version`, `package_version`, `selected_result_id`, `status`, `started_at`, `finished_at`, `responses`, `output`, and `error`. Start capture with schema_version 1, the exact package version and selected ID, `status: "pending"`, `finished_at: null`, and `error: null`. The final manifest is accepted only with `status: "complete"` and `error: null`; set finished_at only after the output is complete. Do not add or rename fields, and never relabel a failed or incomplete run as complete.

Every ordered responses item must contain exactly `operation`, `request_number`, `url`, `method`, `retrieved_at`, `http_status`, `decoded_body_sha256`, `body_file`, and `checksum_covers`. Use one-based request numbers, method GET, integer http_status 200, and checksum_covers `saved decoded response body`. The body filename must be `response-NNNN-<operation>.json`: the first three are `response-0001-openapi.json`, `response-0002-benchmark-siblings.json`, and `response-0003-trace-availability.json`; when trace data is available, continue with `response-0004-request-timeline.json`, `response-0005-trace-histograms.json`, and `response-0006-trace-server-metrics.json`. A no-trace run must stop after response 3.

The output record must contain exactly `format`, `destination`, `sha256`, and `source_request_numbers`. Use format json; set destination to the corresponding absolute resolved path {project / 'agentx-point.json'} or {project / 'agentx-second-point.json'}; hash the final output bytes; and set source_request_numbers to every one-based response number in order. While capture is pending, use sha256 null and an empty source_request_numbers list.

In result.md, write an explicit `key_present: <value>; available: <value>` pair for each point using its `trace_availability` fields. Do not describe an omitted availability key as an explicit `false` response value.

There is no repository or database access in this project. Do not read another checkout, call private services, install other dependencies, or run benchmarks. Save complete public responses and request URLs with retrieval times inside the prepared project. Do not assume row counts or reconstruct data from webpage summaries. Write the final explanation to result.md. Before finishing it, cross-check every numeric, coverage, missing-state, and request-count claim against the corresponding JSON artifact or manifest. Include one response-count ledger that names lookup, PowerX CSV, PowerX JSON, unavailable PowerX, diagnostic, AgentX CSV, AgentX JSON, excluded AgentX, traced point, and no-trace point separately and gives each artifact's exact consumed-response count. Do not call a multi-response artifact single-response or claim that endpoint URLs never repeat across separate fresh artifacts. Keep command output compact.

The complete response files are required deliverables. Use the exporter's built-in --evidence-dir with separate fresh directories powerx-csv-evidence, powerx-json-evidence, and unavailable-evidence for the corresponding outputs. For every lookup and diagnostic request, finish reading the body before creating `retrieved_at`, then save and parse the same complete body bytes consumed by the output. Each request record must contain exactly query_url, status, retrieved_at, and sha256 of its saved body. Never use a pre-fetch timestamp. The benchmark response time must also be lookup.json's retrieved_at, and the diagnostic response time must be diagnostic.json's diagnostic.retrieved_at. The five-row lookup, selected export rows, and diagnostic summary are not substitutes for original responses. Before finishing, verify raw-responses contains exactly those six files alongside result.md.

Each lookup, CSV export, JSON export, empty export, and diagnostic must be traceable to the complete response from the very same HTTP request it consumed. A separate request to the same URL does not satisfy this requirement. Keep installed skill files unchanged. Matching row counts alone do not establish original-response capture.
'''
    if getattr(args, 'contract_one', False):
        base += f'''

After completing the compatibility workflow, exercise the installed 1.0 `inferencex` entry. First run `discover configs --model {args.model}` and preserve its JSON. Select an actually observed strict-v2 single-turn config with exactly {args.isl} input and {args.osl} output tokens; do not invent a result ID, model key, hardware, date, topology, or image. Create exactly these six new bundle directories under `bundles`: `powerx`, `agentx`, `result`, `tco`, `releases`, and `collectivex`. Use the matching formal command for each family and `--output-dir`; use the discovered result ID for `result inspect`, the explicit PowerX scope above, the AgentX display model above, the documented TCO prices b200=3.6 and mi355x=1.8, the existing GLM-5 dated release comparison, and CollectiveX runs {COLLECTIVEX_POSITIVE_RUN_IDS[0]} (left) and {COLLECTIVEX_POSITIVE_RUN_IDS[1]} (right) after confirming both remain measured in the compatibility workflow's saved current run list. Run `inferencex verify` once against each completed directory without network access. Keep every bundle's original `manifest.json`, `result.json` or CSV, and `responses/*.body` files unchanged. Add the exact six bundle summaries and policy outcomes to result.md.
'''
    return base


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


def workflow_identity(document, version):
    require(document.get('schema_version') == 1, 'Workflow schema version differs')
    actual = document.get('metadata', document).get('package_version')
    require(actual == version, 'Workflow package version differs')


def _normalized_id_object(value):
    if value is None:
        return None
    if isinstance(value, list):
        return [_normalized_id_object(item) for item in value]
    if not isinstance(value, dict):
        return value
    identity_keys = {'id', 'workflow_run_id', 'curve_workflow_run_id', 'github_run_id', 'run_attempt'}
    return {key: str(item) if key in identity_keys and item is not None else
            _normalized_id_object(item) for key, item in value.items()}


def _collective_source(bodies, requests, references, run_id):
    require(type(references) is list and len(references) == 1,
            'CollectiveX matched source reference differs')
    reference = references[0]
    index = reference.get('response_index')
    require(type(index) is int and 0 <= index < len(bodies),
            'CollectiveX source index differs')
    require(requests[index]['operation'] == 'collectivex-run' and
            urlsplit(requests[index]['url']).path == f'/api/v1/collectivex/runs/{run_id}' and
            bodies[index].get('run', {}).get('run_id') == run_id,
            'CollectiveX source belongs to a different selected run')
    value = bodies[index]
    pointer = reference.get('json_pointer')
    require(type(pointer) is str and pointer.startswith('/'),
            'CollectiveX source pointer differs')
    for raw_key in pointer.split('/')[1:]:
        key = raw_key.replace('~1', '/').replace('~0', '~')
        value = value[int(key)] if isinstance(value, list) else value[key]
    ep = re.fullmatch(r'/series/(\d+)/points/(\d+)/components/(dispatch|stage|combine|roundtrip)', pointer)
    kv = re.fullmatch(r'/kv/(\d+)/rows/(\d+)', pointer)
    require(ep is not None or kv is not None, 'CollectiveX source identity pointer differs')
    if ep:
        series = bodies[index]['series'][int(ep[1])]
        point = series['points'][int(ep[2])]
        identity = {'suite': 'ep',
                    'configuration': {key: item for key, item in series.items() if key != 'points'},
                    'operation': ep[3],
                    **{key: item for key, item in point.items() if key not in {
                        'components', 'roundtrip_token_rate_at_latency_percentile'}},
                    'payload_bytes': value['payload_bytes']}
    else:
        case = bodies[index]['kv'][int(kv[1])]
        identity = {'suite': 'kv',
                    'configuration': {key: item for key, item in case.items() if key not in {
                        'rows', 'label', 'disposition', 'outcome', 'reason', 'detail'}},
                    'row': {key: item for key, item in value.items() if key not in {
                        'prep_ms', 'latency_ms', 'request_ms', 'gbps_p50',
                        'gbps_p50_incl_prep', 'verify_passed'}}}
    return value, identity


def _nested_metric(value, name):
    for key in name.split('.'):
        if value is None:
            return None
        value = value.get(key)
    return value


def _string_export_identities(row):
    clean, _changed = sanitized(row)
    clean = dict(clean)
    for key in ('id', 'workflow_run_id', 'curve_workflow_run_id'):
        if clean.get(key) is not None:
            clean[key] = str(clean[key])
    return clean


def _csv_cell_matches(cell, value, location):
    if value is None:
        require(cell == '', f'Bundle CSV value differs: {location}')
    elif type(value) is bool:
        require(cell == str(value).lower(), f'Bundle CSV value differs: {location}')
    elif finite(value):
        try:
            matches = float(cell) == value
        except ValueError:
            matches = False
        require(matches, f'Bundle CSV value differs: {location}')
    else:
        require(cell == str(value), f'Bundle CSV value differs: {location}')


def _powerx_expected(manifest, requests, bodies, response_ids, rows):
    options = manifest.get('normalized_arguments')
    require(type(options) is dict and set(options) == {
        'model', 'date', 'isl', 'osl', 'raw_model', 'format'},
        'PowerX saved options differ')
    require(options['format'] == manifest['result']['format'], 'PowerX saved format differs')
    query = parse_qs(urlsplit(requests[0]['url']).query)
    require(query.get('model') == [options['model']] and
            query.get('powerValid') == ['strictV2'] and
            query.get('date', []) == ([] if options['date'] is None else [options['date']]),
            'PowerX request scope differs')
    source = bodies[0]
    require(type(source) is list and all(type(row) is dict and type(row.get('metrics')) is dict
                                         for row in source),
            'PowerX response shape differs')
    selected = [row for row in scoped(source, options['isl'], options['osl'], options['raw_model'])
                if strict(row)]
    expected = [_string_export_identities(row) for row in selected]
    if manifest['result']['format'] == 'json':
        require(rows == expected, 'PowerX derivation differs')
    else:
        require(len(rows) == len(expected), 'PowerX CSV row count differs')
        context = {
            'package_version': manifest['producer']['package_version'],
            'query_url': requests[0]['url'],
            'retrieved_at': requests[0]['response']['retrieved_at'],
            'requested_model': options['model'],
            'requested_date': options['date'],
            'date_selection': 'latest' if options['date'] is None else 'as-of',
            'raw_model': options['raw_model'],
            'source_response_id': response_ids[0],
        }
        for index, (record, expected_row) in enumerate(zip(rows, expected), 1):
            for column in CONTRACT_POWERX_CSV_COLUMNS:
                value = expected_row['metrics'].get(column) if column in METRIC_COLUMNS else \
                    context.get(column, expected_row.get(column))
                _csv_cell_matches(record[column], value, f'powerx row {index} {column}')
    hardware = {}
    eligible = 0
    for row in expected:
        measured = any((key.find('power_w') >= 0 or key.find('joules_per_') >= 0) and
                       finite(row['metrics'].get(key)) and row['metrics'][key] >= 0
                       for key in METRIC_COLUMNS)
        hardware.setdefault(row.get('hardware'), 0)
        hardware[row.get('hardware')] += int(measured)
        eligible += int(measured)
    return len(expected), None, hardware, eligible


def _agentx_expected(manifest, requests, bodies, response_ids, rows):
    options = manifest.get('normalized_arguments')
    required = {'model', 'date', 'raw_model', 'hardware', 'framework', 'precision',
                'spec_method', 'offload_mode', 'concurrency', 'format'}
    require(type(options) is dict and set(options) == required,
            'AgentX saved options differ')
    require(options['format'] == manifest['result']['format'], 'AgentX saved format differs')
    query = parse_qs(urlsplit(requests[0]['url']).query)
    require(query.get('model') == [options['model']] and
            query.get('date', []) == ([] if options['date'] is None else [options['date']]),
            'AgentX request scope differs')
    benchmarks = bodies[0]
    require(type(benchmarks) is list and all(agentx_benchmark(row) for row in benchmarks),
            'AgentX benchmark response shape differs')
    selected = [row for row in benchmarks if row['benchmark_type'] == 'agentic_traces' and all(
        options[name] is None or row[field] == options[name]
        for name, field in AGENTX_FILTERS)]
    joined = {name: {} for name in
              ('agentic-aggregates', 'derived-agentic-metrics', 'trace-availability')}
    for request, body in zip(requests[1:], bodies[1:]):
        operation = request['operation']
        ids = parse_qs(urlsplit(request['url']).query).get('ids', [''])[0].split(',')
        requested = [int(value) for value in ids if value]
        joined[operation].update(agentx_map(body, requested, operation))
    expected = []
    for source in selected:
        benchmark = _string_export_identities(source)
        result_id = safe_result_id(source['id'])
        if result_id is None:
            agentx = {'status': 'unsupported_id', 'result_id': None,
                      'aggregates': {'status': 'unsupported_id', 'value': None},
                      'derived_metrics': {'status': 'unsupported_id', 'value': None},
                      'trace_availability': {'status': 'unsupported_id', 'value': None,
                                             'response_key_present': None}}
        else:
            aggregate = joined['agentic-aggregates'].get(result_id)
            derived = joined['derived-agentic-metrics'].get(result_id)
            trace_present = result_id in joined['trace-availability']
            trace = joined['trace-availability'].get(result_id, False)
            agentx = {
                'status': 'complete' if aggregate is not None and derived is not None else 'partial',
                'result_id': str(result_id),
                'aggregates': {'status': 'available' if aggregate is not None else 'not_returned',
                               'value': _normalized_id_object(aggregate)},
                'derived_metrics': {'status': 'available' if derived is not None else 'not_returned',
                                    'value': _normalized_id_object(derived)},
                'trace_availability': {'status': 'stored_trace' if trace else 'no_stored_trace',
                                       'value': trace, 'response_key_present': trace_present},
            }
        expected.append({'benchmark': benchmark, 'agentx': agentx})
    if manifest['result']['format'] == 'json':
        require(rows == expected, 'AgentX join differs')
    else:
        require(len(rows) == len(expected), 'AgentX CSV row count differs')
        context = {
            'package_version': manifest['producer']['package_version'],
            'query_url': requests[0]['url'],
            'retrieved_at': requests[0]['response']['retrieved_at'],
            'requested_model': options['model'],
            'requested_date': options['date'],
            'date_selection': 'latest' if options['date'] is None else 'as-of',
            'requested_benchmark_type': 'agentic_traces',
            **{f'filter.{name}': options[name] for name, _field in AGENTX_FILTERS},
            'source_response_ids': json.dumps(response_ids, separators=(',', ':')),
        }
        for index, (record, expected_row) in enumerate(zip(rows, expected), 1):
            benchmark, agentx = expected_row['benchmark'], expected_row['agentx']
            aggregate = agentx['aggregates']['value'] or {}
            enrichment = {
                **{f'aggregate.{group}.{field}': (aggregate.get(group) or {}).get(field)
                   for group in AGENTX_GROUPS for field in (*AGENTX_PERCENTILES, 'n')},
                'derived.p75_e2e_norm_intvty':
                    (agentx['derived_metrics']['value'] or {}).get('p75_e2e_norm_intvty'),
                'derived.p90_e2e_norm_intvty':
                    (agentx['derived_metrics']['value'] or {}).get('p90_e2e_norm_intvty'),
                'trace.available': agentx['trace_availability']['value'],
                'trace.response_key_present': agentx['trace_availability']['response_key_present'],
                'enrichment.status': agentx['status'],
                'enrichment.aggregates_status': agentx['aggregates']['status'],
                'enrichment.derived_metrics_status': agentx['derived_metrics']['status'],
                'enrichment.trace_availability_status': agentx['trace_availability']['status'],
            }
            for column in CONTRACT_AGENTX_CSV_COLUMNS:
                value = context.get(column, benchmark.get(column))
                if column == 'metrics_json':
                    value = json.dumps(benchmark['metrics'], separators=(',', ':'))
                elif column in enrichment:
                    value = enrichment[column]
                _csv_cell_matches(record[column], value, f'agentx row {index} {column}')
    hardware, eligible = {}, 0
    for row in expected:
        aggregate = row['agentx']['aggregates']
        groups = aggregate.get('value') or {}
        usable = aggregate.get('status') == 'available' and any(
            type(groups.get(name)) is dict and groups[name].get('n', 0) > 0
            for name in AGENTX_GROUPS)
        name = row['benchmark']['hardware']
        hardware[name] = hardware.get(name, 0) + int(usable)
        eligible += int(usable)
    return len(expected), None, hardware, eligible


def check_bundle(directory, version):
    """Independent contract-1 bundle audit; never invokes the JavaScript renderer."""
    supplied = Path(directory)
    require(supplied.is_dir() and not supplied.is_symlink(),
            'Bundle root must be a regular directory')
    root = supplied.resolve()

    def regular(relative, label):
        require(type(relative) is str and relative and not Path(relative).is_absolute() and
                '..' not in Path(relative).parts, f'{label} path is not canonical')
        path = root / relative
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),
                f'{label} is missing or unsafe')
        return path.read_bytes()

    manifest = json.loads(regular('manifest.json', 'Manifest').decode('utf-8'))
    require(manifest.get('schema_version') == manifest.get('contract_version') == 1,
            'Bundle contract version differs')
    require(manifest.get('producer', {}).get('package_version') == version,
            'Bundle producer version differs')
    kind = manifest.get('kind')
    require(kind in {'powerx', 'agentx', 'result', 'tco', 'releases', 'collectivex'},
            'Bundle family differs')
    result_record = manifest.get('result', {})
    result_bytes = regular(result_record.get('path'), 'Result')
    require(result_record.get('size') == len(result_bytes) and
            result_record.get('sha256') == hashlib.sha256(result_bytes).hexdigest(),
            'Bundle result identity differs')
    require(result_record.get('format') in {'json', 'csv'}, 'Bundle result format differs')
    requests, bodies, response_ids = manifest.get('requests'), [], []
    require(type(requests) is list and requests, 'Bundle request ledger is missing')
    endpoints = {
        'powerx': {'benchmarks': {'/api/v1/benchmarks'}},
        'agentx': {'benchmarks': {'/api/v1/benchmarks'},
                   'agentic-aggregates': {'/api/v1/agentic-aggregates'},
                   'derived-agentic-metrics': {'/api/v1/derived-agentic-metrics'},
                   'trace-availability': {'/api/v1/trace-availability'}},
        'result': {'benchmarks': {'/api/v1/benchmarks'},
                   'workflow-info': {'/api/v1/workflow-info'},
                   'server-log': {'/api/v1/server-log'}},
        'tco': {'tco-feed': {'/api/v1/tco-feed'}},
        'releases': {'benchmark-history': {'/api/v1/benchmarks/history'}},
        'collectivex': {'openapi': {'/api/openapi.json'},
                        'collectivex-runs': {'/api/v1/collectivex/runs'},
                        'collectivex-run': set()},
    }
    for request in requests:
        url = urlsplit(request.get('url', ''))
        operation = request.get('operation')
        allowed = url.path in endpoints[kind].get(operation, set()) or (
            kind == 'collectivex' and operation == 'collectivex-run' and
            url.path.startswith('/api/v1/collectivex/runs/'))
        require(url.scheme == 'https' and url.netloc == 'inferencex.semianalysis.com' and allowed,
                'Bundle request scope differs')
        response = request.get('response', {})
        raw = regular(response.get('path'), 'Response')
        response_id = hashlib.sha256(raw).hexdigest()
        require(response.get('id') == response.get('sha256') == response_id and
                response.get('size') == len(raw) and response.get('encoding') == 'decoded',
                'Bundle response identity differs')
        require(response.get('status') in request.get('allowed_statuses', []),
                'Bundle response status differs')
        require(type(request.get('attempts')) is list and request['attempts'],
                'Bundle attempt ledger is missing')
        require(type(request.get('operation')) is str and request['operation'] and
                request['operation'] == request['attempts'][-1].get('operation') and
                request['url'] == request['attempts'][-1].get('url'),
                'Bundle request and attempt scope differ')
        accepted = request['attempts'][-1]
        require(accepted.get('status') == response.get('status') and
                accepted.get('consumedBytes') == len(raw) and
                accepted.get('retry', {}).get('decision') == 'accepted',
                'Bundle accepted attempt differs from saved response')
        datetime.fromisoformat(response['retrieved_at'].replace('Z', '+00:00'))
        bodies.append(strict_json(raw))
        response_ids.append(response_id)
    require(len(response_ids) == len(requests), 'Bundle response ledger differs')
    expected_root = {'manifest.json', result_record['path'].split('/')[0], 'responses'}
    require({entry.name for entry in root.iterdir()} == expected_root and
            all(not entry.is_symlink() for entry in root.iterdir()),
            'Bundle file inventory differs')
    response_root = root / 'responses'
    require(response_root.is_dir() and not response_root.is_symlink() and
            {entry.name for entry in response_root.iterdir()} ==
            {f'{response_id}.body' for response_id in response_ids} and
            all(entry.is_file() and not entry.is_symlink() for entry in response_root.iterdir()),
            'Bundle response inventory differs')
    coverage = manifest.get('coverage', {})
    require(coverage.get('status') in {'complete', 'partial', 'empty'}, 'Bundle coverage differs')
    require(type(coverage.get('selected_records')) is int and coverage['selected_records'] >= 0,
            'Bundle selected-record coverage differs')
    summary = manifest.get('summary', {})
    require(summary.get('schema_version') == 1 and summary.get('kind') == kind and
            summary.get('package_version') == version and summary.get('validity') == 'valid' and
            summary.get('coverage') == coverage and
            summary.get('output') == {'result': result_record.get('path'), 'manifest': 'manifest.json'},
            'Bundle summary differs')
    policy = summary.get('policy', {})
    requirements = policy.get('requirements', {})
    require(set(requirements) == {'require_hardware', 'min_comparable_pairs'} and
            type(requirements['require_hardware']) is list and
            all(type(item) is str and item for item in requirements['require_hardware']) and
            (requirements['min_comparable_pairs'] is None or
             type(requirements['min_comparable_pairs']) is int and
             requirements['min_comparable_pairs'] >= 0), 'Bundle policy requirements differ')
    if result_record['format'] == 'csv':
        require(kind in {'powerx', 'agentx'} and result_bytes.endswith(b'\r\n'),
                'Bundle CSV contract differs')
        rows = list(csv.DictReader(io.StringIO(result_bytes.decode('utf-8'), newline='')))
        columns = CONTRACT_POWERX_CSV_COLUMNS if kind == 'powerx' else CONTRACT_AGENTX_CSV_COLUMNS
        require((list(rows[0]) if rows else next(csv.reader(
            io.StringIO(result_bytes.decode('utf-8'), newline='')))) == columns,
            'Bundle CSV header differs from fixed contract')
        derived = (_powerx_expected if kind == 'powerx' else _agentx_expected)(
            manifest, requests, bodies, response_ids, rows)
        result = None
    else:
        result = strict_json(result_bytes)
        require(result.get('schema_version') == 1, 'Bundle result schema differs')
        require(result.get('kind', kind) == kind, 'Bundle result family differs')
        encoded = json.dumps(result, separators=(',', ':'))
        require(all(response_id in encoded for response_id in set(response_ids)),
                'Bundle result omits a consumed response reference')
        if kind == 'powerx':
            derived = _powerx_expected(
                manifest, requests, bodies, response_ids, result['rows'])
        elif kind == 'agentx':
            derived = _agentx_expected(
                manifest, requests, bodies, response_ids, result['rows'])
        elif kind == 'result':
            derived = None

    if kind == 'result':
        selected = result['selected_result']
        matches = [_string_export_identities(row) for row in bodies[0]
                   if str(row.get('id')) == str(selected.get('id'))]
        require(len(matches) == 1 and selected == matches[0], 'Provenance selection differs')
        metadata = result.get('metadata', {})
        require(metadata.get('selected_result_id') == selected['id'] and
                metadata.get('ran_new_benchmark') is False,
                'Provenance metadata differs')
        producer = result.get('producer', {})
        run_url = selected.get('run_url')
        if run_url is None:
            require(producer.get('status') == 'unresolved' and
                    producer.get('github_run_id') is None and
                    producer.get('run_attempt') is None,
                    'Provenance producer meaning differs')
        else:
            match = re.fullmatch(
                r'https://github\.com/[\w.-]+/[\w.-]+/actions/runs/([1-9]\d*)'
                r'(?:/attempts/([1-9]\d*))?', run_url)
            require(match is not None and producer.get('github_run_id') == match.group(1) and
                    producer.get('run_attempt') == match.group(2),
                    'Provenance producer meaning differs')
            workflow_runs = bodies[1].get('runs', []) if type(bodies[1]) is dict else []
            matching_runs = [item for item in workflow_runs
                             if str(item.get('github_run_id')) == match.group(1)]
            expected_status = 'confirmed' if match.group(2) is not None and matching_runs else 'row_only'
            require(producer.get('status') == expected_status,
                    'Provenance producer confirmation differs')
        evidence = result.get('evidence', [])
        require([entry.get('response_id') for entry in evidence] == response_ids and
                result.get('log', {}).get('source_response_id') == response_ids[-1],
                'Provenance response references differ')
        log = result.get('log', {})
        if requests[-1]['response']['status'] == 404:
            require(log.get('status') == 'not_found' and log.get('text') is None,
                    'Provenance missing-log state differs')
        else:
            saved_log = bodies[-1]
            require(log.get('status') == 'available' and
                    str(saved_log.get('id')) == selected['id'] and
                    log.get('text') == saved_log.get('serverLog'),
                    'Provenance log differs from source')
        derived = (1, None, {selected['hardware']: 1}, 1)
    elif kind == 'tco':
        feed = bodies[0]
        options = manifest.get('normalized_arguments', {})
        prices = options.get('gpu_hourly_prices_usd')
        workloads = options.get('workloads')
        require(type(prices) is dict and prices and type(workloads) is list and workloads and
                len(result['rows']) == len(prices) * len(workloads) and
                {(row.get('hardware'), row.get('workload')) for row in result['rows']} ==
                {(hardware_name, workload) for hardware_name in prices for workload in workloads},
                'TCO saved scope differs from result')
        eligible, hardware = 0, {}
        for row in result['rows']:
            require(row.get('usd_per_gpu_hour') == prices[row['hardware']],
                    'TCO saved price differs from result')
            point = row.get('point')
            if point is None:
                require(row['status'] == 'missing_point' and
                        not any(item.get('hardware') == row.get('hardware') and
                                item.get('workload') == row.get('workload')
                                for item in feed['rows']),
                        'TCO missing point differs from consumed feed')
            else:
                require(point in feed['rows'], 'TCO point differs from consumed feed')
                expected_status = ('zero_throughput' if point.get('boundary') == 'interpolated' and
                                   point.get('output_tput_per_gpu') == 0 else
                                   'available' if point.get('boundary') == 'interpolated' else
                                   point.get('boundary'))
                require(row['status'] == expected_status, 'TCO point status differs')
            if row['status'] == 'available':
                require(finite(point.get('output_tput_per_gpu')) and
                        point['output_tput_per_gpu'] > 0 and finite(row.get('usd_per_gpu_hour')),
                        'TCO available point differs')
                expected = row['usd_per_gpu_hour'] * 1e6 / (point['output_tput_per_gpu'] * 3600)
                require(math.isclose(row['usd_per_million_output_tokens'], expected, rel_tol=1e-12),
                        'TCO arithmetic differs')
                eligible += 1
            else:
                require(row.get('usd_per_million_output_tokens') is None,
                        'TCO unavailable point has a modeled cost')
            hardware.setdefault(row['hardware'], 0)
            hardware[row['hardware']] += int(row['status'] == 'available')
        derived = (len(result['rows']), None, hardware, eligible)
    elif kind == 'releases':
        source = bodies[0]
        originals = {}
        for row in source:
            original = {key: value for key, value in row.items() if key not in {
                'curve_date', 'curve_workflow_run_id', 'curve_run_started_at'}}
            result_id = str(row['id'])
            require(result_id not in originals or originals[result_id] == original,
                    'Release observation identity differs between snapshots')
            originals[result_id] = original
        options = manifest.get('normalized_arguments', {})
        query = parse_qs(urlsplit(requests[0]['url']).query)
        require(query == {key: [js_text(options[key])] for key in ('model', 'isl', 'osl')},
                'Release request scope differs')
        selection = result.get('selection', {})
        selected_records, groups = 0, {}
        for side in ('before', 'after'):
            detail = selection.get(side, {})
            selected_rows = detail.get('rows')
            expected_rows = [row for row in source if
                             row['benchmark_type'] == 'single_turn' and
                             all(row[key] == options[key] for key in ('hardware', 'framework', 'isl', 'osl')) and
                             (options['raw_model'] is None or row['model'] == options['raw_model']) and
                             row['date'] == options[f'{side}_date'] and
                             all(options[f'{side}_{key}'] is None or row[key] == options[f'{side}_{key}']
                                 for key in ('image', 'run_url'))]
            require(selected_rows == expected_rows, 'Release selection differs from saved scope')
            unique = {str(row['id']): row for row in selected_rows}
            require(detail.get('unique_observations') == len(unique) and
                    detail.get('snapshot_reuses') == len(selected_rows) - len(unique),
                    'Release selection coverage differs')
            selected_records += len(unique)
            groups[side] = {}
            for row in unique.values():
                values = [row[field] for field in RELEASE_CONFIGURATION_FIELDS]
                for field in RELEASE_CONFIGURATION_METRICS:
                    values.extend((field in row['metrics'], row['metrics'].get(field)))
                key = tuple((float if finite(value) else type(value), value) for value in values)
                groups[side].setdefault(key, []).append(row)
        expected_pairs = {}
        for key in groups['before'].keys() & groups['after'].keys():
            before, after = groups['before'][key], groups['after'][key]
            if len(before) == len(after) == 1 and str(before[0]['id']) != str(after[0]['id']):
                expected_pairs[(str(before[0]['id']), str(after[0]['id']))] = (before[0], after[0])
        pair_ids = [(pair.get('before_id'), pair.get('after_id')) for pair in result['comparisons']]
        require(len(pair_ids) == len(set(pair_ids)) and set(pair_ids) == set(expected_pairs),
                'Release matching differs from source configuration')
        comparable = 0
        for pair in result['comparisons']:
            before_row, after_row = expected_pairs[(pair['before_id'], pair['after_id'])]
            require(pair.get('configuration') == {
                key: before_row[key] for key in RELEASE_CONFIGURATION_FIELDS} and
                pair.get('configuration_metrics') == {
                    key: before_row['metrics'][key] for key in RELEASE_CONFIGURATION_METRICS
                    if key in before_row['metrics']}, 'Release matching configuration differs')
            metric = pair['metric']
            metric_name = metric['name']
            before, after = metric['before'], metric['after']
            require(metric_name == options['metric'] and
                    before_row['metrics'].get(metric_name) == before and
                    after_row['metrics'].get(metric_name) == after,
                    'Release metric source differs')
            if finite(before) and finite(after):
                comparable += 1
                require(math.isclose(metric['delta'], after - before, rel_tol=1e-12),
                        'Release difference differs')
            else:
                require(metric.get('delta') is None and metric.get('percent_change') is None,
                        'Release missing metric differs')
            if finite(before) and finite(after) and before != 0:
                require(math.isclose(metric['percent_change'], (after - before) / before * 100,
                                     rel_tol=1e-12), 'Release percent change differs')
        require(result['metadata']['causal_attribution'] == 'not_established',
                'Release result overclaims causality')
        require(result['metadata'].get('statistical_verdict') == 'not_established',
                'Release statistical verdict differs')
        hardware_name = manifest.get('normalized_arguments', {}).get('hardware')
        derived = (selected_records, comparable,
                   {} if hardware_name is None else {hardware_name: comparable}, comparable)
    elif kind == 'collectivex':
        comparisons = result['comparisons']
        run_ids = result.get('selection', {}).get('run_ids', [])
        if any(comparison['status'] == 'matched' for comparison in comparisons):
            require(type(run_ids) is list and len(run_ids) == 2 and len(set(run_ids)) == 2,
                    'CollectiveX matched comparison needs two selected runs')
            options = manifest.get('normalized_arguments', {})
            if options.get('left') is not None:
                require(run_ids == [options['left'], options['right']],
                        'CollectiveX selected run IDs differ from requested scope')
        for status, count_value in result['summary'].items():
            require(count_value == sum(row['status'] == status for row in comparisons),
                    'CollectiveX summary differs')
        for comparison in comparisons:
            if comparison['status'] != 'matched':
                continue
            left, left_identity = _collective_source(bodies, requests, comparison['left'], run_ids[0])
            right, right_identity = _collective_source(bodies, requests, comparison['right'], run_ids[1])
            require(left_identity == right_identity == comparison.get('identity'),
                    'CollectiveX matched source identity differs')
            for metric in comparison['metrics']:
                left_value = _nested_metric(left, metric['name'])
                right_value = _nested_metric(right, metric['name'])
                require(metric['left']['value'] == left_value and
                        metric['right']['value'] == right_value,
                        'CollectiveX metric source differs')
                difference = None if left_value is None or right_value is None else right_value - left_value
                ratio = None if left_value in (None, 0) or right_value is None else right_value / left_value
                require(metric['difference_right_minus_left'] == difference and
                        metric['ratio_right_over_left'] == ratio,
                        'CollectiveX metric arithmetic differs')
        comparable = sum(comparison['status'] == 'matched' and any(
            metric.get('left', {}).get('status') == 'value' and
            metric.get('right', {}).get('status') == 'value'
            for metric in comparison.get('metrics', [])) for comparison in comparisons)
        derived = (len(comparisons), comparable, {}, comparable)

    selected_records, comparable, derived_hardware, eligible_records = derived
    require(coverage['selected_records'] == selected_records,
            'Bundle selected-record coverage differs from result')
    require(coverage.get('comparable_pairs') == comparable,
            'Bundle comparable-pair coverage differs from result')
    hardware_entries = coverage.get('hardware')
    require(type(hardware_entries) is list and
            all(type(entry) is dict and type(entry.get('hardware')) is str and
                type(entry.get('valid_records')) is int and entry['valid_records'] >= 0
                for entry in hardware_entries) and
            len({entry['hardware'] for entry in hardware_entries}) == len(hardware_entries),
            'Bundle hardware coverage differs')
    hardware = {entry['hardware']: entry['valid_records'] for entry in hardware_entries}
    require(hardware == derived_hardware, 'Bundle hardware validity differs from result')
    policy_requested = bool(requirements['require_hardware']) or \
        requirements['min_comparable_pairs'] is not None
    policy_passes = all(derived_hardware.get(item, 0) > 0
                        for item in requirements['require_hardware']) and \
        (requirements['min_comparable_pairs'] is None or
         comparable >= requirements['min_comparable_pairs'])
    expected_policy = 'not_requested' if not policy_requested else 'passed' if policy_passes else 'failed'
    require(policy.get('status') == expected_policy and type(policy.get('reasons')) is list and
            (expected_policy != 'failed' or bool(policy['reasons'])),
            'Bundle policy decision differs')
    policy_exit_code = 3 if expected_policy == 'failed' else 0
    return {'kind': kind, 'status': 'passed', 'selected_records': coverage['selected_records'],
            'eligible_records': eligible_records, 'comparable_pairs': comparable,
            'response_ids': response_ids,
            'policy_status': expected_policy, 'policy_exit_code': policy_exit_code}


def workflow_source(source, expected_url, body_key='body_utf8', hash_key='decoded_body_sha256',
                    url_key='url', statuses=(200,)):
    require(source[url_key] == expected_url, 'Workflow source URL differs')
    require(source['http_status'] in statuses, 'Workflow source HTTP status differs')
    datetime.fromisoformat(source['retrieved_at'].replace('Z', '+00:00'))
    raw = source[body_key].encode('utf-8')
    require(hashlib.sha256(raw).hexdigest() == source[hash_key], 'Workflow source checksum differs')
    return json.loads(source[body_key].removeprefix('\ufeff'))


def maintained_collectivex_positive_pair(project):
    document = json.loads((project / 'collectivex.json').read_text())
    require(type(document) is dict and type(document.get('responses')) is list,
            'CollectiveX compatibility evidence differs')
    sources = [source for source in document['responses']
               if type(source) is dict and source.get('query_url') == COLLECTIVEX_RUN_LIST_URL]
    require(len(sources) == 1, 'CollectiveX compatibility run list differs')
    listed = workflow_source(sources[0], COLLECTIVEX_RUN_LIST_URL, 'body_text',
                             url_key='query_url')
    require(type(listed) is dict and listed.get('version') == 1 and
            listed.get('discovery_complete') is True and type(listed.get('runs')) is list,
            'CollectiveX compatibility run list is incomplete')
    runs = {run.get('run_id'): run for run in listed['runs'] if type(run) is dict}
    require(all(run_id in runs and type(runs[run_id].get('measured_cases')) is int and
                runs[run_id]['measured_cases'] > 0 for run_id in COLLECTIVEX_POSITIVE_RUN_IDS),
            'Maintained CollectiveX positive runs are unavailable in the current list')
    return COLLECTIVEX_POSITIVE_RUN_IDS


def check_additional_workflows(project, version):
    """Live smoke invariants; fixture suites cover the full domain contracts separately."""
    documents = {name: json.loads((project / f'{name}.json').read_text())
                 for name in ('provenance', 'tco', 'releases', 'collectivex')}
    for document in documents.values():
        workflow_identity(document, version)
    provenance = documents['provenance']
    sources = {}
    for source in provenance['evidence']:
        url = urlsplit(source['url'])
        require(url.scheme == 'https' and url.netloc == 'inferencex.semianalysis.com' and
                url.path == '/api/v1/' + source['operation'], 'Unexpected provenance endpoint')
        sources[source['operation']] = workflow_source(source, source['url'], statuses=(200, 404))
    selected = provenance['selected_result']
    require(str(selected['id']) == '416696' and selected in sources['benchmarks'],
            'Provenance result differs from consumed benchmark')
    require(selected['date'] == '2026-05-30' and
            selected['run_url'] == 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26694739752/attempts/1',
            'Provenance producer identity differs')
    require(provenance['metadata']['ran_new_benchmark'] is False and
            provenance['producer']['github_run_id'] == '26694739752', 'Provenance scope differs')
    require(provenance['log']['status'] == 'available' and
            provenance['log']['response'] == sources['server-log'], 'Provenance log evidence differs')

    tco = documents['tco']
    url = AGENTX_ORIGIN + '/api/v1/tco-feed?' + urlencode(dict(
        model='DeepSeek-V4-Pro', workloads='8192x1024', tiers='50', view='points', format='json', date='2026-09-06'))
    source = tco['source']
    # Query order is irrelevant; the complete parameter set and value multiplicity are not.
    require(urlsplit(source['query_url'])._replace(query='') == urlsplit(url)._replace(query='') and
            parse_qs(urlsplit(source['query_url']).query) == parse_qs(urlsplit(url).query), 'TCO query differs')
    feed = workflow_source(source, source['query_url'], 'body', 'sha256', 'query_url')
    require(source['body_bytes'] == len(source['body'].encode('utf-8')), 'TCO body length differs')
    prices = {'b200': 3.6, 'mi355x': 1.8}  # Explicit test assumptions, not market prices.
    require(len(tco['rows']) == 2 and {row['hardware'] for row in tco['rows']} == set(prices),
            'TCO requested hardware coverage differs')
    for row in tco['rows']:
        point = row['point']
        require(point in feed['rows'] and point['hardware'] == row['hardware'] and
                point['workload'] == row['workload'] == '8192x1024' and point['tier'] == 50,
                'TCO point differs from consumed feed')
        require(row['status'] == 'available' and point['boundary'] == 'interpolated' and
                point['output_tput_per_gpu'] > 0, 'TCO smoke point is no longer available; review scope')
        expected = prices[row['hardware']] * 1e6 / (point['output_tput_per_gpu'] * 3600)
        require(row['usd_per_gpu_hour'] == prices[row['hardware']] and
                math.isclose(row['usd_per_million_output_tokens'], expected, rel_tol=1e-12), 'TCO cost differs')
    require(tco['coverage']['available_points'] == 2, 'TCO coverage differs')

    releases = documents['releases']
    history = workflow_source(releases['evidence'][0],
                              API + '/history?model=GLM-5&isl=8192&osl=1024')
    require(releases['outcome'] == 'observed_comparisons' and releases['comparisons'],
            'Release smoke pair is no longer available; review scope')
    for side, date, run_id in [('before', '2026-05-30', '26694739752'), ('after', '2026-07-02', '28571158239')]:
        expected_rows = [row for row in history if row['model'] == 'glm5.1' and
                         row['hardware'] == 'mi355x' and row['framework'] == 'sglang' and
                         row['benchmark_type'] == 'single_turn' and row['isl'] == 8192 and row['osl'] == 1024 and
                         row['date'] == date and row['run_url'] ==
                         f'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/{run_id}/attempts/1']
        require(releases['selection'][side]['rows'] == expected_rows and expected_rows,
                'Release selection differs from consumed history')
    for pair in releases['comparisons']:
        before = next(row for row in releases['selection']['before']['rows'] if row['id'] == pair['before_id'])
        after = next(row for row in releases['selection']['after']['rows'] if row['id'] == pair['after_id'])
        require(all(before[key] == after[key] == value for key, value in pair['configuration'].items()),
                'Release public configuration differs')
        b, a = before['metrics']['median_ttft'], after['metrics']['median_ttft']
        metric = pair['metric']
        require(metric['name'] == 'median_ttft' and metric['before'] == b and metric['after'] == a and
                math.isclose(metric['delta'], a - b, rel_tol=1e-12) and
                math.isclose(metric['percent_change'], (a - b) / b * 100, rel_tol=1e-12),
                'Release metric arithmetic differs')
    require(releases['metadata']['causal_attribution'] == 'not_established', 'Release overclaims causality')

    collective = documents['collectivex']
    bodies = []
    for source in collective['responses']:
        url = urlsplit(source['query_url'])
        require(url.scheme == 'https' and url.netloc == 'inferencex.semianalysis.com' and
                (url.path == '/api/openapi.json' or url.path.startswith('/api/v1/collectivex/runs')),
                'Unexpected CollectiveX endpoint')
        bodies.append(workflow_source(source, source['query_url'], 'body_text', url_key='query_url'))
    require(len(collective['runs']) == 2 and len(set(collective['selection']['run_ids'])) == 2,
            'CollectiveX smoke requires two measured runs; review scope')
    for entry in collective['runs']:
        require(entry['run'] == bodies[entry['response_index']]['run'], 'CollectiveX run evidence differs')
    require(collective['comparisons'], 'CollectiveX smoke produced no rows')
    for status, count in collective['summary'].items():
        require(count == sum(row['status'] == status for row in collective['comparisons']),
                'CollectiveX summary differs')
    # Resolve every exported source pointer; a successful export must not cite nonexistent data.
    for row in collective['comparisons']:
        for pointer in row['left'] + row['right']:
            value = bodies[pointer['response_index']]
            for key in pointer['json_pointer'].split('/')[1:]:
                key = key.replace('~1', '/').replace('~0', '~')
                value = value[int(key)] if isinstance(value, list) else value[key]
            require(value is not None or row['status'] == 'incomparable',
                    'CollectiveX null source must remain incomparable')
    return {'status': 'passed', 'provenance_result_id': str(selected['id']), 'tco_points': 2,
            'release_pairs': len(releases['comparisons']), 'collectivex_summary': collective['summary']}


def run_additional_workflows(node, installed, project, env, version, deadline):
    examples = {
        'provenance': ('investigate-result', ['--id', '416696', '--model', 'GLM-5', '--run-id', '26694739752']),
        'tco': ('compare-tco', ['--model', 'DeepSeek-V4-Pro', '--workloads', '8192x1024', '--target', '50',
                              '--gpu-hourly-prices', 'b200=3.6,mi355x=1.8', '--date', '2026-09-06']),
        'releases': ('compare-releases', ['--model', 'GLM-5', '--raw-model', 'glm5.1', '--hardware', 'mi355x',
            '--framework', 'sglang', '--isl', '8192', '--osl', '1024', '--metric', 'median_ttft',
            '--before-date', '2026-05-30', '--after-date', '2026-07-02',
            '--before-run-url', 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26694739752/attempts/1',
            '--after-run-url', 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/28571158239/attempts/1']),
        'collectivex': ('compare-collectivex', []),
    }
    for name, (helper, flags) in examples.items():
        run([node, installed / f'scripts/{helper}.mjs', *flags, '--output', f'{name}.json'],
            project, env, name, deadline)
    return check_additional_workflows(project, version)


def run_contract_one_workflows(node, installed, project, env, args, version, deadline):
    if not contract_one_required(version):
        return None
    collective_left, collective_right = maintained_collectivex_positive_pair(project)
    cli = installed / 'scripts/inferencex.mjs'
    require(cli.is_file() and not cli.is_symlink(), 'The installed inferencex entry is missing')
    discovery_flags = ['discover', 'configs', '--model', args.model, '--limit', '1000',
                       '--max-attempts', '3']
    if args.date:
        discovery_flags += ['--date', args.date]
    discovery = json.loads(run([node, cli, *discovery_flags], project, env,
                               'contract-one-discovery', deadline))
    require(discovery.get('schema_version') == 1 and discovery.get('kind') == 'configs' and
            type(discovery.get('items')) is list and discovery['items'] and
            discovery.get('scope', {}).get('requested_model') == args.model and
            discovery.get('coverage', {}).get('available_items', 0) > 0,
            'Discovery did not return a usable public scope')
    candidates = [item for item in discovery['items']
                  if item.get('workload') == {'benchmark_type': 'single_turn',
                                               'input_tokens': args.isl,
                                               'output_tokens': args.osl} and
                  item.get('power', {}).get('strict_v2') == 'eligible' and
                  (args.raw_model is None or item.get('raw_model') == args.raw_model)]
    require(candidates, 'Discovered scope has no strict-v2 PowerX observation; choose another scope')
    selected = candidates[0]
    pin = {'model': args.model, 'date': args.date, 'result_id': selected['result_id'],
           'raw_model': selected['raw_model'], 'hardware': selected['hardware'],
           'workload': selected['workload'], 'discovery_sources': discovery.get('sources')}
    save(project / 'contract-one-scope.json', pin)

    bundle_root = project / 'contract-one-bundles'
    bundle_root.mkdir()
    power_flags = ['--model', args.model, '--isl', str(args.isl), '--osl', str(args.osl)]
    if args.date:
        power_flags += ['--date', args.date]
    if args.raw_model:
        power_flags += ['--raw-model', args.raw_model]
    result_flags = ['--id', selected['result_id'], '--model', args.model]
    if args.date:
        result_flags += ['--date', args.date]
    commands = {
        'powerx': ['powerx', 'export', *power_flags],
        'agentx': ['agentx', 'export', '--model', args.agentx_model],
        'result': ['result', 'inspect', *result_flags],
        'tco': ['tco', 'compare', '--model', 'DeepSeek-V4-Pro', '--workloads', '8192x1024',
                '--target', '50', '--gpu-hourly-prices', 'b200=3.6,mi355x=1.8',
                '--date', '2026-09-06'],
        'releases': ['releases', 'compare', '--model', 'GLM-5', '--raw-model', 'glm5.1',
                     '--hardware', 'mi355x', '--framework', 'sglang', '--isl', '8192',
                     '--osl', '1024', '--metric', 'median_ttft', '--before-date', '2026-05-30',
                     '--after-date', '2026-07-02', '--before-run-url',
                     'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26694739752/attempts/1',
                     '--after-run-url',
                     'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/28571158239/attempts/1'],
        'collectivex': ['collectivex', 'compare', '--left', collective_left,
                        '--right', collective_right],
    }
    reports = {}
    denial = project / 'contract-one-deny-network.mjs'
    denial.write_text("globalThis.fetch = () => { throw new Error('offline verification attempted HTTP'); };\n")
    for kind, flags in commands.items():
        directory = bundle_root / kind
        run([node, cli, *flags, '--output-dir', directory, '--max-attempts', '3'],
            project, env, f'contract-one-{kind}', deadline)
        reports[kind] = check_bundle(directory, version)
        require(reports[kind]['eligible_records'] > 0 and
                (kind not in {'releases', 'collectivex'} or
                 reports[kind]['comparable_pairs'] > 0),
                f'{kind} positive bundle is no longer positive; choose another scope')
        run([node, '--import', denial, cli, 'verify', directory], project, env,
            f'contract-one-verify-{kind}', deadline)

    empty = bundle_root / 'powerx-empty'
    empty_flags = ['--model', args.model, '--isl', str(args.empty_isl), '--osl', str(args.empty_osl)]
    if args.date:
        empty_flags += ['--date', args.date]
    if args.raw_model:
        empty_flags += ['--raw-model', args.raw_model]
    run([node, cli, 'powerx', 'export', *empty_flags,
         '--output-dir', empty, '--max-attempts', '3'],
        project, env, 'contract-one-powerx-empty', deadline)
    empty_report = check_bundle(empty, version)
    require(empty_report['selected_records'] == 0, 'PowerX negative scope is no longer empty')
    run([node, '--import', denial, cli, 'verify', empty], project, env,
        'contract-one-verify-powerx-empty', deadline)
    try:
        run([node, '--import', denial, cli, 'verify', empty, '--require-hardware',
             '__release_verifier_missing_hardware__'], project, env,
            'contract-one-policy-exit-3', deadline)
    except subprocess.CalledProcessError as error:
        require(error.returncode == 3 and error.stderr == '', 'Policy failure must exit 3 only')
        policy = json.loads(error.output)
        require(policy.get('validity') == 'valid' and
                policy.get('policy', {}).get('status') == 'failed',
                'Policy exit 3 summary differs')
    else:
        raise ValueError('Missing required hardware unexpectedly satisfied policy')
    return {'status': 'passed', 'discovery': pin, 'bundles': reports,
            'negative': empty_report, 'policy_exit_code': 3}


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
    args.contract_one = contract_one_required(record['version'])
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
            raw_responses = args.project / 'raw-responses'
            raw_directory = raw_responses.is_dir() and not raw_responses.is_symlink()
            raw_files = list(raw_responses.iterdir()) if raw_directory else []
            expected_raw_files = {
                'lookup-openapi.request.json', 'lookup-openapi.response.json',
                'lookup.request.json', 'lookup.response.json',
                'diagnostic.request.json', 'diagnostic.response.json'}
            require(raw_directory and {path.name for path in raw_files} == expected_raw_files and
                    all(path.is_file() and not path.is_symlink() for path in raw_files),
                    'raw-responses must contain exactly the six required regular files')
            openapi = captured_request(args.project, 'lookup-openapi', OPENAPI)
            check_lookup_openapi(openapi, args.model)
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
            check_point_recipe(args.project, installed, 'agentx-point', args.agentx_point_id)
            check_point_recipe(args.project, installed, 'agentx-second-point', args.agentx_no_trace_id)
            points = check_point_outcomes([
                check_agentx_point(args.project, 'agentx-point-evidence', 'agentx-point.json',
                                   args.agentx_point_id, record['version']),
                check_agentx_point(args.project, 'agentx-second-point-evidence', 'agentx-second-point.json',
                                   args.agentx_no_trace_id, record['version'])])
            require((args.project / 'result.md').read_text().strip(), 'Native-agent narrative is missing')
            result.update(agentx=agentx, agentx_points=points)
            if args.contract_one:
                bundles = args.project / 'bundles'
                expected = {'powerx', 'agentx', 'result', 'tco', 'releases', 'collectivex'}
                require(bundles.is_dir() and not bundles.is_symlink() and
                        {path.name for path in bundles.iterdir()} == expected and
                        all(path.is_dir() and not path.is_symlink() for path in bundles.iterdir()),
                        'Native-agent contract-1 bundle inventory differs')
                result['contract_one_bundles'] = {
                    kind: check_bundle(bundles / kind, record['version']) for kind in sorted(expected)}
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
            structured_errors = check_structured_errors(
                node, npm, installed, project, env, archive, record['version'],
                args.mode == 'public', deadline)
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
            offline_verification = verify_saved_exports(
                node, installed, project, env, record['version'], deadline)
            points = check_point_outcomes([
                run_point(node, installed, project, env, 'agentx-point', args.agentx_point_id,
                          record['version'], deadline),
                run_point(node, installed, project, env, 'agentx-second-point', args.agentx_no_trace_id,
                          record['version'], deadline)])
            result['additional_workflows'] = run_additional_workflows(
                node, installed, project, env, record['version'], deadline)
            if args.contract_one:
                result['contract_one'] = run_contract_one_workflows(
                    node, installed, project, env, args, record['version'], deadline)
            check_installed(installed, skill_files, record['version'])
            result.update(agentx=agentx, agentx_points=points, structured_errors=structured_errors)
            if offline_verification:
                result['offline_verification'] = offline_verification
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
