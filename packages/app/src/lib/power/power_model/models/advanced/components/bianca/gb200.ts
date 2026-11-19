// SPDX-License-Identifier: GPL-3.0-only

import { ValidationError } from '../../../../base';
import { BiancaBoard, type BiancaBoardFields } from './bianca';

export class GB200BiancaBoard extends BiancaBoard {
  static override readonly typeName: string = 'GB200BiancaBoard';
  static override readonly gpu_family: string = 'Blackwell';

  constructor({ gpu_tdp_w = 1200, ...fields }: Partial<BiancaBoardFields> = {}) {
    if (gpu_tdp_w !== 1200) throw new ValidationError('Input should be 1200');
    super({ gpu_tdp_w, ...fields });
  }
}
