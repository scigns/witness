import { describe, expect, it } from 'vitest';

import { ConcurrencyLimiter } from './concurrency-limiter.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ConcurrencyLimiter', () => {
  it('runs up to the limit concurrently, without waiting', async () => {
    const limiter = new ConcurrencyLimiter(2);
    const started: number[] = [];
    const gates = [deferred<void>(), deferred<void>()];

    const jobs = [0, 1].map((i) =>
      limiter.run(async () => {
        started.push(i);
        await gates[i]!.promise;
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started.sort()).toEqual([0, 1]);

    gates[0]!.resolve();
    gates[1]!.resolve();
    await Promise.all(jobs);
  });

  it('queues a caller past the limit until a running slot frees, FIFO', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: string[] = [];
    const first = deferred<void>();

    const jobA = limiter.run(async () => {
      order.push('a-start');
      await first.promise;
      order.push('a-end');
    });

    // Give jobA a tick to actually claim the only slot before b/c queue up.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const jobB = limiter.run(async () => {
      order.push('b');
    });
    const jobC = limiter.run(async () => {
      order.push('c');
    });

    // Neither b nor c should have run yet — the slot is still held by a.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['a-start']);

    first.resolve();
    await Promise.all([jobA, jobB, jobC]);

    expect(order).toEqual(['a-start', 'a-end', 'b', 'c']);
  });

  it('releases the slot even when the job throws, so later callers are not stuck forever', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await expect(
      limiter.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // If the slot were not released, this would hang until the test times out.
    const result = await limiter.run(async () => 'ok');
    expect(result).toBe('ok');
  });
});
