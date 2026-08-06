import { afterEach, describe, expect, it, vi } from 'vitest';
import { gpuDetector } from './gpu';
import { get, value, zh } from '../../test/helpers';

const RENDERER = 0x1f01;
const VENDOR = 0x1f00;
const MAX_TEXTURE_SIZE = 0x0d33;
const SHADING_LANGUAGE_VERSION = 0x8b8c;
const UNMASKED_RENDERER = 0x9246;
const UNMASKED_VENDOR = 0x9245;

interface FakeOpts {
  debugExt: boolean;
  renderer: string;
  vendor: string;
}

/** 记录 loseContext 是否被调用，用于验证不泄漏上下文 */
const loseCalls = { count: 0 };

function stubGl(opts: FakeOpts) {
  const gl = {
    RENDERER,
    VENDOR,
    MAX_TEXTURE_SIZE,
    SHADING_LANGUAGE_VERSION,
    getExtension(name: string) {
      if (name === 'WEBGL_lose_context') {
        return {
          loseContext() {
            loseCalls.count += 1;
          },
        };
      }
      if (name === 'WEBGL_debug_renderer_info' && opts.debugExt) {
        return {
          UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER,
          UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR,
        };
      }
      return null;
    },
    getParameter(p: number) {
      switch (p) {
        case UNMASKED_RENDERER:
        case RENDERER:
          return opts.renderer;
        case UNMASKED_VENDOR:
        case VENDOR:
          return opts.vendor;
        case MAX_TEXTURE_SIZE:
          return 16384;
        case SHADING_LANGUAGE_VERSION:
          return 'WebGL GLSL ES 3.00';
        default:
          return null;
      }
    },
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl2' ? gl : null) as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  loseCalls.count = 0;
});

describe('gpu 探测器 —— WebGL 扩展可用', () => {
  it('拿到 UNMASKED_RENDERER 时为 exact 且提取型号', async () => {
    stubGl({
      debugExt: true,
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'Google Inc. (NVIDIA)',
    });

    const metrics = await gpuDetector.run();
    const r = get(metrics, 'gpu.renderer');
    expect(r.confidence).toBe('exact');
    expect(value(metrics, 'gpu.renderer')).toBe('NVIDIA GeForce RTX 3080 Ti');
    expect(r.source).toBe('WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL');
    expect(value(metrics, 'gpu.webglVersion')).toBe('WebGL 2.0');
    expect(value(metrics, 'gpu.maxTextureSize')).toBe('16384 px');
  });

  it('用完释放上下文', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    await gpuDetector.run();
    expect(loseCalls.count).toBe(1);
  });

  it('连续 10 次检测各自释放上下文，不泄漏', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    for (let i = 0; i < 10; i += 1) {
      const metrics = await gpuDetector.run();
      expect(value(metrics, 'gpu.renderer')).toBe('NVIDIA GeForce RTX 4090');
    }
    expect(loseCalls.count).toBe(10);
  });
});

describe('gpu 探测器 —— 扩展被屏蔽 / 笼统值', () => {
  it('拿不到扩展时降级为 approx 并说明原因', async () => {
    stubGl({ debugExt: false, renderer: 'WebKit WebGL', vendor: 'WebKit' });

    const metrics = await gpuDetector.run();
    const r = get(metrics, 'gpu.renderer');
    expect(r.confidence).toBe('approx');
    expect(zh(r.note)).toMatch(/屏蔽/);
    expect(r.source).toBe('WebGLRenderingContext.RENDERER');
  });

  it('Safari 返回 Apple GPU 这类笼统值时标 approx', async () => {
    stubGl({ debugExt: true, renderer: 'Apple GPU', vendor: 'Apple Inc.' });

    const metrics = await gpuDetector.run();
    const r = get(metrics, 'gpu.renderer');
    expect(r.confidence).toBe('approx');
    expect(r.note).toBeTruthy();
  });
});

describe('gpu 探测器 —— 无 WebGL', () => {
  it('上下文创建失败时全部标不可用且不抛错', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);

    const metrics = await gpuDetector.run();
    expect(metrics.length).toBeGreaterThan(0);
    expect(get(metrics, 'gpu.renderer').confidence).toBe('unavailable');
    expect(get(metrics, 'gpu.renderer').value).toBeNull();
  });

  it('getParameter 抛错时不中断整组', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl2'
        ? {
            RENDERER,
            VENDOR,
            MAX_TEXTURE_SIZE,
            SHADING_LANGUAGE_VERSION,
            getExtension: () => null,
            getParameter: () => {
              throw new Error('blocked');
            },
          }
        : null) as never);

    const metrics = await gpuDetector.run();
    expect(get(metrics, 'gpu.renderer').confidence).toBe('unavailable');
  });
});

describe('gpu 探测器 —— WebGPU', () => {
  it('adapter.info 有值时展示非空字段', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          info: { vendor: 'nvidia', architecture: 'ada-lovelace', device: '', description: '' },
          limits: { maxBufferSize: 4 * 1024 ** 3 },
          features: new Set(['depth-clip-control', 'timestamp-query']),
        }),
      },
    });

    const metrics = await gpuDetector.run();
    expect(value(metrics, 'gpu.webgpu.adapter')).toBe('nvidia · ada-lovelace');
    expect(get(metrics, 'gpu.webgpu.adapter').confidence).toBe('exact');
    expect(value(metrics, 'gpu.webgpu.features')).toBe('2 项');
  });

  it('maxBufferSize 标 approx 且说明它不是显存', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({ info: {}, limits: { maxBufferSize: 2 * 1024 ** 3 } }),
      },
    });

    const metrics = await gpuDetector.run();
    const m = get(metrics, 'gpu.webgpu.maxBufferSize');
    expect(m.confidence).toBe('approx');
    expect(value(metrics, 'gpu.webgpu.maxBufferSize')).toBe('2 GB');
    expect(zh(m.note)).toMatch(/不.*显存|不能当显存/);
  });

  it('requestAdapter 返回 null 时标不可用', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null } });

    const metrics = await gpuDetector.run();
    expect(get(metrics, 'gpu.webgpu.adapter').confidence).toBe('unavailable');
    // WebGL 仍然正常
    expect(value(metrics, 'gpu.renderer')).toBe('NVIDIA GeForce RTX 4090');
  });

  it('info 字段全为空字符串时标不可用而不是渲染空白', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({ info: { vendor: '', architecture: '', device: '' } }),
      },
    });

    const metrics = await gpuDetector.run();
    const m = get(metrics, 'gpu.webgpu.adapter');
    expect(m.confidence).toBe('unavailable');
    expect(m.value).toBeNull();
  });

  it('没有 navigator.gpu 时标不可用且不抛错', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    vi.stubGlobal('navigator', {});

    const metrics = await gpuDetector.run();
    expect(get(metrics, 'gpu.webgpu.adapter').confidence).toBe('unavailable');
    expect(zh(get(metrics, 'gpu.webgpu.adapter').note)).toMatch(/WebGPU/);
  });

  it('requestAdapter reject 时不中断 WebGL 结果', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: () => Promise.reject(new Error('no adapter')) },
    });

    const metrics = await gpuDetector.run();
    expect(get(metrics, 'gpu.webgpu.adapter').confidence).toBe('unavailable');
    expect(value(metrics, 'gpu.renderer')).toBe('NVIDIA GeForce RTX 4090');
  });
});

describe('gpu 探测器 —— 诚实性', () => {
  it('显存始终列为读不到', async () => {
    stubGl({ debugExt: true, renderer: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' });
    const metrics = await gpuDetector.run();
    expect(get(metrics, 'gpu.vram').confidence).toBe('unavailable');
  });
});
