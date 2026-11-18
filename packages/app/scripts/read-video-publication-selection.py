"""Resolve a merge dispatch's immutable selection before the App authorizes any writes."""

import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile


REPO = "SemiAnalysisAI/InferenceX"
FILENAME = "video-publication-selection.json"


def github(path):
    return subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"])


def read_selection(payload):
    if not ({"selection_artifact_id", "selection_sha256"} & payload.keys()):
        return None  # A dispatch from before selection manifests were introduced.
    artifact_id = payload.get("selection_artifact_id")
    digest = payload.get("selection_sha256")
    merge_id = payload.get("merge_run_id")
    if not (
        isinstance(artifact_id, str) and re.fullmatch(r"[1-9][0-9]*", artifact_id)
        and isinstance(merge_id, str) and re.fullmatch(r"[1-9][0-9]*", merge_id)
        and isinstance(digest, str) and re.fullmatch(r"[a-f0-9]{64}", digest)
    ):
        raise ValueError("Invalid video publication selection reference")
    run = json.loads(github(f"actions/runs/{merge_id}"))
    artifact = json.loads(github(f"actions/artifacts/{artifact_id}"))
    if not (
        str(run["id"]) == merge_id and run["event"] == "push"
        and run["path"] == ".github/workflows/merge-ingest.yml" and run["head_branch"] == "main"
        and run["repository"]["full_name"] == run["head_repository"]["full_name"] == REPO
        and str(artifact["id"]) == artifact_id and str(artifact["workflow_run"]["id"]) == merge_id
        and artifact["name"] == "video-publication-selection" and artifact["expired"] is False
    ):
        raise ValueError("Selection artifact does not belong to the main merge workflow")
    with zipfile.ZipFile(io.BytesIO(github(f"actions/artifacts/{artifact_id}/zip"))) as archive:
        data = archive.read(FILENAME)
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Video publication selection SHA256 mismatch")
    return data


if __name__ == "__main__":
    payload = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())["client_payload"]
    selection = read_selection(payload)
    if selection is not None:
        path = Path(os.environ["RUNNER_TEMP"]) / FILENAME
        path.write_bytes(selection)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            print(f"path={path}", file=output)
