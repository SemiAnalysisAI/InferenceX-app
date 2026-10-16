// SPDX-License-Identifier: GPL-3.0-only
/** Common board interface for NVIDIA eight-way HGX systems. */

import { UniversalBaseBoard } from './ubb';

/** Eight GPUs with non-GPU inventory modeled by a concrete board. */
export abstract class NVIDIA8WayHGXBoard extends UniversalBaseBoard {
  static override readonly typeName: string = 'NVIDIA8WayHGXBoard';
}
