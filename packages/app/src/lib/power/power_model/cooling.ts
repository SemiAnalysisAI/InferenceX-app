// SPDX-License-Identifier: GPL-3.0-only

import { FrozenModel, ValidationError } from './base';

export type CoolingMode = 'air' | 'liquid';

const PUE: Record<CoolingMode, number> = { air: 1.3, liquid: 1.1 };

export class CoolingProfile extends FrozenModel {
  static override readonly typeName: string = 'CoolingProfile';
  readonly mode: CoolingMode;

  constructor({ mode }: { mode: CoolingMode }) {
    super();
    if (!Object.hasOwn(PUE, mode)) throw new ValidationError("Input should be 'air' or 'liquid'");
    this.mode = mode;
  }

  get pue(): number {
    return PUE[this.mode];
  }

  protected fields() {
    return { mode: this.mode };
  }
}
