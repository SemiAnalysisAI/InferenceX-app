import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admZip: vi.fn(),
  getEntries: vi.fn(),
}));

vi.mock('adm-zip', () => ({
  default: class MockAdmZip {
    constructor(zipPath: string) {
      mocks.admZip(zipPath);
    }

    getEntries() {
      return mocks.getEntries();
    }
  },
}));

import { readZipJsonAndText } from './zip-reader';

afterEach(() => {
  vi.clearAllMocks();
});

describe('readZipJsonAndText', () => {
  it('collects JSON and selected text with one archive traversal', () => {
    const metaData = vi.fn(() => Buffer.from('{"model":"test"}'));
    const resultsData = vi.fn(() => Buffer.from('{"results":{"task":{}}}'));
    const samplesData = vi.fn(() => Buffer.from('{"doc_id":1}\n'));
    const serverLogData = vi.fn(() => Buffer.from('deferred server log'));
    mocks.getEntries.mockReturnValue([
      { isDirectory: false, name: 'meta_env.json', getData: metaData },
      { isDirectory: false, name: 'results_task.json', getData: resultsData },
      { isDirectory: false, name: 'samples_task_123.jsonl', getData: samplesData },
      { isDirectory: false, name: 'server.log', getData: serverLogData },
    ]);

    const contents = readZipJsonAndText(
      'eval.zip',
      (name) => name.startsWith('samples_') && name.endsWith('.jsonl'),
    );

    expect(mocks.admZip).toHaveBeenCalledTimes(1);
    expect(mocks.getEntries).toHaveBeenCalledTimes(1);
    expect(metaData).toHaveBeenCalledTimes(1);
    expect(resultsData).toHaveBeenCalledTimes(1);
    expect(samplesData).toHaveBeenCalledTimes(1);
    expect(serverLogData).not.toHaveBeenCalled();
    expect(contents?.jsonFiles).toEqual(
      new Map([
        ['meta_env.json', { model: 'test' }],
        ['results_task.json', { results: { task: {} } }],
      ]),
    );
    expect(contents?.textFiles).toEqual(new Map([['samples_task_123.jsonl', '{"doc_id":1}\n']]));
  });
});
