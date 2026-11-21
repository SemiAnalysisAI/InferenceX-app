import { afterEach, describe, expect, it, mock } from 'bun:test';

import { readZipJsonAndText } from './zip-reader';

const mocks = {
  admZip: mock(),
  getEntries: mock(),
};

mock.module('adm-zip', () => ({
  default: class MockAdmZip {
    constructor(zipPath: string) {
      mocks.admZip(zipPath);
    }

    getEntries() {
      return mocks.getEntries();
    }
  },
}));

afterEach(() => {
  mock.clearAllMocks();
});

describe('readZipJsonAndText', () => {
  it('collects JSON and selected text with one archive traversal', () => {
    const metaData = mock(() => Buffer.from('{"model":"test"}'));
    const resultsData = mock(() => Buffer.from('{"results":{"task":{}}}'));
    const samplesData = mock(() => Buffer.from('{"doc_id":1}\n'));
    const serverLogData = mock(() => Buffer.from('deferred server log'));
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
