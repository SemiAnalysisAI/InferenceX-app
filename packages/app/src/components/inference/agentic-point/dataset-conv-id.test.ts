import { describe, expect, it } from 'vitest';

import { datasetConvId, subagentIdOf } from './request-timeline';

describe('datasetConvId', () => {
  it('returns a plain conversation id unchanged', () => {
    expect(datasetConvId('002001296e8a8c38ad9d7cc436d691afc602')).toBe(
      '002001296e8a8c38ad9d7cc436d691afc602',
    );
  });

  it('strips a ::sa: subagent suffix to the parent conv id', () => {
    expect(datasetConvId('002001296e8a8c38ad9d7cc436d691afc602::sa:subagent_004_27c95af7')).toBe(
      '002001296e8a8c38ad9d7cc436d691afc602',
    );
  });

  it('strips a ::fa: forked-agent suffix', () => {
    expect(datasetConvId('02bc0afb13f7a2d9efa86c28511261d85c0e::fa:007')).toBe(
      '02bc0afb13f7a2d9efa86c28511261d85c0e',
    );
  });

  it('strips at the first :: even with a trailing stream index', () => {
    expect(datasetConvId('abc::sa:agent_1:s2')).toBe('abc');
  });
});

describe('subagentIdOf', () => {
  it('returns null for a main-conversation cid', () => {
    expect(subagentIdOf('002001296e8a8c38ad9d7cc436d691afc602')).toBeNull();
  });

  it('extracts the subagent id from a ::sa: cid', () => {
    expect(subagentIdOf('002001296e8a8c38ad9d7cc436d691afc602::sa:subagent_004_27c95af7')).toBe(
      'subagent_004_27c95af7',
    );
  });

  it('drops a trailing :s<stream> index from the subagent id', () => {
    expect(subagentIdOf('abc::sa:subagent_001_f552fe6f:s3')).toBe('subagent_001_f552fe6f');
  });

  it('drops an :aux:<n> stream suffix from the subagent id', () => {
    expect(subagentIdOf('04dba6fe::sa:subagent_001_b00fdc12:aux:011')).toBe(
      'subagent_001_b00fdc12',
    );
  });

  it('returns null for a ::fa: forked-agent cid (no matching subagent group)', () => {
    expect(subagentIdOf('02bc0afb13f7a2d9efa86c28511261d85c0e::fa:007')).toBeNull();
  });
});
