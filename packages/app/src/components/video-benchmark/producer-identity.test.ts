import { describe, expect, it } from 'vitest';
import { at, type Json } from './bundle';
import { producerIdentity } from './producer-identity';
import { servingCells } from './serving';
import { servingFixture } from './serving.fixture';

function set(value: Json, key: string, replacement: Json) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  value[key] = replacement;
}

function sealedIdentityFixture() {
  const bundle = servingFixture();
  const cells = servingCells(bundle);
  const identity = {
    modelRevision: 'a'.repeat(40),
    planSha256: 'c'.repeat(64),
    engine: { name: 'sglang', revision: 'b'.repeat(40) },
  };
  for (const document of [bundle.manifest, bundle.documents.get('serving-smoke.json') ?? null]) {
    set(document, 'plan_sha256', identity.planSha256);
    set(document, 'engine', structuredClone(identity.engine));
  }
  for (const cell of cells) {
    set(cell.run, 'plan_sha256', identity.planSha256);
    set(cell.job, 'plan_sha256', identity.planSha256);
    set(at(cell.run, 'configuration'), 'runtime', 'sglang');
  }
  return { bundle, cells, identity };
}

describe('producer engine and selected plan identity', () => {
  it('retains legacy unknown identity and accepts consistent sealed records independently of quality', () => {
    expect(producerIdentity(servingFixture(), [])).toBeNull();
    const { bundle, cells, identity } = sealedIdentityFixture();
    expect(producerIdentity(bundle, cells)).toEqual(identity);
    expect(producerIdentity(bundle, [])).toEqual(identity);
  });
  it('rejects selected plan, engine revision, model revision, and unsealed matrix substitutions', () => {
    for (const defect of [
      ({ cells }: ReturnType<typeof sealedIdentityFixture>) =>
        set(cells[0].run, 'plan_sha256', 'd'.repeat(64)),
      ({ cells }: ReturnType<typeof sealedIdentityFixture>) =>
        set(at(cells[0].run, 'configuration'), 'runtime_revision', 'd'.repeat(40)),
      ({ cells }: ReturnType<typeof sealedIdentityFixture>) =>
        set(at(cells[0].run, 'configuration'), 'model_revision', 'd'.repeat(40)),
      ({ bundle }: ReturnType<typeof sealedIdentityFixture>) =>
        bundle.checksums.delete('serving-smoke.json'),
    ]) {
      const fixture = sealedIdentityFixture();
      defect(fixture);
      expect(() => producerIdentity(fixture.bundle, fixture.cells)).toThrow(
        'does not match sealed execution',
      );
    }
  });
});
