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
                    check.run([sys.executable, '-c', script], self.root, {}, 'descendants', deadline=0.2)
            finally:
                for process in processes:
                    try:
                        process.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        check.os.killpg(process.pid, check.signal.SIGKILL)
                        process.wait(timeout=1)
        self.assertLess(time.perf_counter() - started, 2)
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
        body = stream.getvalue()
        record = {'name': check.PACKAGE, 'version': VERSION, 'filename': 'candidate.tgz',
                  'sha256': hashlib.sha256(body).hexdigest(),
                  'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(body).digest()).decode()}
        (self.root / 'candidate.tgz').write_bytes(body)
        check.save(self.root / 'release.json', record)
        command = ['verify-release.py', 'public', str(self.root / 'release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example',
                   '--agentx-point-id', '7', '--agentx-no-trace-id', '8',
                   '--evidence', str(self.root / 'evidence')]
        metadata = {'name': check.PACKAGE, 'version': VERSION, 'dist': {'integrity': 'wrong'}}
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

    def test_csv_request_metadata_must_match_its_own_capture(self):
        url = check.API + '?model=Example&powerValid=strictV2'
        args = SimpleNamespace(model='Example', date=None, isl=8192, osl=1024, raw_model=None, strict_url=url)
        row = {'id': '9007199254740993', 'model': 'example', 'benchmark_type': 'single_turn',
               'isl': 8192, 'osl': 1024, 'metrics': {'power_valid': 1, 'power_metric_schema_version': 2, 'avg_power_w': 0}}
        metadata = {'package_version': VERSION, 'query_url': url, 'requested_model': 'Example', 'requested_date': None,
                    'date_selection': 'latest', 'raw_model': None, 'benchmark_type': 'single_turn', 'isl': 8192, 'osl': 1024,
                    'retrieved_at': '2026-09-05T00:00:00Z', 'returned_rows': 1, 'selected_rows': 1,
                    'returned_models': ['example'], 'selected_models': ['example'],
                    'excluded_rows': {'outside_requested_scope': 0, 'not_strict_v2': 0}, 'metric_coverage': {}}
        for key in check.METRIC_COLUMNS - {'power_valid', 'power_metric_schema_version'}:
            present = int(key == 'avg_power_w')
            metadata['metric_coverage'][key] = {'available_rows': present, 'unavailable_rows': 1 - present}
        evidence = self.root / 'powerx-csv-evidence'
        evidence.mkdir()
        body = json.dumps([row]).encode()
        (evidence / 'response.json').write_bytes(body)
        manifest = {'schema_version': 1, 'status': 'complete', 'package_version': VERSION,
                    'request': {'url': url, 'method': 'GET', 'filters': {'model': 'Example', 'date': None,
                                'powerValid': 'strictV2', 'benchmark_type': 'single_turn', 'isl': 8192, 'osl': 1024, 'raw_model': None}},
                    'response': {'status': 200, 'body_file': 'response.json', 'checksum_covers': 'saved decoded response body',
                                 'sha256': hashlib.sha256(body).hexdigest(), 'retrieved_at': metadata['retrieved_at']},
                    'export': {'format': 'csv', 'destination': str(self.root / 'powerx.csv'), 'metadata': metadata}}
        csv_row = {field: metadata.get(field) if field in check.REQUEST_COLUMNS else
                   row['metrics'].get(field) if field in check.METRIC_COLUMNS else row.get(field) for field in check.CSV_COLUMNS}

        def write():
            with (self.root / 'powerx.csv').open('w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=check.CSV_COLUMNS)
                writer.writeheader()
                writer.writerow(csv_row)
            manifest['export']['sha256'] = hashlib.sha256((self.root / 'powerx.csv').read_bytes()).hexdigest()
            check.save(evidence / 'manifest.json', manifest)

        write()
        self.assertEqual(check.captured_export(self.root, evidence.name, 'powerx.csv', args, VERSION), [row])
        csv_row['retrieved_at'] = '2026-09-06T00:00:00Z'
        write()
        with self.assertRaisesRegex(ValueError, 'CSV extraction metadata.*retrieved_at'):
            check.captured_export(self.root, evidence.name, 'powerx.csv', args, VERSION)

    def test_lookup_evidence_must_match_openapi_and_saved_output(self):
        responses = self.root / 'raw-responses'
        responses.mkdir()
        schema = {'paths': {'/api/v1/benchmarks': {'get': {'parameters': [
            {'name': 'model', 'in': 'query', 'schema': {'enum': ['Example']}}]}}}}
        openapi_body = json.dumps(schema).encode()

        def write_openapi(body, **changes):
            (responses / 'lookup-openapi.response.json').write_bytes(body)
            context = {'query_url': check.OPENAPI, 'status': 200,
                       'retrieved_at': '2026-09-05T00:00:00Z',
                       'sha256': hashlib.sha256(body).hexdigest()}
            context.update(changes)
            check.save(responses / 'lookup-openapi.request.json', context)

        write_openapi(openapi_body)
        check.check_lookup_openapi(
            check.captured_request(self.root, 'lookup-openapi', check.OPENAPI), 'Example')
        write_openapi(openapi_body, unexpected=True)
        with self.assertRaisesRegex(ValueError, 'Original request evidence'):
            check.captured_request(self.root, 'lookup-openapi', check.OPENAPI)

        altered = json.loads(json.dumps(schema))
        altered['paths']['/api/v1/benchmarks']['get']['parameters'][0]['schema']['enum'] = ['Other']
        altered_body = json.dumps(altered).encode()
        write_openapi(altered_body)
        with self.assertRaisesRegex(ValueError, 'OpenAPI model contract'):
            check.check_lookup_openapi(
                check.captured_request(self.root, 'lookup-openapi', check.OPENAPI), 'Example')
        altered['paths']['/api/v1/benchmarks']['get']['parameters'][0] |= {
            'in': 'header', 'schema': {'enum': ['Example']}}
        write_openapi(json.dumps(altered).encode())
        with self.assertRaisesRegex(ValueError, 'OpenAPI model contract'):
            check.check_lookup_openapi(
                check.captured_request(self.root, 'lookup-openapi', check.OPENAPI), 'Example')

        body = b'[]'
        (responses / 'lookup.response.json').write_bytes(body)
        context = {'query_url': check.API + '?model=Example', 'status': 200,
                   'retrieved_at': '2026-09-05T00:00:00Z', 'sha256': hashlib.sha256(body).hexdigest()}
        check.save(responses / 'lookup.request.json', context)
        self.assertEqual(check.captured_request(self.root, 'lookup', context['query_url'], context), [])
        with self.assertRaisesRegex(ValueError, 'original request context'):
            check.captured_request(self.root, 'lookup', context['query_url'], context | {'retrieved_at': '2026-09-06T00:00:00Z'})


class AgentXVerifierTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.fixture_index = 0
        self.args = SimpleNamespace(agentx_model='Example', agentx_point_id='7', agentx_no_trace_id='8',
                                    model='Example', date=None, isl=8192, osl=1024, raw_model=None,
                                    empty_isl=7, empty_osl=13)

    @staticmethod
    def row():
        return {
            'id': '7', 'model': 'model-a', 'hardware': 'h200', 'framework': 'vllm', 'image': None,
            'precision': 'fp8', 'spec_method': 'none', 'benchmark_type': 'agentic_traces', 'conc': 1,
            'offload_mode': 'off', 'recipe_fingerprint': None, 'disagg': False, 'is_multinode': False,
            'prefill_tp': 1, 'prefill_ep': 1, 'prefill_dp_attention': False, 'prefill_num_workers': 1,
            'decode_tp': 1, 'decode_ep': 1, 'decode_dp_attention': False, 'decode_num_workers': 1,
            'num_prefill_gpu': 1, 'num_decode_gpu': 1, 'isl': 32, 'osl': 16, 'date': '2026-09-05',
            'workflow_run_id': 'run-1', 'run_started_at': '2026-09-05T00:00:00Z', 'run_url': None,
            'curve_date': None, 'curve_workflow_run_id': None, 'curve_run_started_at': None,
            'metrics': {'z': 0, 'a': False, 'nullish': None, 'object': {'kept': True}, 'é': 1}}

    @staticmethod
    def scope(excluded):
        raw_model = check.AGENTX_EXCLUDED_RAW_MODEL if excluded else None
        requested = {
            'display_model': 'Example', 'date': None, 'date_selection': 'latest', 'raw_model': raw_model,
            'hardware': None, 'framework': None, 'precision': None, 'spec_method': None,
            'offload_mode': None, 'concurrency': None, 'benchmark_type': 'agentic_traces'}
        applied = {
            'display_model': {'status': 'applied', 'value': 'Example'},
            'date': {'status': 'omitted', 'value': None},
            'benchmark_type': {'status': 'applied', 'value': 'agentic_traces'},
            'raw_model': {'status': 'applied' if excluded else 'omitted', 'value': raw_model},
            'hardware': {'status': 'omitted', 'value': None},
            'framework': {'status': 'omitted', 'value': None},
            'precision': {'status': 'omitted', 'value': None},
            'spec_method': {'status': 'omitted', 'value': None},
            'offload_mode': {'status': 'omitted', 'value': None},
            'concurrency': {'status': 'omitted', 'value': None}}
        return requested, applied

    @staticmethod
    def coverage(selected):
        count = int(selected)
        return {
            'safe_id_rows': count, 'unsupported_id_rows': 0, 'unique_safe_ids': count,
            'aggregates': {group: {'available_rows': 0, 'null_rows': count, 'missing_entry_rows': 0,
                                   'unsupported_id_rows': 0} for group in check.AGENTX_GROUPS},
            'derived_metrics': {'available_rows': count, 'missing_entry_rows': 0, 'unsupported_id_rows': 0},
            'trace_availability': {'stored_trace_rows': 0, 'no_stored_trace_rows': count,
                                   'response_key_rows': count, 'missing_key_rows': 0,
                                   'unsupported_id_rows': 0}}

    def write_summary(self, output_format, *, excluded=False):
        self.fixture_index += 1
        row = self.row()
        requested, applied = self.scope(excluded)
        selected = [] if excluded else [row]
        benchmark_url = check.API + '?model=Example'
        responses = [('benchmarks', benchmark_url, None, [row])]
        if selected:
            query = '?ids=7'
            responses += [
                ('agentic-aggregates', check.AGENTX_ORIGIN + '/api/v1/agentic-aggregates' + query, [7],
                 {'7': {'id': 7, **dict.fromkeys(check.AGENTX_GROUPS)}}),
                ('derived-agentic-metrics', check.AGENTX_ORIGIN + '/api/v1/derived-agentic-metrics' + query, [7],
                 {'7': {'id': 7, 'p75_e2e_norm_intvty': 0, 'p90_e2e_norm_intvty': None}}),
                ('trace-availability', check.AGENTX_ORIGIN + '/api/v1/trace-availability' + query, [7],
                 {'7': False})]
        suffix = f'{"excluded" if excluded else output_format}-{self.fixture_index}'
        evidence = self.root / f'agentx-{suffix}-evidence'
        evidence.mkdir()
        records = []
        for number, (operation, url, chunk, body) in enumerate(responses, 1):
            body_bytes = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
            filename = f'response-{number:04d}-{operation}.json'
            (evidence / filename).write_bytes(body_bytes)
            records.append({'operation': operation, 'request_number': number, 'url': url, 'method': 'GET',
                            'retrieved_at': f'2026-09-05T00:00:0{number}Z', 'http_status': 200,
                            'decoded_body_sha256': hashlib.sha256(body_bytes).hexdigest(), 'body_file': filename,
                            'requested_chunk_ids': chunk,
                            'checksum_covers': 'saved decoded response body'})
        outcome = 'no_matching_rows' if excluded else 'selected_rows'
        counts = {'returned_rows': 1, 'returned_agentx_rows': 1, 'selected_rows': len(selected)}
        filters = {name: applied[name] for name, _field in check.AGENTX_FILTERS}
        enriched = [] if excluded else [{
            'benchmark': row,
            'agentx': {
                'status': 'complete', 'result_id': 7,
                'aggregates': {'status': 'available', 'value': {'id': 7, **dict.fromkeys(check.AGENTX_GROUPS)}},
                'derived_metrics': {'status': 'available', 'value': {
                    'id': 7, 'p75_e2e_norm_intvty': 0, 'p90_e2e_norm_intvty': None}},
                'trace_availability': {'status': 'no_stored_trace', 'value': False,
                                       'response_key_present': True}}}]
        metadata = {
            'package_version': VERSION, 'retrieved_at': '2026-09-05T00:00:05Z',
            'request_urls': [{'operation': item['operation'], 'url': item['url']} for item in records],
            'requested_scope': requested, 'filters': filters, 'outcome': outcome, **counts,
            'available_filter_values': {'raw_model': ['model-a'], 'hardware': ['h200'],
                                        'framework': ['vllm'], 'precision': ['fp8'],
                                        'spec_method': ['none'], 'offload_mode': ['off'], 'concurrency': [1]},
            'returned_model_keys': ['model-a'], 'selected_model_keys': [] if excluded else ['model-a'],
            'enrichment_coverage': self.coverage(not excluded), 'non_finite_values': 0,
            'observation_context': 'Existing observations were read; no new benchmark was run.'}
        output = self.root / f'agentx-{suffix}.{output_format}'
        if output_format == 'json':
            output.write_text(json.dumps({'schema_version': 1, 'metadata': metadata, 'rows': enriched},
                                         ensure_ascii=False, indent=2) + '\n')
        else:
            metric_columns = ['metrics.a', 'metrics.nullish', 'metrics.z', 'metrics.é']
            columns = [*check.AGENTX_CONTEXT_COLUMNS, *check.AGENTX_BENCHMARK_COLUMNS, *metric_columns,
                       *check.AGENTX_ENRICHMENT_COLUMNS]
            context = {'package_version': VERSION, 'query_url': benchmark_url,
                       'retrieved_at': metadata['retrieved_at'], 'requested_model': 'Example',
                       'requested_date': None, 'date_selection': 'latest',
                       'requested_benchmark_type': 'agentic_traces',
                       **{f'filter.{name}': requested[name] for name, _field in check.AGENTX_FILTERS}}
            values = {**context, **{field: row.get(field) for field in check.AGENTX_BENCHMARK_COLUMNS},
                      'metrics.a': False, 'metrics.nullish': None, 'metrics.z': 0, 'metrics.é': 1,
                      **{f'aggregate.{group}.{field}': None for group in check.AGENTX_GROUPS
                         for field in (*check.AGENTX_PERCENTILES, 'n')},
                      'derived.p75_e2e_norm_intvty': 0, 'derived.p90_e2e_norm_intvty': None,
                      'trace.available': False, 'trace.response_key_present': True,
                      'enrichment.status': 'complete', 'enrichment.aggregates_status': 'available',
                      'enrichment.derived_metrics_status': 'available',
                      'enrichment.trace_availability_status': 'no_stored_trace'}
            with output.open('w', newline='') as handle:
                writer = csv.writer(handle, lineterminator='\r\n')
                writer.writerow(columns)
                writer.writerow(['' if values.get(column) is None else
                                 str(values[column]).lower() if type(values.get(column)) is bool else
                                 values[column] for column in columns])
        manifest = {
            'schema_version': 1, 'package_version': VERSION, 'status': 'complete',
            'started_at': '2026-09-05T00:00:00Z', 'finished_at': '2026-09-05T00:00:06Z',
            'outcome': outcome, 'requested_filters': requested, 'applied_filters': applied, 'counts': counts,
            'responses': records,
            'export': {'format': output_format, 'destination': str(output.resolve()),
                       'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'metadata': metadata,
                       'source_request_numbers': list(range(1, len(records) + 1))},
            'error': None}
        check.save(evidence / 'manifest.json', manifest)
        return evidence, output, manifest

    def write_multichunk_summary(self):
        self.fixture_index += 1
        rows = []
        for result_id in range(1, 502):
            row = self.row() | {'id': str(result_id)}
            rows.append(row)
        requested, applied = self.scope(False)
        benchmark_url = check.API + '?model=Example'
        responses = [('benchmarks', benchmark_url, None, rows)]
        for operation, limit in [('agentic-aggregates', 200), ('derived-agentic-metrics', 200),
                                 ('trace-availability', 500)]:
            for offset in range(0, len(rows), limit):
                chunk = list(range(offset + 1, min(offset + limit, len(rows)) + 1))
                if operation == 'agentic-aggregates':
                    body = {str(result_id): {'id': result_id, **dict.fromkeys(check.AGENTX_GROUPS)}
                            for result_id in chunk if result_id != 2}
                elif operation == 'derived-agentic-metrics':
                    body = {str(result_id): {'id': result_id, 'p75_e2e_norm_intvty': 0,
                                             'p90_e2e_norm_intvty': None}
                            for result_id in chunk if result_id != 3}
                else:
                    body = {str(result_id): result_id == 1 for result_id in chunk if result_id != 4}
                responses.append((operation, check.AGENTX_ORIGIN + f'/api/v1/{operation}?' +
                                  check.urlencode({'ids': ','.join(map(str, chunk))}), chunk, body))
        evidence = self.root / f'agentx-multichunk-{self.fixture_index}-evidence'
        evidence.mkdir()
        records = []
        for number, (operation, url, chunk, body) in enumerate(responses, 1):
            body_bytes = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
            filename = f'response-{number:04d}-{operation}.json'
            (evidence / filename).write_bytes(body_bytes)
            records.append({'operation': operation, 'request_number': number, 'url': url, 'method': 'GET',
                            'retrieved_at': f'2026-09-05T00:00:{number:02d}Z', 'http_status': 200,
                            'decoded_body_sha256': hashlib.sha256(body_bytes).hexdigest(), 'body_file': filename,
                            'requested_chunk_ids': chunk,
                            'checksum_covers': 'saved decoded response body'})
        enriched = []
        for result_id, row in enumerate(rows, 1):
            aggregates = None if result_id == 2 else {'id': result_id, **dict.fromkeys(check.AGENTX_GROUPS)}
            derived = None if result_id == 3 else {
                'id': result_id, 'p75_e2e_norm_intvty': 0, 'p90_e2e_norm_intvty': None}
            trace_key = result_id != 4
            trace = result_id == 1
            enriched.append({'benchmark': row, 'agentx': {
                'status': 'complete' if aggregates is not None and derived is not None else 'partial',
                'result_id': result_id,
                'aggregates': {'status': 'available' if aggregates is not None else 'not_returned',
                               'value': aggregates},
                'derived_metrics': {'status': 'available' if derived is not None else 'not_returned',
                                    'value': derived},
                'trace_availability': {'status': 'stored_trace' if trace else 'no_stored_trace',
                                       'value': trace, 'response_key_present': trace_key}}})
        counts = {'returned_rows': 501, 'returned_agentx_rows': 501, 'selected_rows': 501}
        filters = {name: applied[name] for name, _field in check.AGENTX_FILTERS}
        coverage = {
            'safe_id_rows': 501, 'unsupported_id_rows': 0, 'unique_safe_ids': 501,
            'aggregates': {group: {'available_rows': 0, 'null_rows': 500, 'missing_entry_rows': 1,
                                   'unsupported_id_rows': 0} for group in check.AGENTX_GROUPS},
            'derived_metrics': {'available_rows': 500, 'missing_entry_rows': 1, 'unsupported_id_rows': 0},
            'trace_availability': {'stored_trace_rows': 1, 'no_stored_trace_rows': 500,
                                   'response_key_rows': 500, 'missing_key_rows': 1,
                                   'unsupported_id_rows': 0}}
        metadata = {
            'package_version': VERSION, 'retrieved_at': '2026-09-05T00:00:10Z',
            'request_urls': [{'operation': record['operation'], 'url': record['url']} for record in records],
            'requested_scope': requested, 'filters': filters, 'outcome': 'selected_rows', **counts,
            'available_filter_values': {'raw_model': ['model-a'], 'hardware': ['h200'],
                                        'framework': ['vllm'], 'precision': ['fp8'],
                                        'spec_method': ['none'], 'offload_mode': ['off'], 'concurrency': [1]},
            'returned_model_keys': ['model-a'], 'selected_model_keys': ['model-a'],
            'enrichment_coverage': coverage, 'non_finite_values': 0,
            'observation_context': 'Existing observations were read; no new benchmark was run.'}
        output = self.root / f'agentx-multichunk-{self.fixture_index}.json'
        check.save(output, {'schema_version': 1, 'metadata': metadata, 'rows': enriched})
        manifest = {
            'schema_version': 1, 'package_version': VERSION, 'status': 'complete',
            'started_at': '2026-09-05T00:00:00Z', 'finished_at': '2026-09-05T00:00:11Z',
            'outcome': 'selected_rows', 'requested_filters': requested, 'applied_filters': applied,
            'counts': counts, 'responses': records,
            'export': {'format': 'json', 'destination': str(output.resolve()),
                       'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'metadata': metadata,
                       'source_request_numbers': list(range(1, len(records) + 1))},
            'error': None}
        check.save(evidence / 'manifest.json', manifest)
        return evidence, output, manifest

    @staticmethod
    def point_openapi():
        return {'paths': {path: {'get': {'parameters': [
            {'name': parameter, 'in': 'query', 'required': True}]}}
            for _operation, path, parameter in check.POINT_OPERATIONS[1:]}}

    def write_point(self, *, trace):
        self.fixture_index += 1
        selected_id = '7'
        siblings = {'sku': {'model': 'model-a'}, 'siblings': [{'id': selected_id, 'model': 'model-a'}]}
        availability = {selected_id: True} if trace else {}
        bodies = [self.point_openapi(), siblings, availability]
        if trace:
            timeline = {'version': 1, 'startNs': 0, 'endNs': 1, 'durationS': 1, 'requests': []}
            histograms = {selected_id: {'id': 7, 'isl': [1], 'osl': [2]}}
            server = {'meta': {'id': 7}, 'startNs': 0, 'endNs': 1, 'durationS': 1,
                      'timeslicesCount': 0, 'kvCacheUsage': [], 'prefixCacheHitRate': [], 'queueDepth': [],
                      'prefillTps': [], 'decodeTps': [], 'prefixCacheHitsTps': [], 'hostKvCacheUsage': [],
                      'kvCacheUsageByEngine': [], 'promptTokensBySource': {}, 'kvCachePoolTokens': None,
                      'metricSources': []}
            bodies += [timeline, histograms, server]
        specs = check.POINT_OPERATIONS if trace else check.POINT_OPERATIONS[:3]
        name = f'{"trace" if trace else "no-trace"}-{self.fixture_index}'
        evidence = self.root / f'{name}-evidence'
        evidence.mkdir()
        records = []
        for number, ((operation, path, parameter), body) in enumerate(zip(specs, bodies), 1):
            body_bytes = json.dumps(body, separators=(',', ':')).encode()
            filename = f'response-{number:04d}-{operation}.json'
            (evidence / filename).write_bytes(body_bytes)
            records.append({'operation': operation, 'request_number': number,
                            'url': check.point_url(path, parameter, selected_id), 'method': 'GET',
                            'retrieved_at': f'2026-09-05T00:00:{number * 2 - 1:02d}Z', 'http_status': 200,
                            'decoded_body_sha256': hashlib.sha256(body_bytes).hexdigest(), 'body_file': filename,
                            'checksum_covers': 'saved decoded response body'})
        output = self.root / f'{name}.json'
        requests = [{'query_url': record['url'], 'retrieved_at': f'2026-09-05T00:00:{index * 2:02d}Z'}
                    for index, record in enumerate(records, 1)]
        document = {
            'schema_version': 1,
            'metadata': {'selected_result_id': selected_id, 'retrieved_at': '2026-09-05T00:00:20Z',
                         'requests': requests, 'ran_new_benchmark': False,
                         'event_timestamp_unit': 'nanoseconds',
                         'event_timestamp_origin': 'offset from timeline.startNs; not wall-clock'},
            'benchmark_siblings': siblings, 'selected_point': siblings['siblings'][0],
            'trace_availability': {'response': availability, 'key_present': trace, 'available': trace},
            'outcome': 'trace_diagnostics' if trace else 'trace_unavailable',
            'timeline': bodies[3] if trace else None, 'histograms': bodies[4] if trace else None,
            'server_metrics': bodies[5] if trace else None}
        output.write_text(json.dumps(document, indent=2) + '\n')
        manifest = {
            'schema_version': 1, 'package_version': VERSION, 'selected_result_id': selected_id,
            'status': 'complete', 'started_at': '2026-09-05T00:00:00Z',
            'finished_at': '2026-09-05T00:00:21Z', 'responses': records,
            'output': {'format': 'json', 'destination': str(output.resolve()),
                       'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                       'source_request_numbers': list(range(1, len(records) + 1))}, 'error': None}
        check.save(evidence / 'manifest.json', manifest)
        return evidence, output, manifest, document

    def test_summary_oracle_accepts_json_csv_and_excluded_selection(self):
        for output_format, excluded in [('json', False), ('csv', False), ('json', True)]:
            with self.subTest(output_format=output_format, excluded=excluded):
                evidence, output, _manifest = self.write_summary(output_format, excluded=excluded)
                result = check.check_agentx_capture(self.root, evidence.name, output.name, self.args,
                                                    VERSION, excluded=excluded)
                self.assertEqual(result['outcome'], 'no_matching_rows' if excluded else 'selected_rows')
        self.assertIsNone(check.safe_result_id(True))
        self.assertIsNone(check.safe_result_id('07'))
        self.assertIsNone(check.safe_result_id(str(check.MAX_SAFE_INTEGER + 1)))
        self.assertEqual(check.js_sorted(['\ue000', '😀']), ['😀', '\ue000'])

    def test_summary_oracle_rejects_altered_values_ids_chunks_and_incomplete_evidence(self):
        evidence, output, manifest = self.write_summary('json')
        document = json.loads(output.read_text())
        document['rows'][0]['benchmark']['metrics']['z'] = False
        check.save(output, document)
        manifest['export']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'AgentX JSON'):
            check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)

        evidence, output, manifest = self.write_summary('csv')
        with output.open(newline='') as handle:
            rows = list(csv.reader(handle))
        column = rows[0].index('derived.p75_e2e_norm_intvty')
        rows[1][column] = '1'
        with output.open('w', newline='') as handle:
            csv.writer(handle, lineterminator='\r\n').writerows(rows)
        manifest['export']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'AgentX CSV value'):
            check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)

        evidence, output, manifest = self.write_summary('csv')
        with output.open(newline='') as handle:
            rows = list(csv.reader(handle))
        rows[1].append('surplus')
        with output.open('w', newline='') as handle:
            csv.writer(handle, lineterminator='\r\n').writerows(rows)
        manifest['export']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'row width'):
            check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)

        for mutation, message in [('chunk', 'identity'), ('id', 'result ID'), ('manifest', 'manifest')]:
            with self.subTest(mutation=mutation):
                evidence, output, manifest = self.write_summary('json')
                if mutation == 'chunk':
                    manifest['responses'][1]['requested_chunk_ids'] = [8]
                elif mutation == 'id':
                    body_path = evidence / manifest['responses'][1]['body_file']
                    body = json.loads(body_path.read_text())
                    body['8'] = body.pop('7')
                    body_path.write_text(json.dumps(body))
                    manifest['responses'][1]['decoded_body_sha256'] = hashlib.sha256(body_path.read_bytes()).hexdigest()
                else:
                    del manifest['export']['source_request_numbers']
                check.save(evidence / 'manifest.json', manifest)
                with self.assertRaisesRegex((ValueError, KeyError), message):
                    check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)

        evidence, output, manifest = self.write_summary('json')
        (evidence / manifest['responses'][2]['body_file']).unlink()
        with self.assertRaises(FileNotFoundError):
            check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)

    def test_summary_oracle_joins_real_multichunk_responses_and_missing_states(self):
        evidence, output, manifest = self.write_multichunk_summary()
        operations = [record['operation'] for record in manifest['responses']]
        self.assertEqual(operations.count('agentic-aggregates'), 3)
        self.assertEqual(operations.count('derived-agentic-metrics'), 3)
        self.assertEqual(operations.count('trace-availability'), 2)
        result = check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)
        self.assertEqual(result['selected_rows'], 501)
        rows = json.loads(output.read_text())['rows']
        self.assertEqual(rows[1]['agentx']['aggregates']['status'], 'not_returned')
        self.assertEqual(rows[2]['agentx']['derived_metrics']['status'], 'not_returned')
        self.assertFalse(rows[3]['agentx']['trace_availability']['response_key_present'])

        evidence, output, manifest = self.write_multichunk_summary()
        first, second = manifest['responses'][1:3]
        first_path, second_path = evidence / first['body_file'], evidence / second['body_file']
        first_body, second_body = first_path.read_bytes(), second_path.read_bytes()
        first_path.write_bytes(second_body)
        second_path.write_bytes(first_body)
        first['decoded_body_sha256'] = hashlib.sha256(second_body).hexdigest()
        second['decoded_body_sha256'] = hashlib.sha256(first_body).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'Unexpected agentic-aggregates result ID'):
            check.check_agentx_capture(self.root, evidence.name, output.name, self.args, VERSION)

    def test_point_oracle_accepts_bounded_trace_and_no_trace_and_rejects_invalid_diagnostics(self):
        for trace in [False, True]:
            evidence, output, _manifest, _document = self.write_point(trace=trace)
            self.assertEqual(check.check_agentx_point(self.root, evidence.name, output.name, '7', VERSION),
                             'trace_diagnostics' if trace else 'trace_unavailable')
        self.assertEqual(check.check_point_outcomes(['trace_diagnostics', 'trace_unavailable']),
                         ['trace_diagnostics', 'trace_unavailable'])
        with self.assertRaisesRegex(ValueError, 'one traced and one no-trace'):
            check.check_point_outcomes(['trace_unavailable', 'trace_unavailable'])

        evidence, output, manifest, document = self.write_point(trace=True)
        document['timeline']['version'] = True
        check.save(output, document)
        manifest['output']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'Trace diagnostic differs'):
            check.check_agentx_point(self.root, evidence.name, output.name, '7', VERSION)

        evidence, output, manifest, document = self.write_point(trace=True)
        timeline_record = manifest['responses'][3]
        timeline_path = evidence / timeline_record['body_file']
        timeline = json.loads(timeline_path.read_text())
        timeline['version'] = True
        timeline_path.write_text(json.dumps(timeline))
        timeline_record['decoded_body_sha256'] = hashlib.sha256(timeline_path.read_bytes()).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'timeline'):
            check.check_agentx_point(self.root, evidence.name, output.name, '7', VERSION)

        evidence, output, manifest, document = self.write_point(trace=False)
        document['selected_point']['id'] = '8'
        check.save(output, document)
        manifest['output']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
        check.save(evidence / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'differs from complete responses'):
            check.check_agentx_point(self.root, evidence.name, output.name, '7', VERSION)

    def test_native_point_recipe_allows_only_the_selected_id_seam(self):
        installed = self.root / 'installed'
        reference = installed / 'references'
        reference.mkdir(parents=True)
        reference.joinpath('agentx.md').write_text("""```bash
node --input-type=module <<'JS'
const selectedResultId = '421';
console.log(selectedResultId);
JS
```
""")
        expected = check.point_recipe(installed, '7').encode()
        script = self.root / 'agentx-point-recipe.mjs'
        script.write_bytes(expected)
        check.check_point_recipe(self.root, installed, 'agentx-point', '7')

        for mutation in [expected + b'\n', expected.replace(b'\n', b'\r\n'),
                         expected.replace(b'console.log', b'process.stdout.write')]:
            with self.subTest(mutation=mutation):
                script.write_bytes(mutation)
                with self.assertRaisesRegex(ValueError, 'changed beyond its selected ID'):
                    check.check_point_recipe(self.root, installed, 'agentx-point', '7')

        outside = self.root / 'outside.mjs'
        outside.write_bytes(expected)
        script.unlink()
        script.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'changed beyond its selected ID'):
            check.check_point_recipe(self.root, installed, 'agentx-point', '7')

    def test_point_oracle_requires_one_chronological_capture_request_output_chain(self):
        for mutation in ['capture-order', 'request-before-capture', 'output-before-request',
                         'finish-before-output']:
            with self.subTest(mutation=mutation):
                evidence, output, manifest, document = self.write_point(trace=False)
                if mutation == 'capture-order':
                    manifest['responses'][0]['retrieved_at'] = '2026-09-05T00:00:04Z'
                elif mutation == 'request-before-capture':
                    document['metadata']['requests'][0]['retrieved_at'] = '2026-09-05T00:00:00Z'
                elif mutation == 'output-before-request':
                    document['metadata']['retrieved_at'] = '2026-09-05T00:00:05Z'
                else:
                    manifest['finished_at'] = '2026-09-05T00:00:19Z'
                check.save(output, document)
                manifest['output']['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
                check.save(evidence / 'manifest.json', manifest)
                with self.assertRaisesRegex(ValueError, 'timestamps are not chronological'):
                    check.check_agentx_point(self.root, evidence.name, output.name, '7', VERSION)

    def test_point_capture_preload_rejects_effective_post_request(self):
        node = check.shutil.which('node')
        self.assertIsNotNone(node)
        preload = self.root / 'capture.mjs'
        script = self.root / 'post.mjs'
        evidence = self.root / 'post-evidence'
        preload.write_text(check.POINT_CAPTURE_PRELOAD)
        script.write_text("""try {
  await fetch(new Request('https://inferencex.semianalysis.com/api/openapi.json', { method: 'POST' }));
  throw new Error('POST was accepted');
} catch (error) {
  if (!String(error).includes('allow only GET requests')) throw error;
}
""")
        environment = dict(check.os.environ)
        environment.update(INFERENCEX_POINT_EVIDENCE=str(evidence), INFERENCEX_POINT_ID='7',
                           INFERENCEX_POINT_OUTPUT=str(self.root / 'point.json'),
                           INFERENCEX_PACKAGE_VERSION=VERSION)
        completed = subprocess.run([node, '--import', preload.as_uri(), script], env=environment,
                                   capture_output=True, text=True, check=False)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads((evidence / 'manifest.json').read_text())['responses'], [])

    def test_point_capture_preload_requires_redirect_rejection(self):
        node = check.shutil.which('node')
        self.assertIsNotNone(node)
        preload = self.root / 'capture.mjs'
        script = self.root / 'redirect.mjs'
        evidence = self.root / 'redirect-evidence'
        preload.write_text(check.POINT_CAPTURE_PRELOAD)
        script.write_text("""try {
  await fetch('https://inferencex.semianalysis.com/api/openapi.json');
  throw new Error('Default redirect handling was accepted');
} catch (error) {
  if (!String(error).includes('must reject redirects')) throw error;
}
""")
        environment = dict(check.os.environ)
        environment.update(INFERENCEX_POINT_EVIDENCE=str(evidence), INFERENCEX_POINT_ID='7',
                           INFERENCEX_POINT_OUTPUT=str(self.root / 'point.json'),
                           INFERENCEX_PACKAGE_VERSION=VERSION)
        completed = subprocess.run([node, '--import', preload.as_uri(), script], env=environment,
                                   capture_output=True, text=True, check=False)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads((evidence / 'manifest.json').read_text())['responses'], [])

    def test_installed_boundary_and_public_archive_bytes_are_exact(self):
        installed = self.root / 'installed'
        installed.mkdir()
        (installed / 'SKILL.md').write_bytes(b'skill')
        check.save(installed / '.inferencex-skills.json', {'package': check.PACKAGE, 'version': VERSION})
        check.check_installed(installed, {'SKILL.md': b'skill'}, VERSION)
        (installed / 'unexpected.txt').write_text('extra')
        with self.assertRaisesRegex(ValueError, 'Unexpected installed files'):
            check.check_installed(installed, {'SKILL.md': b'skill'}, VERSION)
        (installed / 'unexpected.txt').unlink()
        outside_file = self.root / 'outside.txt'
        outside_file.write_text('outside')
        (installed / 'file-link').symlink_to(outside_file)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            check.check_installed(installed, {'SKILL.md': b'skill'}, VERSION)
        (installed / 'file-link').unlink()
        outside_directory = self.root / 'outside-directory'
        outside_directory.mkdir()
        (installed / 'directory-link').symlink_to(outside_directory, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            check.check_installed(installed, {'SKILL.md': b'skill'}, VERSION)
        (installed / 'directory-link').unlink()
        check.os.mkfifo(installed / 'named-pipe')
        with self.assertRaisesRegex(ValueError, 'regular file'):
            check.check_installed(installed, {'SKILL.md': b'skill'}, VERSION)
        (installed / 'named-pipe').unlink()

        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as packed:
            entry = tarfile.TarInfo('package/skills/inferencex-api/SKILL.md')
            entry.size = 5
            packed.addfile(entry, io.BytesIO(b'skill'))
        archive = stream.getvalue()
        record = {'name': check.PACKAGE, 'version': VERSION, 'filename': 'candidate.tgz',
                  'sha256': hashlib.sha256(archive).hexdigest(),
                  'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()}
        (self.root / 'candidate.tgz').write_bytes(archive)
        check.save(self.root / 'release.json', record)
        metadata = {'name': check.PACKAGE, 'version': VERSION,
                    'dist': {'integrity': record['integrity'], 'tarball': check.REGISTRY + '/different.tgz'}}
        command = ['verify-release.py', 'public', str(self.root / 'release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example', '--agentx-point-id', '7',
                   '--agentx-no-trace-id', '8', '--evidence', str(self.root / 'public-verification')]
        with patch.object(sys, 'argv', command), \
                patch.object(check, 'fetch_public', side_effect=[json.dumps(metadata).encode(), b'different']) as fetch, \
                patch.object(check, 'install_target') as install, patch('builtins.print'):
            with self.assertRaisesRegex(ValueError, 'Public tarball differs'):
                check.main()
        self.assertEqual(fetch.call_count, 2)
        install.assert_not_called()

    def test_candidate_orchestrates_powerx_and_agentx_for_both_targets(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as packed:
            content = b'skill'
            entry = tarfile.TarInfo('package/skills/inferencex-api/SKILL.md')
            entry.size = len(content)
            packed.addfile(entry, io.BytesIO(content))
        body = stream.getvalue()
        record = {'name': check.PACKAGE, 'version': VERSION, 'filename': 'candidate.tgz',
                  'sha256': hashlib.sha256(body).hexdigest(),
                  'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(body).digest()).decode()}
        (self.root / 'candidate.tgz').write_bytes(body)
        check.save(self.root / 'release.json', record)
        command = ['verify-release.py', 'candidate', str(self.root / 'release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example', '--agentx-point-id', '7',
                   '--agentx-no-trace-id', '8', '--evidence', str(self.root / 'verification')]
        projects = {}

        def install(clean_root, target, *_args, **_kwargs):
            project = Path(clean_root) / target
            project.mkdir(parents=True)
            projects[target] = project
            return project, {}

        with patch.object(sys, 'argv', command), patch.object(check, 'install_target', side_effect=install) as installs, \
                patch.object(check, 'check_installed') as installed_checks, patch.object(check, 'run') as runs, \
                patch.object(check, 'captured_export', return_value=[]), \
                patch.object(check, 'check_exports', return_value={'selected_rows': 1}), \
                patch.object(check, 'check_agentx_capture', return_value={'selected_rows': 1}), \
                patch.object(check, 'run_point', side_effect=['trace_diagnostics', 'trace_unavailable'] * 2), \
                patch('builtins.print'):
            check.main()
        self.assertEqual([call.args[1] for call in installs.call_args_list], ['codex', 'claude'])
        self.assertEqual(installed_checks.call_count, 4)
        commands = [[str(part) for part in call.args[0]] for call in runs.call_args_list]
        for target, project in projects.items():
            target_commands = [command for command, call in zip(commands, runs.call_args_list)
                               if call.args[1] == project]
            self.assertEqual(sum('export-powerx.mjs' in ' '.join(command) for command in target_commands), 2, target)
            self.assertEqual(sum('export-agentx.mjs' in ' '.join(command) for command in target_commands), 3, target)

    def test_agents_prepares_canonical_projects_with_only_archive_and_hashed_prompt(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as packed:
            entry = tarfile.TarInfo('package/skills/inferencex-api/SKILL.md')
            entry.size = 5
            packed.addfile(entry, io.BytesIO(b'skill'))
        archive = stream.getvalue()
        record = {'name': check.PACKAGE, 'version': VERSION, 'filename': 'candidate.tgz',
                  'sha256': hashlib.sha256(archive).hexdigest(),
                  'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()}
        (self.root / 'candidate.tgz').write_bytes(archive)
        check.save(self.root / 'release.json', record)
        evidence = self.root / 'agents-verification'
        canonical_root = self.root / 'canonical-acceptance'
        canonical_root.mkdir()
        alias_root = self.root / 'aliased-acceptance'
        alias_root.symlink_to(canonical_root, target_is_directory=True)
        command = ['verify-release.py', 'agents', str(self.root / 'release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example', '--agentx-point-id', '7',
                   '--agentx-no-trace-id', '8', '--evidence', str(evidence)]
        with patch.object(sys, 'argv', command), \
                patch.object(check.tempfile, 'mkdtemp', return_value=str(alias_root)), \
                patch.object(check, 'install_target') as install, \
                patch.object(check.shutil, 'which') as which, patch('builtins.print'):
            check.main()
        install.assert_not_called()
        which.assert_not_called()
        report = json.loads((evidence / 'verification.json').read_text())
        clean_root = Path(report['clean_root'])
        self.assertEqual(clean_root, canonical_root.resolve())
        self.addCleanup(check.shutil.rmtree, clean_root, True)
        acceptance = json.loads((clean_root / 'acceptance.json').read_text())
        self.assertEqual(acceptance['status'], 'prepared')
        for prepared in acceptance['targets']:
            project = Path(prepared['project'])
            self.assertEqual(project, project.resolve())
            self.assertEqual({path.name for path in project.iterdir()}, {'candidate.tgz', 'prompt.txt'})
            self.assertEqual((project / 'candidate.tgz').read_bytes(), archive)
            prompt_bytes = (project / 'prompt.txt').read_bytes()
            self.assertEqual(prepared, {'target': prepared['target'], 'project': str(project),
                                        'status': 'awaiting-native-agent',
                                        'prompt_sha256': hashlib.sha256(prompt_bytes).hexdigest()})
            prompt_text = prompt_bytes.decode()
            self.assertIn(f'install --target {prepared["target"]}', prompt_text)
            self.assertIn(str((project / 'candidate.tgz').resolve()), prompt_text)
            skill_root = '.agents' if prepared['target'] == 'codex' else '.claude'
            self.assertIn(f'The installed skill must be exactly {project / skill_root}/skills/inferencex-api.',
                          prompt_text)

    def test_agent_prompt_pins_project_commands_and_exact_point_manifest_contract(self):
        for target, install_root in [('codex', '.agents'), ('claude', '.claude')]:
            target_project = (self.root / f'prepared/{target}').resolve()
            target_archive = target_project / 'candidate.tgz'
            target_prompt = check.prompt(self.args, target, target_archive)
            commands = [
                f'npm exec --yes --offline --package {target_archive} -- inferencex-skills install --target {target}',
                f'npm exec --yes --offline --package {target_archive} -- inferencex-skills status --target {target} --json > status.json',
                f'npm exec --yes --offline --package {target_archive} -- inferencex-skills install --target {target} --force --dry-run --json > preview.json',
            ]
            with self.subTest(target=target):
                self.assertTrue(target_prompt.startswith(
                    'Your first three tool calls must be shell calls containing exactly these commands, one per call, in this order:\n'))
                self.assertEqual([line[3:] for line in target_prompt.splitlines()[2:5]], commands)
                for number, command in enumerate(commands, 1):
                    self.assertEqual(target_prompt.count(f'\n{number}. {command}\n'), 1)
                self.assertIn(
                    f'The installed skill must be exactly {target_project / install_root}/skills/inferencex-api.',
                    target_prompt,
                )

        project = (self.root / 'prepared/codex').resolve()
        archive = project / 'candidate.tgz'
        prompt_text = check.prompt(self.args, 'codex', archive)
        installed = project / '.agents/skills/inferencex-api'
        for required in [
                f'The prepared project root is {project}.',
                'This prepared project is the only writable boundary',
                'Every shell redirection destination, including a throwaway check, must resolve inside this project',
                'do not run `cd`, even back to this same path',
                'Never create, extract, or delete task files in `/tmp`, `$TMPDIR`, `$HOME`, or another directory',
                'Do not list or extract the candidate archive',
                'Make exactly one shell tool call at a time, and wait for it to finish successfully before issuing the next',
                'Until all three finish, make no tool calls except the next required shell call',
                'Do not prefix, suffix, or combine the commands with `pwd`, `ls`, `cat`, `&&`, `;`, a pipe, or any other command',
                'Run the required install, status, and preview commands from that exact directory',
                'Do not change directories or pass --dir or --cwd',
                f'The installed skill must be exactly {installed}.',
                'status --target codex --json',
                'install --target codex --force --dry-run --json',
                'Do not run a connectivity or schema preflight with `curl` or any other tool',
                "The task's first two HTTP requests must be the captured OpenAPI request and captured benchmark request",
                'only after both response captures and lookup.json exist may an exporter or diagnostic make an HTTP request',
                'Do not make a preliminary, uncaptured, retry, or evidence-only repeat request',
                'The lookup must make exactly two HTTP requests',
                'fetch `/api/openapi.json` once and then the exact benchmark URL once',
                'raw-responses/lookup-openapi.response.json',
                'raw-responses/lookup-openapi.request.json',
                'raw-responses/lookup.response.json',
                'raw-responses/lookup.request.json',
                'Run the installed bounded diagnostic exactly once',
                'It must make exactly one HTTP request in total, the unfiltered benchmark request',
                'raw-responses/diagnostic.response.json',
                'raw-responses/diagnostic.request.json',
                'finish reading the body before creating `retrieved_at`',
                'save and parse the same complete body bytes consumed by the output',
                'Each request record must contain exactly query_url, status, retrieved_at, and sha256 of its saved body',
                "The benchmark response time must also be lookup.json's retrieved_at",
                "the diagnostic response time must be diagnostic.json's diagnostic.retrieved_at",
                'raw-responses contains exactly those six files',
                '`schema_version`, `package_version`, `selected_result_id`, `status`, `started_at`, ',
                '`finished_at`, `responses`, `output`, and `error`',
                '`operation`, `request_number`, `url`, `method`, `retrieved_at`, `http_status`, ',
                '`decoded_body_sha256`, `body_file`, and `checksum_covers`',
                '`response-0001-openapi.json`',
                '`response-NNNN-<operation>.json`',
                '`format`, `destination`, `sha256`, and `source_request_numbers`',
                'The final manifest is accepted only with `status: "complete"` and `error: null`',
                'Run the installed one-point recipe as written',
                'agentx-point-recipe.mjs',
                'agentx-second-point-recipe.mjs',
                'every other recipe byte must remain identical',
                'the file must end at that final `}` byte with no trailing newline or other byte',
                'Do not create an outside-project scratch copy while extracting or comparing the recipe files',
                'separate Node `--import` capture preload',
                "redirect that recipe process's stdout directly",
                'must not write their output or evidence, replace `response.json()`, replace `console.log()`',
                'Do not reimplement the request flow or reconstruct the JSON output',
                "Build `metadata.requests` only after that run's final fetch has completed",
                'one item containing exactly `query_url` and `retrieved_at`',
                'for every manifest response in identical order (six for a traced run and three for a no-trace run)',
                'each `query_url` must match the corresponding manifest response `url`',
                "each `retrieved_at` must be the recipe's own request time for that fetch",
                'Do not describe an omitted availability key as an explicit `false` value',
        ]:
            with self.subTest(required=required):
                self.assertIn(required, prompt_text)

    def test_agents_rejects_archive_filename_collision_before_creating_projects(self):
        record = {'name': check.PACKAGE, 'version': VERSION, 'filename': 'prompt.txt',
                  'sha256': '0' * 64, 'integrity': 'sha512-invalid'}
        check.save(self.root / 'unsafe-release.json', record)
        command = ['verify-release.py', 'agents', str(self.root / 'unsafe-release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example', '--agentx-point-id', '7',
                   '--agentx-no-trace-id', '8', '--evidence', str(self.root / 'unsafe-verification')]
        with patch.object(sys, 'argv', command), patch.object(check.tempfile, 'mkdtemp') as projects:
            with self.assertRaisesRegex(ValueError, r'safe \.tgz basename'):
                check.main()
        projects.assert_not_called()
        self.assertFalse((self.root / 'unsafe-verification').exists())

    def test_check_agent_runs_both_workload_and_point_oracles(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as packed:
            entry = tarfile.TarInfo('package/skills/inferencex-api/SKILL.md')
            entry.size = 5
            packed.addfile(entry, io.BytesIO(b'skill'))
        archive = stream.getvalue()
        record = {'name': check.PACKAGE, 'version': VERSION, 'filename': 'candidate.tgz',
                  'sha256': hashlib.sha256(archive).hexdigest(),
                  'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()}
        (self.root / 'candidate.tgz').write_bytes(archive)
        check.save(self.root / 'release.json', record)
        project = self.root / 'prepared/codex'
        project.mkdir(parents=True)
        (project / 'candidate.tgz').write_bytes(archive)
        prompt_bytes = check.prompt(self.args, 'codex', project / 'candidate.tgz').encode()
        (project / 'prompt.txt').write_bytes(prompt_bytes)
        scope = {'model': 'Example', 'date': None, 'isl': 8192, 'osl': 1024, 'raw_model': None,
                 'empty_isl': 7, 'empty_osl': 13, 'agentx_model': 'Example',
                 'agentx_point_id': '7', 'agentx_no_trace_id': '8'}
        claude_project = project.parent / 'claude'
        claude_prompt = check.prompt(self.args, 'claude', claude_project / 'candidate.tgz').encode()
        acceptance = {
            'status': 'prepared', 'mode': 'agents', 'started_at': '2026-09-05T00:00:00Z',
            'candidate': record, 'new_benchmark_runs': False, 'requests': [], 'scope': scope,
            'clean_root': str(project.parent),
            'targets': [
                {'target': 'codex', 'project': str(project), 'status': 'awaiting-native-agent',
                 'prompt_sha256': hashlib.sha256(prompt_bytes).hexdigest()},
                {'target': 'claude', 'project': str(claude_project), 'status': 'awaiting-native-agent',
                 'prompt_sha256': hashlib.sha256(claude_prompt).hexdigest()}]}
        check.save(project.parent / 'acceptance.json', acceptance)
        check.save(project / 'lookup.json', {})
        check.save(project / 'unavailable.json', {'metadata': {}, 'rows': []})
        check.save(project / 'diagnostic.json', {'diagnostic': {}})
        (project / 'result.md').write_text('Checked both public workflows.')
        raw_responses = project / 'raw-responses'
        raw_responses.mkdir()
        for name in ['lookup-openapi.request.json', 'lookup-openapi.response.json',
                     'lookup.request.json', 'lookup.response.json',
                     'diagnostic.request.json', 'diagnostic.response.json']:
            (raw_responses / name).write_text('{}')
        command = ['verify-release.py', 'check-agent', str(self.root / 'release.json'), '--model', 'Example',
                   '--isl', '8192', '--osl', '1024', '--agentx-model', 'Example', '--agentx-point-id', '7',
                   '--agentx-no-trace-id', '8', '--project', str(project),
                   '--evidence', str(self.root / 'check-agent')]
        for mutation in ['missing-status', 'running-status', 'failed-status', 'wrong-mode',
                         'changed-target', 'missing-target', 'changed-target-status', 'same-project']:
            with self.subTest(mutation=mutation):
                altered = json.loads(json.dumps(acceptance))
                if mutation == 'missing-status':
                    del altered['status']
                elif mutation in {'running-status', 'failed-status'}:
                    altered['status'] = mutation.removesuffix('-status')
                elif mutation == 'wrong-mode':
                    altered['mode'] = 'candidate'
                elif mutation == 'changed-target':
                    altered['targets'][1]['target'] = 'other'
                elif mutation == 'missing-target':
                    altered['targets'].pop()
                elif mutation == 'changed-target-status':
                    altered['targets'][1]['status'] = 'complete'
                else:
                    altered['targets'][1]['project'] = altered['targets'][0]['project']
                check.save(project.parent / 'acceptance.json', altered)
                rejected = command[:-1] + [str(self.root / f'rejected-{mutation}')]
                message = 'preparation state' if mutation in {
                    'missing-status', 'running-status', 'failed-status', 'wrong-mode'} else 'target set'
                with patch.object(sys, 'argv', rejected), patch.object(check, 'check_installed') as installed, \
                        patch('builtins.print'):
                    with self.assertRaisesRegex(ValueError, message):
                        check.main()
                installed.assert_not_called()
        check.save(project.parent / 'acceptance.json', acceptance)
        (project / 'prompt.txt').write_text('changed')
        tampered = command[:-1] + [str(self.root / 'tampered-check-agent')]
        with patch.object(sys, 'argv', tampered), patch.object(check, 'check_installed') as installed, \
                patch('builtins.print'):
            with self.assertRaisesRegex(ValueError, 'prompt differs'):
                check.main()
        installed.assert_not_called()
        (project / 'prompt.txt').write_bytes(prompt_bytes)

        def reject_inventory(label):
            rejected = command[:-1] + [str(self.root / f'{label}-check-agent')]
            with patch.object(sys, 'argv', rejected), patch.object(check, 'check_installed'), \
                    patch.object(check, 'captured_export', return_value=[]), \
                    patch.object(check, 'check_exports', return_value={'selected_rows': 1}), \
                    patch('builtins.print'):
                with self.assertRaisesRegex(ValueError, 'six required regular files'):
                    check.main()

        openapi_response = raw_responses / 'lookup-openapi.response.json'
        openapi_response.unlink()
        reject_inventory('missing-openapi')
        openapi_response.write_text('{}')
        extra = raw_responses / 'extra.json'
        extra.write_text('{}')
        reject_inventory('extra-raw-response')
        extra.unlink()
        outside_raw_responses = self.root / 'outside-raw-responses'
        raw_responses.rename(outside_raw_responses)
        raw_responses.symlink_to(outside_raw_responses, target_is_directory=True)
        reject_inventory('raw-responses-symlink')
        raw_responses.unlink()
        outside_raw_responses.rename(raw_responses)
        symlink_target = project / 'symlink-target.json'
        symlink_target.write_text('{}')
        openapi_response.unlink()
        openapi_response.symlink_to(symlink_target)
        reject_inventory('response-symlink')
        openapi_response.unlink()
        openapi_response.write_text('{}')

        openapi = {'paths': {'/api/v1/benchmarks': {'get': {'parameters': [
            {'name': 'model', 'in': 'query', 'schema': {'enum': ['Example']}}]}}}}
        with patch.object(sys, 'argv', command), patch.object(check, 'check_installed'), \
                patch.object(check, 'captured_export', return_value=[]), \
                patch.object(check, 'check_exports', return_value={'selected_rows': 1}), \
                patch.object(check, 'captured_request', side_effect=[openapi, [], []]) as requests, \
                patch.object(check, 'check_lookup'), \
                patch.object(check, 'check_metadata', return_value=[]), \
                patch.object(check, 'check_empty_diagnostic'), \
                patch.object(check, 'check_agentx_capture', return_value={'selected_rows': 1}) as summaries, \
                patch.object(check, 'check_point_recipe') as recipes, \
                patch.object(check, 'check_agentx_point',
                             side_effect=['trace_diagnostics', 'trace_unavailable']) as points, \
                patch('builtins.print'):
            check.main()
        self.assertEqual(requests.call_count, 3)
        self.assertEqual(requests.call_args_list[0].args, (project, 'lookup-openapi', check.OPENAPI))
        expected_url = check.API + '?model=Example'
        self.assertEqual(requests.call_args_list[1].args, (project, 'lookup', expected_url, {}))
        self.assertEqual(requests.call_args_list[2].args, (project, 'diagnostic', expected_url, {}))
        self.assertEqual(summaries.call_count, 3)
        self.assertEqual(recipes.call_count, 2)
        self.assertEqual(points.call_count, 2)
        report = json.loads((self.root / 'check-agent/verification.json').read_text())
        self.assertEqual(report['status'], 'data-checks-passed')

    def test_workflow_gates_candidate_before_publish_and_public_after(self):
        workflow = (Path(__file__).resolve().parents[3] / '.github/workflows/publish-skills.yml').read_text()
        candidate = workflow.index('verify-release.py candidate')
        publish = workflow.index('npm publish')
        public = workflow.index('verify-release.py public')
        self.assertLess(candidate, publish)
        self.assertLess(publish, public)
        for flag in ['--agentx-model', '--agentx-point-id', '--agentx-no-trace-id']:
            self.assertEqual(workflow.count(flag), 2)


if __name__ == '__main__':
    unittest.main()
