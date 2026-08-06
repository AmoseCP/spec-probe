import type { Detector, DetectorResult, Metric } from './types';
import { cpuDetector } from './detectors/cpu';
import { gpuDetector } from './detectors/gpu';
import { memoryDetector } from './detectors/memory';
import { displayDetector } from './detectors/display';
import { codecDetector } from './detectors/codec';
import { devicesDetector } from './detectors/devices';
import { systemDetector } from './detectors/system';
import { networkDetector } from './detectors/network';
import { benchmarkDetector } from './detectors/benchmark';
import { perfDetector } from './detectors/perf';

/**
 * 首屏那一行的三张卡：回答"这台机器是什么"。
 * 其余分组走瀑布流，瀑布流按列排版会把靠前的卡片推到第二列去，
 * 最该先看到的三项不能交给它。
 */
export const PRIMARY_IDS = ['system', 'cpu', 'gpu'] as const;

/** 展示顺序即数组顺序；执行顺序无所谓，全部并行。 */
export const detectors: Detector[] = [
  systemDetector,
  cpuDetector,
  gpuDetector,
  memoryDetector,
  displayDetector,
  codecDetector,
  devicesDetector,
  networkDetector,
  benchmarkDetector,
  perfDetector,
];

/** 单个探测器的兜底：run() 本不该抛，抛了也不能影响其他分组。 */
async function runOne(d: Detector): Promise<DetectorResult> {
  const t0 = performance.now();
  try {
    const metrics = await d.run();
    return {
      detector: d,
      metrics: Array.isArray(metrics) ? metrics : [],
      crashed: false,
      durationMs: performance.now() - t0,
    };
  } catch {
    const fallback: Metric = {
      id: `${d.id}.error`,
      group: d.group,
      label: { zh: '本组数据', en: 'This group' },
      value: null,
      confidence: 'unavailable',
      source: d.subtitle,
      note: {
        zh: '该组探测在本浏览器中断，其余分组不受影响',
        en: 'This group’s detection broke in this browser; every other group is unaffected',
      },
    };
    return { detector: d, metrics: [fallback], crashed: true, durationMs: performance.now() - t0 };
  }
}

/**
 * 并行执行全部探测器，**每个完成即回调**，不等全部结束。
 * 首屏因此不会被最慢的探测器阻塞。
 */
export async function runAll(
  onResult: (r: DetectorResult) => void,
  list: Detector[] = detectors,
): Promise<DetectorResult[]> {
  const settled = await Promise.allSettled(
    list.map((d) =>
      runOne(d).then((r) => {
        onResult(r);
        return r;
      }),
    ),
  );
  return settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
}
