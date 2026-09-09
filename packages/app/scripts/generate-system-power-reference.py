#!/usr/bin/env python3
"""Regenerate fixed 8k1k profiles and parity cases from Oren's pinned Python models.

Usage: python3 packages/app/scripts/generate-system-power-reference.py /path/to/inferencex_power_model
Only Python's standard library is required. No telemetry, dependencies, or GPUs are fetched.
Apply the repository formatter to generated JSON before committing.
"""

import argparse
from dataclasses import asdict
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
REVISION = "ca4403aa527069857351ad8047dbb726844b3382"
SOURCE = "https://github.com/SemiAnalysisAI/inferencex_power_model"
MODELS = {
    "h100": ("hgx_h100_chassis/h100_chassis_power_model.py", "h100_chassis_power", "make_h100_config"),
    "h200": ("hgx_h200_chassis/h200_chassis_power_model.py", "h200_chassis_power", "make_h200_config"),
    "b200": ("hgx_b200_chassis/b200_chassis_power_model.py", "b200_chassis_power", "B200ChassisMasterConfig"),
    "b300": ("hgx_b300_chassis/b300_chassis_power_model.py", "b300_chassis_power", "B300ChassisConfig"),
    "mi300x": ("mi300x_chassis/mi300x_chassis_power_model.py", "mi300x_chassis_power", "MI300XChassisConfig"),
    "mi325x": ("mi325x_chassis/mi325x_chassis_power_model.py", "mi325x_chassis_power", "MI325XChassisConfig"),
    "mi355x": ("mi355x_chassis/mi355x_chassis_power_model.py", "mi355x_chassis_power", "MI355XChassisConfig"),
}
ASSUMPTIONS = {"u_pcie": 0.05, "u_cpu": 0.20, "u_ram": 0.20, "u_nvme": 0.0, "pue": 1.20}


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model_repo", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "src/lib")
    args = parser.parse_args()
    repo = args.model_repo.resolve()
    if git(repo, "rev-parse", "HEAD") != REVISION:
        raise SystemExit(f"Model checkout must be pinned to {REVISION}")
    if git(repo, "status", "--porcelain", "--untracked-files=all", "--", "*.py", "README.md", "AGENTS.md"):
        raise SystemExit("Model Python sources or methodology files are dirty; use the clean pinned revision")

    profiles, cases = {}, []
    for hardware, (model_path, function_name, config_factory) in MODELS.items():
        path = repo / "human_verified" / model_path
        sys.path.insert(0, str(path.parent))
        module = importlib.import_module(path.stem)
        function, cfg = getattr(module, function_name), getattr(module, config_factory)()
        assumptions = dict(ASSUMPTIONS)
        assumptions.update({"u_eth": 0.0} if hardware.startswith("mi") else {"u_nvlink": 0.50, "u_ib": 0.0})
        if hardware in ("b200", "b300"):
            assumptions["u_dpu"] = 0.0
        baseline = function(0.0, cfg=cfg, **assumptions)
        fixed_components = {key: value for key, value in baseline["components_dc_w"].items()
                            if not key.endswith("_measured") and key != "chassis_fans"}
        fans, psu = cfg.fans, cfg.psu
        capacity = psu.active_capacity_w if hardware == "b200" else psu.load_sharing_capacity_w
        limit = psu.active_capacity_w if hardware == "b200" else (
            psu.redundant_capacity_w if hardware in ("h100", "h200") else psu.modeled_capacity_w)
        profiles[hardware] = {
            "modelPath": "human_verified/" + model_path,
            "functionName": function_name,
            "configFactory": config_factory,
            "gpuCount": 8,
            "assumptions": {**assumptions, "fan_pwm": None},
            "defaultConfig": asdict(cfg),
            "fixedComponentsDcWatts": fixed_components,
            "fan": {
                "electricalNameplateWatts": fans.electrical_nameplate_w,
                "electricalGroupsWatts": [fans.n_80mm * fans.rated_80mm_w, fans.n_60mm * fans.rated_60mm_w]
                if hardware == "b200" else [fans.electrical_nameplate_w],
                "minPwm": fans.min_pwm_frac,
                "maxPwm": fans.normal_max_pwm_frac,
                "fullCoolingLoadWatts": fans.full_cooling_load_w,
                "exponent": fans.fan_curve_exponent,
            },
            "psu": {
                "loadSharingCapacityWatts": capacity,
                "maxDcWatts": limit,
                "efficiencyCurve": sorted(psu.efficiency_curve.items()),
            },
        }

        def evaluate(gpu, pue=1.2):
            return function(gpu, cfg=cfg, **{**assumptions, "pue": pue})

        fixed = sum(fixed_components.values())
        samples = {0.05, 1.25, 1000.25, 1000.75, 2400.0, 4000.0, 5600.0}
        # Both sides of fan saturation and all reachable PSU interpolation knots.
        for boundary in (fans.full_cooling_load_w - fixed,):
            samples.update(round(boundary + offset, 3) for offset in (-0.2, 0.0, 0.2) if boundary + offset > 0)
        for fraction in sorted(psu.efficiency_curve):
            target = fraction * capacity
            if not baseline["dc_total_w"] < target <= limit:
                continue
            lo, hi = 0.0, limit
            for _ in range(50):
                mid = (lo + hi) / 2
                try:
                    below = evaluate(mid)["dc_total_w"] < target
                except ValueError:
                    below = False
                if below:
                    lo = mid
                else:
                    hi = mid
            samples.update(round(hi + offset, 3) for offset in (-0.2, 0.0, 0.2))
        samples.add(limit)  # Capacity overflow must be unavailable, never clamped.
        for gpu in sorted(samples):
            for pue in (1.0, 1.2):
                case = {"hardware": hardware, "measuredGpuWatts": gpu, "pue": pue}
                try:
                    result = evaluate(gpu, pue)
                    case["expected"] = {
                        "preFanDcWatts": result["pre_fan_dc_w"],
                        "fanWatts": result["components_dc_w"]["chassis_fans"],
                        "dcWatts": result["dc_total_w"],
                        "psuEfficiency": result["psu_efficiency"],
                        "psuLossWatts": result["psu_conversion_loss_w"],
                        "chassisAcWatts": result["ac_wall_w"],
                        "facilityWatts": result["utility_power_w"],
                    }
                except ValueError as error:
                    case["expected"] = None
                    case["referenceError"] = str(error)
                cases.append(case)

    source_hashes = {}
    # Include the complete pinned Python implementation and plot entry points.
    for relative in git(repo, "ls-files", "*.py").splitlines():
        source_hashes[relative] = hashlib.sha256((repo / relative).read_bytes()).hexdigest()
    provenance = {"modelRevision": REVISION, "source": SOURCE, "status": "DRAFT / pending human verification"}
    outputs = {
        "system-power-model.profiles.json": {
            **provenance,
            "assumptionsSource": f"{SOURCE}/blob/{REVISION}/README.md#chassis-models",
            "assumptions": ASSUMPTIONS,
            "sourceSha256": dict(sorted(source_hashes.items())),
            "profiles": profiles,
        },
        "system-power-model.reference.json": {**provenance, "cases": cases},
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, payload in outputs.items():
        (args.output_dir / filename).write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(f"Generated {len(profiles)} profiles and {len(cases)} Python reference cases at {REVISION}")


if __name__ == "__main__":
    main()
