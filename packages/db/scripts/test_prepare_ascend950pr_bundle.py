import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("prepare-ascend950pr-bundle.py")
SPEC = importlib.util.spec_from_file_location("prepare_ascend950pr_bundle", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def record(case_id, b_dtype):
    args = {"m": 1, "n": 64, "k": 128, "a": {"dtype": "bf16"},
            "b": {"dtype": b_dtype}, "out": "bf16"}
    return {"case_id": case_id, "args": args, "status": "ok",
            "started_at": "2026-10-23T12:00:00+00:00",
            "finished_at": "2026-10-23T12:00:01+00:00",
            "sources": [{"model": "Example/Model", "role": "gate"}],
            "correctness": {"before_timing": {"passed": True},
                            "after_timing": {"passed": True}},
            "timing": {"device_event_samples_us": [8, 7, 9, 6, 5, 10, 11, 12, 13, 14]},
            "metrics": {"latency_us": 10, "tflops": 2 * 64 * 128 / 10 / 1e6}}


class BundleTest(unittest.TestCase):
    def test_preserves_samples_checks_and_rejects_plot_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database, plot_path, audit_path = [root / name for name in ("latest.sqlite3", "plot.json", "audit.json")]
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("CREATE TABLE results (seq INTEGER PRIMARY KEY, case_id TEXT, status TEXT, record TEXT)")
            connection.execute("INSERT INTO metadata VALUES (?, ?)", ("fingerprint", json.dumps({"runtime": {"cann": "9.1"}})))
            bf16, fp32 = record("bf16", "bf16"), record("fp32", "fp32")
            for seq, item in enumerate((bf16, fp32), 1):
                connection.execute("INSERT INTO results VALUES (?, ?, ?, ?)",
                                   (seq, item["case_id"], "ok", json.dumps(item)))
            connection.commit()
            connection.close()
            point = {"args": bf16["args"], "case_id": "bf16", "latency_us": 10}
            gpu = {**point, "run_id": "123", "source_url": "https://example.test/runs/123"}
            stats = {"ascend950pr": {}, "h100": {}}
            plot = {"source_hashes": {"x/unquantized/latest.sqlite3": MODULE.sha256(database)},
                    "categories": {"bf16_inputs": {"rows": {"ascend950pr": [point], "h100": [gpu]},
                                                    "shared_keys": [], "common_compute_keys": [],
                                                    "stats": stats}}}
            audit = {"categories": {"bf16_inputs": {"counts": {"ascend950pr": 1, "h100": 1},
                                                     "shared": 0, "common_compute": 0,
                                                     "stats": stats}}}
            plot_path.write_text(json.dumps(plot))
            audit_path.write_text(json.dumps(audit))
            bundle = MODULE.build_bundle(database, plot_path, audit_path, expected=(2, 1, 1))
            rows = bundle["shards"][0]["docs"][0]["rows"]
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["metrics"]["source_record"]["timing"]["device_event_samples_us"],
                             bf16["timing"]["device_event_samples_us"])
            self.assertTrue(rows[0]["metrics"]["source_record"]["correctness"]["after_timing"]["passed"])
            self.assertEqual(bundle["manifest"]["submission"]["replaces"], MODULE.OLD_RUN_ID)
            plot["categories"]["bf16_inputs"]["rows"]["ascend950pr"][0]["latency_us"] = 9
            plot_path.write_text(json.dumps(plot))
            with self.assertRaisesRegex(ValueError, "Plot point differs"):
                MODULE.build_bundle(database, plot_path, audit_path, expected=(2, 1, 1))


if __name__ == "__main__":
    unittest.main()
