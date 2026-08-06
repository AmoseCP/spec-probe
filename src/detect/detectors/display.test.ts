import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayDetector } from './display';
import { get, value, zh } from '../../test/helpers';

function stubMatchMedia(map: Record<string, boolean>, supported = true) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    media: supported ? q : 'not all',
    matches: Boolean(map[q]),
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('display 探测器 —— 常规环境', () => {
  it('分辨率、像素比与物理像素换算', async () => {
    vi.stubGlobal('screen', {
      width: 1728,
      height: 1117,
      availWidth: 1728,
      availHeight: 1080,
      colorDepth: 30,
      isExtended: true,
      orientation: { type: 'landscape-primary' },
    });
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    stubMatchMedia({ '(dynamic-range: high)': true, '(color-gamut: p3)': true });

    const metrics = await displayDetector.run();

    expect(value(metrics, 'display.resolution')).toBe('1728 × 1117');
    expect(zh(get(metrics, 'display.resolution').note)).toMatch(/CSS 像素/);
    expect(value(metrics, 'display.dpr')).toBe('2×');
    expect(value(metrics, 'display.physicalPixels')).toBe('3456 × 2234');
    expect(value(metrics, 'display.colorDepth')).toBe('30 位');
    expect(value(metrics, 'display.hdr')).toMatch(/高动态范围/);
    expect(value(metrics, 'display.colorGamut')).toBe('Display P3');
    expect(value(metrics, 'display.isExtended')).toMatch(/多块显示器/);
    expect(value(metrics, 'display.orientation')).toBe('横向');
  });
});

describe('display 探测器 —— 接口缺失', () => {
  it('无 isExtended 与媒体特性时标不可用', async () => {
    vi.stubGlobal('screen', { width: 1920, height: 1080, colorDepth: 24 });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    stubMatchMedia({}, false);

    const metrics = await displayDetector.run();

    expect(get(metrics, 'display.isExtended').confidence).toBe('unavailable');
    expect(get(metrics, 'display.hdr').confidence).toBe('unavailable');
    expect(get(metrics, 'display.colorGamut').confidence).toBe('unavailable');
  });

  it('screen 缺失时不抛错', async () => {
    vi.stubGlobal('screen', {});
    vi.stubGlobal('window', {});
    stubMatchMedia({});

    await expect(displayDetector.run()).resolves.toBeInstanceOf(Array);
  });
});

describe('display 探测器 —— 诚实性', () => {
  it('显示器型号列为读不到', async () => {
    vi.stubGlobal('screen', { width: 1920, height: 1080 });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    stubMatchMedia({});

    const metrics = await displayDetector.run();
    expect(get(metrics, 'display.panel').confidence).toBe('unavailable');
    // 刷新率没有直接接口，改由 perf 探测器实测推算，这里不再占位
    expect(metrics.some((m) => m.id === 'display.refreshRate')).toBe(false);
  });
});
