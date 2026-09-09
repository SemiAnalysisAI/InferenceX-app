# H3 video artifact viewer

`/video` and `/zh/video` consume the existing H3 CI artifact from
[InferenceX PR #2894](https://github.com/SemiAnalysisAI/InferenceX/pull/2894).
They do not launch inference or define a new backend result schema.

## Review locally or in a PR preview

Download the complete `h3-video-<run-id>-<attempt>` GitHub Actions artifact, unzip
it, and choose **Open artifact folder**. Select the directory containing
`manifest.json` and `SHA256SUMS`. All files stay in browser memory. Nothing is
uploaded, persisted in localStorage, or bundled into the website. Reload or
Clear results releases the import. The 1 GiB bundle / 512 MiB file limits keep
this small smoke viewer bounded; larger runs need streaming storage.

The default reference download is the real
[eight-second clockwork-fox run 34293342829, artifact 10082823150](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34293342829/artifacts/10082823150)
at backend commit `65699f7c6f1c4d69a3226793251e6d2739ab60f4`.
The earlier [four-second run 34291306687, artifact 10081961245](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34291306687/artifacts/10081961245)
at `45c9d055dd17d2f023ce42ab7a6024fe2351b23a` uses the same contract.
Both are identical-revision A/A runs, not optimized candidates. GitHub may
require sign-in and expires these artifacts after 14 days. Download before
expiry. No fixture is preloaded as a result.

For a localhost URL that loads that downloaded bundle automatically:

```sh
bun install --frozen-lockfile
bun run dev --hostname 127.0.0.1 --port 3000
# In another terminal, use your extracted artifact's actual path:
python3 scripts/serve-h3-artifact.py /path/to/h3-video-34291306687-1
```

Open `http://127.0.0.1:3000/video?manifest=http%3A%2F%2F127.0.0.1%3A8769%2Fmanifest.json`.
The helper binds loopback, serves only inventoried files under that directory,
and allows CORS only from the local app on port 3000. The H3 route does not need
a database. `E2E_FIXTURES=1` can supply unrelated dashboard routes for repository
tests; it never supplies video results. Other ports can use folder import.

A PR preview opens the same viewer; collaborators use their own authorized
artifact download. **Sharing the page does not grant access to any media.**
An explicit HTTPS manifest-directory input is also supported for approved,
CORS-enabled public storage. No credentials are forwarded, redirects are rejected,
and URLs with embedded credentials/query tokens are rejected. Private or signed
single-object URLs should be downloaded and opened locally, not converted into a
public bucket. Deployed URLs never auto-fetch a manifest query parameter.

## Existing feature gate and deployment boundary

`use-feature-gate.ts` listens for **↑ ↑ ↓ ↓**, sets
`localStorage['inferencex-feature-gate'] = '1'`, and broadcasts
`inferencex:feature-gate:unlocked`. `tab-nav.tsx` derives hidden tabs from
`dashboard-routes.ts`. Video uses that registry with no global data providers,
English/Chinese routes, and `indexable: false`. Both routes send noindex metadata
and are excluded from the sitemap. Direct route access works while navigation is
locked, exactly because the feature gate is visibility, **not authorization**.

This change prepares the integration and PR preview. It does not authorize a
production merge/deployment, change deployment protections, or publish private
media. The import surface masks PostHog text and excludes autocapture; its only
explicit analytics event carries no bundle values.

## Backend contract and interpretation

| Source                                           | UI use                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `manifest.json` (`schema_version: 1`)            | Run/attempt, backend commit, frozen workload, model revision, declared resources and evidence hashes                     |
| `SHA256SUMS`                                     | Verify every listed file before displaying any results; missing, duplicate, unsafe or mismatched entries fail the import |
| `ci.json`                                        | Final execution/regression/qualification status; startup Slurm snapshots do not override final execution state           |
| `report/evidence.json` (`controlled_gpu_report`) | Role summaries, original media identities, observations/warmups and comparison checks                                    |
| `gpu/<role>/run.json`                            | Full completion accounting and recorded video/audio integrity checks                                                     |
| `gpu/gpu-job.json`                               | Observed GPU identities, launch flags, telemetry qualification and measured-window memory samples                        |
| `gpu/supervisor/<role>/telemetry.jsonl`          | Recorded board power, monotonic times, phase and owned GPU observations                                                  |
| `gpu/comparison.json`                            | Normalized video MAE, audio waveform MAE and paired coverage                                                             |
| `report/index.html` and content-addressed assets | Original report in a sandbox; scripts, external resources and forms disabled; original files downloadable                |

Checksums verify internal consistency, not source authenticity or independent
hardware attestation. Confirm the exact CI run and manifest digest. All displays
are recorded results or explicitly labeled arithmetic, not a fresh decode or
re-evaluation. Missing fields remain unavailable; a failed attempt without a
report still shows its final status and downloadable evidence.

- Latency is client submit → downloaded, validated media. It includes polling,
  transfer and local analysis; it is not GPU kernel latency.
- Clips/sec is valid clips / serial measured-block wall seconds, with warmup
  excluded. Counts retain failed/invalid and scheduled requests. It is not
  demonstrated saturated capacity, and a one-clip median is one observation.
- Power is the sum of observed participating-board watts, not TDP. The viewer
  integrates adjacent complete, owned `measurement` samples by trapezoids and
  divides by covered time for mean watts. It does not extrapolate endpoints or
  bridge missing/duplicate/out-of-order samples or gaps above 3× requested cadence.
  Backend telemetry qualification must be true. **This window includes warmup**
  and is shown with UTC endpoints and sample count. Energy is a sampled integral
  estimate (kJ), not facility energy or measured-only J/clip.
- Memory uses the backend's measurement-window per-GPU maximum in MiB, including
  warmup. Sampling can miss peaks; it is not framework allocator high-water usage.
- Video MAE is normalized RGB difference (0–1). Identical decoded frames have
  `video_identical: true` and null finite PSNR; null is not a failed comparison.
  Audio RMS ratio is candidate/baseline. Similarity and integrity are not
  perceptual quality, prompt adherence, lip sync, or release qualification.
- The top-level regression remains inconclusive when uncalibrated, even if
  individual fidelity checks pass and execution completes.

## Optional economics

The fields start without an assumed market price or cost. Enter USD/clip, a source
or explanation, and an as-of date. Billed GPU count defaults from Slurm `AllocTRES`
and is editable when a billing agreement differs; participating GPUs come from
recorded telemetry. With measured rate `q`, price `p`, billed count `B`,
participating count `P`, and all-in billed GPU-hour cost `c`:

- Total revenue/hour = `q × 3600 × p`.
- Revenue per participating/billed GPU-hour = revenue divided by `P` / `B`.
- Total profit/hour = revenue − `B × c`; divide by `P` / `B` for the two views.

Blank cost means unavailable profit, not zero cost. The cost must include rental
or amortization, electricity, cooling, host/network, storage, labor, licensing and
other overhead without double-counting included rental costs. Negative profit is
preserved. This is a full-demand extrapolation of serial throughput, excludes
startup/warmup, and does not claim realized revenue or sustainable serving capacity.
The four-second reference uses four participating GPUs and eight allocated GPUs.

## Persistent storage: remaining configuration

The existing app has public JSON Vercel Blob caching (`blob-cache.ts`,
`BLOB_READ_WRITE_TOKEN` plus `BLOB_CACHE_PREFIX`) and public GCS artifact-backup
readers. Those patterns do not establish approved private H3 media access.
No R2 client/configuration or R2 credential names were found in the app source,
example environment, current worktree environment, or readable GitHub secret-name
inventory on 2026-09-09 UTC. This does not inspect or assert the contents of Vercel's
remote environment.

A private persistent upload is blocked on: the approved bucket/account and S3
endpoint, an object-scoped write credential (R2 access-key ID and secret or an
approved worker binding), collaborator access policy/identity provider or signed
read service, and CORS origins. No bucket policy or credential was changed.
Reuse `report/assets/<sha256>.mp4` identities. A future approved publisher can
namespace the immutable full bundle by repository/run/attempt/manifest SHA256,
verify existing bytes before reusing objects, and preserve `SHA256SUMS` plus the
CI artifact reference. Do not overwrite an object with different bytes or treat
an unlisted public URL as private storage.

## Verification

`bundle.test.ts` covers checksum/path failures, partial attempts, missing data,
sampled power integration, invalid windows and both economics denominators.
To additionally read actual downloaded backend bytes:

```sh
H3_ARTIFACT_DIR=/path/to/extracted-artifact bun --cwd packages/app vitest run \
  src/components/video-benchmark/bundle.test.ts
```

`navigation.cy.ts` covers the real shared keyboard gate, English/Chinese noindex
routes, empty state and recoverable import errors. Verify actual media in a browser:
play each side with sound, switch to warmup and back, check original report playback,
download manifest/media and compare hashes, clear/reload, and retry after a bad URL.
Tests' synthetic contract data is test-only and is never a default demo result.
