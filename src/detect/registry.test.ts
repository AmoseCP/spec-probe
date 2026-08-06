import { describe, expect, it } from 'vitest';
import { detectors, runAll } from './registry';
import type { Detector, DetectorResult, Metric } from './types';
import { en, zh } from '../test/helpers';

const crasher: Detector = {
  id: 'crasher',
  group: 'cpu',
  title: '会崩的探测器',
  subtitle: 'test',
  run() {
    throw new Error('sync boom');
  },
};

const rejecter: Detector = {
  id: 'rejecter',
  group: 'gpu',
  title: '会 reject 的探测器',
  subtitle: 'test',
  run: () => Promise.reject(new Error('async boom')),
};

const slow: Detector = {
  id: 'slow',
  group: 'memory',
  title: '慢探测器',
  subtitle: 'test',
  run: () =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve([
            {
              id: 'slow.x',
              group: 'memory',
              label: '慢项',
              value: '1',
              confidence: 'exact',
              source: 'test',
            } satisfies Metric,
          ]),
        30,
      ),
    ),
};

const fast: Detector = {
  id: 'fast',
  group: 'display',
  title: '快探测器',
  subtitle: 'test',
  run: async () => [
    {
      id: 'fast.x',
      group: 'display',
      label: '快项',
      value: '1',
      confidence: 'exact',
      source: 'test',
    } satisfies Metric,
  ],
};

describe('runAll —— 崩溃隔离', () => {
  it('单个探测器抛错不影响其他分组', async () => {
    const seen: DetectorResult[] = [];
    const results = await runAll((r) => seen.push(r), [crasher, rejecter, fast]);

    expect(results).toHaveLength(3);
    expect(seen).toHaveLength(3);

    const crashed = results.find((r) => r.detector.id === 'crasher')!;
    expect(crashed.crashed).toBe(true);
    expect(crashed.metrics[0].confidence).toBe('unavailable');
    expect(crashed.metrics[0].value).toBeNull();

    const ok = results.find((r) => r.detector.id === 'fast')!;
    expect(ok.crashed).toBe(false);
    expect(ok.metrics[0].value).toBe('1');
  });
});

describe('runAll —— 并行与增量', () => {
  it('快的先回调，不等慢的（不串行 await）', async () => {
    const order: string[] = [];
    await runAll((r) => order.push(r.detector.id), [slow, fast]);
    expect(order[0]).toBe('fast');
    expect(order).toHaveLength(2);
  });

  it('总耗时接近最慢的单个探测器，而非累加', async () => {
    const t0 = performance.now();
    await runAll(() => {}, [slow, slow, slow]);
    expect(performance.now() - t0).toBeLessThan(90);
  });
});

describe('registry 注册表', () => {
  it('探测器 id 唯一', () => {
    const ids = detectors.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个探测器都有中英标题与来源副标题', () => {
    for (const d of detectors) {
      expect(zh(d.title)!.length).toBeGreaterThan(0);
      expect(en(d.title)!.length).toBeGreaterThan(0);
      expect(d.subtitle.length).toBeGreaterThan(0);
    }
  });
});
