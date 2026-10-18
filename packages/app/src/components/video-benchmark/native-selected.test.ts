import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { archiveSources } from './archive';
import { loadBundle } from './bundle';
import { videoHistoryEntry } from './history';
import { producerIdentity } from './producer-identity';
import { servingCells } from './serving';

const models = {
  h3: {
    id: 'MiniMaxAI/MiniMax-H3',
    revision: '42ed227ee7df40d41602854ae760620d6eb651fe',
    plan: '83d0bee3463cd6fa2ea3bdc58453ba1e4eeb85e05b4a541edc0ccfa88235d082',
    head: '3f9839c6826a9b530281e948ad240ea1a9e82702',
    gpus: 2,
  },
  wan: {
    id: 'Wan-AI/Wan2.2-T2V-A14B-Diffusers',
    revision: '5be7df9619b54f4e2667b2755bc6a756675b5cd7',
    plan: '45b82c5b06bfcac61c991abfdeba2aa4cbbe193e8d310f2b82edca4732c40407',
    head: '4bfb66cae86cf7402fa466712ebf28c5e766c003',
    gpus: 8,
  },
};
const engines = {
  sglang: '71de97b264b04dcd514cf904003028aefe9775c8',
  'vllm-omni': 'a8576ccb725c4e21cd13c3eb5f9a546b21149d2b',
};
const cases = [
  ['h3', 'sglang', '71661e9e20680342ae3bbc2bb35b3ee72438c3698bf9685d509dcb0d43beb24e'],
  ['h3', 'vllm-omni', '03a4c54e5f629775129b94e2e1d05958700e617125a6186c39a9d0606c40a877'],
  ['wan', 'sglang', '98cbcc5111637644461ac1245cfe90a23958b3015e7c3b9bea797df9ed328484'],
  ['wan', 'vllm-omni', '2808da396d1efd80b3eec389ee551752e9022e9685ade9132de3235e7cfcb2bb'],
] satisfies [keyof typeof models, keyof typeof engines, string][];

it.each(cases)(
  'imports the %s %s selected-YAML writer replay into History',
  async (model, engine, fingerprint) => {
    const expected = models[model];
    const bytes = await readFile(
      join(import.meta.dirname, 'fixtures', 'native-selected', `${model}-${engine}.zip`),
    );
    const artifact = {
      id: 1,
      name: `h3-results-123-2-${fingerprint}`,
      expired: false,
      size_in_bytes: bytes.length,
      workflow_run: { id: 123, head_sha: expected.head },
    };
    const [source] = await archiveSources(new Blob([new Uint8Array(bytes)]), artifact);
    const bundle = await loadBundle(source.read);
    const cells = servingCells(bundle);
    const identity = {
      modelRevision: expected.revision,
      planSha256: expected.plan,
      engine: { name: engine, revision: engines[engine] },
    };
    expect(cells).toHaveLength(1);
    expect(producerIdentity(bundle, cells)).toEqual(identity);
    const entry = videoHistoryEntry(
      {
        storageVersion: 1,
        runId: '123',
        artifact,
        sources: [
          {
            id: source.id,
            documents: [...bundle.documents],
            checksums: [...bundle.checksums],
            assets: [],
            texts: [],
          },
        ],
      },
      null,
    );
    expect(entry.sources[0]).toMatchObject({
      error: null,
      model: expected.id,
      execution: 'complete',
      producer: identity,
      releaseQualified: false,
      observations: [
        {
          cell: 'c1',
          concurrency: 1,
          scheduled: 20,
          completed: 20,
          valid: 20,
          samples: 20,
          participating: expected.gpus,
          quality: null,
        },
      ],
    });
  },
);
