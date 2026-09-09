import { at, entries, ROLES, rows, sha256, text, type Json } from './bundle';
import { servingFixture } from './serving.fixture';
import type { CIArtifact } from './archive';
import type { StoredArtifact, StoredSource } from './stored';

const object = (value: Json) => Object.fromEntries(entries(value));
const asset = (id: string, path: string) => ({
  url: `https://synthetic.public.blob.vercel-storage.com/${id}/${path}`,
  downloadUrl: `https://synthetic.public.blob.vercel-storage.com/${id}/${path}?download=1`,
});

// Every byte is synthetic test data. The .mp4 bodies are deliberately not playable media.
export async function fidelityFixture({ pairs = 2, failedPairs = 1 } = {}) {
  const runId = '789';
  const artifact: CIArtifact = {
    id: 987,
    name: `h3-fidelity-${runId}-1`,
    expired: false,
    size_in_bytes: 1,
  };
  const files = new Map<string, Blob>();
  const originals: StoredArtifact[] = [];
  const originalFiles = new Map<string, Map<string, Blob>>();
  const sourceArtifacts: Json[] = [];
  const roleResults: Record<string, Json> = {};
  const observations: Record<string, Json[]> = {};
  for (const [index, role] of ROLES.entries()) {
    const id = String(101 + index);
    const original = servingFixture(id, `Synthetic ${role} GPU`, pairs);
    const sourceFiles = new Map<string, Blob>();
    const sourceChecksums = new Map<string, string>();
    const save = async (path: string, value: Json | Blob) => {
      const blob = value instanceof Blob ? value : new Blob([JSON.stringify(value)]);
      sourceFiles.set(path, blob);
      const hash = await sha256(blob);
      sourceChecksums.set(path, hash);
      return hash;
    };
    const root = 'gpu/c1';
    const requestRun = object(original.documents.get(`${root}/baseline/run.json`)!);
    const records = rows(at(requestRun, 'records'));
    for (const [n, record] of records.entries()) {
      const path = `${root}/baseline/${text(at(record, 'artifact_path'))}`;
      const blob = new Blob([`Synthetic non-playable ${role} clip ${n}; test fixture only`]);
      const hash = await save(path, blob);
      Object.assign(record!, { sha256: hash, prompt: `Synthetic test prompt ${n}`, seed: n });
      if (at(record, 'phase') === 'measurement') files.set(`report/index_assets/${hash}.mp4`, blob);
    }
    const runHash = await save(`${root}/baseline/run.json`, requestRun);
    const specHash = await save(`${root}/spec.json`, original.documents.get(`${root}/spec.json`)!);
    const job = object(original.documents.get(`${root}/gpu-job.json`)!);
    job.spec_sha256 = specHash;
    Object.assign(at(job, 'roles', 'baseline')!, { run_sha256: runHash });
    const jobHash = await save(`${root}/gpu-job.json`, job);
    const powerHash = await save(
      `${root}/power.json`,
      original.documents.get(`${root}/power.json`)!,
    );
    const matrix = object(original.documents.get('serving-smoke.json')!);
    const cell = object(rows(at(matrix, 'cells'))[0]);
    Object.assign(at(cell, 'run')!, { sha256: runHash });
    Object.assign(at(cell, 'receipt')!, { sha256: jobHash });
    Object.assign(at(cell, 'power')!, { sha256: powerHash });
    matrix.cells = [cell];
    const matrixHash = await save('serving-smoke.json', matrix);
    const manifest = {
      ...object(original.manifest),
      evidence: { 'serving-smoke.json': matrixHash },
    };
    const ci = { ...object(original.ci), site: { gpu_model: `Synthetic ${role} GPU` } };
    await save('manifest.json', manifest);
    await save('ci.json', ci);
    const seal = new Blob([
      [...sourceChecksums].map(([path, hash]) => `${hash}  ${path}`).join('\n'),
    ]);
    sourceFiles.set('SHA256SUMS', seal);
    const sealHash = await sha256(seal);
    const sourceArtifact = {
      id: 201 + index,
      name: `h3-video-${id}-1`,
      expired: false,
      size_in_bytes: 1,
      digest: `sha256:${sealHash}`,
      workflow_run: { id: Number(id), head_sha: at(manifest, 'git_commit') },
    };
    sourceArtifacts.push({
      ci: {
        databaseId: Number(id),
        headSha: at(manifest, 'git_commit'),
        runAttempt: 1,
        status: 'completed',
        conclusion: 'success',
        url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}`,
      },
      artifact: sourceArtifact,
      source_seal_sha256: sealHash,
    });
    for (const [sourcePath, target] of [
      ['manifest.json', 'manifest.json'],
      ['ci.json', 'ci.json'],
      ['serving-smoke.json', 'serving-smoke.json'],
      [`${root}/baseline/run.json`, 'c1-run.json'],
      ['SHA256SUMS', 'original-SHA256SUMS'],
    ])
      files.set(`sources/${id}/${target}`, sourceFiles.get(sourcePath)!);
    const sourceDocuments: [string, Json][] = [];
    for (const [path, blob] of sourceFiles)
      if (path.endsWith('.json')) sourceDocuments.push([path, JSON.parse(await blob.text())]);
    originals.push({
      storageVersion: 1,
      runId: id,
      artifact: sourceArtifact,
      sources: [
        {
          id,
          documents: sourceDocuments,
          checksums: [...sourceChecksums],
          assets: [...sourceFiles.keys()].map((path) => [path, asset(id, path)]),
          texts: [],
        },
      ],
    });
    originalFiles.set(id, sourceFiles);
    roleResults[role] = {
      run_id: `synthetic-${role}`,
      configuration: at(requestRun, 'configuration'),
      run_bundle_sha256: runHash,
      summary: at(requestRun, 'summary'),
    };
    observations[role] = records
      .filter((record) => at(record, 'phase') === 'measurement')
      .map((record) => {
        const path = `/synthetic-runner/${id}/${text(at(record, 'artifact_path'))}`;
        return {
          status: 'succeeded',
          attempted: true,
          artifact_path: path,
          sha256: at(record, 'sha256'),
          latency_seconds: 120 - index * 10,
          latency_boundary: 'submit_to_downloaded_media',
          media: { ...object(at(record, 'media')), path, sha256: at(record, 'sha256') },
        };
      });
  }
  const comparison: Json = {
    bundle_type: 'mvp_comparison',
    bundle_version: '0.1.0',
    producer: {
      run_id: runId,
      run_attempt: '1',
      git_commit: 'd'.repeat(40),
      run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`,
      mode: 'Synthetic CPU comparison fixture; no generation',
    },
    source_artifacts: sourceArtifacts,
    ...roleResults,
    plan: { generation: { duration_seconds: 8, width: 1344, height: 768, fps: 24 } },
    policy: { calibration_status: 'uncalibrated', min_video_psnr_db: 30 },
    overall_status: failedPairs ? 'fail' : 'pass',
    release_qualified: false,
    release_qualification_reason: 'Synthetic fixture; not a benchmark or release qualification.',
    measurement: { performance_mode: 'descriptive_only', boundary: 'submit_to_downloaded_media' },
    limitations: ['Synthetic test data; media bytes are not playable.'],
    summary: {
      measurement_slots: pairs,
      matched_valid_pairs: pairs,
      passed_slots: pairs - failedPairs,
      failed_slots: failedPairs,
      inconclusive_slots: 0,
    },
    slots: Array.from({ length: pairs }, (_, index): Json => ({
      slot_id: `measurement-r${String(index + 1).padStart(3, '0')}-c001`,
      case_id: `synthetic-case-${index + 1}`,
      prompt: `Synthetic test prompt ${index + 1}`,
      seed: index + 1,
      status: index < failedPairs ? 'fail' : 'pass',
      baseline: observations.baseline[index],
      candidate: observations.candidate[index],
      metrics: {
        video_psnr_db: index < failedPairs ? 27 : 35,
        video_mae: 0.02,
        audio_spectral_cosine: 0.96,
        audio_rms_ratio: 1,
        audio_waveform_mae: 0.03,
        video_compared_frames: 192,
        video_total_frames: 192,
        video_sample_coverage_fraction: 1,
        audio_sample_coverage_fraction: 1,
        audio_compared_samples_per_channel: 256000,
      },
      checks: [
        { name: 'baseline.media_validity', status: 'pass' },
        { name: 'candidate.media_validity', status: 'pass' },
        {
          name: 'fidelity.video_psnr',
          status: index < failedPairs ? 'fail' : 'pass',
          observed: index < failedPairs ? 27 : 35,
          threshold: 30,
          unit: 'dB',
        },
      ],
    })),
  };
  const portable = object(structuredClone(comparison));
  portable.report = { html: 'index.html', portable_assets: 'index_assets', scripts: false };
  for (const slot of rows(at(portable, 'slots')))
    for (const role of ROLES) {
      const observation = at(slot, role);
      const path = `index_assets/${at(observation, 'sha256')}.mp4`;
      Object.assign(observation!, { artifact_path: path, artifact_path_base: 'report_directory' });
      Object.assign(at(observation, 'media')!, { path });
    }
  const firstMedia = text(at(portable, 'slots', 0, 'baseline', 'artifact_path'));
  const html = `<h1>Synthetic report only</h1><video controls src="${firstMedia}"></video><a href="index.comparison.json" download>Raw portable comparison</a><script>document.body.dataset.scriptRan='yes'</script><img src="https://outside.example.test/tracker.png">`;
  files.set('comparison.json', new Blob([JSON.stringify(comparison)]));
  files.set('report/index.comparison.json', new Blob([JSON.stringify(portable)]));
  files.set('report/index.html', new Blob([html]));
  const checksums = new Map<string, string>();
  const documents = new Map<string, Json>();
  for (const [path, blob] of files) {
    checksums.set(path, await sha256(blob));
    if (path.endsWith('.json')) documents.set(path, JSON.parse(await blob.text()));
  }
  files.set(
    'SHA256SUMS',
    new Blob([[...checksums].map(([path, hash]) => `${hash}  ${path}`).join('\n')]),
  );
  const published: StoredSource = {
    id: runId,
    kind: 'fidelity',
    documents: [...documents],
    checksums: [...checksums],
    assets: [...files.keys()].map((path) => [path, asset(runId, path)]),
    texts: [['report/index.html', html]],
  };
  const read = (path: string) => {
    const file = files.get(path);
    if (!file) throw new Error(`Missing synthetic fixture file: ${path}`);
    return Promise.resolve(file);
  };
  return {
    runId,
    artifact,
    files,
    read,
    documents,
    checksums,
    published,
    originals,
    originalFiles,
    comparison,
    portable,
  };
}
