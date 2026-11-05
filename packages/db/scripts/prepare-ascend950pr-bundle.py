"""Convert the verified queued 950PR journal to an OperatorX raw bundle.

The public GPU rows in the plot snapshot are used for provenance and parity checks;
they already exist in OperatorX and are never copied into the new run.
"""

import argparse
import hashlib
import json
import math
import sqlite3
from pathlib import Path

RUN_ID = "external-ascend950pr-20261023-queued-v1"
BACKEND = "torch_npu_matmul_queued"
TESTLIST = "gemm_queued_20261023"
OLD_RUN_ID = "external-ascend950pr-20261002-linear"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def build_bundle(database_path, plot_path, audit_path, expected=(3968, 3936, 32)):
    plot = json.loads(plot_path.read_text())
    audit = json.loads(audit_path.read_text())
    expected_hash = plot["source_hashes"].get(next(
        (name for name in plot["source_hashes"] if name.endswith("/unquantized/latest.sqlite3")),
        "",
    ))
    actual_hash = sha256(database_path)
    if actual_hash != expected_hash:
        raise ValueError("SQLite SHA-256 differs from the plot's source hash")
    category = plot["categories"]["bf16_inputs"]
    plot_rows = {stable(row["args"]): row for row in category["rows"]["ascend950pr"]}
    counts = audit["categories"]["bf16_inputs"]["counts"]
    if {key: len(rows) for key, rows in category["rows"].items()} != counts:
        raise ValueError("Plot and audit hardware counts disagree")
    if category["stats"] != audit["categories"]["bf16_inputs"]["stats"]:
        raise ValueError("Plot and audit statistics disagree")
    if len(category["shared_keys"]) != audit["categories"]["bf16_inputs"]["shared"] or len(
        category["common_compute_keys"]
    ) != audit["categories"]["bf16_inputs"]["common_compute"]:
        raise ValueError("Plot and audit cohort counts disagree")
    for hardware, rows in category["rows"].items():
        if hardware == "ascend950pr":
            continue
        if any(not row.get("run_id") or not row.get("source_url", "").endswith("/" + row["run_id"]) for row in rows):
            raise ValueError(f"Missing GPU source identity for {hardware}")

    connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity check failed")
        metadata = json.loads(connection.execute("SELECT value FROM metadata WHERE key='fingerprint'").fetchone()[0])
        records = {}
        for case_id, status, raw in connection.execute("SELECT case_id,status,record FROM results ORDER BY seq"):
            if status == "ok":
                record = json.loads(raw)
                if record["case_id"] != case_id or case_id in records:
                    raise ValueError(f"Duplicate or mismatched case ID: {case_id}")
                records[case_id] = record
        if len(records) != expected[0]:
            raise ValueError(f"Expected {expected[0]} completed cases, found {len(records)}")
        distinct_cases = connection.execute("SELECT COUNT(DISTINCT case_id) FROM results").fetchone()[0]
        if distinct_cases != expected[0]:
            raise ValueError(f"Expected {expected[0]} distinct cases, found {distinct_cases}")
    finally:
        connection.close()

    manifest_cases = []
    docs = []
    rows = []
    plotted = set()
    fp32_compute = 0
    first_started = min(record["started_at"] for record in records.values())
    last_finished = max(record["finished_at"] for record in records.values())
    for case_id, record in records.items():
        args = record["args"]
        sources = [source["model"] + "/" + source["role"] for source in record["sources"]]
        shape = {"type": "gemm", "args": args, "sources": sources}
        manifest_cases.append({"testlist": TESTLIST, "shape": shape})
        if not record["correctness"]["before_timing"]["passed"] or not record["correctness"]["after_timing"]["passed"]:
            raise ValueError(f"Correctness failed for {case_id}")
        samples = record["timing"]["device_event_samples_us"]
        latency = record["metrics"]["latency_us"]
        if len(samples) != 10 or sorted(samples)[5] != latency or not math.isfinite(latency) or latency <= 0:
            raise ValueError(f"Invalid timing samples for {case_id}")
        if not math.isclose(2 * args["m"] * args["n"] * args["k"] / latency / 1e6,
                            record["metrics"]["tflops"], rel_tol=1e-8):
            raise ValueError(f"Throughput differs for {case_id}")
        key = stable(args)
        if args["a"]["dtype"] == args["b"]["dtype"] == "bf16":
            point = plot_rows.get(key)
            if point is None or point["case_id"] != case_id or point["latency_us"] != latency:
                raise ValueError(f"Plot point differs for {case_id}")
            plotted.add(key)
        else:
            if (args["a"]["dtype"], args["b"]["dtype"]) != ("bf16", "fp32"):
                raise ValueError(f"Unexpected operand dtypes for {case_id}")
            fp32_compute += 1
        rows.append({
            "testlist": TESTLIST,
            "op": {**shape, "backend": BACKEND},
            "status": "ok",
            "metrics": {
                "latency_us": latency,
                "npu_graph": record["metrics"].get("npu_graph", False),
                "queued_wall_latency_us_per_call": record["metrics"].get("queued_wall_latency_us_per_call"),
                "source_record": record,
            },
        })
        if len(rows) == 64:
            docs.append({"run": {"cluster": "ascend950pr_1x", "software": metadata.get("runtime"),
                                 "hardware_identity": metadata.get("hardware_identity"),
                                 "source_sqlite_sha256": actual_hash}, "rows": rows})
            rows = []
    if rows:
        docs.append({"run": {"cluster": "ascend950pr_1x", "software": metadata.get("runtime"),
                             "hardware_identity": metadata.get("hardware_identity"),
                             "source_sqlite_sha256": actual_hash}, "rows": rows})
    if len(plotted) != len(plot_rows) or len(plotted) != expected[1] or fp32_compute != expected[2]:
        raise ValueError("The plotted / FP32-compute split does not reconcile")

    return {
        "run": {"run_id": RUN_ID, "run_attempt": 1, "source_sha": "sha256:" + actual_hash,
                "source_branch": None, "generated_at": first_started, "conclusion": "success"},
        "manifest": {"include": [{"id": "queued-v1", "runner": "ascend950pr-external",
                                  "cluster": "ascend950pr_1x", "mode": "timing",
                                  "backends": [BACKEND], "cases": manifest_cases}],
                     "submission": {"source_sqlite_sha256": actual_hash,
                                    "plot_sha256": sha256(plot_path), "audit_sha256": sha256(audit_path),
                                    "measurement_date": "2026-10-23",
                                    "first_started_at": first_started,
                                    "last_finished_at": last_finished,
                                    "replaces": OLD_RUN_ID,
                                    "scope": "3,936 BF16-input and 32 BF16/FP32-input GEMM cases; GPU rows remain in their original runs",
                                    "timing_qualification": "Queued NPU event timing; public GPU graph, shield, cache and throttle policies differ"}},
        "shards": [{"id": "queued-v1", "attempt": 1, "docs": docs}],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite", type=Path)
    parser.add_argument("plot", type=Path)
    parser.add_argument("audit", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bundle = build_bundle(args.sqlite.resolve(), args.plot.resolve(), args.audit.resolve())
    args.output.write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
    print(f"Prepared {bundle['run']['run_id']}: {sum(len(doc['rows']) for doc in bundle['shards'][0]['docs'])} results")


if __name__ == "__main__":
    main()
