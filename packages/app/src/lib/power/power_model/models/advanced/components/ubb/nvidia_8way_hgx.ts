// SPDX-License-Identifier: GPL-3.0-only

import { UniversalBaseBoard } from './ubb';

export abstract class NVIDIA8WayHGXBoard extends UniversalBaseBoard {
  static override readonly typeName: string = 'NVIDIA8WayHGXBoard';
}
