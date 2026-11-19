// SPDX-License-Identifier: GPL-3.0-only

import { ValidationError } from '../../../../base';
import { AMD8WayUBB } from './amd_8way_ubb';
import type { UniversalBaseBoardFields } from './ubb';

export class MI355UBB extends AMD8WayUBB {
  static override readonly typeName: string = 'MI355UBB';

  constructor({ gpu_tdp_w = 1400, ...fields }: Partial<UniversalBaseBoardFields> = {}) {
    if (gpu_tdp_w !== 1400) throw new ValidationError('Input should be 1400');
    super({ gpu_tdp_w, ...fields });
  }
}
