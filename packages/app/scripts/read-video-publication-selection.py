"""Resolve a merge dispatch's immutable selection before the App authorizes any writes."""

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
    artifact_id = payload.get("selection_artifact_id")
    merge_id = payload.get("merge_run_id")
    if not (
        isinstance(artifact_id, str) and re.fullmatch(r"[1-9][0-9]*", artifact_id)
        and isinstance(merge_id, str) and re.fullmatch(r"[1-9][0-9]*", merge_id)
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
        return archive.read(FILENAME)


if __name__ == "__main__":
    payload = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())["client_payload"]
    path = Path(os.environ["RUNNER_TEMP"]) / FILENAME
    path.write_bytes(read_selection(payload))
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        print(f"path={path}", file=output)
