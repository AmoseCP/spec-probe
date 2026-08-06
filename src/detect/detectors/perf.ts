import type { Detector, Metric } from '../types';
import { acquireGl, approx, safe, safeAsync, unavailable, withTimeout } from '../utils';

// ------------------------------------------------------------ 刷新率推算

/** 常见面板刷新率。实测值落在 5% 以内就吸附过去，避免显示 119.7 Hz 这种噪声。 */
const COMMON_HZ = [24, 30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 240, 360];

const FRAMES = 40;
/** 前几帧受首次合成影响，不参与统计 */
const WARMUP_FRAMES = 5;

export interface RefreshSample {
  hz: number;
  medianMs: number;
  usableFrames: number;
  snapped: number | null;
}

export function snapToCommonHz(hz: number): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (const c of COMMON_HZ) {
    const err = Math.abs(hz - c) / c;
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  return bestErr <= 0.05 ? best : null;
}

export function summarizeFrameDeltas(deltas: number[]): RefreshSample | null {
  // 明显异常的间隔（掉帧、节流）直接剔除，否则中位数会被拖偏
  const usable = deltas.slice(WARMUP_FRAMES).filter((d) => d > 0.5 && d < 200);
  if (usable.length < 5) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const hz = 1000 / medianMs;
  return { hz, medianMs, usableFrames: usable.length, snapped: snapToCommonHz(hz) };
}

async function measureRefreshRate(): Promise<RefreshSample | null> {
  if (typeof requestAnimationFrame !== 'function') return null;
  // 后台标签页的 rAF 被节流到 1Hz 左右，测出来的数字毫无意义
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null;

  const deltas = await safeAsync(
    () =>
      withTimeout(
        new Promise<number[]>((resolve) => {
          const acc: number[] = [];
          let last = 0;
          let count = 0;
          const tick = (t: number) => {
            if (last) acc.push(t - last);
            last = t;
            count += 1;
            if (count <= FRAMES) requestAnimationFrame(tick);
            else resolve(acc);
          };
          requestAnimationFrame(tick);
        }),
        2500,
        [] as number[],
      ),
    [] as number[],
  );

  return summarizeFrameDeltas(deltas);
}

// ------------------------------------------------------------ 填充率实测

const VERT_SRC = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG_SRC = `
precision mediump float;
uniform float uSeed;
void main() { gl_FragColor = vec4(uSeed, 0.5, 0.25, 1.0); }
`;

const SURFACE = 1024;
const TARGET_MS = 150;
const MAX_PASSES = 400;

export interface FillRateSample {
  gigapixelsPerSecond: number;
  passes: number;
  elapsedMs: number;
  surface: number;
}

function compile(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  gl.shaderSource(vs, VERT_SRC);
  gl.compileShader(vs);
  gl.shaderSource(fs, FRAG_SRC);
  gl.compileShader(fs);

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function measureFillRate(): FillRateSample | null {
  const handle = acquireGl();
  if (!handle) return null;

  try {
    const { gl } = handle;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.width = SURFACE;
    canvas.height = SURFACE;
    gl.viewport(0, 0, SURFACE, SURFACE);

    const program = safe(() => compile(gl), null);
    if (!program) return null;
    gl.useProgram(program);

    // 覆盖整个视口的大三角形，比两个三角形的 quad 少一次光栅化接缝
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const seed = gl.getUniformLocation(program, 'uSeed');

    const pixels = new Uint8Array(4);
    // readPixels 会强制等待 GPU 真正画完，否则测到的只是命令入队时间
    const flush = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const draw = (passes: number) => {
      for (let i = 0; i < passes; i += 1) {
        gl.uniform1f(seed, (i % 16) / 16);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      flush();
    };

    // 预热：让着色器编译与首次分配的开销落在计时之外
    draw(4);

    const probeStart = performance.now();
    draw(8);
    const probeMs = Math.max(0.1, performance.now() - probeStart);

    // 按预热结果推算能在 ~150ms 内画完的次数，避免慢机器上卡住
    const passes = Math.min(MAX_PASSES, Math.max(8, Math.round((TARGET_MS / probeMs) * 8)));

    const start = performance.now();
    draw(passes);
    const elapsedMs = performance.now() - start;
    if (elapsedMs <= 0) return null;

    const totalPixels = SURFACE * SURFACE * passes;
    return {
      gigapixelsPerSecond: totalPixels / (elapsedMs / 1000) / 1e9,
      passes,
      elapsedMs,
      surface: SURFACE,
    };
  } catch {
    return null;
  } finally {
    handle.release();
  }
}

// ---------------------------------------------------------------- 探测器

export const perfDetector: Detector = {
  id: 'perf',
  group: 'display',
  title: { zh: '实测推算（代理指标）', en: 'Measured estimates (proxies)' },
  subtitle: 'requestAnimationFrame · WebGL drawArrays',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];

    const refresh = await measureRefreshRate();
    out.push(
      refresh
        ? approx({
            id: 'perf.refreshRate',
            group: 'display',
            label: { zh: '刷新率', en: 'Refresh rate' },
            value: refresh.snapped
              ? { zh: `约 ${refresh.snapped} Hz`, en: `about ${refresh.snapped} Hz` }
              : { zh: `约 ${refresh.hz.toFixed(1)} Hz`, en: `about ${refresh.hz.toFixed(1)} Hz` },
            raw: {
              hz: Math.round(refresh.hz * 100) / 100,
              medianFrameMs: Math.round(refresh.medianMs * 1000) / 1000,
              usableFrames: refresh.usableFrames,
              snappedTo: refresh.snapped,
            },
            source: 'requestAnimationFrame',
            note: {
              zh: `没有直接接口，这是由 ${refresh.usableFrames} 个帧间隔的中位数（${refresh.medianMs.toFixed(2)} ms）反推的${refresh.snapped ? '，并吸附到最接近的常见档位' : ''}。浏览器节流、后台负载、以及多屏下窗口所在的屏幕都会影响结果，可能低于面板标称值`,
              en: `No direct API. Derived from the median of ${refresh.usableFrames} frame intervals (${refresh.medianMs.toFixed(2)} ms)${refresh.snapped ? ', snapped to the nearest common rate' : ''}. Throttling, background load and which display the window sits on all affect it, so it can read below the panel's rated rate`,
            },
          })
        : unavailable({
            id: 'perf.refreshRate',
            group: 'display',
            label: { zh: '刷新率', en: 'Refresh rate' },
            source: 'requestAnimationFrame',
            note: {
              zh: '采样失败：标签页不在前台，或帧回调被节流。刷新率没有直接接口，只能靠逐帧采样推算',
              en: 'Sampling failed: the tab is in the background, or frame callbacks were throttled. There is no direct API — only frame sampling',
            },
          }),
    );

    const fill = measureFillRate();
    out.push(
      fill
        ? approx({
            id: 'perf.fillRate',
            group: 'display',
            label: { zh: '像素填充率', en: 'Pixel fill rate' },
            value: {
              zh: `约 ${fill.gigapixelsPerSecond.toFixed(1)} GPixel/s`,
              en: `about ${fill.gigapixelsPerSecond.toFixed(1)} GPixel/s`,
            },
            raw: {
              gigapixelsPerSecond: Math.round(fill.gigapixelsPerSecond * 100) / 100,
              passes: fill.passes,
              elapsedMs: Math.round(fill.elapsedMs * 10) / 10,
              surface: fill.surface,
            },
            source: 'WebGL drawArrays + readPixels',
            note: {
              zh: `${fill.surface}×${fill.surface} 全屏填充画 ${fill.passes} 遍实测。只反映像素填充这一个侧面，不等于游戏帧率或算力；受合成器调度、其他标签页占用与节能策略影响，多次运行会有波动`,
              en: `Measured by drawing a ${fill.surface}×${fill.surface} full-screen fill ${fill.passes} times. It covers pixel fill only — not game frame rates or compute throughput — and fluctuates with compositor scheduling, other tabs and power policies`,
            },
          })
        : unavailable({
            id: 'perf.fillRate',
            group: 'display',
            label: { zh: '像素填充率', en: 'Pixel fill rate' },
            source: 'WebGL drawArrays + readPixels',
            note: {
              zh: 'WebGL 上下文或着色器编译失败，无法实测',
              en: 'Could not create a WebGL context or compile the shader',
            },
          }),
    );

    return out;
  },
};
