import type { Detector, Metric } from '../types';
import { approx, unavailable } from '../utils';
import type { BenchResult } from './benchmark.worker';

const TIMEOUT_MS = 8000;

/** 在 Worker 里跑分。永不抛出，失败返回 null。 */
export function runBenchmark(): Promise<BenchResult | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);

  return new Promise<BenchResult | null>((resolve) => {
    let worker: Worker | null = null;
    let settled = false;

    const finish = (r: BenchResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker?.terminate();
      } catch {
        /* 已经结束就算了 */
      }
      resolve(r);
    };

    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    try {
      worker = new Worker(new URL('./benchmark.worker.ts', import.meta.url), { type: 'module' });
      worker.addEventListener('message', (e: MessageEvent<BenchResult>) => finish(e.data));
      worker.addEventListener('error', () => finish(null));
      worker.postMessage('start');
    } catch {
      finish(null);
    }
  });
}

export const benchmarkDetector: Detector = {
  id: 'benchmark',
  group: 'cpu',
  title: { zh: '性能跑分（代理指标）', en: 'Benchmark (proxy measure)' },
  subtitle: 'Web Worker · performance.now',

  async run(): Promise<Metric[]> {
    const r = await runBenchmark();

    if (!r) {
      return [
        unavailable({
          id: 'benchmark.score',
          group: 'cpu',
          label: { zh: '单线程浮点吞吐', en: 'Single-thread throughput' },
          source: 'Web Worker + performance.now()',
          note: {
            zh: '本环境不支持 Web Worker，或跑分超时。跑分不在主线程执行，因此不会退化为阻塞式测量',
            en: 'No Web Worker support here, or the run timed out. The benchmark never falls back to the main thread',
          },
        }),
      ];
    }

    const millionsPerSecond = Math.round((r.opsPerSecond / 1_000_000) * 10) / 10;

    return [
      approx({
        id: 'benchmark.score',
        group: 'cpu',
        label: { zh: '单线程浮点吞吐', en: 'Single-thread throughput' },
        value: { zh: `${millionsPerSecond} M 次/秒`, en: `${millionsPerSecond} M iterations/s` },
        raw: r.opsPerSecond,
        source: 'Web Worker + performance.now()',
        note: {
          zh: '仅供分档，受后台负载和节能策略影响，多次运行会有波动。这是 CPU 型号缺失时的代理指标，不能反推具体型号，也不换算成自造的分数刻度',
          en: 'Only good for coarse tiers. Background load and power policies make it fluctuate between runs. It stands in for the unavailable CPU model, cannot identify one, and is deliberately not converted into an invented score',
        },
      }),
      approx({
        id: 'benchmark.bestMs',
        group: 'cpu',
        label: { zh: '最快一轮耗时', en: 'Fastest round' },
        value: `${Math.round(r.bestMs * 10) / 10} ms`,
        raw: { bestMs: r.bestMs, rounds: r.rounds, iterations: r.iterations },
        source: 'performance.now()',
        note: {
          zh: `每轮 ${r.iterations.toLocaleString('en-US')} 次 sqrt/sin 浮点迭代，跑 3 轮取最快一轮；各轮：${r.rounds.join(' / ')} ms`,
          en: `${r.iterations.toLocaleString('en-US')} sqrt/sin float iterations per round, best of 3; rounds: ${r.rounds.join(' / ')} ms`,
        },
      }),
    ];
  },
};
