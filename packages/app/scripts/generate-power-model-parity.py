#!/usr/bin/env python3
"""Regenerate the TypeScript power-model port's manifest and parity fixture.

Usage: python3 packages/app/scripts/generate-power-model-parity.py [--inferencex PATH]

PATH is a local SemiAnalysisAI/InferenceX clone that contains REVISION (default:
$INFERENCEX_REPO, else an InferenceX checkout next to this repository). The script
extracts power_model at REVISION into a temporary directory and imports it, so it
needs Python >= 3.12 with pydantic 2, the upstream package's only dependency.

It writes two files next to the port (packages/app/src/lib/power/power_model):
- power-model.manifest.json: the revision, its source tree, and every upstream
  Python module, which power-model-parity.test.ts maps one-to-one onto the port.
- power-model.parity.json: the upstream model's own output for every catalog
  system, workload, scale-out state, measured Grace-socket input, and a sweep of
  GPU watts (including out-of-domain inputs and their errors).
Output is byte-stable across reruns.
"""

import argparse
import io
import itertools
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

sys.dont_write_bytecode = True
# InferenceX #3887 merge commit: the measured Grace-socket input landed here.
REVISION = "1e509932e09f2382f778d0e793893b534b02737b"
SOURCE_PATH = "power_model"
PACKAGE_PATH = "power_model/src/power_model"
SOURCE_URL = f"https://github.com/SemiAnalysisAI/InferenceX/tree/{REVISION}/{SOURCE_PATH}"
REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = REPO_ROOT / "packages/app/src/lib/power"
# Upstream modules the port deliberately omits, with the reason recorded in the manifest.
SKIPPED = {
    "__main__.py": "Command-line entry point; the app calls the library directly.",
    "cli.py": "Argument parsing and terminal output for the command line only.",
}
WORKLOADS = ("idle", "fixed-seq-len", "agentic", "agentic-cpu-offloading")
SCALE_OUT = (False, True)
SYSTEM_COUNTS = (1, 4)
# Spans idle, typical, TDP, and both PSU-capacity and rack-shelf limits; -1 is rejected.
# 594.191 W/GPU is the measured GB300 NVL72 Qwen3.5 8k/1k replay mean (app NVL72 fixtures).
GPU_WATTS = (
    -1.0, 0.0, 150.5, 350.0, 594.191, 612.375, 700.0, 1000.0,
    1200.0, 1400.0, 1430.0, 1440.0, 1600.0, 2400.0,
)
# Other socket inputs use this subset of GPU watts.
SPARSE_WATTS = (0.0, 700.0, 1400.0)
# Four-system clusters scale the shared network allocation.
CLUSTER_WATTS = (700.0, 1440.0)
# None models Grace; 98.066 W is a measured GB300 NVL72 replay mean.
RACK_SOCKET_WATTS = (None, 0.0, 98.066, 250.0, 500.0)
# Full component trees (with provenance and configuration) for these GPU watts.
DETAIL_WATTS = (0.0, 612.375)
SUMMARY_KEYS = ("it_power_w", "facility_overhead_w", "facility_power_w", "AllInPower_per_gpu")
REPORT_CASES = (
    ("hopper", "agentic", True, 4, 700.0, None),
    ("b300", "agentic-cpu-offloading", False, 1, 1000.0, None),
    ("mi355", "fixed-seq-len", True, 1, 1200.0, None),
    ("gb200-nvl72", "agentic", True, 1, 1000.0, None),
    ("gb300-nvl72", "fixed-seq-len", False, 4, 1200.0, 98.066),
)


def git(repo, *args, text=True):
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=text
    ).stdout


def load_upstream(repo, workdir):
    try:
        git(repo, "cat-file", "-e", f"{REVISION}^{{commit}}")
    except subprocess.CalledProcessError:
        raise SystemExit(f"{repo} lacks {REVISION}; run: git -C {repo} fetch origin {REVISION}")
    tree = git(repo, "rev-parse", f"{REVISION}:{SOURCE_PATH}").strip()
    archive = git(repo, "archive", "--format=tar", REVISION, SOURCE_PATH, text=False)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(workdir, filter="data")
    sys.path.insert(0, str(Path(workdir) / SOURCE_PATH / "src"))
    files = sorted(
        path.removeprefix(f"{PACKAGE_PATH}/")
        for path in git(repo, "ls-tree", "-r", "--name-only", REVISION, PACKAGE_PATH).splitlines()
        if path.endswith(".py")
    )
    return tree, files


def error_of(error):
    """Classify like the port: pydantic ValidationError, else a plain ValueError."""
    import pydantic

    if isinstance(error, pydantic.ValidationError):
        first = error.errors()[0]
        message = str(first["ctx"]["error"]) if first["type"] == "value_error" else None
        return {"kind": "validation", "message": message}
    return {"kind": "value", "message": str(error)}


class Interner:
    """Store each repeated provenance or configuration once, referenced by index."""

    def __init__(self):
        self.values, self.index = [], {}

    def __call__(self, value):
        if value is None:
            return None
        key = json.dumps(value, sort_keys=True, allow_nan=False)
        if key not in self.index:
            self.index[key] = len(self.values)
            self.values.append(value)
        return self.index[key]


def compact(node, provenance, configuration):
    return {
        "name": node["name"],
        "power_w": node["power_w"],
        "quantity": node["quantity"],
        "provenance": provenance(node["provenance"]),
        "details": node["details"],
        "configuration": configuration(node["configuration"]),
        "children": [compact(child, provenance, configuration) for child in node["children"]],
    }


def totals(node):
    """Name, power and quantity for every node, depth first."""
    return [[node["name"], node["power_w"], node["quantity"]]] + [
        row for child in node["children"] for row in totals(child)
    ]


def evaluate(create, model, system, workload, scale_out, systems, gpu_watts, socket_watts):
    try:
        estimate = create(
            system=system,
            model=model,
            workload_state=workload,
            using_scale_out=scale_out,
            systems=systems,
        ).estimate_breakdown(gpu_watts, cpu_and_dram_measured_power_per_socket=socket_watts)
    except ValueError as error:
        return None, error_of(error)
    return estimate, None


def grid():
    """(system, workload, scale_out, systems, gpu_watts, socket_watts, detail) inputs."""
    from power_model.models.advanced.systems.catalog import SYSTEMS

    for system, system_class in SYSTEMS.items():
        rack = system_class.has_grace_sockets
        for workload, scale_out in itertools.product(WORKLOADS, SCALE_OUT):
            if rack and workload == "idle":
                # Grace has no idle profile: one modeled and one measured rejection suffice.
                for gpu_watts, socket_watts in ((700.0, None), (700.0, 98.066)):
                    yield system, workload, scale_out, 1, gpu_watts, socket_watts, False
                continue
            for gpu_watts in GPU_WATTS:
                for socket_watts in RACK_SOCKET_WATTS if rack else (None,):
                    if socket_watts not in (None, 98.066) and gpu_watts not in SPARSE_WATTS:
                        continue
                    detail = gpu_watts in DETAIL_WATTS and socket_watts in (None, 98.066)
                    yield system, workload, scale_out, 1, gpu_watts, socket_watts, detail
            for gpu_watts in CLUSTER_WATTS:
                for socket_watts in (None, 98.066) if rack else (None,):
                    yield system, workload, scale_out, 4, gpu_watts, socket_watts, False
            if not rack:
                # A chassis has no Grace socket to measure.
                yield system, workload, scale_out, 1, 700.0, 100.0, False


def cases(provenance, configuration):
    from power_model import create_power_model

    out = []
    for system, workload, scale_out, systems, gpu_watts, socket_watts, detail in grid():
        estimate, error = evaluate(
            create_power_model, "oss", system, workload, scale_out, systems, gpu_watts, socket_watts
        )
        case = {
            "model": "oss",
            "system": system,
            "workload_state": workload,
            "using_scale_out": scale_out,
            "systems": systems,
            "gpu_level_power_per_gpu": gpu_watts,
            "cpu_and_dram_measured_power_per_socket": socket_watts,
        }
        if error:
            case["error"] = error
        elif detail:
            dumped = estimate.model_dump(mode="json")
            dumped["components"] = [
                compact(node, provenance, configuration) for node in dumped["components"]
            ]
            case["estimate"] = dumped
        else:
            dumped = estimate.model_dump(mode="json")
            case["summary"] = {
                **{key: dumped[key] for key in SUMMARY_KEYS},
                # Every node's watts, depth first; detail cases pin the tree's shape.
                "component_power_w": [
                    row[1] for node in dumped["components"] for row in totals(node)
                ],
            }
        out.append(case)
    # The one-GPU example model: every workload, with and without a socket input.
    for system, workload, socket_watts in itertools.product(
        ("hopper", "gb200-nvl72"), WORKLOADS, (None, 100.0)
    ):
        estimate, error = evaluate(
            create_power_model, "example", system, workload, False, 1, 700.0, socket_watts
        )
        case = {
            "model": "example",
            "system": system,
            "workload_state": workload,
            "using_scale_out": False,
            "systems": 1,
            "gpu_level_power_per_gpu": 700.0,
            "cpu_and_dram_measured_power_per_socket": socket_watts,
        }
        if error:
            case["error"] = error
        else:
            dumped = estimate.model_dump(mode="json")
            dumped["components"] = [
                compact(node, provenance, configuration) for node in dumped["components"]
            ]
            case["estimate"] = dumped
        out.append(case)
    return out


def reports():
    from power_model import create_power_model
    from power_model.reporting import format_power_breakdown_per_chassis

    out = []
    for system, workload, scale_out, systems, gpu_watts, socket_watts in REPORT_CASES:
        estimate = create_power_model(
            system=system, workload_state=workload, using_scale_out=scale_out, systems=systems
        ).estimate_breakdown(gpu_watts, cpu_and_dram_measured_power_per_socket=socket_watts)
        out.append(
            {
                "system": system,
                "workload_state": workload,
                "using_scale_out": scale_out,
                "systems": systems,
                "gpu_level_power_per_gpu": gpu_watts,
                "cpu_and_dram_measured_power_per_socket": socket_watts,
                "text": format_power_breakdown_per_chassis(estimate),
            }
        )
    return out


def catalog():
    from power_model.models.advanced.systems.catalog import SYSTEMS, system_name

    names = [*SYSTEMS, *(cls.__name__ for cls in SYSTEMS.values()), "H100", "h200", "GB200", "gb300", "unknown"]
    return {
        "systems": {name: cls.__name__ for name, cls in SYSTEMS.items()},
        "aliases": {name: system_name(name) for name in names},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--inferencex",
        type=Path,
        default=Path(os.environ.get("INFERENCEX_REPO", REPO_ROOT.parent / "InferenceX")),
    )
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()
    provenance, configuration = Interner(), Interner()
    with tempfile.TemporaryDirectory() as workdir:
        tree, files = load_upstream(args.inferencex.resolve(), workdir)
        missing = sorted(set(SKIPPED) - set(files))
        if missing:
            raise SystemExit(f"Skipped modules are not upstream: {missing}")
        parity_cases = cases(provenance, configuration)
        parity_reports = reports()
        parity_catalog = catalog()
    outputs = {
        "power-model.manifest.json": {
            "modelRevision": REVISION,
            "sourceTree": tree,
            "sourceUrl": SOURCE_URL,
            "packagePath": PACKAGE_PATH,
            "pythonFiles": files,
            "skipped": SKIPPED,
        },
        "power-model.parity.json": {
            "modelRevision": REVISION,
            "provenances": provenance.values,
            "configurations": configuration.values,
            "catalog": parity_catalog,
            "cases": parity_cases,
            "reports": parity_reports,
        },
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, payload in outputs.items():
        # The small manifest is reviewed by hand; the fixture is stored minified
        # (and excluded from formatting in .prettierignore).
        indent = 2 if filename.endswith("manifest.json") else None
        separators = None if indent else (",", ":")
        (args.output_dir / filename).write_text(
            json.dumps(payload, indent=indent, separators=separators, allow_nan=False) + "\n"
        )
    errors = sum("error" in case for case in parity_cases)
    print(
        f"Wrote {len(files)} upstream modules ({len(SKIPPED)} skipped) and {len(parity_cases)} "
        f"parity cases ({errors} rejected) at {REVISION[:12]} (tree {tree[:12]})"
    )


if __name__ == "__main__":
    main()
