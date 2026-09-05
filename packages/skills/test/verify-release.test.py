"""Offline retry/deadline regressions for the existing read-only verifier."""

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
VERSION = '0.3.0'
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
            ETARGET.replace(VERSION, '0.3.1'),
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
                   '--isl', '8192', '--osl', '1024', '--evidence', str(self.root / 'evidence')]
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

    def test_original_lookup_context_must_match_saved_output(self):
        responses = self.root / 'raw-responses'
        responses.mkdir()
        body = b'[]'
        (responses / 'lookup.response.json').write_bytes(body)
        context = {'query_url': check.API + '?model=Example', 'status': 200,
                   'retrieved_at': '2026-09-05T00:00:00Z', 'sha256': hashlib.sha256(body).hexdigest()}
        check.save(responses / 'lookup.request.json', context)
        self.assertEqual(check.captured_request(self.root, 'lookup', context['query_url'], context), [])
        with self.assertRaisesRegex(ValueError, 'original request context'):
            check.captured_request(self.root, 'lookup', context['query_url'], context | {'retrieved_at': '2026-09-06T00:00:00Z'})


if __name__ == '__main__':
    unittest.main()
