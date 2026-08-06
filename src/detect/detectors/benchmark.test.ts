import { afterEach, describe, expect, it, vi } from 'vitest';
import { benchmarkDetector } from './benchmark';
import { get, value, zh } from '../../test/helpers';

/** 假 Worker：立刻回一条消息，用来验证探测器的组装逻辑 */
class FakeWorker {
  static terminated = 0;
  private handlers: Record<string, Array<(e: unknown) => void>> = {};

  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.handlers[type] ??= []).push(fn);
  }

  postMessage() {
    queueMicrotask(() => {
      for (const fn of this.handlers.message ?? []) {
        fn({
          data: {
            bestMs: 200,
            rounds: [200, 214, 220],
            iterations: 2_000_000,
            opsPerSecond: 10_000_000,
            sink: 1,
          },
        });
      }
    });
  }

  terminate() {
    FakeWorker.terminated += 1;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.terminated = 0;
});

describe('benchmark 探测器 —— Worker 可用', () => {
  it('结果一律 approx，note 写明只能分档', async () => {
    vi.stubGlobal('Worker', FakeWorker);

    const metrics = await benchmarkDetector.run();
    const score = get(metrics, 'benchmark.score');

    expect(score.confidence).toBe('approx');
    // 用有物理含义的吞吐量，而不是自造的分数刻度
    expect(value(metrics, 'benchmark.score')).toBe('10 M 次/秒');
    expect(zh(score.note)).toMatch(/分档/);
    expect(zh(score.note)).toMatch(/波动/);
  });

  it('跑完即终止 Worker，不留后台线程', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    await benchmarkDetector.run();
    expect(FakeWorker.terminated).toBe(1);
  });

  it('不把分数映射成具体 CPU 型号', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const metrics = await benchmarkDetector.run();
    const text = metrics.map((m) => `${zh(m.value)} ${zh(m.note)}`).join(' ');
    expect(text).not.toMatch(/i[3579]-|Ryzen|骁龙|Apple M\d/);
  });
});

describe('benchmark 探测器 —— Worker 不可用', () => {
  it('没有 Worker 时标不可用，且不退回主线程跑分', async () => {
    vi.stubGlobal('Worker', undefined);

    const metrics = await benchmarkDetector.run();
    const score = get(metrics, 'benchmark.score');
    expect(score.confidence).toBe('unavailable');
    expect(score.value).toBeNull();
    expect(zh(score.note)).toMatch(/主线程/);
  });

  it('Worker 构造抛错时不中断', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked by CSP');
        }
      },
    );

    const metrics = await benchmarkDetector.run();
    expect(get(metrics, 'benchmark.score').confidence).toBe('unavailable');
  });
});
