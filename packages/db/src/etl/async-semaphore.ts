/** Minimal FIFO semaphore for bounding concurrent asynchronous operations. */
export class AsyncSemaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error(`Semaphore limit must be a positive integer, received ${limit}`);
    }
    this.limit = limit;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }
}
