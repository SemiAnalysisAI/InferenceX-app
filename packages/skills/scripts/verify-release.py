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
COLLECTIVEX_POSITIVE_RUN_IDS = ('33378604574', '33412478973')
MAX_SAFE_INTEGER = 9_007_199_254_740_991
# Only the exact-version npm ETARGET propagation symptom is retryable. No HTTP,
# publication, data-validation, or candidate-install retries.
PUBLIC_INSTALL_ATTEMPTS = 3
PUBLIC_RETRY_DELAYS = (5, 10)
PUBLIC_DEADLINE_SECONDS = 300
METRIC_COLUMNS = set('power_valid power_metric_schema_version avg_power_w prefill_avg_power_w decode_avg_power_w joules_per_successful_query joules_per_input_token joules_per_output_token joules_per_total_token prefill_joules_per_input_token decode_joules_per_output_token avg_temp_c peak_temp_c avg_util_pct avg_mem_used_mb'.split())
POWERX_UNITS = {
    'avg_power_w': 'measured W per GPU',
    'prefill_avg_power_w': 'role-local measured W per GPU',
    'decode_avg_power_w': 'role-local measured W per GPU',
    'joules_per_successful_query': 'whole-deployment accelerator J/query',
    'joules_per_input_token': 'whole-deployment accelerator J/input token',
    'joules_per_output_token': 'whole-deployment accelerator J/output token',
    'joules_per_total_token': 'whole-deployment accelerator J/total token',
    'prefill_joules_per_input_token': 'role-local accelerator J/input token',
    'decode_joules_per_output_token': 'role-local accelerator J/output token',
    'avg_temp_c': 'per-GPU degrees C',
    'peak_temp_c': 'per-GPU degrees C',
    'avg_util_pct': 'per-GPU percent',
    'avg_mem_used_mb': 'per-GPU MB',
}
TCO_UNITS = {
    'gpu_hourly_price': 'USD per GPU-hour',
    'target_output_throughput': 'output tokens per second per user',
    'gpu_output_throughput': 'output tokens per second per GPU',
    'modeled_cost': 'USD per million output tokens',
}
TCO_STATUSES = ('available', 'missing_point', 'clamped_low', 'unreachable', 'zero_throughput')
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


def contract_one_required(version):
    return version_at_least(version, (0, 12, 0))


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
        return actual.keys() == expected.keys() and all(
            same_json(actual[key], expected[key]) for key in actual)
    if type(actual) is list:
        return len(actual) == len(expected) and all(
            same_json(a, b) for a, b in zip(actual, expected))
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


def prompt(args, target, archive):
    archive = archive.resolve()
    project = archive.parent
    skill_root = project / ('.agents' if target == 'codex' else '.claude') / 'skills/inferencex-api'
    cli = skill_root / 'scripts/inferencex.mjs'
    date = f' --date {args.date}' if args.date else ''
    raw = f' --raw-model {args.raw_model}' if args.raw_model else ''
    left, right = COLLECTIVEX_POSITIVE_RUN_IDS
    installer = f'npm exec --yes --offline --package {archive} -- inferencex-skills'
    return f'''Work only in {project}. Use the exact candidate archive {archive}; do not read another
checkout, use private services, or run benchmarks.

Install the candidate, inspect status, and preview a forced reinstall in order:

1. {installer} install --target {target}
2. {installer} status --target {target} --json
3. {installer} install --target {target} --force --dry-run --json

Preserve stdout, stderr, and exit codes. Read the installed SKILL.md. The installed
CLI is {cli}. Use only its unified query surface. The six formal routes are:

- `inferencex powerx export`
- `inferencex agentx export`
- `inferencex result inspect`
- `inferencex tco compare`
- `inferencex releases compare`
- `inferencex collectivex compare`

Offline replay uses `inferencex verify`.

Create a `bundles` parent and exactly these six children through the formal commands:
powerx, agentx, result, tco, releases, and collectivex. First run `discover configs
--model {args.model}{date}` and select an observed strict-v2 single-turn configuration
with {args.isl} input and {args.osl} output tokens{raw}. Use that exact result ID and
hardware for PowerX and result provenance. Export AgentX summaries for
{args.agentx_model}. Use TCO assumptions b200=3.6 and mi355x=1.8 for workload
8192x1024 at target 50. Use the maintained GLM-5 dated release comparison and
CollectiveX runs {left} and {right}.

After each bundle completes, run `inferencex verify` on it without network access.
Keep completed bundle bytes unchanged. Write each command, exit code, verification
summary, and a concise interpretation to result.md. Preserve missing values, dates,
units, topology, provenance, coverage, and policy without causal claims. Distinguish
valid partial evidence, policy exit 3, and invalid evidence.
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


def _normalized_id_object(value):
    if value is None:
        return None
    if isinstance(value, list):
        return [_normalized_id_object(item) for item in value]
    if not isinstance(value, dict):
        return value
    identity_keys = {'id', 'workflow_run_id', 'curve_workflow_run_id', 'github_run_id', 'run_attempt'}
    return {key: str(item) if key in identity_keys and item is not None else item
            for key, item in value.items()}


def _json_identity(value):
    if type(value) is dict:
        return (dict, tuple((key, _json_identity(item)) for key, item in sorted(value.items())))
    if type(value) is list:
        return (list, tuple(map(_json_identity, value)))
    return (float if finite(value) else type(value), value)


def _collective_topology_issues(topology):
    if type(topology) is not dict:
        return ['missing_topology']
    issues = [f'missing_or_invalid_{key}' for key in
              ('ep_size', 'nodes', 'gpus_per_node', 'scale_up_domain')
              if not integer(topology.get(key)) or not 0 < topology[key] <= MAX_SAFE_INTEGER]
    for key in ('scale_up_transport', 'topology_class', 'scale_out_transport'):
        if key == 'scale_out_transport' and key in topology and topology[key] is None:
            continue
        if type(topology.get(key)) is not str or not topology[key].strip():
            issues.append(f'missing_or_invalid_{key}')
    return issues


MISSING = object()


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
        value = value[int(key)] if isinstance(value, list) else value.get(key, MISSING)
    ep = re.fullmatch(r'/series/(\d+)/points/(\d+)/components/(dispatch|stage|combine|roundtrip)', pointer)
    kv = re.fullmatch(r'/kv/(\d+)/rows/(\d+)', pointer)
    require(ep is not None or kv is not None, 'CollectiveX source identity pointer differs')
    if ep:
        series = bodies[index]['series'][int(ep[1])]
        point = series['points'][int(ep[2])]
        component = value if type(value) is dict else {}
        identity = {'suite': 'ep',
                    'configuration': {key: item for key, item in series.items() if key != 'points'},
                    'operation': ep[3],
                    **{key: item for key, item in point.items() if key not in {
                        'components', 'roundtrip_token_rate_at_latency_percentile'}},
                    **({'payload_bytes': component['payload_bytes']} if 'payload_bytes' in component else {})}
        issues = _collective_topology_issues(series.get('system'))
        for key in ('series_id', 'phase', 'mode', 'precision', 'backend'):
            if type(series.get(key)) is not str or not series[key].strip():
                issues.append(f'missing_or_invalid_{key}')
        hardware = series.get('system') or {}
        if type(hardware.get('sku')) is not str or not hardware['sku'].strip() or \
                hardware.get('vendor') not in ('nvidia', 'amd'):
            issues.append('missing_hardware_identity')
        if any(not integer(point.get(key)) or not 0 < point[key] <= MAX_SAFE_INTEGER
               for key in ('tokens_per_rank', 'global_tokens')):
            issues.append('missing_or_invalid_token_counts')
        if value is MISSING or value is None:
            issues.append('unavailable_component')
        if not integer(component.get('payload_bytes')) or not 0 <= component['payload_bytes'] <= MAX_SAFE_INTEGER:
            issues.append('missing_or_invalid_payload_bytes')
        metric_groups = [(component, 'latency_us', 'us'),
                         (component, 'activation_data_rate_gbps_at_latency_percentile', 'GB/s aggregate activation'),
                         (component, 'payload_data_rate_gbps_at_latency_percentile', 'GB/s per GPU payload')]
        if ep[3] == 'roundtrip':
            metric_groups.append((point, 'roundtrip_token_rate_at_latency_percentile', 'tokens/s aggregate'))
        metric_sources = [(source, f'{name}.{key}', unit) for source, name, unit in metric_groups
                          for key in ('p50', 'p90', 'p95', 'p99')]
    else:
        case = bodies[index]['kv'][int(kv[1])]
        identity = {'suite': 'kv',
                    'configuration': {key: item for key, item in case.items() if key not in {
                        'rows', 'label', 'disposition', 'outcome', 'reason', 'detail'}},
                    'row': {key: item for key, item in value.items() if key not in {
                        'prep_ms', 'latency_ms', 'request_ms', 'gbps_p50',
                        'gbps_p50_incl_prep', 'verify_passed'}}}
        issues = _collective_topology_issues(case.get('topology'))
        for key in ('case_id', 'sku', 'backend', 'fabric', 'workload', 'precision'):
            if type(case.get(key)) is not str or not case[key].strip():
                issues.append(f'missing_or_invalid_{key}')
        if case.get('vendor') not in ('nvidia', 'amd'):
            issues.append('missing_hardware_identity')
        if case.get('outcome') != 'success' or case.get('disposition') != 'runnable':
            issues.append('kv_case_not_successful')
        if value.get('kind') not in ('paged', 'bulk') or value.get('op') not in ('push', 'pull'):
            issues.append('missing_or_invalid_kv_operation')
        for key in ('isl', 'batch', 'descs', 'req_bytes'):
            if not integer(value.get(key)) or not (0 if key == 'req_bytes' else 1) <= value[key] <= MAX_SAFE_INTEGER:
                issues.append(f'missing_or_invalid_{key}')
        page_tokens = value.get('page_tokens', MISSING)
        if not (page_tokens is None and value.get('kind') == 'bulk') and \
                not (integer(page_tokens) and 0 < page_tokens <= MAX_SAFE_INTEGER):
            issues.append('missing_or_invalid_page_tokens')
        if value.get('verify_passed') is not True:
            issues.append('kv_verification_not_passed')
        metric_sources = [(value, f'{name}.{key}', 'samples' if key == 'n' else unit)
                          for name, unit in (('latency_ms', 'ms per burst'), ('request_ms', 'ms per request'))
                          for key in ('p50', 'p95', 'min', 'max', 'n')]
        metric_sources += [(value, key, unit) for key, unit in
                           (('prep_ms', 'ms per burst'), ('gbps_p50', 'GB/s'),
                            ('gbps_p50_incl_prep', 'GB/s including prep'))]
    metrics = []
    for source, name, unit in metric_sources:
        metric_value = _nested_metric(source, name)
        require(metric_value is MISSING or metric_value is None or
                finite(metric_value) and metric_value >= 0, 'CollectiveX metric source is invalid')
        state = {'status': 'missing'} if metric_value is MISSING else {
            'status': 'null' if metric_value is None else 'value', 'value': metric_value}
        metrics.append({'name': name, 'unit': unit, **state})
    return identity, issues, metrics


def _nested_metric(value, name):
    for key in name.split('.'):
        if value is None or value is MISSING:
            return value
        value = value.get(key, MISSING)
    return value


def _collective_expected(manifest, requests, bodies, result):
    options = manifest.get('normalized_arguments', {})
    require(set(options) == {'left', 'right'}, 'CollectiveX saved scope differs')
    explicit = options['left'] is not None or options['right'] is not None
    expected_requests = [('openapi', '/api/openapi.json', {})]
    if explicit:
        run_ids = [options['left'], options['right']]
        require(all(type(value) is str and re.fullmatch(r'[1-9]\d*', value) for value in run_ids) and
                run_ids[0] != run_ids[1], 'CollectiveX selected run scope differs')
    else:
        require(len(bodies) >= 2 and type(bodies[1].get('runs')) is list,
                'CollectiveX discovery scope differs')
        run_ids = sorted([run['run_id'] for run in bodies[1]['runs'] if run['measured_cases'] > 0],
                         key=int)[-2:]
        expected_requests.append(('collectivex-runs', '/api/v1/collectivex/runs', {'version': ['1']}))
    dataset_start = len(expected_requests)
    if len(run_ids) == 2:
        expected_requests.extend(('collectivex-run', f'/api/v1/collectivex/runs/{run_id}', {'version': ['1']})
                                 for run_id in run_ids)
    require([(request['operation'], urlsplit(request['url']).path,
              parse_qs(urlsplit(request['url']).query, keep_blank_values=True))
             for request in requests] == expected_requests, 'CollectiveX request scope differs')
    require(result.get('selection') == {
        'mode': 'explicit_run_ids' if explicit else 'newest_two_measured_from_one_list',
        'run_ids': run_ids}, 'CollectiveX selected run scope differs')
    groups = {}
    for side, dataset_index in enumerate(range(dataset_start, len(bodies))):
        dataset = bodies[dataset_index]
        pointers = [f'/series/{series_index}/points/{point_index}/components/{operation}'
                    for series_index, series in enumerate(dataset['series'])
                    for point_index in range(len(series['points']))
                    for operation in ('dispatch', 'stage', 'combine', 'roundtrip')]
        pointers += [f'/kv/{case_index}/rows/{row_index}'
                     for case_index, case in enumerate(dataset.get('kv', []))
                     for row_index in range(len(case['rows']))]
        for pointer in pointers:
            reference = {'response_index': dataset_index, 'json_pointer': pointer}
            identity, issues, metrics = _collective_source(bodies, requests, [reference], run_ids[side])
            group = groups.setdefault(_json_identity(identity), [[], []])
            group[side].append((reference, issues, metrics))
    comparisons = result['comparisons']
    keys = [_json_identity(row['identity']) for row in comparisons]
    require(len(keys) == len(set(keys)) and set(keys) == set(groups),
            'CollectiveX comparison identity set differs from raw source')
    counts = dict.fromkeys(('matched', 'only_left', 'only_right', 'ambiguous', 'incomparable'), 0)
    comparable = 0
    for comparison, key in zip(comparisons, keys):
        left, right = groups[key]
        issues = list(dict.fromkeys(issue for _, problems, _ in left + right for issue in problems))
        status = ('ambiguous' if len(left) > 1 or len(right) > 1 else 'incomparable' if issues else
                  'only_right' if not left else 'only_left' if not right else 'matched')
        require(comparison['left'] == [entry[0] for entry in left] and
                comparison['right'] == [entry[0] for entry in right],
                'CollectiveX source references differ from selected run identities')
        require(comparison['status'] == status and comparison.get('issues') == issues,
                'CollectiveX comparison status differs from raw source')
        metrics = []
        usable = False
        if status == 'matched':
            for a, b in zip(left[0][2], right[0][2]):
                numeric = a['status'] == b['status'] == 'value'
                usable |= numeric and a['unit'] != 'samples'
                difference = b['value'] - a['value'] if numeric else None
                ratio = b['value'] / a['value'] if numeric and a['value'] != 0 else None
                metrics.append({'name': a['name'], 'unit': a['unit'],
                                'left': {k: v for k, v in a.items() if k not in ('name', 'unit')},
                                'right': {k: v for k, v in b.items() if k not in ('name', 'unit')},
                                'difference_right_minus_left': difference if finite(difference) else None,
                                'ratio_right_over_left': ratio if finite(ratio) else None})
        require(same_json(comparison['metrics'], metrics), 'CollectiveX metric source or arithmetic differs')
        comparable += usable
        counts[status] += 1
    require(result['summary'] == counts, 'CollectiveX summary differs from raw source')
    reasons = [{'code': status, 'count': counts[status]} for status in
               ('only_left', 'only_right', 'ambiguous', 'incomparable') if counts[status]]
    if counts['matched'] > comparable:
        reasons.append({'code': 'matched_without_usable_metric', 'count': counts['matched'] - comparable})
    require(manifest['coverage'] == {
        'status': 'empty' if not comparisons else 'complete' if comparable == len(comparisons) else 'partial',
        'selected_records': len(comparisons), 'comparable_pairs': comparable, 'hardware': [],
        'reasons': reasons}, 'CollectiveX bundle coverage differs from raw source')
    return len(comparisons), comparable, {}, comparable


def _sanitized_export_identity(row):
    clean, changed = sanitized(row)
    clean = dict(clean)
    for key in ('id', 'workflow_run_id', 'curve_workflow_run_id'):
        if clean.get(key) is not None:
            clean[key] = str(clean[key])
    return clean, changed


def _string_export_identities(row):
    return _sanitized_export_identity(row)[0]


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


def _sorted_unique(values):
    return sorted(set(values), key=str)


def _agentx_enrichment_coverage(rows):
    supported = [row for row in rows if row['agentx']['status'] != 'unsupported_id']
    unsupported = len(rows) - len(supported)
    aggregates = {}
    for group in AGENTX_GROUPS:
        available = [row for row in supported
                     if row['agentx']['aggregates']['status'] == 'available']
        aggregates[group] = {
            'available_rows': sum(row['agentx']['aggregates']['value'][group] is not None
                                  for row in available),
            'null_rows': sum(row['agentx']['aggregates']['value'][group] is None
                             for row in available),
            'missing_entry_rows': sum(row['agentx']['aggregates']['status'] == 'not_returned'
                                      for row in supported),
            'unsupported_id_rows': unsupported,
        }
    return {
        'safe_id_rows': len(supported),
        'unsupported_id_rows': unsupported,
        'unique_safe_ids': len({row['agentx']['result_id'] for row in supported}),
        'aggregates': aggregates,
        'derived_metrics': {
            'available_rows': sum(row['agentx']['derived_metrics']['status'] == 'available'
                                  for row in supported),
            'missing_entry_rows': sum(row['agentx']['derived_metrics']['status'] == 'not_returned'
                                      for row in supported),
            'unsupported_id_rows': unsupported,
        },
        'trace_availability': {
            'stored_trace_rows': sum(row['agentx']['trace_availability']['value'] is True
                                     for row in supported),
            'no_stored_trace_rows': sum(row['agentx']['trace_availability']['value'] is False
                                        for row in supported),
            'response_key_rows': sum(row['agentx']['trace_availability']['response_key_present']
                                     is True for row in supported),
            'missing_key_rows': sum(row['agentx']['trace_availability']['response_key_present']
                                    is False for row in supported),
            'unsupported_id_rows': unsupported,
        },
    }


def _powerx_expected(manifest, requests, bodies, response_ids, rows, document=None):
    options = manifest.get('normalized_arguments')
    require(type(options) is dict and set(options) == {
        'model', 'date', 'isl', 'osl', 'raw_model', 'format'},
        'PowerX saved options differ')
    require(options['format'] == manifest['result']['format'], 'PowerX saved format differs')
    query = parse_qs(urlsplit(requests[0]['url']).query)
    expected_query = {'model': [options['model']], 'powerValid': ['strictV2']}
    if options['date'] is not None:
        expected_query['date'] = [options['date']]
    require(query == expected_query,
            'PowerX request scope differs')
    source = bodies[0]
    require(type(source) is list and all(type(row) is dict and type(row.get('metrics')) is dict
                                         for row in source),
            'PowerX response shape differs')
    scoped_rows = scoped(source, options['isl'], options['osl'], options['raw_model'])
    selected = [row for row in scoped_rows if strict(row)]
    expected, non_finite_values = [], 0
    for row in selected:
        clean, changed = _sanitized_export_identity(row)
        expected.append(clean)
        non_finite_values += changed
    if manifest['result']['format'] == 'json':
        require(rows == expected, 'PowerX derivation differs')
        metadata = {
            'package_version': manifest['producer']['package_version'],
            'query_url': requests[0]['url'],
            'retrieved_at': requests[0]['response']['retrieved_at'],
            'requested_model': options['model'],
            'requested_date': options['date'],
            'date_selection': 'latest' if options['date'] is None else 'as-of',
            'benchmark_type': 'single_turn',
            'isl': options['isl'],
            'osl': options['osl'],
            'raw_model': options['raw_model'],
            'returned_rows': len(source),
            'selected_rows': len(expected),
            'returned_models': _sorted_unique(row['model'] for row in source),
            'selected_models': _sorted_unique(row['model'] for row in selected),
            'excluded_rows': {
                'outside_requested_scope': len(source) - len(scoped_rows),
                'not_strict_v2': len(scoped_rows) - len(selected),
            },
            'metric_coverage': {
                key: {
                    'available_rows': sum(finite(row['metrics'].get(key)) for row in selected),
                    'unavailable_rows': sum(not finite(row['metrics'].get(key)) for row in selected),
                }
                for key in POWERX_UNITS
            },
            'non_finite_values': non_finite_values,
            'contract_version': 1,
            'source_response_id': response_ids[0],
        }
        require(document.get('metadata') == metadata, 'PowerX metadata differs from saved response')
        require(document.get('units') == POWERX_UNITS, 'PowerX units differ')
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
    excluded = len(scoped_rows) - len(selected)
    unavailable = len(expected) - eligible
    expected_coverage = {
        'status': 'empty' if not expected else
                  'partial' if excluded + unavailable > 0 else 'complete',
        'selected_records': len(expected),
        'comparable_pairs': None,
        'hardware': [{'hardware': name, 'valid_records': hardware[name]}
                     for name in sorted(hardware)],
        'reasons': ([{'code': 'not_strict_v2', 'count': excluded}] if excluded else []) +
                   ([{'code': 'measurement_unavailable', 'count': unavailable}]
                    if unavailable else []),
    }
    require(manifest.get('coverage') == expected_coverage,
            'PowerX bundle coverage differs from saved response')
    return len(expected), None, hardware, eligible


def _agentx_expected(manifest, requests, bodies, response_ids, rows, document=None):
    options = manifest.get('normalized_arguments')
    required = {'model', 'date', 'raw_model', 'hardware', 'framework', 'precision',
                'spec_method', 'offload_mode', 'concurrency', 'format'}
    require(type(options) is dict and set(options) == required,
            'AgentX saved options differ')
    require(options['format'] == manifest['result']['format'], 'AgentX saved format differs')
    query = parse_qs(urlsplit(requests[0]['url']).query)
    expected_query = {'model': [options['model']]}
    if options['date'] is not None:
        expected_query['date'] = [options['date']]
    require(query == expected_query,
            'AgentX request scope differs')
    benchmarks = bodies[0]
    require(type(benchmarks) is list and all(agentx_benchmark(row) for row in benchmarks),
            'AgentX benchmark response shape differs')
    agentx_rows = [row for row in benchmarks if row['benchmark_type'] == 'agentic_traces']
    selected = [row for row in agentx_rows if all(
        options[name] is None or row[field] == options[name]
        for name, field in AGENTX_FILTERS)]
    selected_ids = list(dict.fromkeys(result_id for row in selected
                                     if (result_id := safe_result_id(row['id'])) is not None))
    expected_requests = [(operation, {'ids': [','.join(map(str, selected_ids[start:start + size]))]})
                         for operation, size in (('agentic-aggregates', 200),
                                                 ('derived-agentic-metrics', 200),
                                                 ('trace-availability', 500))
                         for start in range(0, len(selected_ids), size)]
    require([(request['operation'], parse_qs(urlsplit(request['url']).query, keep_blank_values=True))
             for request in requests[1:]] == expected_requests,
            'AgentX enrichment request scope differs from selected ID chunks')
    joined = {name: {} for name in
              ('agentic-aggregates', 'derived-agentic-metrics', 'trace-availability')}
    for request, body in zip(requests[1:], bodies[1:]):
        operation = request['operation']
        ids = parse_qs(urlsplit(request['url']).query).get('ids', [''])[0].split(',')
        requested = [int(value) for value in ids if value]
        joined[operation].update(agentx_map(body, requested, operation))
    expected, non_finite_values = [], 0
    for source in selected:
        benchmark, changed = _sanitized_export_identity(source)
        non_finite_values += changed
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
        request_urls = []
        for request, response_id in zip(requests, response_ids):
            entry = {'operation': request['operation'], 'url': request['url'],
                     'response_id': response_id}
            if request['operation'] != 'benchmarks':
                entry['requested_ids'] = parse_qs(urlsplit(request['url']).query).get(
                    'ids', [''])[0].split(',')
            request_urls.append(entry)
        requested_scope = {
            'display_model': options['model'],
            'date': options['date'],
            'date_selection': 'latest' if options['date'] is None else 'as-of',
            **{name: options[name] for name, _field in AGENTX_FILTERS},
            'benchmark_type': 'agentic_traces',
        }
        available_fields = {
            'raw_model': 'model', 'hardware': 'hardware', 'framework': 'framework',
            'precision': 'precision', 'spec_method': 'spec_method',
            'offload_mode': 'offload_mode', 'concurrency': 'conc',
        }
        metadata = {
            'package_version': manifest['producer']['package_version'],
            'retrieved_at': requests[0]['response']['retrieved_at'],
            'request_urls': request_urls,
            'requested_scope': requested_scope,
            'filters': {name: {'status': 'omitted' if options[name] is None else 'applied',
                               'value': options[name]}
                        for name, _field in AGENTX_FILTERS},
            'outcome': 'no_agentx_rows' if not agentx_rows else
                       'no_matching_rows' if not selected else 'selected_rows',
            'returned_rows': len(benchmarks),
            'returned_agentx_rows': len(agentx_rows),
            'selected_rows': len(expected),
            'available_filter_values': {
                name: _sorted_unique(row[field] for row in agentx_rows)
                for name, field in available_fields.items()
            },
            'returned_model_keys': _sorted_unique(row['model'] for row in benchmarks),
            'selected_model_keys': _sorted_unique(row['model'] for row in selected),
            'enrichment_coverage': _agentx_enrichment_coverage(expected),
            'non_finite_values': non_finite_values,
            'observation_context': 'Existing observations were read; no new benchmark was run.',
            'contract_version': 1,
            'source_response_ids': response_ids,
        }
        require(document.get('metadata') == metadata,
                'AgentX metadata differs from saved responses')
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
                    require(same_json(strict_json(record[column].encode()), benchmark['metrics']),
                            f'Bundle CSV value differs: agentx row {index} metrics_json')
                    continue
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
    unavailable = len(expected) - eligible
    expected_coverage = {
        'status': 'empty' if not expected else 'partial' if unavailable else 'complete',
        'selected_records': len(expected),
        'comparable_pairs': None,
        'hardware': [{'hardware': name, 'valid_records': hardware[name]}
                     for name in sorted(hardware)],
        'reasons': ([{'code': 'aggregate_unavailable', 'count': unavailable}]
                    if unavailable else []),
    }
    require(manifest.get('coverage') == expected_coverage,
            'AgentX bundle coverage differs from saved responses')
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
                manifest, requests, bodies, response_ids, result['rows'], result)
        elif kind == 'agentx':
            derived = _agentx_expected(
                manifest, requests, bodies, response_ids, result['rows'], result)
        elif kind == 'result':
            derived = None

    if kind == 'result':
        selected = result['selected_result']
        options = manifest.get('normalized_arguments', {})
        require(set(options) == {'id', 'model', 'date', 'run_id', 'log_file', 'log_offset', 'log_limit'} and
                type(options['id']) is str and safe_result_id(options['id']) is not None and
                type(options['model']) is str and options['model'].strip() and
                not (options['date'] is not None and options['run_id'] is not None) and
                (options['run_id'] is None or type(options['run_id']) is str and
                 safe_result_id(options['run_id']) is not None) and
                type(options['log_offset']) is int and 0 <= options['log_offset'] <= 2_000_000_000 and
                type(options['log_limit']) is int and 1 <= options['log_limit'] <= 262_144 and
                (options['log_file'] is None or type(options['log_file']) is str and
                 0 < len(options['log_file']) <= 1024 and '\0' not in options['log_file']),
                'Provenance saved arguments differ')
        require(selected['id'] == options['id'], 'Provenance selected ID differs from requested scope')
        benchmark_query = {'model': [options['model']]}
        if options['date'] is not None:
            requested_date = options['date']
            require(type(requested_date) is str and
                    re.fullmatch(r'\d{4}-\d{2}-\d{2}', requested_date) is not None and
                    datetime.fromisoformat(requested_date).date().isoformat() == requested_date and
                    selected['date'] <= requested_date and
                    selected.get('curve_date', selected['date']) <= requested_date,
                    'Provenance date scope differs')
            benchmark_query['date'] = [requested_date]
        if options['run_id'] is not None:
            benchmark_query.update(runId=[options['run_id']], exactRun=['true'])
        expected_requests = [('benchmarks', benchmark_query)]
        if selected.get('run_url') is not None:
            workflow_query = {'date': [selected['date']]}
            if selected['benchmark_type'] == 'agentic_traces':
                workflow_query['benchmarkType'] = ['agentic_traces']
            expected_requests.append(('workflow-info', workflow_query))
        log_query = {'id': [options['id']], 'offset': [str(options['log_offset'])],
                     'limit': [str(options['log_limit'])]}
        if options['log_file'] is not None:
            log_query['file'] = [options['log_file']]
        expected_requests.append(('server-log', log_query))
        require([(request['operation'], parse_qs(urlsplit(request['url']).query, keep_blank_values=True))
                 for request in requests] == expected_requests, 'Provenance request scope differs')
        matches = [_string_export_identities(row) for row in bodies[0]
                   if str(row.get('id')) == str(selected.get('id'))]
        require(len(matches) == 1 and selected == matches[0], 'Provenance selection differs')
        metadata = result.get('metadata', {})
        expected_scope = {
            'display_model': options['model'], 'date': options['date'],
            'github_run_id': options['run_id'],
            'selection': 'logical_run_snapshot' if options['run_id'] is not None else
                         'as_of_snapshot' if options['date'] is not None else 'latest_snapshot',
        }
        require(metadata.get('scope') == expected_scope and metadata.get('log_window') == {
            'file': options['log_file'], 'offset': options['log_offset'], 'limit': options['log_limit'],
            'offset_unit': 'Unicode characters'}, 'Provenance metadata scope differs')
        require(metadata.get('selected_result_id') == selected['id'] and
                metadata.get('ran_new_benchmark') is False,
                'Provenance metadata differs')
        producer = result.get('producer', {})
        expected_run, expected_configs = None, []
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
            require(len(matching_runs) <= 1 and all(
                item.get('date') == selected['date'] and
                (match.group(2) is None or str(item.get('run_attempt')) == match.group(2))
                for item in matching_runs), 'Provenance producer attempt differs')
            if match.group(2) is not None and matching_runs:
                expected_run = matching_runs[0]
                expected_configs = [config for config in bodies[1].get('runConfigs', [])
                                    if str(config.get('github_run_id')) == match.group(1) and
                                    all(config.get(key) == selected[key] for key in
                                        ('model', 'hardware', 'framework', 'precision', 'spec_method', 'disagg'))]
            expected_status = 'confirmed' if match.group(2) is not None and matching_runs else 'row_only'
            require(producer.get('status') == expected_status,
                    'Provenance producer confirmation differs')
        require(same_json(producer.get('workflow_run'), _normalized_id_object(expected_run)) and
                same_json(producer.get('run_configs'), _normalized_id_object(expected_configs)),
                'Provenance producer configuration differs from source')
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
        reasons = []
        for condition, code in (
            (expected_run is None, 'producer_unconfirmed'),
            (not expected_configs, 'producer_config_unconfirmed'),
            (selected['image'] is None, 'image_unavailable'),
            (requests[-1]['response']['status'] == 404, 'log_unavailable'),
        ):
            if condition:
                reasons.append({'code': code, 'count': 1})
        require(coverage == {'status': 'partial' if reasons else 'complete',
                             'selected_records': 1, 'comparable_pairs': None,
                             'hardware': [{'hardware': selected['hardware'], 'valid_records': 1}],
                             'reasons': reasons}, 'Provenance bundle coverage differs from source')
        derived = (1, None, {selected['hardware']: 1}, 1)
    elif kind == 'tco':
        feed = bodies[0]
        options = manifest.get('normalized_arguments', {})
        require(type(options) is dict and set(options) == {
            'model', 'date', 'workloads', 'target_output_tokens_per_second_per_user',
            'gpu_hourly_prices_usd', 'units'} and options.get('units') == TCO_UNITS,
            'TCO saved options or units differ')
        prices = options.get('gpu_hourly_prices_usd')
        workloads = options.get('workloads')
        target = options.get('target_output_tokens_per_second_per_user')
        require(type(prices) is dict and prices and type(workloads) is list and workloads and
                finite(target) and target > 0 and
                len(result['rows']) == len(prices) * len(workloads) and
                {(row.get('hardware'), row.get('workload')) for row in result['rows']} ==
                {(hardware_name, workload) for hardware_name in prices for workload in workloads},
                'TCO saved scope differs from result')
        expected_query = {
            'model': [options['model']], 'workloads': [','.join(workloads)],
            'tiers': [js_text(target)], 'view': ['points'], 'format': ['json']}
        if options['date'] is not None:
            expected_query['date'] = [options['date']]
        require(parse_qs(urlsplit(requests[0]['url']).query) == expected_query,
                'TCO request scope differs')
        require(type(feed) is dict and feed.get('model') == options['model'] and
                feed.get('date') == options['date'] and
                type(feed.get('db_model_keys')) is list and feed['db_model_keys'] and
                all(type(key) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', key)
                    for key in feed['db_model_keys']) and
                len(set(feed['db_model_keys'])) == len(feed['db_model_keys']) and
                feed.get('workloads') == workloads and feed.get('tiers') == [target] and
                not any(key in feed for key in ('alpha', 'weights', 'workload_weights')) and
                type(feed.get('rows')) is list,
                'TCO points response scope differs')
        expected_metadata = {
            'package_version': manifest['producer']['package_version'],
            'contract_version': 1,
            'requested_model': options['model'],
            'db_model_keys': feed['db_model_keys'],
            'requested_date': options['date'],
            'date_selection': 'as-of' if options['date'] is not None else 'latest',
            'benchmark_type': 'single_turn',
            'workloads': workloads,
            'target_output_tokens_per_second_per_user': target,
            'interactivity_statistic': 'median',
            'gpu_hourly_prices_usd': prices,
            'price_source': 'user-supplied',
            'cost_unit': TCO_UNITS['modeled_cost'],
            'throughput_unit': TCO_UNITS['gpu_output_throughput'],
            'formula': 'USD/GPU-hour * 1000000 / (output tokens/second/GPU * 3600)',
            'assumed_throughput_fraction': 1,
            'cost_scope': ('Supplied GPU hourly rate applied to API-reported output throughput; '
                           'GPU divisor may be role-specific or unverified; not verified '
                           'whole-deployment GPU rental cost or total ownership cost'),
            'frontier_scope': ('API frontier across frameworks, precisions, speculative methods '
                               'and deployment configurations on API-reported throughput bases; '
                               'no observation IDs, verified whole-deployment GPU denominator or '
                               'matched-configuration proof'),
            'offline_verification_scope': ('Saved API interpolation is an input; offline '
                'verification recalculates costs from saved points and does not independently '
                'revalidate benchmark frontier interpolation methodology.'),
        }
        require(result.get('metadata') == expected_metadata,
                'TCO metadata differs from saved response and arguments')
        require(result.get('units') == TCO_UNITS, 'TCO units differ')
        expected_source = {
            'response_id': response_ids[0],
            'query_url': requests[0]['url'],
            'retrieved_at': requests[0]['response']['retrieved_at'],
            'http_status': requests[0]['response']['status'],
            'sha256': response_ids[0],
            'body_encoding': 'utf8',
            'body_bytes': requests[0]['response']['size'],
        }
        require(result.get('source') == expected_source,
                'TCO source differs from saved response')
        eligible, hardware = 0, {}
        status_counts = {status: 0 for status in TCO_STATUSES}
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
                require((point.get('hardware'), point.get('workload'), point.get('tier')) ==
                        (row['hardware'], row['workload'], target),
                        'TCO point scope differs from its hardware, workload or tier')
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
            require(row.get('status') in status_counts, 'TCO point status differs')
            status_counts[row['status']] += 1
            hardware.setdefault(row['hardware'], 0)
            hardware[row['hardware']] += int(row['status'] == 'available')
        expected_domain_coverage = {
            'status': 'complete' if eligible == len(result['rows']) else 'incomplete',
            'requested_points': len(result['rows']),
            'returned_points': len(feed['rows']),
            'available_points': eligible,
            'status_counts': status_counts,
            'returned_hardware': _sorted_unique(row['hardware'] for row in feed['rows']),
        }
        require(result.get('coverage') == expected_domain_coverage,
                'TCO coverage differs from saved response')
        expected_bundle_coverage = {
            'status': 'empty' if not result['rows'] else
                      'complete' if eligible == len(result['rows']) else 'partial',
            'selected_records': len(result['rows']),
            'comparable_pairs': None,
            'hardware': [{'hardware': name, 'valid_records': hardware[name]}
                         for name in prices],
            'reasons': [{'code': status, 'count': status_counts[status]}
                        for status in TCO_STATUSES[1:] if status_counts[status]],
        }
        require(manifest.get('coverage') == expected_bundle_coverage,
                'TCO bundle coverage differs from saved response')
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
            expected_rows = [_string_export_identities(row) for row in source if
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
        derived = _collective_expected(manifest, requests, bodies, result)

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


def run_contract_one_workflows(node, installed, project, env, args, version, deadline):
    require(contract_one_required(version), 'Release verifier requires contract 1')
    collective_left, collective_right = COLLECTIVEX_POSITIVE_RUN_IDS
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
    parser.add_argument('--evidence', type=Path, required=True,
                        help='New directory; previous attempts are never overwritten')
    parser.add_argument('--project', type=Path,
                        help='Prepared native-agent project, for check-agent')
    args = parser.parse_args()
    require(all(value > 0 for value in (args.isl, args.osl, args.empty_isl, args.empty_osl)),
            'Token counts must be positive')
    if args.date:
        require(datetime.strptime(args.date, '%Y-%m-%d').strftime('%Y-%m-%d') == args.date,
                'Use a YYYY-MM-DD cutoff')

    record = json.loads(args.manifest.read_text())
    require(type(record.get('filename')) is str and
            re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*\.tgz', record['filename']) is not None and
            record['filename'] != 'prompt.txt', 'Archive filename must be a safe .tgz basename')
    require(contract_one_required(record['version']), 'Release verifier requires version 0.12.0 or later')
    archive = args.manifest.resolve().parent / record['filename']
    body = archive.read_bytes()
    require(record['name'] == PACKAGE and hashlib.sha256(body).hexdigest() == record['sha256'],
            'Candidate identity mismatch')
    require('sha512-' + base64.b64encode(hashlib.sha512(body).digest()).decode() == record['integrity'],
            'Candidate integrity mismatch')
    with tarfile.open(fileobj=io.BytesIO(body), mode='r:gz') as packed:
        prefix = 'package/skills/inferencex-api/'
        skill_files = {member.name.removeprefix(prefix): packed.extractfile(member).read()
                       for member in packed.getmembers()
                       if member.isfile() and member.name.startswith(prefix)}
    require('SKILL.md' in skill_files and 'scripts/inferencex.mjs' in skill_files,
            'Archive is missing the installed CLI')

    args.evidence = args.evidence.resolve()
    args.evidence.mkdir(parents=True)
    scope_fields = ('model', 'date', 'isl', 'osl', 'raw_model', 'empty_isl',
                    'empty_osl', 'agentx_model')
    report = {'status': 'running', 'mode': args.mode, 'started_at': now(),
              'candidate': record, 'new_benchmark_runs': False, 'requests': [],
              'targets': [], 'scope': {key: getattr(args, key) for key in scope_fields}}
    deadline = time.monotonic() + PUBLIC_DEADLINE_SECONDS if args.mode == 'public' else None
    if deadline is not None:
        report['public_retry_policy'] = {
            'install_attempts_per_target': PUBLIC_INSTALL_ATTEMPTS,
            'delays_seconds': PUBLIC_RETRY_DELAYS,
            'total_deadline_seconds': PUBLIC_DEADLINE_SECONDS,
            'retryable': 'exact requested package/version npm ETARGET only'}
    save(args.evidence / 'verification.json', report)

    try:
        if args.mode == 'check-agent':
            require(args.project is not None, '--project is required for check-agent')
            prepared = json.loads((args.project.parent / 'acceptance.json').read_text())
            require(prepared.get('mode') == 'agents' and prepared.get('status') == 'prepared' and
                    prepared.get('candidate') == record and prepared.get('scope') == report['scope'],
                    'Acceptance preparation state differs')
            targets = prepared.get('targets')
            require(type(targets) is list and len(targets) == 2 and
                    {entry.get('target') for entry in targets} == {'codex', 'claude'} and
                    all(entry.get('status') == 'awaiting-native-agent' for entry in targets),
                    'Prepared target set differs')
            matches = [entry for entry in targets
                       if Path(entry.get('project', '')).resolve() == args.project.resolve()]
            require(len(matches) == 1, 'Project was not prepared for this acceptance run')
            target = matches[0]
            local_archive = args.project / record['filename']
            prompt_bytes = (args.project / 'prompt.txt').read_bytes()
            require(local_archive.read_bytes() == body and
                    target.get('prompt_sha256') == hashlib.sha256(prompt_bytes).hexdigest() and
                    prompt_bytes == prompt(args, target['target'], local_archive).encode(),
                    'Native-agent archive or prompt differs')
            installed = args.project / ('.agents' if target['target'] == 'codex' else '.claude') / \
                'skills/inferencex-api'
            check_installed(installed, skill_files, record['version'])
            bundles = args.project / 'bundles'
            expected = {'powerx', 'agentx', 'result', 'tco', 'releases', 'collectivex'}
            require(bundles.is_dir() and not bundles.is_symlink() and
                    {path.name for path in bundles.iterdir()} == expected and
                    all(path.is_dir() and not path.is_symlink() for path in bundles.iterdir()),
                    'Native-agent bundle inventory differs')
            audits = {kind: check_bundle(bundles / kind, record['version'])
                      for kind in sorted(expected)}
            require((args.project / 'result.md').is_file() and
                    (args.project / 'result.md').read_text().strip(),
                    'Native-agent narrative is missing')
            report.update(status='data-checks-passed', narrative_review='required',
                          targets=[{'target': target['target'], 'project': str(args.project),
                                    'bundles': audits}])
            return

        if args.mode == 'public':
            metadata = json.loads(fetch_public(
                f'{REGISTRY}/@semianalysisai%2finferencex-skills/{record["version"]}',
                args.evidence / 'registry.json', report, deadline))
            require(metadata['name'] == PACKAGE and metadata['version'] == record['version'] and
                    metadata['dist']['integrity'] == record['integrity'],
                    'Public metadata differs from candidate')
            public = fetch_public(metadata['dist']['tarball'],
                                  args.evidence / 'public-package.tgz', report, deadline)
            require(public == body, 'Public tarball differs from the accepted archive')

        clean_root = Path(tempfile.mkdtemp(prefix='inferencex-skill-acceptance-')).resolve()
        report['clean_root'] = str(clean_root)
        if args.mode == 'agents':
            for target in ('codex', 'claude'):
                project = clean_root / target
                project.mkdir()
                local_archive = project / record['filename']
                local_archive.write_bytes(body)
                prompt_bytes = prompt(args, target, local_archive).encode()
                (project / 'prompt.txt').write_bytes(prompt_bytes)
                report['targets'].append({
                    'target': target, 'project': str(project),
                    'status': 'awaiting-native-agent',
                    'prompt_sha256': hashlib.sha256(prompt_bytes).hexdigest()})
            report['status'] = 'prepared'
            save(clean_root / 'acceptance.json', report)
            report['native_agent_acceptance'] = 'not run'
            return

        node, npm = shutil.which('node'), shutil.which('npm')
        require(node and npm, 'Node 24 and npm must be on PATH')
        for target in ('codex', 'claude'):
            project, environment = install_target(
                clean_root, target, node, npm, archive, record['version'],
                args.mode == 'public', report, deadline)
            installed = project / ('.agents' if target == 'codex' else '.claude') / \
                'skills/inferencex-api'
            check_installed(installed, skill_files, record['version'])
            workflows = run_contract_one_workflows(
                node, installed, project, environment, args, record['version'], deadline)
            check_installed(installed, skill_files, record['version'])
            report['targets'].append({'target': target, 'project': str(project),
                                      'contract_one': workflows})
        remaining_seconds(deadline, PUBLIC_DEADLINE_SECONDS)
        report['status'] = 'passed'
    except Exception as error:
        report.update(status='failed', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        if args.mode in {'candidate', 'public'} and report.get('clean_root'):
            for target in ('codex', 'claude'):
                source = Path(report['clean_root']) / target
                if source.exists():
                    shutil.copytree(source, args.evidence / target)
        report['completed_at'] = now()
        save(args.evidence / 'verification.json', report)
        print(json.dumps({'status': report['status'],
                          'evidence': str(args.evidence / 'verification.json'),
                          'clean_root': report.get('clean_root')}))


if __name__ == '__main__':
    main()
