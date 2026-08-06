import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectors, runAll } from './registry';
import type { DetectorResult, Metric } from './types';
import { en, zh } from '../test/helpers';

/** 验收标准 3 / 4 的机器化断言，覆盖注册表里的全部探测器。 */
function assertContract(metrics: Metric[]) {
  for (const m of metrics) {
    expect(m.id, 'id 必填').toBeTruthy();
    expect(zh(m.label), `${m.id} 的中文 label 必填`).toBeTruthy();
    expect(en(m.label), `${m.id} 的英文 label 必填`).toBeTruthy();
    expect(zh(m.source), `${m.id} 的 source 必填`).toBeTruthy();
    expect(zh(m.source)!.trim().length, `${m.id} 的 source 不得为空白`).toBeGreaterThan(0);
    expect(en(m.source), `${m.id} 的 source 英文必填`).toBeTruthy();
    // source 必须是真实 API 名或显式的"无对应 Web API"，不允许含糊表述
    expect(zh(m.source), `${m.id} 的 source 不得写成含糊表述`).not.toMatch(/^浏览器(接口|API)$/);
    // 占位型 source 必须双语，否则英文界面会露出中文
    if (zh(m.source)!.startsWith('（')) {
      expect(en(m.source), `${m.id} 的占位 source 需要英文版本`).not.toMatch(/[一-龥]/);
    }

    if (m.confidence === 'approx') {
      expect(zh(m.note), `${m.id} 标为 approx 必须写明为什么近似`).toBeTruthy();
      expect(en(m.note), `${m.id} 的 approx 说明必须有英文`).toBeTruthy();
      expect(zh(m.note)!.trim().length).toBeGreaterThan(4);
    }
    if (m.confidence === 'unavailable') {
      expect(m.value, `${m.id} 不可用时 value 必须为 null`).toBeNull();
    } else {
      expect(zh(m.value), `${m.id} 可用时中文 value 不得为空`).toBeTruthy();
      expect(en(m.value), `${m.id} 可用时英文 value 不得为空`).toBeTruthy();
    }
  }
}

function allMetrics(results: DetectorResult[]): Metric[] {
  return results.flatMap((r) => r.metrics);
}

function stubRich() {
  vi.stubGlobal('navigator', {
    hardwareConcurrency: 16,
    deviceMemory: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    pdfViewerEnabled: true,
    onLine: true,
    languages: ['zh-CN', 'en'],
    userAgent: 'Mozilla/5.0 Chrome/131.0.0.0',
    userAgentData: {
      platform: 'Windows',
      mobile: false,
      getHighEntropyValues: async () => ({
        architecture: 'x86',
        bitness: '64',
        model: '',
        platformVersion: '15.0.0',
        fullVersionList: [{ brand: 'Google Chrome', version: '131.0.6778.86' }],
      }),
    },
    storage: { estimate: async () => ({ quota: 1024 ** 3, usage: 1024 }) },
    mediaDevices: {
      enumerateDevices: async () => [{ kind: 'videoinput', label: '', deviceId: '' }],
    },
    mediaCapabilities: {
      decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }),
      encodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: false }),
    },
    connection: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false },
    getBattery: async () => ({
      level: 0.5,
      charging: true,
      chargingTime: 1800,
      dischargingTime: Number.POSITIVE_INFINITY,
    }),
    gpu: {
      requestAdapter: async () => ({
        info: { vendor: 'nvidia', architecture: 'ada', device: '', description: '' },
        limits: { maxBufferSize: 2 * 1024 ** 3 },
        features: new Set(['timestamp-query']),
      }),
    },
  });
  vi.stubGlobal('performance', {
    now: () => 0,
    memory: { jsHeapSizeLimit: 4 * 1024 ** 3, usedJSHeapSize: 1024 ** 2 },
  });
  vi.stubGlobal('screen', {
    width: 2560,
    height: 1440,
    availWidth: 2560,
    availHeight: 1400,
    colorDepth: 24,
    isExtended: false,
    orientation: { type: 'landscape-primary' },
  });
  vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));
  stubFastRaf();
}

/** jsdom 的 rAF 是真 16ms 一帧，40 帧要 0.6s；契约测试只关心结构，给个快的即可 */
function stubFastRaf() {
  let t = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    t += 16.67;
    queueMicrotask(() => cb(t));
    return 1;
  });
}

function stubBare() {
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('performance', { now: () => 0 });
  vi.stubGlobal('screen', {});
  vi.stubGlobal('matchMedia', undefined);
  vi.stubGlobal('requestAnimationFrame', undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('全体探测器契约 —— 接口齐全的环境', () => {
  it('每项都有 source；approx 必带 note；unavailable 的 value 为 null', async () => {
    stubRich();
    const results = await runAll(() => {});
    expect(results).toHaveLength(detectors.length);
    assertContract(allMetrics(results));
  });

  it('metric id 全局唯一', async () => {
    stubRich();
    const ids = allMetrics(await runAll(() => {})).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('没有任何探测器崩溃', async () => {
    stubRich();
    const results = await runAll(() => {});
    expect(results.every((r) => !r.crashed)).toBe(true);
  });

  it('中英文两种语言都不会渲染出空字符串', async () => {
    stubRich();
    for (const m of allMetrics(await runAll(() => {}))) {
      for (const lang of ['zh', 'en'] as const) {
        const text = lang === 'zh' ? zh(m.value) : en(m.value);
        if (m.confidence !== 'unavailable') expect(text!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('全体探测器契约 —— 接口几乎全无的环境', () => {
  it('契约仍然成立且无探测器崩溃', async () => {
    stubBare();
    const results = await runAll(() => {});
    assertContract(allMetrics(results));
    expect(results.every((r) => !r.crashed)).toBe(true);
  });

  it('每个分组都至少产出一项（不会渲染成空卡片）', async () => {
    stubBare();
    const results = await runAll(() => {});
    for (const r of results) {
      expect(r.metrics.length, `${r.detector.id} 没有产出任何项`).toBeGreaterThan(0);
    }
  });
});
