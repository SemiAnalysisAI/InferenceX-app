// SPDX-License-Identifier: GPL-3.0-only
/** GB300 logical board variant, with a provisional shared LPDDR5X profile. */

import { ValidationError } from '../../../../base';
import { BiancaBoard, type BiancaBoardFields } from './bianca';

export class GB300BiancaBoard extends BiancaBoard {
  static override readonly typeName: string = 'GB300BiancaBoard';
  static override readonly gpu_family: string = 'Blackwell Ultra';

  constructor({ gpu_tdp_w = 1400, ...fields }: Partial<BiancaBoardFields> = {}) {
    if (gpu_tdp_w !== 1400) throw new ValidationError('Input should be 1400');
    super({ gpu_tdp_w, ...fields });
  }
}
