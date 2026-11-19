import { readFileSync } from 'node:fs';

import { BaseSequencer, type TestSpecification } from 'vitest/node';

const environmentDocblock = /@(?:vitest|jest)-environment\s+(?<name>[\w-]+)\b/;

export class EnvironmentGroupedSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const groups = Map.groupBy(
      await super.sort(files),
      (file) => readFileSync(file.moduleId, 'utf8').match(environmentDocblock)?.groups?.name ?? '',
    );
    return [...groups.values()].flat();
  }
}
