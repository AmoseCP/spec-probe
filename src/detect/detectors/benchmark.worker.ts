/**
 * CPU 跑分。必须在 Worker 里跑，主线程只等结果，不阻塞首屏。
 * 固定迭代次数的浮点循环 —— 只用于粗略分档，不做任何型号推测。
 *
 * 结果以"每秒迭代次数"给出，不换算成自造的分数刻度：
 * 那种 1000 分基准是拿某台机器当参照编出来的，与本项目的诚实原则冲突。
 */

const ITERATIONS = 2_000_000;
const ROUNDS = 3;

function floatLoop(iterations: number): number {
  let acc = 0;
  for (let i = 1; i <= iterations; i += 1) {
    acc += Math.sqrt(i) * Math.sin(i) + acc / i;
  }
  return acc;
}

export interface BenchResult {
  bestMs: number;
  rounds: number[];
  iterations: number;
  /** 每秒迭代次数，由最快一轮换算 */
  opsPerSecond: number;
  /** 防止引擎把整个循环优化掉 */
  sink: number;
}

self.addEventListener('message', () => {
  const rounds: number[] = [];
  let sink = 0;

  for (let r = 0; r < ROUNDS; r += 1) {
    const t0 = performance.now();
    sink += floatLoop(ITERATIONS);
    rounds.push(performance.now() - t0);
  }

  // 取最快一轮：后台负载只会让某轮变慢，不会让它变快
  const bestMs = Math.max(0.001, Math.min(...rounds));
  const result: BenchResult = {
    bestMs,
    rounds: rounds.map((m) => Math.round(m * 10) / 10),
    iterations: ITERATIONS,
    opsPerSecond: Math.round((ITERATIONS / bestMs) * 1000),
    sink,
  };

  (self as unknown as Worker).postMessage(result);
});
