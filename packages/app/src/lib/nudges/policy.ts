import type { NudgeDefinition } from './types';

export function dismissesOnAction(def: NudgeDefinition): boolean {
  return def.dismissOnAction ?? def.type !== 'banner';
}
