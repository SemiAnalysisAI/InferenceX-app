#!/usr/bin/env python3
"""Regenerate fixed 8k1k profiles and parity cases from Oren's pinned Python models.

Usage: python3 packages/app/scripts/generate-system-power-reference.py /path/to/inferencex_power_model
Only Python's standard library is required. No telemetry, dependencies, or GPUs are fetched.
Apply the repository formatter to generated JSON before committing.

Chassis profiles (`profiles`) describe one eight-GPU HGX/OAM system whose GPU watts
are the only measured input. Rack profiles (`rackProfiles`) describe one NVL72 rack
whose compute-module watts per tray are measured (module sensor, or GPU board plus
Grace socket); the Grace CPU and LPDDR5X are never modelled.
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
# feat/gb200-nvl72-rack-model on top of ca4403aa (PR #10 merge); pending push to the upstream repo.
REVISION = "963ead8b20a722595c34f7f4a0041259501cf019"
REVISION_STATUS = "branch feat/gb200-nvl72-rack-model, child of ca4403aa527069857351ad8047dbb726844b3382; pending push upstream"
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
RACK_MODEL_PATH = "gb200_nvl72_rack/gb200_nvl72_rack_power_model.py"
RACK_MODELS = {
    "gb200": (RACK_MODEL_PATH, "gb200_nvl72_rack_power", "gb200_nvl72_rack_config"),
    "gb300": (RACK_MODEL_PATH, "gb200_nvl72_rack_power", "gb300_nvl72_rack_config"),
}
# Same fixed network utilization as the chassis sweep; the rack model has no CPU/DRAM inputs.
RACK_ASSUMPTIONS = {"u_nvlink": 0.50, "u_ib": 0.0, "u_pcie": 0.05, "pue": 1.20}
RACK_BASES = {"module": "module", "gpu_plus_grace": "gpu-plus-grace"}


def rack_expected(result):
    return {
        "computeModulesDcWatts": result["compute_modules_dc_w"],
        "regulatorAllowanceWatts": result["regulator_allowance_w"],
        "trayStaticDcWatts": result["tray_static_dc_w"],
        "nvswitchTraysDcWatts": result["nvswitch_trays_dc_w"],
        "trayConversionLossWatts": result["tray_conversion_loss_w"],
        "rackDcWatts": result["rack_dc_w"],
        "powerShelfEfficiency": result["power_shelf_efficiency"],
        "powerShelfLossWatts": result["power_shelf_loss_w"],
        "rackAcWatts": result["rack_ac_w"],
        "facilityWatts": result["facility_w"],
        "perGpuAcWatts": result["per_gpu_ac_w"],
        "perGpuFacilityWatts": result["per_gpu_facility_w"],
    }


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

    rack_profiles, rack_cases = {}, []
    for hardware, (model_path, function_name, config_factory) in RACK_MODELS.items():
        path = repo / "human_verified" / model_path
        sys.path.insert(0, str(path.parent))
        module = importlib.import_module(path.stem)
        function, cfg = getattr(module, function_name), getattr(module, config_factory)()
        utilization = {key: RACK_ASSUMPTIONS[key] for key in ("u_nvlink", "u_ib", "u_pcie")}
        # Everything except the measured compute modules and the shelf curve is fixed at
        # these utilizations. Keep the source's per-tray block order: the app re-sums it.
        tray_blocks, tray_details = module._compute_tray_static(
            cfg.compute_tray, u_ib=utilization["u_ib"], u_pcie=utilization["u_pcie"])
        nvswitch = module.nvswitch5_power(utilization["u_nvlink"], cfg.nvswitch)
        shelf = cfg.power_shelf
        rack_profiles[hardware] = {
            "modelPath": "human_verified/" + model_path,
            "functionName": function_name,
            "configFactory": config_factory,
            "topology": "nvl72-rack",
            "gpuCount": cfg.n_gpu,
            "computeTrayCount": cfg.n_compute_trays,
            "gpusPerComputeTray": cfg.compute_tray.n_gpu,
            "graceSocketsPerComputeTray": cfg.compute_tray.n_grace,
            "nvswitchTrayCount": cfg.n_nvswitch_trays,
            "assumptions": dict(RACK_ASSUMPTIONS),
            "defaultConfig": asdict(cfg),
            "computeTrayStaticDcWatts": tray_blocks,
            "computeTrayStaticDetails": tray_details,
            "nvswitchTraySiliconWatts": nvswitch["pair_w"],
            "nvswitchTrayResidualWatts": cfg.nvswitch_tray_residual_w,
            "managementSwitchCount": cfg.n_management_switches,
            "managementSwitchWatts": cfg.management_switch_w,
            "trayInputConversionEfficiency": cfg.tray_input_conversion_efficiency,
            "regulatorLossFracOfTdp": cfg.regulator_loss_frac_of_tdp,
            "regulatorAllowanceIncludesGrace": cfg.regulator_allowance_includes_grace,
            "powerShelf": {
                "installedCapacityWatts": shelf.installed_capacity_w,
                "redundantCapacityWatts": shelf.redundant_capacity_w,
                "efficiencyCurve": sorted(shelf.efficiency_curve.items()),
            },
            "unverifiedParameters": module.UNVERIFIED_PARAMETERS,
        }

        def evaluate_rack(basis, pue=1.2, **watts):
            return function(basis=basis, cfg=cfg, **{**utilization, "pue": pue}, **watts)

        installed, n_trays = shelf.installed_capacity_w, cfg.n_compute_trays
        # 5400 W/tray is the GB200 module TDP anchor (2 x 2700 W) from the research note.
        module_samples = {0.05, 1.25, 1000.25, 2000.0, 3000.75, 4000.0, 5400.0, 6000.0, 7200.0}
        baseline_dc = evaluate_rack("module", module_w_per_tray=0.0)["rack_dc_w"]
        # Both sides of every reachable shelf-efficiency knot, on rack DC load.
        for fraction in sorted(shelf.efficiency_curve):
            target = fraction * installed
            if not baseline_dc < target <= installed:
                continue
            lo, hi = 0.0, installed / n_trays
            for _ in range(50):
                mid = (lo + hi) / 2
                try:
                    below = evaluate_rack("module", module_w_per_tray=mid)["rack_dc_w"] < target
                except ValueError:
                    below = False
                if below:
                    lo = mid
                else:
                    hi = mid
            module_samples.update(round(hi + offset, 3) for offset in (-0.2, 0.0, 0.2))
        module_samples.add(installed / n_trays)  # Shelf overflow must be unavailable, never clamped.
        for module_w in sorted(module_samples):
            for pue in (1.0, 1.1, 1.2):
                case = {"hardware": hardware, "basis": RACK_BASES["module"],
                        "moduleWattsPerTray": module_w, "pue": pue}
                try:
                    case["expected"] = rack_expected(evaluate_rack("module", pue, module_w_per_tray=module_w))
                except ValueError as error:
                    case["expected"] = None
                    case["referenceError"] = str(error)
                rack_cases.append(case)
        for gpu_w in (0.05, 1.25, 2000.0, 3000.25, 4800.0, 5600.0):
            for grace_w in (0.05, 300.0, 600.5):
                for pue in (1.0, 1.1):
                    result = evaluate_rack("gpu_plus_grace", pue, gpu_board_w_per_tray=gpu_w,
                                           grace_socket_w_per_tray=grace_w)
                    rack_cases.append({"hardware": hardware, "basis": RACK_BASES["gpu_plus_grace"],
                                       "gpuBoardWattsPerTray": gpu_w, "graceSocketWattsPerTray": grace_w,
                                       "pue": pue, "expected": rack_expected(result)})

    source_hashes = {}
    # Include the complete pinned Python implementation and plot entry points.
    for relative in git(repo, "ls-files", "*.py").splitlines():
        source_hashes[relative] = hashlib.sha256((repo / relative).read_bytes()).hexdigest()
    provenance = {
        "modelRevision": REVISION,
        "modelRevisionStatus": REVISION_STATUS,
        "source": SOURCE,
        "status": "DRAFT / pending human verification",
    }
    outputs = {
        "system-power-model.profiles.json": {
            **provenance,
            "assumptionsSource": f"{SOURCE}/blob/{REVISION}/README.md#chassis-models",
            "assumptions": ASSUMPTIONS,
            "rackAssumptionsSource": f"{SOURCE}/blob/{REVISION}/human_verified/{RACK_MODEL_PATH}",
            "rackAssumptions": RACK_ASSUMPTIONS,
            "sourceSha256": dict(sorted(source_hashes.items())),
            "profiles": profiles,
            "rackProfiles": rack_profiles,
        },
        "system-power-model.reference.json": {**provenance, "cases": cases, "rackCases": rack_cases},
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, payload in outputs.items():
        (args.output_dir / filename).write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(f"Generated {len(profiles)} chassis profiles, {len(rack_profiles)} rack profiles, "
          f"{len(cases)} chassis and {len(rack_cases)} rack Python reference cases at {REVISION}")


if __name__ == "__main__":
    main()
