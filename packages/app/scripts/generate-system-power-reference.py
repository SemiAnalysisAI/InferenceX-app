#!/usr/bin/env python3
"""Regenerate system-power profiles and parity cases from the pinned InferenceX power model.

Usage: python3 packages/app/scripts/generate-system-power-reference.py [--inferencex PATH]

PATH is a local SemiAnalysisAI/InferenceX clone that contains REVISION (default:
$INFERENCEX_REPO, else an InferenceX checkout next to this repository). The script
extracts power_model at REVISION into a temporary directory and imports it, so it
needs Python >= 3.12 with pydantic 2, the upstream package's only dependency.
It asserts that the closed form evaluated by system-power-model.ts reproduces
the upstream estimate before writing anything. Output is byte-stable across reruns.
"""

import argparse
import io
import itertools
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

sys.dont_write_bytecode = True
REVISION = "dc717fb5d58620bee3bbb579b5e25160b21ce45d"
SOURCE_PATH = "power_model"
SOURCE_URL = f"https://github.com/SemiAnalysisAI/InferenceX/tree/{REVISION}/{SOURCE_PATH}"
REPO_ROOT = Path(__file__).resolve().parents[3]
# App hardware identity -> upstream system key. GB200/GB300 are rack-scale models, not chassis.
SYSTEMS = {
    "h100": "hopper",
    "h200": "hopper",
    "b200": "b200",
    "b300": "b300",
    "mi300x": "mi300",
    "mi325x": "mi325",
    "mi355x": "mi355",
}
WORKLOADS = ("fixed-seq-len", "agentic", "agentic-cpu-offloading")
SCALE_OUT = (False, True)
REL_TOL = 1e-12


def flag(scale_out):
    return "true" if scale_out else "false"


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
    source = Path(workdir) / SOURCE_PATH / "src"
    sys.path.insert(0, str(source))
    return tree


def profile(system):
    from power_model import OperatingState
    from power_model.models.advanced.components.hgx_fans import NormalizedHGXFanPower
    from power_model.models.advanced.systems.catalog import get_system_class
    from power_model.models.advanced.systems.hgx import HGXSystemChassis

    system_class = get_system_class(system)
    hardware = system_class()
    if not isinstance(hardware, HGXSystemChassis) or hardware.gpu_count != 8:
        raise SystemExit(f"{system} is not an eight-GPU HGX/OAM chassis")
    if system_class.default_cooling.mode != "air":
        raise SystemExit(f"{system} is not air-cooled; the app describes every chassis as air-cooled")
    fan = hardware.resolved_fan_power
    if not isinstance(fan, NormalizedHGXFanPower):
        raise SystemExit(f"{system} fan model {type(fan).__name__} has no closed form here")
    fixed_dc, network = {}, {}
    for workload, scale_out in itertools.product(WORKLOADS, SCALE_OUT):
        state = OperatingState(workload_state=workload, using_scale_out=scale_out)
        board = hardware.ubb.for_operating_state(state).estimate_breakdown(0)
        generic = [group.estimate_breakdown() for group in hardware._component_groups(state)]
        fixed_dc.setdefault(workload, {})[flag(scale_out)] = math.fsum(
            [board.power_w, *(node.power_w for node in generic)]
        )
        watts = math.fsum(
            group.estimate_breakdown(operating_state=state).power_w
            for group in system_class.default_networking
        )
        if network.setdefault(flag(scale_out), watts) != watts:
            raise SystemExit(f"{system} network power depends on the workload state")
    policy = fan.policy
    return {
        "system": system,
        "fixedDcWatts": fixed_dc,
        "networkWatts": network,
        "fan": {
            "fullCoolingLoadWatts": fan.full_cooling_load_w,
            "electricalNameplateWatts": fan.electrical_nameplate_w,
            "minPwm": policy.min_pwm_frac,
            "maxPwm": policy.normal_max_pwm_frac,
            "exponent": policy.fan_curve_exponent,
        },
        "psu": {
            "loadSharingCapacityWatts": hardware.psu.load_sharing_capacity_w,
            "modeledCapacityWatts": hardware.psu.modeled_capacity_w,
            "efficiencyCurve": [
                {"loadFraction": point.load_fraction, "efficiency": point.efficiency}
                for point in hardware.psu.efficiency_curve
            ],
        },
        "pue": system_class.default_cooling.pue,
    }


def psu_efficiency(curve, fraction):
    first, last = curve[0], curve[-1]
    if fraction <= first["loadFraction"]:
        return first["efficiency"]
    if fraction >= last["loadFraction"]:
        return last["efficiency"]
    for left, right in zip(curve, curve[1:]):
        if fraction <= right["loadFraction"]:
            weight = (fraction - left["loadFraction"]) / (
                right["loadFraction"] - left["loadFraction"]
            )
            return left["efficiency"] + weight * (right["efficiency"] - left["efficiency"])


def dc_watts(p, gpu_watts_per_gpu, workload, scale_out):
    component_dc = 8 * gpu_watts_per_gpu + p["fixedDcWatts"][workload][flag(scale_out)]
    fan = p["fan"]
    load = min(1.0, component_dc / fan["fullCoolingLoadWatts"])
    pwm = fan["minPwm"] + (fan["maxPwm"] - fan["minPwm"]) * load ** fan["exponent"]
    pwm = min(fan["maxPwm"], max(fan["minPwm"], pwm))
    return component_dc + fan["electricalNameplateWatts"] * pwm**3


def closed_form(p, gpu_watts_per_gpu, workload, scale_out):
    """The system-power-model.ts evaluation, line for line."""
    dc = dc_watts(p, gpu_watts_per_gpu, workload, scale_out)
    psu = p["psu"]
    if dc > psu["modeledCapacityWatts"]:
        return None
    efficiency = psu_efficiency(psu["efficiencyCurve"], dc / psu["loadSharingCapacityWatts"])
    it = dc / efficiency + p["networkWatts"][flag(scale_out)]
    return {"itWatts": it, "facilityWatts": it * p["pue"]}


def upstream(system, gpu_watts_per_gpu, workload, scale_out):
    from power_model import create_power_model

    model = create_power_model(system=system, workload_state=workload, using_scale_out=scale_out)
    try:
        result = model.estimate_breakdown(gpu_watts_per_gpu)
    except ValueError as error:
        return None, str(error)
    return {"itWatts": result.it_power_w, "facilityWatts": result.facility_power_w}, None


def gpu_watts_where(p, workload, scale_out, dc_target):
    """Smallest GPU watts per GPU whose chassis DC load reaches dc_target (DC rises with GPU power)."""
    lo, hi = 0.0, dc_target / 8
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if dc_watts(p, mid, workload, scale_out) < dc_target else (lo, mid)
    return hi


def assert_closed_form(system, p):
    worst = 0.0
    for workload, scale_out in itertools.product(WORKLOADS, SCALE_OUT):
        psu = p["psu"]
        limit = gpu_watts_where(p, workload, scale_out, psu["modeledCapacityWatts"])
        boundaries = [
            (p["fan"]["fullCoolingLoadWatts"] - p["fixedDcWatts"][workload][flag(scale_out)])
            / 8,
            *(
                gpu_watts_where(
                    p, workload, scale_out, point["loadFraction"] * psu["loadSharingCapacityWatts"]
                )
                for point in psu["efficiencyCurve"]
            ),
        ]
        grid = [limit * 1.25 * i / 400 for i in range(401)]
        grid += [b + d for b in boundaries for d in (-0.01, 0.0, 0.01) if b + d >= 0]
        grid += [limit - 0.001, limit + 0.001]
        for gpu_watts in grid:
            expected, error = upstream(system, gpu_watts, workload, scale_out)
            actual = closed_form(p, gpu_watts, workload, scale_out)
            where = f"{system} {workload} scale_out={scale_out} gpu={gpu_watts!r}"
            if (expected is None) != (actual is None):
                raise SystemExit(f"Domain mismatch at {where}: upstream={error or expected}")
            for key in expected or {}:
                worst = max(worst, abs(actual[key] - expected[key]) / expected[key])
                if not math.isclose(actual[key], expected[key], rel_tol=REL_TOL):
                    raise SystemExit(f"{key} mismatch at {where}: {actual[key]} != {expected[key]}")
    return worst


def reference_cases(hardware, p):
    from power_model.models.advanced.systems.catalog import get_system_class

    tdp = float(get_system_class(p["system"])().ubb.gpu_tdp_w)
    cases = []
    for workload, scale_out in itertools.product(WORKLOADS, SCALE_OUT):
        limit = gpu_watts_where(p, workload, scale_out, p["psu"]["modeledCapacityWatts"])
        # Idle, half and full TDP, the last in-domain and first out-of-domain whole 10 W.
        samples = (0.0, tdp / 2, tdp, math.floor(limit / 10) * 10.0, math.ceil(limit / 10) * 10.0)
        for gpu_watts in samples:
            expected, error = upstream(p["system"], gpu_watts, workload, scale_out)
            case = {
                "hardware": hardware,
                "workload": workload,
                "scaleOut": scale_out,
                "gpuWattsPerGpu": gpu_watts,
                "expected": expected,
            }
            if error:
                case["referenceError"] = error
            cases.append(case)
    if all(case["expected"] is not None for case in cases):
        raise SystemExit(f"{hardware} has no out-of-domain reference case")
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--inferencex",
        type=Path,
        default=Path(os.environ.get("INFERENCEX_REPO", REPO_ROOT.parent / "InferenceX")),
    )
    parser.add_argument("--output-dir", type=Path, default=REPO_ROOT / "packages/app/src/lib")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as workdir:
        tree = load_upstream(args.inferencex.resolve(), workdir)
        systems = {system: profile(system) for system in sorted(set(SYSTEMS.values()))}
        worst = max(assert_closed_form(system, p) for system, p in systems.items())
        profiles = {hardware: systems[system] for hardware, system in SYSTEMS.items()}
        cases = [case for hardware, p in profiles.items() for case in reference_cases(hardware, p)]
    outputs = {
        "system-power-model.profiles.json": {
            "modelRevision": REVISION,
            "sourceTree": tree,
            "sourceUrl": SOURCE_URL,
            "profiles": profiles,
        },
        "system-power-model.reference.json": {"modelRevision": REVISION, "cases": cases},
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, payload in outputs.items():
        (args.output_dir / filename).write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(
        f"Closed form matches upstream within {worst:.1e} relative; wrote {len(profiles)} profiles "
        f"and {len(cases)} reference cases at {REVISION[:12]} (tree {tree[:12]})"
    )


if __name__ == "__main__":
    main()
