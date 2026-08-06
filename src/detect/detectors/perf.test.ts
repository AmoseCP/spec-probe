import { afterEach, describe, expect, it, vi } from 'vitest';
import { perfDetector, snapToCommonHz, summarizeFrameDeltas } from './perf';
import { get, value, zh } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('snapToCommonHz', () => {
  it('接近常见档位时吸附过去', () => {
    expect(snapToCommonHz(59.94)).toBe(60);
    expect(snapToCommonHz(119.7)).toBe(120);
    expect(snapToCommonHz(143.2)).toBe(144);
  });

  it('离所有常见档位都远时不吸附，返回 null', () => {
    expect(snapToCommonHz(200)).toBeNull();
    expect(snapToCommonHz(7)).toBeNull();
  });
});

describe('summarizeFrameDeltas', () => {
  it('丢弃前 5 帧后取中位数', () => {
    // 前 5 帧故意给异常值，应被忽略
    const deltas = [40, 33, 25, 30, 28, ...Array(20).fill(16.67)];
    const s = summarizeFrameDeltas(deltas)!;
    expect(s.medianMs).toBeCloseTo(16.67, 2);
    expect(Math.round(s.hz)).toBe(60);
    expect(s.snapped).toBe(60);
  });

  it('剔除掉帧造成的超长间隔', () => {
    const deltas = [...Array(6).fill(8.33), ...Array(14).fill(8.33), 500, 900];
    const s = summarizeFrameDeltas(deltas)!;
    expect(s.snapped).toBe(120);
    expect(s.usableFrames).toBe(15);
  });

  it('可用样本太少时返回 null，不硬给一个数', () => {
    expect(summarizeFrameDeltas([16, 16, 16])).toBeNull();
    expect(summarizeFrameDeltas([])).toBeNull();
  });
});

describe('perf 探测器 —— 刷新率', () => {
  it('rAF 可用时推算出刷新率并标 approx', async () => {
    let t = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      t += 16.67;
      setTimeout(() => cb(t), 0);
      return 1;
    });
    vi.stubGlobal('document', { visibilityState: 'visible', createElement: () => null });

    const metrics = await perfDetector.run();
    const m = get(metrics, 'perf.refreshRate');

    expect(m.confidence).toBe('approx');
    expect(value(metrics, 'perf.refreshRate')).toBe('约 60 Hz');
    expect(zh(m.note)).toMatch(/没有直接接口/);
    expect(zh(m.note)).toMatch(/节流|后台/);
  });

  it('标签页在后台时不给数字', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(1000), 0);
      return 1;
    });
    vi.stubGlobal('document', { visibilityState: 'hidden', createElement: () => null });

    const metrics = await perfDetector.run();
    const m = get(metrics, 'perf.refreshRate');
    expect(m.confidence).toBe('unavailable');
    expect(m.value).toBeNull();
    expect(zh(m.note)).toMatch(/前台|节流/);
  });

  it('没有 requestAnimationFrame 时标不可用', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const metrics = await perfDetector.run();
    expect(get(metrics, 'perf.refreshRate').confidence).toBe('unavailable');
  });
});

describe('perf 探测器 —— 填充率', () => {
  it('WebGL 不可用时标不可用且不抛错', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);

    const metrics = await perfDetector.run();
    const m = get(metrics, 'perf.fillRate');
    expect(m.confidence).toBe('unavailable');
    expect(m.value).toBeNull();
  });

  it('填充率结果一律 approx，并说明不等于游戏帧率', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);

    let now = 0;
    // 每次 readPixels 推进 10ms，模拟 GPU 真正画完
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      ARRAY_BUFFER: 3,
      STATIC_DRAW: 4,
      FLOAT: 5,
      TRIANGLES: 6,
      RGBA: 7,
      UNSIGNED_BYTE: 8,
      LINK_STATUS: 9,
      canvas: document.createElement('canvas'),
      viewport() {},
      createShader: () => ({}),
      shaderSource() {},
      compileShader() {},
      createProgram: () => ({}),
      attachShader() {},
      linkProgram() {},
      getProgramParameter: () => true,
      deleteShader() {},
      useProgram() {},
      createBuffer: () => ({}),
      bindBuffer() {},
      bufferData() {},
      getAttribLocation: () => 0,
      enableVertexAttribArray() {},
      vertexAttribPointer() {},
      getUniformLocation: () => ({}),
      uniform1f() {},
      drawArrays() {},
      readPixels() {
        now += 10;
      },
      getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext() {} } : null),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl2' ? gl : null) as never);
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const metrics = await perfDetector.run();
    const m = get(metrics, 'perf.fillRate');

    expect(m.confidence).toBe('approx');
    expect(value(metrics, 'perf.fillRate')).toMatch(/GPixel\/s/);
    expect(zh(m.note)).toMatch(/不等于游戏帧率/);
    expect(zh(m.note)).toMatch(/波动/);
  });
});
