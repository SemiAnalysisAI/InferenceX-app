type TaskRunner = <T>(task: () => Promise<T>) => Promise<T>;

/** Run asynchronous work under one shared concurrency ceiling. */
export function createTaskLimiter(maxConcurrent: number): TaskRunner {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
    throw new RangeError('maxConcurrent must be a positive integer');
  }

  const queue: (() => void)[] = [];
  let active = 0;

  const drain = (): void => {
    while (active < maxConcurrent) {
      const start = queue.shift();
      if (!start) return;
      active++;
      start();
    }
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        void Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            drain();
          });
      });
      drain();
    });
}
