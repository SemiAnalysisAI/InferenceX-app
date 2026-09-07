"""Offline evidence, orchestration, retry, and deadline regressions for the release verifier."""

import base64
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'release_check', Path(__file__).resolve().parents[1] / 'scripts/verify-release.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
VERSION = '0.4.0'
ETARGET = f'npm error code ETARGET\nnpm error notarget No matching version found for {check.PACKAGE}@{VERSION}.\n'
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


class Clock:
    value = 0

    def monotonic(self):
        return self.value

    def sleep(self, seconds):
        self.value += seconds


class RetryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.clock = Clock()
        self.report = {}
        self.calls = []
        self.monotonic = patch.object(check.time, 'monotonic', self.clock.monotonic)
        self.delay = patch.object(check.time, 'sleep', wraps=self.clock.sleep)
        self.monotonic.start()
        self.sleep = self.delay.start()
        self.addCleanup(self.monotonic.stop)
        self.addCleanup(self.delay.stop)

    def install(self, outcomes, *, public=True, deadline=300):
        def execute(command, **kwargs):
            self.calls.append((command, kwargs))
            self.assertNotIn('publish', command)
            self.assertNotIn('pack', command)
            project = kwargs['cwd']
            self.assertFalse((project / 'partial-install').exists())
            (project / 'partial-install').write_text('keep attempt evidence')
            logs = Path(kwargs['env']['npm_config_cache']) / '_logs'
            logs.mkdir(parents=True)
            (logs / 'debug.log').write_text('npm attempt details')
            outcome = outcomes[len(self.calls) - 1]
            kwargs['stdout'].write('partial stdout' if isinstance(outcome, Exception) else 'attempt output')
            kwargs['stderr'].write('partial stderr' if isinstance(outcome, Exception) else outcome)

            def wait(timeout):
                kwargs['timeout'] = timeout
                self.clock.value += 1
                if isinstance(outcome, Exception):
                    raise outcome
                return int(bool(outcome))

            return SimpleNamespace(pid=54321, wait=wait, poll=lambda: None)

        with patch.object(check.subprocess, 'Popen', side_effect=execute), patch.object(check.os, 'killpg') as kill:
            self.kill = kill
            return check.install_target(self.root, 'codex', '/runtime/node', '/runtime/npm',
                                        self.root / 'candidate.tgz', VERSION, public, self.report, deadline)

    def test_transient_then_success_keeps_every_attempt_and_fresh_project(self):
        project, env = self.install([ETARGET, ''])
        self.assertEqual(project, self.root / 'codex/attempt-2')
        self.assertEqual([entry['status'] for entry in self.report['install_attempts']], ['failed', 'passed'])
        self.assertEqual(self.sleep.call_args_list[0].args, (5,))
        self.assertEqual(self.clock.value, 7)
        self.assertEqual(env['npm_config_fetch_retries'], '0')
        self.assertNotEqual(self.calls[0][1]['env']['npm_config_cache'], env['npm_config_cache'])
        for entry in self.report['install_attempts']:
            attempt = Path(entry['project'])
            saved = json.loads((attempt / 'install-attempt.json').read_text())
            self.assertEqual(saved, entry)
            self.assertEqual(entry['elapsed_seconds'], 1)
            self.assertIn('started_at', entry)
            self.assertIn('completed_at', entry)
            self.assertEqual((attempt / 'npm-logs/debug.log').read_text(), 'npm attempt details')
            self.assertEqual((attempt / 'install.stdout.log').read_text(), 'attempt output')
            self.assertTrue((attempt / 'partial-install').exists())
            self.assertEqual(self.calls[entry['attempt'] - 1][0][4], f'{check.PACKAGE}@{VERSION}')
        self.assertEqual((self.root / 'codex/attempt-1/install.stderr.log').read_text(), ETARGET)

    def test_exhaustion_keeps_three_failed_attempts(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.install([ETARGET] * 3)
        self.assertEqual(len(self.calls), 3)
        self.assertEqual([call.args[0] for call in self.sleep.call_args_list], [5, 10])
        self.assertEqual(self.clock.value, 18)
        self.assertTrue(all(entry['status'] == 'failed' for entry in self.report['install_attempts']))
        self.assertTrue((self.root / 'codex/attempt-3/install-attempt.json').exists())

    def test_permanent_and_nonexact_errors_fail_without_retry(self):
        errors = [
            'npm error code E401\nAuthentication required',
            'npm error code E403\nForbidden',
            'npm error code EINTEGRITY\nIntegrity checksum failed',
            ETARGET.replace(VERSION, '0.4.1'),
            ETARGET.replace(check.PACKAGE, 'another-package'),
            ETARGET.replace('code ETARGET', 'code E404'),
            ETARGET + 'npm error code E401\n',
            'npm error code ETARGET\nNo exact package evidence',
        ]
        for index, error in enumerate(errors):
            with self.subTest(error=error):
                self.root = self.root / str(index)
                self.root.mkdir()
                self.calls, self.report = [], {}
                with self.assertRaises(subprocess.CalledProcessError):
                    self.install([error])
                self.assertEqual(len(self.calls), 1)
                self.assertFalse(self.report['install_attempts'][0]['retryable'])
        self.sleep.assert_not_called()

    def test_candidate_does_not_retry_etarget(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.install([ETARGET], public=False, deadline=None)
        self.assertEqual(len(self.calls), 1)
        self.assertIn('--offline', self.calls[0][0])
        self.sleep.assert_not_called()

    def test_deadline_prevents_retry_and_bounds_subprocess(self):
        with self.assertRaisesRegex(TimeoutError, 'next retry'):
            self.install([ETARGET], deadline=6)
        self.assertEqual(self.calls[0][1]['timeout'], 6)
        self.sleep.assert_not_called()
        self.assertEqual(len(self.calls), 1)
        self.assertTrue((self.root / 'codex/attempt-1/install-attempt.json').exists())

    def test_timeout_preserves_output_and_is_never_retried(self):
        error = subprocess.TimeoutExpired(['npm', 'exec'], 7, output=b'partial stdout', stderr=b'partial stderr')
        with self.assertRaises(subprocess.TimeoutExpired):
            self.install([error], deadline=7)
        self.assertEqual(self.calls[0][1]['timeout'], 7)
        self.assertEqual((self.root / 'codex/attempt-1/install.stdout.log').read_text(), 'partial stdout')
        self.assertEqual((self.root / 'codex/attempt-1/install.stderr.log').read_text(), 'partial stderr')
        record, = map(json.loads, (self.root / 'codex/attempt-1/commands.jsonl').read_text().splitlines())
        self.assertEqual(record['command'], self.calls[0][0])
        self.assertTrue(record['timed_out'])
        self.assertIsNone(record['returncode'])
        self.assertEqual(record['timeout_seconds'], 7)
        self.assertTrue(self.calls[0][1]['start_new_session'])
        self.kill.assert_called_once_with(54321, check.signal.SIGKILL)
        self.sleep.assert_not_called()

    def test_elapsed_deadline_stops_before_another_subprocess(self):
        with self.assertRaises(TimeoutError):
            self.install([], deadline=0)
        self.assertEqual(self.calls, [])

    def test_hanging_descendant_cannot_hold_command_open_after_timeout(self):
        script = ('import subprocess, sys, time; '
                  'subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"]); '
                  'print("parent and child started", flush=True); time.sleep(60)')
        started = time.perf_counter()
        real_popen = check.subprocess.Popen
        processes = []

        def start(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        with patch.object(check.subprocess, 'Popen', side_effect=start):
            try:
                with self.assertRaises(subprocess.TimeoutExpired):
                    # Allow interpreter startup under concurrent packed suites; the child sleeps for 60s.
                    check.run([sys.executable, '-c', script], self.root, {}, 'descendants', deadline=1)
            finally:
                for process in processes:
                    try:
                        process.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        check.os.killpg(process.pid, check.signal.SIGKILL)
                        process.wait(timeout=1)
        self.assertLess(time.perf_counter() - started, 3)
        self.assertIn('parent and child started', (self.root / 'descendants.stdout.log').read_text())
        self.assertEqual(processes[0].returncode, -check.signal.SIGKILL)

    def test_http_total_deadline_interrupts_slow_body_and_restores_alarm(self):
        url = check.REGISTRY + '/metadata'
        report = {'requests': []}
        response = SimpleNamespace(status=200, url=url, headers={})

        def slow_read():
            self.clock.value = 8
            handler = signals.call_args_list[0].args[1]
            handler(check.signal.SIGALRM, None)

        response.read = slow_read
        manager = unittest.mock.MagicMock()
        manager.__enter__.return_value = response
        opener = SimpleNamespace(open=unittest.mock.Mock(return_value=manager))
        with patch.object(check, 'build_opener', return_value=opener), \
                patch.object(check.signal, 'signal', return_value=check.signal.SIG_DFL) as signals, \
                patch.object(check.signal, 'setitimer') as timers:
            with self.assertRaisesRegex(TimeoutError, 'HTTP response'):
                check.fetch_public(url, self.root / 'response.json', report, deadline=8)
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 8)
        self.assertEqual([call.args for call in timers.call_args_list],
                         [(check.signal.ITIMER_REAL, 8), (check.signal.ITIMER_REAL, 0)])
        self.assertEqual(signals.call_args_list[-1].args, (check.signal.SIGALRM, check.signal.SIG_DFL))
        self.assertEqual(report['requests'][0]['status'], 'failed')
        self.assertFalse((self.root / 'response.json').exists())

    def test_public_integrity_mismatch_fails_before_install(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as packed:
            content = b'skill'
            entry = tarfile.TarInfo('package/skills/inferencex-api/SKILL.md')
            entry.size = len(content)
            packed.addfile(entry, io.BytesIO(content))
            cli = tarfile.TarInfo('package/skills/inferencex-api/scripts/inferencex.mjs')
            cli.size = len(content)
            packed.addfile(cli, io.BytesIO(content))
        body = stream.getvalue()
        version = '1.0.0'
        record = {'name': check.PACKAGE, 'version': version, 'filename': 'candidate.tgz',
                  'sha256': hashlib.sha256(body).hexdigest(),
                  'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(body).digest()).decode()}
        (self.root / 'candidate.tgz').write_bytes(body)
        check.save(self.root / 'release.json', record)
        command = ['verify-release.py', 'public', str(self.root / 'release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example',
                   '--evidence', str(self.root / 'evidence')]
        metadata = {'name': check.PACKAGE, 'version': version, 'dist': {'integrity': 'wrong'}}
        with patch.object(sys, 'argv', command), patch.object(check, 'fetch_public', return_value=json.dumps(metadata)) as fetch, \
                patch.object(check, 'install_target') as install, patch('builtins.print'):
            with self.assertRaisesRegex(ValueError, 'Public metadata differs'):
                check.main()
        fetch.assert_called_once()
        install.assert_not_called()
        self.sleep.assert_not_called()
        report = json.loads((self.root / 'evidence/verification.json').read_text())
        self.assertEqual(report['status'], 'failed')
        self.assertIn('Public metadata differs', report['error'])
        self.assertEqual(report['public_retry_policy']['total_deadline_seconds'], 300)

class UnifiedAcceptanceSurfaceTests(unittest.TestCase):
    def test_native_prompt_uses_only_the_unified_query_entry(self):
        args = SimpleNamespace(
            model='GLM-5', date='2026-09-07', isl=8192, osl=1024,
            raw_model='glm5', empty_isl=7, empty_osl=13,
            agentx_model='DeepSeek-V4-Pro')
        text = check.prompt(args, 'codex', Path('/tmp/candidate.tgz'))
        for route in ('inferencex powerx export', 'inferencex agentx export',
                      'inferencex result inspect', 'inferencex tco compare',
                      'inferencex releases compare', 'inferencex collectivex compare',
                      'inferencex verify'):
            self.assertIn(route, text)
        for removed in ('export-powerx.mjs', 'export-agentx.mjs', 'verify-export.mjs',
                        'investigate-result.mjs', 'compare-tco.mjs',
                        'compare-releases.mjs', 'compare-collectivex.mjs'):
            self.assertNotIn(removed, text)


class ContractOneBundleOracleTests(unittest.TestCase):
    VERSION = '1.0.0'

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.serial = 0

    def bundle(self, kind, responses, build_result, coverage=None, requirements=None,
               result_format='json', normalized_arguments=None):
        self.serial += 1
        root = self.root / f'{kind}-{self.serial}'
        response_root = root / 'responses'
        response_root.mkdir(parents=True)
        ledger, response_ids = [], []
        for operation, url, body, status in responses:
            raw = json.dumps(body, separators=(',', ':')).encode()
            response_id = hashlib.sha256(raw).hexdigest()
            (response_root / f'{response_id}.body').write_bytes(raw)
            response_ids.append(response_id)
            ledger.append({
                'operation': operation,
                'url': url,
                'allowed_statuses': [200, 404] if status == 404 else [200],
                'attempts': [{
                    'operation': operation,
                    'url': url,
                    'ordinal': 1,
                    'startedAt': '2026-09-07T00:00:00.000Z',
                    'endedAt': '2026-09-07T00:00:01.000Z',
                    'status': status,
                    'consumedBytes': len(raw),
                    'retry': {'decision': 'accepted', 'reason': 'allowed_status'},
                }],
                'response': {
                    'encoding': 'decoded',
                    'id': response_id,
                    'path': f'responses/{response_id}.body',
                    'retrieved_at': '2026-09-07T00:00:01.000Z',
                    'sha256': response_id,
                    'size': len(raw),
                    'status': status,
                },
            })
        result = build_result(response_ids)
        result_bytes = result.encode() if result_format == 'csv' else \
            (json.dumps(result, indent=2) + '\n').encode()
        (root / f'result.{result_format}').write_bytes(result_bytes)
        coverage = coverage or {
            'status': 'complete', 'selected_records': 1, 'comparable_pairs': None,
            'hardware': [], 'reasons': []}
        requirements = requirements or {'require_hardware': [], 'min_comparable_pairs': None}
        requested = bool(requirements['require_hardware']) or \
            requirements['min_comparable_pairs'] is not None
        hardware = {entry['hardware']: entry['valid_records'] for entry in coverage['hardware']}
        passed = all(hardware.get(name, 0) > 0 for name in requirements['require_hardware']) and \
            (requirements['min_comparable_pairs'] is None or
             (coverage['comparable_pairs'] or 0) >= requirements['min_comparable_pairs'])
        policy_status = 'not_requested' if not requested else 'passed' if passed else 'failed'
        if normalized_arguments is None:
            normalized_arguments = {
                'powerx': {'model': 'GLM-5', 'date': None, 'isl': 8192, 'osl': 1024,
                           'raw_model': None, 'format': result_format},
                'agentx': {'model': 'DeepSeek-V4-Pro', 'date': None, 'raw_model': None,
                           'hardware': None, 'framework': None, 'precision': None,
                           'spec_method': None, 'offload_mode': None, 'concurrency': None,
                           'format': result_format},
                'tco': {'model': 'dsv4', 'date': None, 'workloads': ['1024x1024'],
                        'target_output_tokens_per_second_per_user': 50,
                        'gpu_hourly_prices_usd': {'b200': 3.6}, 'units': {}},
                'releases': {'model': 'GLM-5', 'raw_model': 'glm5', 'hardware': 'h200_sxm',
                             'framework': 'sglang', 'isl': 8192, 'osl': 1024,
                             'metric': 'median_ttft', 'before_date': '2026-09-06',
                             'after_date': '2026-09-07', 'before_image': 'before',
                             'after_image': 'after', 'before_run_url': None,
                             'after_run_url': None},
            }.get(kind, {})
        manifest = {
            'schema_version': 1,
            'contract_version': 1,
            'kind': kind,
            'producer': {'package_version': self.VERSION},
            'normalized_arguments': normalized_arguments,
            'result': {
                'format': result_format, 'path': f'result.{result_format}', 'size': len(result_bytes),
                'sha256': hashlib.sha256(result_bytes).hexdigest()},
            'requests': ledger,
            'coverage': coverage,
            'summary': {
                'schema_version': 1,
                'command': f'{kind} test',
                'kind': kind,
                'package_version': self.VERSION,
                'created_at': '2026-09-07T00:00:02.000Z',
                'validity': 'valid',
                'coverage': coverage,
                'policy': {'status': policy_status, 'requirements': requirements, 'reasons': []},
                'output': {'result': f'result.{result_format}', 'manifest': 'manifest.json'},
            },
        }
        check.save(root / 'manifest.json', manifest)
        return root

    def fixtures(self):
        origin = 'https://inferencex.semianalysis.com'
        base = {
            'model': 'glm5', 'hardware': 'h200_sxm', 'framework': 'sglang',
            'image': None, 'precision': 'fp8', 'spec_method': 'none',
            'benchmark_type': 'single_turn', 'isl': 8192, 'osl': 1024, 'conc': 1,
            'disagg': False, 'is_multinode': False, 'offload_mode': 'none',
            'recipe_fingerprint': None, 'prefill_tp': 1, 'prefill_ep': 1,
            'prefill_dp_attention': False, 'prefill_num_workers': 1,
            'decode_tp': 1, 'decode_ep': 1, 'decode_dp_attention': False,
            'decode_num_workers': 1, 'num_prefill_gpu': 1, 'num_decode_gpu': 1,
            'date': '2026-09-07', 'workflow_run_id': '101', 'run_started_at': None,
            'run_url': None, 'curve_date': '2026-09-07',
            'curve_workflow_run_id': '101', 'curve_run_started_at': None,
        }
        power_row = {**base, 'id': 1,
                     'metrics': {'power_valid': 1, 'power_metric_schema_version': 2,
                                 'avg_power_w': 700}}
        power = self.bundle(
            'powerx', [('benchmarks', origin +
                        '/api/v1/benchmarks?model=GLM-5&powerValid=strictV2', [power_row], 200)],
            lambda ids: {'schema_version': 1, 'kind': 'powerx',
                         'metadata': {
                             'package_version': self.VERSION,
                             'query_url': origin +
                                 '/api/v1/benchmarks?model=GLM-5&powerValid=strictV2',
                             'retrieved_at': '2026-09-07T00:00:01.000Z',
                             'requested_model': 'GLM-5', 'requested_date': None,
                             'date_selection': 'latest', 'benchmark_type': 'single_turn',
                             'isl': 8192, 'osl': 1024, 'raw_model': None,
                             'returned_rows': 1, 'selected_rows': 1,
                             'returned_models': ['glm5'], 'selected_models': ['glm5'],
                             'excluded_rows': {'outside_requested_scope': 0,
                                               'not_strict_v2': 0},
                             'metric_coverage': {
                                 key: {'available_rows': int(key == 'avg_power_w'),
                                       'unavailable_rows': int(key != 'avg_power_w')}
                                 for key in POWERX_UNITS},
                             'non_finite_values': 0, 'contract_version': 1,
                             'source_response_id': ids[0]},
                         'units': POWERX_UNITS,
                         'rows': [{**power_row, 'id': '1'}]},
            {'status': 'complete', 'selected_records': 1, 'comparable_pairs': None,
             'hardware': [{'hardware': 'h200_sxm', 'valid_records': 1}], 'reasons': []})

        benchmark = {**base, 'id': 2, 'hardware': 'b300',
                     'benchmark_type': 'agentic_traces', 'metrics': {'median_ttft': 10}}
        group = {'mean': 10, 'p50': 10, 'p75': 11, 'p90': 12, 'p95': 13, 'p99': 14, 'n': 1}
        aggregate = {'id': 2, 'isl': group, 'osl': None, 'kvCacheUtil': None,
                     'prefixCacheHitRate': None}
        derived = {'id': 2, 'p75_e2e_norm_intvty': 4, 'p90_e2e_norm_intvty': 5}
        agent_responses = [
            ('benchmarks', origin + '/api/v1/benchmarks?model=DeepSeek-V4-Pro', [benchmark], 200),
            ('agentic-aggregates', origin + '/api/v1/agentic-aggregates?ids=2',
             {'2': aggregate}, 200),
            ('derived-agentic-metrics', origin + '/api/v1/derived-agentic-metrics?ids=2',
             {'2': derived}, 200),
            ('trace-availability', origin + '/api/v1/trace-availability?ids=2', {'2': False}, 200),
        ]
        agent = self.bundle(
            'agentx', agent_responses,
            lambda ids: {'schema_version': 1, 'kind': 'agentx',
                         'metadata': {
                             'package_version': self.VERSION,
                             'retrieved_at': '2026-09-07T00:00:01.000Z',
                             'request_urls': [
                                 {'operation': operation, 'url': url,
                                  'response_id': response_id,
                                  **({} if operation == 'benchmarks' else
                                     {'requested_ids': ['2']})}
                                 for (operation, url, _body, _status), response_id
                                 in zip(agent_responses, ids)],
                             'requested_scope': {
                                 'display_model': 'DeepSeek-V4-Pro', 'date': None,
                                 'date_selection': 'latest', 'raw_model': None,
                                 'hardware': None, 'framework': None, 'precision': None,
                                 'spec_method': None, 'offload_mode': None,
                                 'concurrency': None, 'benchmark_type': 'agentic_traces'},
                             'filters': {
                                 name: {'status': 'omitted', 'value': None}
                                 for name, _field in check.AGENTX_FILTERS},
                             'outcome': 'selected_rows', 'returned_rows': 1,
                             'returned_agentx_rows': 1, 'selected_rows': 1,
                             'available_filter_values': {
                                 'raw_model': ['glm5'], 'hardware': ['b300'],
                                 'framework': ['sglang'], 'precision': ['fp8'],
                                 'spec_method': ['none'], 'offload_mode': ['none'],
                                 'concurrency': [1]},
                             'returned_model_keys': ['glm5'],
                             'selected_model_keys': ['glm5'],
                             'enrichment_coverage': {
                                 'safe_id_rows': 1, 'unsupported_id_rows': 0,
                                 'unique_safe_ids': 1,
                                 'aggregates': {
                                     name: {'available_rows': int(name == 'isl'),
                                            'null_rows': int(name != 'isl'),
                                            'missing_entry_rows': 0,
                                            'unsupported_id_rows': 0}
                                     for name in check.AGENTX_GROUPS},
                                 'derived_metrics': {'available_rows': 1,
                                                     'missing_entry_rows': 0,
                                                     'unsupported_id_rows': 0},
                                 'trace_availability': {'stored_trace_rows': 0,
                                                        'no_stored_trace_rows': 1,
                                                        'response_key_rows': 1,
                                                        'missing_key_rows': 0,
                                                        'unsupported_id_rows': 0}},
                             'non_finite_values': 0,
                             'observation_context':
                                 'Existing observations were read; no new benchmark was run.',
                             'contract_version': 1, 'source_response_ids': ids},
                         'rows': [{'benchmark': {**benchmark, 'id': '2'}, 'agentx': {
                             'status': 'complete', 'result_id': '2',
                             'aggregates': {'status': 'available', 'value': {**aggregate, 'id': '2'}},
                             'derived_metrics': {'status': 'available', 'value': {**derived, 'id': '2'}},
                             'trace_availability': {'status': 'no_stored_trace', 'value': False,
                                                    'response_key_present': True}}}]},
            {'status': 'complete', 'selected_records': 1, 'comparable_pairs': None,
             'hardware': [{'hardware': 'b300', 'valid_records': 1}], 'reasons': []})

        provenance_responses = [
            ('benchmarks', origin + '/api/v1/benchmarks?model=GLM-5',
            [{**base, 'id': 3, 'metrics': {}}], 200),
            ('workflow-info', origin + '/api/v1/workflow-info?date=2026-09-07', {'runs': []}, 200),
            ('server-log', origin + '/api/v1/server-log?id=3', {'id': 3, 'serverLog': 'ready'}, 200),
        ]
        provenance = self.bundle(
            'result', provenance_responses,
            lambda ids: {'schema_version': 1, 'kind': 'result',
                         'metadata': {'package_version': self.VERSION,
                                      'selected_result_id': '3', 'ran_new_benchmark': False},
                         'selected_result': {**base, 'id': '3', 'metrics': {}},
                         'producer': {'status': 'unresolved', 'github_run_id': None,
                                      'run_attempt': None, 'workflow_run': None,
                                      'run_configs': []},
                         'evidence': [{'response_id': item} for item in ids],
                         'log': {'status': 'available', 'text': 'ready',
                                 'source_response_id': ids[-1]}},
            {'status': 'complete', 'selected_records': 1, 'comparable_pairs': None,
             'hardware': [{'hardware': 'h200_sxm', 'valid_records': 1}], 'reasons': []})

        point = {'hardware': 'b200', 'workload': '1024x1024', 'tier': 50,
                 'output_tput_per_gpu': 1000, 'boundary': 'interpolated',
                 'is_interpolated': True, 'frontier_points': 2,
                 'frontier_min_interactivity': 40, 'frontier_max_interactivity': 60,
                 'latest_date': '2026-09-07', 'oldest_frontier_date': '2026-09-06',
                 'evidence_date': {'from': '2026-09-06', 'to': '2026-09-07'}}
        tco_url = (origin + '/api/v1/tco-feed?model=dsv4&workloads=1024x1024&tiers=50'
                   '&view=points&format=json')
        tco_feed = {'model': 'dsv4', 'date': None, 'db_model_keys': ['dsv4'],
                    'workloads': ['1024x1024'], 'tiers': [50], 'rows': [point]}
        tco_units = {
            'gpu_hourly_price': 'USD per GPU-hour',
            'target_output_throughput': 'output tokens per second per user',
            'gpu_output_throughput': 'output tokens per second per GPU',
            'modeled_cost': 'USD per million output tokens'}
        tco = self.bundle(
            'tco', [('tco-feed', tco_url, tco_feed, 200)],
            lambda ids: {'schema_version': 1, 'kind': 'tco',
                         'metadata': {
                             'package_version': self.VERSION, 'contract_version': 1,
                             'requested_model': 'dsv4', 'db_model_keys': ['dsv4'],
                             'requested_date': None, 'date_selection': 'latest',
                             'benchmark_type': 'single_turn', 'workloads': ['1024x1024'],
                             'target_output_tokens_per_second_per_user': 50,
                             'interactivity_statistic': 'median',
                             'gpu_hourly_prices_usd': {'b200': 3.6},
                             'price_source': 'user-supplied',
                             'cost_unit': 'USD per million output tokens',
                             'throughput_unit': 'output tokens per second per GPU',
                             'formula': ('USD/GPU-hour * 1000000 / '
                                         '(output tokens/second/GPU * 3600)'),
                             'assumed_throughput_fraction': 1,
                             'cost_scope': ('Supplied GPU hourly rate only; not total purchase '
                                            'or ownership cost'),
                             'frontier_scope': ('API frontier across frameworks, precisions, '
                                                'speculative methods and deployment '
                                                'configurations; no observation IDs or '
                                                'matched-configuration proof'),
                             'offline_verification_scope': ('Saved API interpolation is an input; '
                                 'offline verification recalculates costs from saved points and '
                                 'does not independently revalidate benchmark frontier '
                                 'interpolation methodology.')},
                         'units': tco_units,
                         'source': {'response_id': ids[0], 'query_url': tco_url,
                                    'retrieved_at': '2026-09-07T00:00:01.000Z',
                                    'http_status': 200, 'sha256': ids[0],
                                    'body_encoding': 'utf8',
                                    'body_bytes': len(json.dumps(
                                        tco_feed, separators=(',', ':')).encode())},
                         'coverage': {'status': 'complete', 'requested_points': 1,
                                      'returned_points': 1, 'available_points': 1,
                                      'status_counts': {'available': 1, 'missing_point': 0,
                                                        'clamped_low': 0, 'unreachable': 0,
                                                        'zero_throughput': 0},
                                      'returned_hardware': ['b200']},
                         'rows': [{'hardware': 'b200', 'workload': '1024x1024',
                                   'status': 'available', 'usd_per_gpu_hour': 3.6,
                                   'usd_per_million_output_tokens': 1, 'point': point}]},
            {'status': 'complete', 'selected_records': 1, 'comparable_pairs': None,
             'hardware': [{'hardware': 'b200', 'valid_records': 1}], 'reasons': []},
            normalized_arguments={
                'model': 'dsv4', 'date': None, 'workloads': ['1024x1024'],
                'target_output_tokens_per_second_per_user': 50,
                'gpu_hourly_prices_usd': {'b200': 3.6}, 'units': tco_units})

        history = [{**base, 'id': 4, 'date': '2026-09-06', 'image': 'before',
                    'metrics': {'median_ttft': 10}},
                   {**base, 'id': 5, 'image': 'after', 'metrics': {'median_ttft': 15}}]
        configuration = {key: base[key] for key in (
            'model', 'hardware', 'framework', 'precision', 'spec_method', 'benchmark_type',
            'isl', 'osl', 'conc', 'offload_mode', 'disagg', 'is_multinode', 'prefill_tp',
            'prefill_ep', 'prefill_dp_attention', 'prefill_num_workers', 'decode_tp',
            'decode_ep', 'decode_dp_attention', 'decode_num_workers', 'num_prefill_gpu',
            'num_decode_gpu')}
        releases = self.bundle(
            'releases', [('benchmark-history', origin +
                          '/api/v1/benchmarks/history?model=GLM-5&isl=8192&osl=1024', history, 200)],
            lambda ids: {'schema_version': 1, 'kind': 'releases',
                         'metadata': {'causal_attribution': 'not_established',
                                      'statistical_verdict': 'not_established'},
                         'sources': [{'response_id': ids[0]}],
                         'selection': {
                             'before': {'rows': [history[0]], 'excluded': [],
                                        'unique_observations': 1, 'snapshot_reuses': 0},
                             'after': {'rows': [history[1]], 'excluded': [],
                                       'unique_observations': 1, 'snapshot_reuses': 0}},
                         'comparisons': [{'before_id': '4', 'after_id': '5',
                                          'configuration': configuration,
                                          'configuration_metrics': {}, 'metric': {
                             'name': 'median_ttft', 'before': 10, 'after': 15,
                             'delta': 5, 'percent_change': 50}}]},
            {'status': 'complete', 'selected_records': 2, 'comparable_pairs': 1,
             'hardware': [{'hardware': 'h200_sxm', 'valid_records': 1}], 'reasons': []})

        system = {'sku': 'h200_sxm', 'vendor': 'nvidia', 'ep_size': 8, 'nodes': 1,
                  'gpus_per_node': 8, 'scale_up_domain': 8, 'scale_up_transport': 'NVLink',
                  'scale_out_transport': None, 'topology_class': 'scale-up'}
        ep_config = {'series_id': 'case-a', 'phase': 'decode', 'mode': 'normal',
                     'precision': 'bf16', 'backend': 'deepep', 'system': system}
        left = {'run': {'run_id': '90071992547409930001'},
                'series': [{**ep_config, 'points': [{
            'tokens_per_rank': 32, 'global_tokens': 256,
            'components': {'dispatch': {'payload_bytes': 8192,
                                        'latency_us': {'p50': 20}}}}]}]}
        right = json.loads(json.dumps(left))
        right['run']['run_id'] = '90071992547409930002'
        right['series'][0]['points'][0]['components']['dispatch']['latency_us']['p50'] = 10
        collective_responses = [
            ('openapi', origin + '/api/openapi.json', {}, 200),
            ('collectivex-run', origin + '/api/v1/collectivex/runs/90071992547409930001', left, 200),
            ('collectivex-run', origin + '/api/v1/collectivex/runs/90071992547409930002', right, 200),
        ]
        collective = self.bundle(
            'collectivex', collective_responses,
            lambda ids: {'schema_version': 1, 'kind': 'collectivex',
                         'selection': {'run_ids': ['90071992547409930001', '90071992547409930002']},
                         'sources': [{'response_id': item} for item in ids],
                         'summary': {'matched': 1, 'only_left': 0, 'only_right': 0,
                                     'ambiguous': 0, 'incomparable': 0},
                         'comparisons': [{'status': 'matched',
                                         'identity': {'suite': 'ep', 'configuration': ep_config,
                                                      'operation': 'dispatch', 'tokens_per_rank': 32,
                                                      'global_tokens': 256, 'payload_bytes': 8192},
                                         'left': [{'response_index': 1,
                                                   'json_pointer': '/series/0/points/0/components/dispatch'}],
                                         'right': [{'response_index': 2,
                                                    'json_pointer': '/series/0/points/0/components/dispatch'}],
                                         'metrics': [{'name': 'latency_us.p50', 'unit': 'us',
                                                      'left': {'status': 'value', 'value': 20},
                                                      'right': {'status': 'value', 'value': 10},
                                                      'difference_right_minus_left': -10,
                                                      'ratio_right_over_left': 0.5}]}]},
            {'status': 'complete', 'selected_records': 1, 'comparable_pairs': 1,
             'hardware': [], 'reasons': []})
        return {name: value for name, value in (
            ('powerx', power), ('agentx', agent), ('result', provenance), ('tco', tco),
            ('releases', releases), ('collectivex', collective))}

    def rehash_result(self, directory, mutate):
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        result_path = directory / manifest['result']['path']
        result = json.loads(result_path.read_text())
        mutate(result)
        raw = (json.dumps(result, indent=2) + '\n').encode()
        result_path.write_bytes(raw)
        manifest['result']['size'] = len(raw)
        manifest['result']['sha256'] = hashlib.sha256(raw).hexdigest()
        check.save(manifest_path, manifest)

    def rehash_response(self, directory, index, mutate):
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        response = manifest['requests'][index]['response']
        old_id = response['id']
        old_path = directory / response['path']
        body = json.loads(old_path.read_text())
        mutate(body)
        raw = json.dumps(body, separators=(',', ':')).encode()
        new_id = hashlib.sha256(raw).hexdigest()
        new_path = directory / 'responses' / f'{new_id}.body'
        new_path.write_bytes(raw)
        old_path.unlink()
        response.update(id=new_id, sha256=new_id, path=f'responses/{new_id}.body', size=len(raw))
        manifest['requests'][index]['attempts'][-1]['consumedBytes'] = len(raw)
        result_path = directory / manifest['result']['path']
        result = json.loads(result_path.read_text())

        def replace(value):
            if value == old_id:
                return new_id
            if type(value) is list:
                return [replace(item) for item in value]
            if type(value) is dict:
                return {key: replace(item) for key, item in value.items()}
            return value

        result = replace(result)
        if result.get('source', {}).get('response_id') == new_id:
            result['source']['body_bytes'] = len(raw)
        result_raw = (json.dumps(result, indent=2) + '\n').encode()
        result_path.write_bytes(result_raw)
        manifest['result']['size'] = len(result_raw)
        manifest['result']['sha256'] = hashlib.sha256(result_raw).hexdigest()
        check.save(manifest_path, manifest)

    def rehash_overflow_response(self, directory, index, needle, mutate_result):
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        response = manifest['requests'][index]['response']
        old_id = response['id']
        old_path = directory / response['path']
        original = old_path.read_bytes()
        self.assertEqual(original.count(needle), 1)
        raw = original.replace(needle, needle.split(b':', 1)[0] + b':1e400')
        new_id = hashlib.sha256(raw).hexdigest()
        new_path = directory / 'responses' / f'{new_id}.body'
        new_path.write_bytes(raw)
        old_path.unlink()
        response.update(id=new_id, sha256=new_id, path=f'responses/{new_id}.body', size=len(raw))
        manifest['requests'][index]['attempts'][-1]['consumedBytes'] = len(raw)
        result_path = directory / manifest['result']['path']
        result = json.loads(result_path.read_text())

        def replace(value):
            if value == old_id:
                return new_id
            if type(value) is list:
                return [replace(item) for item in value]
            if type(value) is dict:
                return {key: replace(item) for key, item in value.items()}
            return value

        result = replace(result)
        mutate_result(result)
        result_raw = (json.dumps(result, indent=2) + '\n').encode()
        result_path.write_bytes(result_raw)
        manifest['result']['size'] = len(result_raw)
        manifest['result']['sha256'] = hashlib.sha256(result_raw).hexdigest()
        check.save(manifest_path, manifest)

    def forge_coverage(self, directory, *, status=None, selected=None, pairs=None,
                       hardware=None, reasons=None, requirements=None):
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        coverage = manifest['coverage']
        if status is not None:
            coverage['status'] = status
        if selected is not None:
            coverage['selected_records'] = selected
        if pairs is not None:
            coverage['comparable_pairs'] = pairs
        if hardware is not None:
            coverage['hardware'] = hardware
        if reasons is not None:
            coverage['reasons'] = reasons
        manifest['summary']['coverage'] = coverage
        if requirements is not None:
            manifest['summary']['policy'] = {
                'status': 'passed', 'requirements': requirements, 'reasons': []}
        check.save(manifest_path, manifest)

    def convert_to_csv(self, directory, kind):
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        result_path = directory / manifest['result']['path']
        document = json.loads(result_path.read_text())
        records = []
        if kind == 'powerx':
            for row in document['rows']:
                records.append({
                    'package_version': self.VERSION,
                    'query_url': manifest['requests'][0]['url'],
                    'retrieved_at': manifest['requests'][0]['response']['retrieved_at'],
                    'requested_model': manifest['normalized_arguments']['model'],
                    'requested_date': manifest['normalized_arguments']['date'],
                    'date_selection': 'latest',
                    'raw_model': manifest['normalized_arguments']['raw_model'],
                    'source_response_id': manifest['requests'][0]['response']['id'],
                    **row, **row['metrics'],
                })
            columns = check.CONTRACT_POWERX_CSV_COLUMNS
        else:
            source_ids = [request['response']['id'] for request in manifest['requests']]
            options = manifest['normalized_arguments']
            for row in document['rows']:
                benchmark, agentx = row['benchmark'], row['agentx']
                aggregate = agentx['aggregates']['value'] or {}
                enrichment = {
                    **{f'aggregate.{group}.{field}': (aggregate.get(group) or {}).get(field)
                       for group in check.AGENTX_GROUPS
                       for field in (*check.AGENTX_PERCENTILES, 'n')},
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
                records.append({
                    'package_version': self.VERSION,
                    'query_url': manifest['requests'][0]['url'],
                    'retrieved_at': manifest['requests'][0]['response']['retrieved_at'],
                    'requested_model': options['model'], 'requested_date': options['date'],
                    'date_selection': 'latest', 'requested_benchmark_type': 'agentic_traces',
                    **{f'filter.{name}': options[name] for name, _field in check.AGENTX_FILTERS},
                    'source_response_ids': json.dumps(source_ids, separators=(',', ':')),
                    **benchmark, 'metrics_json': json.dumps(benchmark['metrics'], separators=(',', ':')),
                    **enrichment,
                })
            columns = check.CONTRACT_AGENTX_CSV_COLUMNS
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=columns, lineterminator='\r\n', extrasaction='ignore')
        writer.writeheader()
        writer.writerows({key: str(value).lower() if type(value) is bool else value
                          for key, value in record.items()} for record in records)
        raw = output.getvalue().encode()
        csv_path = directory / 'result.csv'
        csv_path.write_bytes(raw)
        result_path.unlink()
        manifest['normalized_arguments']['format'] = 'csv'
        manifest['result'].update(path='result.csv', format='csv', size=len(raw),
                                  sha256=hashlib.sha256(raw).hexdigest())
        manifest['summary']['output']['result'] = 'result.csv'
        check.save(manifest_path, manifest)
        return directory

    def mutate_csv(self, directory, mutate):
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        result_path = directory / manifest['result']['path']
        with result_path.open(newline='') as handle:
            reader = csv.DictReader(handle)
            columns, records = reader.fieldnames, list(reader)
        mutate(records)
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=columns, lineterminator='\r\n')
        writer.writeheader()
        writer.writerows(records)
        raw = output.getvalue().encode()
        result_path.write_bytes(raw)
        manifest['result']['size'] = len(raw)
        manifest['result']['sha256'] = hashlib.sha256(raw).hexdigest()
        check.save(manifest_path, manifest)

    def test_six_family_bundles_are_checked_against_consumed_responses(self):
        reports = {kind: check.check_bundle(directory, self.VERSION)
                   for kind, directory in self.fixtures().items()}
        self.assertEqual(set(reports), {
            'powerx', 'agentx', 'result', 'tco', 'releases', 'collectivex'})
        self.assertTrue(all(report['status'] == 'passed' for report in reports.values()))
        self.assertEqual(reports['collectivex']['comparable_pairs'], 1)

    def test_rehashed_contract_metadata_units_coverage_and_sources_are_rejected(self):
        mutations = [
            ('powerx', lambda result: result['metadata'].update(requested_date='2026-09-01'),
             'PowerX metadata'),
            ('powerx', lambda result: result['units'].update(avg_power_w='watts'),
             'PowerX units'),
            ('powerx', lambda result: result['metadata']['metric_coverage'][
                'avg_power_w'].update(available_rows=0, unavailable_rows=1),
             'PowerX metadata'),
            ('agentx', lambda result: result['metadata']['request_urls'][1].update(
                requested_ids=['999']), 'AgentX metadata'),
            ('agentx', lambda result: result['metadata']['requested_scope'].update(
                hardware='forged'), 'AgentX metadata'),
            ('agentx', lambda result: result['metadata']['enrichment_coverage'][
                'trace_availability'].update(response_key_rows=0), 'AgentX metadata'),
            ('tco', lambda result: result['metadata'].update(price_source='market'),
             'TCO metadata'),
            ('tco', lambda result: result['units'].update(modeled_cost='USD/token'),
             'TCO units'),
            ('tco', lambda result: result['source'].update(
                retrieved_at='2026-09-01T00:00:00.000Z'), 'TCO source'),
            ('tco', lambda result: result['coverage'].update(returned_points=0),
             'TCO coverage'),
        ]
        for kind, mutate, message in mutations:
            with self.subTest(kind=kind, message=message):
                directory = self.fixtures()[kind]
                self.rehash_result(directory, mutate)
                with self.assertRaisesRegex(ValueError, message):
                    check.check_bundle(directory, self.VERSION)

    def test_supported_overflow_numbers_are_sanitized_and_counted(self):
        power = self.fixtures()['powerx']
        self.rehash_overflow_response(
            power, 0, b'"avg_power_w":700',
            lambda result: (
                result['rows'][0]['metrics'].update(avg_power_w=None),
                result['metadata']['metric_coverage']['avg_power_w'].update(
                    available_rows=0, unavailable_rows=1),
                result['metadata'].update(non_finite_values=1)))
        self.forge_coverage(
            power, status='partial',
            hardware=[{'hardware': 'h200_sxm', 'valid_records': 0}],
            reasons=[{'code': 'measurement_unavailable', 'count': 1}])
        self.assertEqual(check.check_bundle(power, self.VERSION)['eligible_records'], 0)

        agent = self.fixtures()['agentx']
        self.rehash_overflow_response(
            agent, 0, b'"median_ttft":10',
            lambda result: (
                result['rows'][0]['benchmark']['metrics'].update(median_ttft=None),
                result['metadata'].update(non_finite_values=1)))
        self.assertEqual(check.check_bundle(agent, self.VERSION)['eligible_records'], 1)

    def test_release_pairs_require_captured_scope_and_matching_configuration(self):
        for changed in ({'conc': 2}, {'image': 'unselected'},
                        {'metrics': {'median_ttft': 15, 'prefill_pp': 2}}):
            with self.subTest(changed=changed):
                directory = self.fixtures()['releases']
                self.rehash_response(directory, 0, lambda body: body[1].update(changed))
                self.rehash_result(directory, lambda result:
                                   result['selection']['after']['rows'][0].update(changed))
                with self.assertRaisesRegex(ValueError, 'Release (selection|matching)'):
                    check.check_bundle(directory, self.VERSION)

    def test_release_snapshot_reuse_requires_one_consistent_producer_observation(self):
        directory = self.fixtures()['releases']
        def carried(row):
            return {**row, 'curve_date': '2026-09-08', 'curve_workflow_run_id': '102'}
        self.rehash_response(directory, 0, lambda rows: rows.append(carried(rows[0])))
        self.rehash_result(directory, lambda result: (
            result['selection']['before']['rows'].append(
                carried(result['selection']['before']['rows'][0])),
            result['selection']['before'].update(snapshot_reuses=1)))
        self.assertEqual(check.check_bundle(directory, self.VERSION)['comparable_pairs'], 1)
        self.rehash_response(directory, 0, lambda rows:
                             rows[-1].update(metrics={'median_ttft': 11}))
        self.rehash_result(directory, lambda result: (
            result['selection']['before']['rows'][-1].update(metrics={'median_ttft': 11}),
            result['comparisons'][0]['metric'].update(before=11, delta=4, percent_change=400/11)))
        with self.assertRaisesRegex(ValueError, 'Release observation identity'):
            check.check_bundle(directory, self.VERSION)

    def test_release_matching_normalizes_numbers_without_merging_booleans(self):
        directory = self.fixtures()['releases']
        def configure(rows):
            rows[0]['conc'] = 1.0
            rows[0]['metrics']['prefill_pp'] = 1.0
            rows[1]['metrics']['prefill_pp'] = 1
        self.rehash_response(directory, 0, configure)
        self.rehash_result(directory, lambda result: (
            configure([result['selection'][side]['rows'][0] for side in ('before', 'after')]),
            result['comparisons'][0]['configuration_metrics'].update(prefill_pp=1)))
        self.assertEqual(check.check_bundle(directory, self.VERSION)['comparable_pairs'], 1)
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['normalized_arguments'].update(isl=8192.0, osl=1024.0)
        manifest_path.write_text(json.dumps(manifest))
        self.assertEqual(check.check_bundle(directory, self.VERSION)['comparable_pairs'], 1)
        self.rehash_response(directory, 0, lambda rows: rows[1].update(disagg=0))
        self.rehash_result(directory, lambda result:
                           result['selection']['after']['rows'][0].update(disagg=0))
        with self.assertRaisesRegex(ValueError, 'Release matching'):
            check.check_bundle(directory, self.VERSION)

    def test_collectivex_matched_pairs_require_exact_source_topology(self):
        directory = self.fixtures()['collectivex']
        self.rehash_response(directory, 2, lambda body:
                             body['series'][0]['system'].update(nodes=2))
        with self.assertRaisesRegex(ValueError, 'CollectiveX.*identity'):
            check.check_bundle(directory, self.VERSION)

    def test_collectivex_pair_cannot_use_the_left_run_as_both_sources(self):
        directory = self.fixtures()['collectivex']
        self.rehash_result(directory, lambda result: (
            result['comparisons'][0]['right'][0].update(response_index=1),
            result['comparisons'][0]['metrics'][0].update(
                right={'status': 'value', 'value': 20},
                difference_right_minus_left=0, ratio_right_over_left=1)))
        with self.assertRaisesRegex(ValueError, 'CollectiveX.*run'):
            check.check_bundle(directory, self.VERSION)

    def test_collectivex_kv_pairs_require_exact_source_workload(self):
        config = {'case_id': 'kv-a', 'sku': 'h200_sxm', 'vendor': 'nvidia', 'backend': 'nixl',
                  'fabric': 'rdma', 'workload': 'dsv4', 'precision': 'bf16',
                  'topology': {'ep_size': 2, 'nodes': 2, 'gpus_per_node': 1,
                               'scale_up_domain': 1, 'scale_up_transport': 'NVLink',
                               'scale_out_transport': 'InfiniBand', 'topology_class': 'scale-out'}}
        identity = {'kind': 'paged', 'op': 'pull', 'isl': 1024, 'page_tokens': 16,
                    'batch': 4, 'descs': 64, 'req_bytes': 1024}
        body = {'kv': [{**config, 'disposition': 'runnable', 'outcome': 'success',
                        'rows': [{**identity, 'verify_passed': True, 'gbps_p50': 2}]}]}
        directory = self.bundle(
            'collectivex', [('collectivex-run',
                            f'https://inferencex.semianalysis.com/api/v1/collectivex/runs/{run_id}',
                            {**body, 'run': {'run_id': run_id}}, 200) for run_id in ('1', '2')],
            lambda ids: {'schema_version': 1, 'kind': 'collectivex',
                         'selection': {'run_ids': ['1', '2']},
                         'sources': [{'response_id': item} for item in ids],
                         'summary': {'matched': 1}, 'comparisons': [{
                             'identity': {'suite': 'kv', 'configuration': config, 'row': identity},
                             'status': 'matched',
                             'left': [{'response_index': 0, 'json_pointer': '/kv/0/rows/0'}],
                             'right': [{'response_index': 1, 'json_pointer': '/kv/0/rows/0'}],
                             'metrics': [{'name': 'gbps_p50', 'unit': 'GB/s',
                                          'left': {'status': 'value', 'value': 2},
                                          'right': {'status': 'value', 'value': 2},
                                          'difference_right_minus_left': 0,
                                          'ratio_right_over_left': 1}]}]},
            {'status': 'complete', 'selected_records': 1, 'comparable_pairs': 1,
             'hardware': [], 'reasons': []})
        self.assertEqual(check.check_bundle(directory, self.VERSION)['comparable_pairs'], 1)
        self.rehash_response(directory, 1, lambda value: value['kv'][0]['rows'][0].update(isl=2048))
        with self.assertRaisesRegex(ValueError, 'CollectiveX.*identity'):
            check.check_bundle(directory, self.VERSION)

    def test_partial_agentx_evidence_remains_valid_with_zero_usable_hardware(self):
        origin = 'https://inferencex.semianalysis.com'
        seed = self.fixtures()['agentx']
        seed_manifest = json.loads((seed / 'manifest.json').read_text())
        benchmark = json.loads((seed / seed_manifest['requests'][0]['response']['path']).read_text())[0]
        benchmark['id'] = 8
        responses = [
            ('benchmarks', origin + '/api/v1/benchmarks?model=DeepSeek-V4-Pro',
             [benchmark], 200),
            ('agentic-aggregates', origin + '/api/v1/agentic-aggregates?ids=8', {}, 200),
            ('derived-agentic-metrics', origin + '/api/v1/derived-agentic-metrics?ids=8', {}, 200),
            ('trace-availability', origin + '/api/v1/trace-availability?ids=8', {}, 200),
        ]
        def partial_result(ids):
            metadata = json.loads((seed / 'result.json').read_text())['metadata']
            metadata.update(
                request_urls=[{
                    'operation': operation, 'url': url, 'response_id': response_id,
                    **({} if operation == 'benchmarks' else {'requested_ids': ['8']})}
                    for (operation, url, _body, _status), response_id in zip(responses, ids)],
                source_response_ids=ids,
                enrichment_coverage={
                    'safe_id_rows': 1, 'unsupported_id_rows': 0, 'unique_safe_ids': 1,
                    'aggregates': {
                        name: {'available_rows': 0, 'null_rows': 0,
                               'missing_entry_rows': 1, 'unsupported_id_rows': 0}
                        for name in check.AGENTX_GROUPS},
                    'derived_metrics': {'available_rows': 0, 'missing_entry_rows': 1,
                                        'unsupported_id_rows': 0},
                    'trace_availability': {'stored_trace_rows': 0,
                                           'no_stored_trace_rows': 1,
                                           'response_key_rows': 0,
                                           'missing_key_rows': 1,
                                           'unsupported_id_rows': 0}})
            return {'schema_version': 1, 'kind': 'agentx', 'metadata': metadata,
                    'rows': [{
                        'benchmark': {**benchmark, 'id': '8'},
                        'agentx': {'status': 'partial', 'result_id': '8',
                                   'aggregates': {'status': 'not_returned', 'value': None},
                                   'derived_metrics': {'status': 'not_returned', 'value': None},
                                   'trace_availability': {'status': 'no_stored_trace',
                                                          'value': False,
                                                          'response_key_present': False}}}]}
        directory = self.bundle(
            'agentx', responses, partial_result,
            {'status': 'partial', 'selected_records': 1, 'comparable_pairs': None,
             'hardware': [{'hardware': 'b300', 'valid_records': 0}],
             'reasons': [{'code': 'aggregate_unavailable', 'count': 1}]})
        report = check.check_bundle(directory, self.VERSION)
        self.assertEqual(report['selected_records'], 1)

    def test_rehashed_tco_derivation_tamper_is_rejected(self):
        directory = self.fixtures()['tco']
        self.rehash_result(directory, lambda result:
                           result['rows'][0].update(usd_per_million_output_tokens=2))
        with self.assertRaisesRegex(ValueError, 'TCO arithmetic'):
            check.check_bundle(directory, self.VERSION)

    def test_contract_csv_rows_and_response_references_are_source_derived(self):
        fixtures = self.fixtures()
        power = self.convert_to_csv(fixtures['powerx'], 'powerx')
        agent = self.convert_to_csv(fixtures['agentx'], 'agentx')
        self.assertEqual(check.check_bundle(power, self.VERSION)['eligible_records'], 1)
        self.assertEqual(check.check_bundle(agent, self.VERSION)['eligible_records'], 1)

        forged_reference = self.convert_to_csv(self.fixtures()['powerx'], 'powerx')
        self.mutate_csv(
            forged_reference,
            lambda rows: rows[0].update(source_response_id='f' * 64))
        with self.assertRaisesRegex(ValueError, 'CSV value'):
            check.check_bundle(forged_reference, self.VERSION)

        bogus_value = self.convert_to_csv(self.fixtures()['agentx'], 'agentx')
        self.mutate_csv(bogus_value, lambda rows: rows[0].update(**{'aggregate.isl.mean': '999'}))
        with self.assertRaisesRegex(ValueError, 'CSV value'):
            check.check_bundle(bogus_value, self.VERSION)

        fabricated = self.convert_to_csv(self.fixtures()['powerx'], 'powerx')
        self.mutate_csv(fabricated, lambda rows: rows.append({**rows[0], 'id': '999'}))
        self.forge_coverage(
            fabricated, selected=2,
            hardware=[{'hardware': 'h200_sxm', 'valid_records': 2}])
        with self.assertRaisesRegex(ValueError, 'row count|derivation'):
            check.check_bundle(fabricated, self.VERSION)

    def test_incomplete_bundle_and_wrong_request_scope_are_rejected(self):
        fixtures = self.fixtures()
        (fixtures['result'] / 'manifest.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Manifest'):
            check.check_bundle(fixtures['result'], self.VERSION)
        directory = fixtures['powerx']
        manifest = json.loads((directory / 'manifest.json').read_text())
        changed = 'https://inferencex.semianalysis.com/api/v1/evaluations'
        manifest['requests'][0]['url'] = changed
        manifest['requests'][0]['attempts'][-1]['url'] = changed
        check.save(directory / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'request scope'):
            check.check_bundle(directory, self.VERSION)

    def test_failed_policy_is_valid_evidence_and_maps_to_exit_three(self):
        power = self.fixtures()['powerx']
        manifest = json.loads((power / 'manifest.json').read_text())
        manifest['summary']['policy'] = {
            'status': 'failed',
            'requirements': {'require_hardware': ['mi355x'], 'min_comparable_pairs': None},
            'reasons': [{'code': 'required_hardware_missing', 'hardware': 'mi355x'}],
        }
        check.save(power / 'manifest.json', manifest)
        report = check.check_bundle(power, self.VERSION)
        self.assertEqual((report['policy_status'], report['policy_exit_code']), ('failed', 3))
        manifest['summary']['policy']['status'] = 'passed'
        check.save(power / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'policy decision'):
            check.check_bundle(power, self.VERSION)

    def test_manifest_cannot_forge_eligible_hardware_or_comparable_pairs(self):
        fixtures = self.fixtures()
        self.rehash_response(
            fixtures['powerx'], 0,
            lambda body: body[0]['metrics'].update(avg_power_w=None))
        self.rehash_result(
            fixtures['powerx'],
            lambda result: (
                result['rows'][0]['metrics'].update(avg_power_w=None),
                result['metadata']['metric_coverage']['avg_power_w'].update(
                    available_rows=0, unavailable_rows=1)))
        self.forge_coverage(
            fixtures['powerx'], hardware=[{'hardware': 'h200_sxm', 'valid_records': 1}],
            requirements={'require_hardware': ['h200_sxm'], 'min_comparable_pairs': None})
        self.rehash_response(
            fixtures['agentx'], 1,
            lambda body: body['2']['isl'].update(n=0))
        self.rehash_result(
            fixtures['agentx'],
            lambda result: result['rows'][0]['agentx']['aggregates']['value']['isl'].update(n=0))
        self.forge_coverage(
            fixtures['agentx'], hardware=[{'hardware': 'b300', 'valid_records': 1}],
            requirements={'require_hardware': ['b300'], 'min_comparable_pairs': None})
        self.rehash_response(
            fixtures['tco'], 0,
            lambda body: body['rows'][0].update(boundary='unreachable'))
        self.rehash_result(fixtures['tco'], lambda result: result['rows'][0].update(
            status='unreachable', usd_per_million_output_tokens=None,
            point={**result['rows'][0]['point'], 'boundary': 'unreachable'}))
        self.rehash_result(fixtures['tco'], lambda result: result['coverage'].update(
            status='incomplete', available_points=0,
            status_counts={'available': 0, 'missing_point': 0, 'clamped_low': 0,
                           'unreachable': 1, 'zero_throughput': 0}))
        self.forge_coverage(
            fixtures['tco'], hardware=[{'hardware': 'b200', 'valid_records': 1}],
            requirements={'require_hardware': ['b200'], 'min_comparable_pairs': None})
        self.rehash_result(fixtures['releases'], lambda result: result.update(comparisons=[]))
        self.forge_coverage(
            fixtures['releases'], pairs=1,
            requirements={'require_hardware': [], 'min_comparable_pairs': 1})
        self.rehash_result(
            fixtures['collectivex'],
            lambda result: result['comparisons'][0].update(metrics=[]))
        self.forge_coverage(
            fixtures['collectivex'], pairs=1,
            requirements={'require_hardware': [], 'min_comparable_pairs': 1})
        for kind in ['powerx', 'agentx', 'tco', 'releases', 'collectivex']:
            with self.subTest(kind=kind), self.assertRaisesRegex(
                    ValueError, 'coverage|validity|comparable|point|policy|matching'):
                check.check_bundle(fixtures[kind], self.VERSION)

    def test_result_source_fields_and_release_claims_cannot_be_rehashed(self):
        fixtures = self.fixtures()
        self.rehash_result(
            fixtures['result'],
            lambda result: result['selected_result'].update(hardware='forged-gpu'))
        with self.assertRaisesRegex(ValueError, 'Provenance'):
            check.check_bundle(fixtures['result'], self.VERSION)
        producer = self.fixtures()['result']
        self.rehash_result(
            producer,
            lambda result: result['producer'].update(
                status='confirmed', github_run_id='123', run_attempt='1'))
        with self.assertRaisesRegex(ValueError, 'producer meaning'):
            check.check_bundle(producer, self.VERSION)
        self.rehash_result(
            fixtures['releases'],
            lambda result: result['metadata'].update(statistical_verdict='regression'))
        with self.assertRaisesRegex(ValueError, 'statistical'):
            check.check_bundle(fixtures['releases'], self.VERSION)

    def test_valid_partial_domain_evidence_keeps_zero_eligibility(self):
        fixtures = self.fixtures()
        self.rehash_response(fixtures['tco'], 0, lambda body: body.update(rows=[]))
        self.rehash_result(fixtures['tco'], lambda result: (
            result['rows'][0].update(
                status='missing_point', point=None, usd_per_million_output_tokens=None),
            result['coverage'].update(
                status='incomplete', returned_points=0, available_points=0,
                status_counts={'available': 0, 'missing_point': 1, 'clamped_low': 0,
                               'unreachable': 0, 'zero_throughput': 0},
                returned_hardware=[])))
        self.forge_coverage(
            fixtures['tco'], status='partial',
            hardware=[{'hardware': 'b200', 'valid_records': 0}],
            reasons=[{'code': 'missing_point', 'count': 1}])
        self.rehash_response(
            fixtures['releases'], 0,
            lambda body: body[1]['metrics'].update(median_ttft=None))
        self.rehash_result(
            fixtures['releases'],
            lambda result: (
                result['comparisons'][0]['metric'].update(
                    after=None, delta=None, percent_change=None, status='missing_after'),
                result['selection']['after']['rows'][0]['metrics'].update(median_ttft=None)))
        self.forge_coverage(fixtures['releases'], pairs=0,
                            hardware=[{'hardware': 'h200_sxm', 'valid_records': 0}])
        self.rehash_result(
            fixtures['collectivex'],
            lambda result: result['comparisons'][0].update(
                status='incomparable', issues=['topology_mismatch'], metrics=[]))
        self.rehash_result(
            fixtures['collectivex'],
            lambda result: result.update(summary={
                'matched': 0, 'only_left': 0, 'only_right': 0,
                'ambiguous': 0, 'incomparable': 1}))
        self.forge_coverage(fixtures['collectivex'], pairs=0)
        for kind in ['tco', 'releases', 'collectivex']:
            report = check.check_bundle(fixtures[kind], self.VERSION)
            self.assertEqual(report['eligible_records'], 0)

    def test_result_missing_log_is_valid_partial_evidence(self):
        seed = self.fixtures()['result']
        seed_manifest = json.loads((seed / 'manifest.json').read_text())
        benchmark_body = json.loads(
            (seed / seed_manifest['requests'][0]['response']['path']).read_text())
        origin = 'https://inferencex.semianalysis.com'
        directory = self.bundle(
            'result', [
                ('benchmarks', origin + '/api/v1/benchmarks?model=GLM-5', benchmark_body, 200),
                ('workflow-info', origin + '/api/v1/workflow-info?date=2026-09-07',
                 {'runs': [], 'changelogs': [], 'configs': [], 'runConfigs': []}, 200),
                ('server-log', origin + '/api/v1/server-log?id=3', {'error': 'not found'}, 404),
            ],
            lambda ids: {
                'schema_version': 1, 'kind': 'result',
                'metadata': {'package_version': self.VERSION, 'selected_result_id': '3',
                             'ran_new_benchmark': False},
                'selected_result': {**benchmark_body[0], 'id': '3'},
                'producer': {'status': 'unresolved', 'github_run_id': None, 'run_attempt': None,
                             'workflow_run': None, 'run_configs': []},
                'evidence': [{'response_id': item} for item in ids],
                'log': {'status': 'not_found', 'text': None, 'source_response_id': ids[-1]},
            },
            {'status': 'partial', 'selected_records': 1, 'comparable_pairs': None,
             'hardware': [{'hardware': 'h200_sxm', 'valid_records': 1}],
             'reasons': [{'code': 'log_unavailable', 'count': 1}]})
        report = check.check_bundle(directory, self.VERSION)
        self.assertEqual(report['eligible_records'], 1)

    def test_contract_one_candidate_runs_six_bundles_offline_and_an_exit_three_policy(self):
        installed = self.root / 'installed'
        (installed / 'scripts').mkdir(parents=True)
        (installed / 'scripts/inferencex.mjs').write_text('// fixture')
        project = self.root / 'project'
        project.mkdir()
        args = SimpleNamespace(model='GLM-5', date='2026-09-07', isl=8192, osl=1024,
                               raw_model='glm5', agentx_model='DeepSeek-V4-Pro',
                               empty_isl=7, empty_osl=13)
        calls = []

        def execute(command, _project, _environment, label, _deadline=None):
            calls.append(([str(part) for part in command], label))
            if label == 'contract-one-discovery':
                return json.dumps({
                    'schema_version': 1, 'kind': 'configs',
                    'scope': {'requested_model': 'GLM-5'},
                    'coverage': {'available_items': 1},
                    'sources': [{'response_id': 'a' * 64}],
                    'items': [{'result_id': '41', 'raw_model': 'glm5', 'hardware': 'h200_sxm',
                               'workload': {'benchmark_type': 'single_turn',
                                            'input_tokens': 8192, 'output_tokens': 1024},
                               'power': {'strict_v2': 'eligible'}}],
                })
            if label == 'contract-one-policy-exit-3':
                output = json.dumps({'validity': 'valid', 'policy': {'status': 'failed'}})
                raise subprocess.CalledProcessError(3, command, output=output, stderr='')
            return '{}\n'

        def audit(directory, version):
            self.assertEqual(version, self.VERSION)
            name = Path(directory).name
            return {'kind': 'powerx' if name == 'powerx-empty' else name,
                    'status': 'passed', 'selected_records': 0 if name == 'powerx-empty' else 1,
                    'eligible_records': 0 if name == 'powerx-empty' else 1,
                    'comparable_pairs': 1 if name in {'releases', 'collectivex'} else None,
                    'response_ids': ['a' * 64], 'policy_status': 'not_requested',
                    'policy_exit_code': 0}

        with patch.object(check, 'run', side_effect=execute), \
                patch.object(check, 'check_bundle', side_effect=audit) as audits:
            report = check.run_contract_one_workflows(
                '/runtime/node', installed, project, {}, args, self.VERSION, None)
        self.assertEqual(report['status'], 'passed')
        self.assertEqual(report['policy_exit_code'], 3)
        self.assertEqual(report['discovery']['result_id'], '41')
        self.assertEqual(audits.call_count, 7)
        commands = [command for command, _label in calls]
        self.assertEqual(sum('--output-dir' in command for command in commands), 7)
        self.assertEqual(sum('verify' in command for command in commands), 8)
        self.assertTrue(all('--import' in command for command in commands if 'verify' in command))
        collective_command = next(command for command, label in calls
                                  if label == 'contract-one-collectivex')
        self.assertEqual(
            collective_command[collective_command.index('--left') + 1],
            check.COLLECTIVEX_POSITIVE_RUN_IDS[0])
        self.assertEqual(
            collective_command[collective_command.index('--right') + 1],
            check.COLLECTIVEX_POSITIVE_RUN_IDS[1])
        pinned = json.loads((project / 'contract-one-scope.json').read_text())
        self.assertEqual(pinned['raw_model'], 'glm5')
        empty_command = next(command for command, label in calls
                             if label == 'contract-one-powerx-empty')
        self.assertIn('--date', empty_command)
        self.assertEqual(empty_command[empty_command.index('--date') + 1], '2026-09-07')
        self.assertIn('--raw-model', empty_command)
        self.assertEqual(empty_command[empty_command.index('--raw-model') + 1], 'glm5')

    def test_contract_one_collectivex_positive_gate_rejects_zero_comparable_pairs(self):
        installed = self.root / 'installed'
        (installed / 'scripts').mkdir(parents=True)
        (installed / 'scripts/inferencex.mjs').write_text('// fixture')
        project = self.root / 'project'
        project.mkdir()
        args = SimpleNamespace(model='GLM-5', date=None, isl=8192, osl=1024,
                               raw_model=None, agentx_model='DeepSeek-V4-Pro',
                               empty_isl=7, empty_osl=13)

        def execute(command, _project, _environment, label, _deadline=None):
            if label == 'contract-one-discovery':
                return json.dumps({
                    'schema_version': 1, 'kind': 'configs',
                    'scope': {'requested_model': 'GLM-5'},
                    'coverage': {'available_items': 1},
                    'items': [{'result_id': '41', 'raw_model': 'glm5',
                               'hardware': 'h200_sxm',
                               'workload': {'benchmark_type': 'single_turn',
                                            'input_tokens': 8192, 'output_tokens': 1024},
                               'power': {'strict_v2': 'eligible'}}],
                })
            return '{}\n'

        def audit(directory, _version):
            kind = Path(directory).name
            return {'eligible_records': 1,
                    'comparable_pairs': 0 if kind == 'collectivex' else 1}

        with patch.object(check, 'run', side_effect=execute), \
                patch.object(check, 'check_bundle', side_effect=audit), \
                self.assertRaisesRegex(ValueError, 'collectivex positive bundle'):
            check.run_contract_one_workflows(
                '/runtime/node', installed, project, {}, args, self.VERSION, None)


if __name__ == '__main__':
    unittest.main()
