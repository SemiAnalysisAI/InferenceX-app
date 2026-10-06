# Preview legacy AMD-SMI power retirement

The PowerX source policy retires direct AMD-SMI `socket_power` values, even when their numerical validation passed. The benchmark result and its throughput, latency, configuration, run, and raw audit evidence remain. This preview makes no database changes. It does not mark a retired source as a measurement failure.

Run the preview against retained source evidence before connecting to a database:

```sh
bun packages/db/src/preview-amd-smi-retirement.ts \
  --evidence /path/to/source-findings.json \
  --artifact-root /path/to/retained-artifacts \
  > /path/to/amd-smi-preview.json
```

The evidence file contains `source_identified_points`, with each result's run ID, attempt, source commit, artifact CSV path, CSV SHA256, collector command, metric, hardware, and API run URL. The preview reads the original CSV and requires its SHA256 and `timestamp,gpu,socket_power` columns to match. It rejects a DME `LOGS/power/samples.csv` even if someone labels that record AMD-SMI. The saved September 29 evidence currently verifies two exact results, 443533 and 431819. Those are examples, not complete historical coverage.

To compare the evidence with every retained AMD benchmark row, provide `DATABASE_READONLY_URL` and add `--db`. The script calls only `getDb()`, the repository's read-only client, and emits one JSON preview. Save that output securely because it contains internal run and result identities. `verifiedRetirementCandidates` match result ID, GitHub run ID, attempt, source commit, hardware, and any stored telemetry CSV SHA. `unresolvedRows` need original-source recovery or a documented exclusion from this policy before a production change. An absent telemetry series leaves series coverage unknown; it does not prove that the benchmark power has a different source. The script lists the existing W/J fields and worker presence, but does not remove either.

```sh
bun packages/db/src/preview-amd-smi-retirement.ts \
  --evidence /path/to/source-findings.json \
  --artifact-root /path/to/retained-artifacts \
  --db > /path/to/amd-smi-db-preview.json
```

Before applying the policy, complete the original-source inventory across retained DB history. Review the exact benchmark IDs and shared series links. Capture original `metrics`, `workers`, `power_audit`, validation documents, telemetry series, samples, statistics, links, and file hashes. The later writer must remove only retired GPU W/J fields and worker power from published benchmark rows; preserve performance and audit data. It also needs a durable source identity that makes CI ingest, backfill, retained-row reuse, run and point reads, Timeline, views, and live GitHub fallback honor the same retirement after retries. `power_valid=0` would falsely describe a policy retirement as failed measurement validation. Do not use run or point purge helpers, which delete benchmark evidence.

The current checkout has no durable source-retirement rule, and the saved API snapshot does not enumerate all historical DB rows or collector identities. This preview is a source inventory and a proposed target list. It is not a production cleanup command.
