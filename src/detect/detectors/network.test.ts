import { afterEach, describe, expect, it, vi } from 'vitest';
import { networkDetector } from './network';
import { get, value, zh } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('network 探测器 —— 接口存在（Chromium）', () => {
  it('分档、带宽、延迟全部标 approx 并说明原因', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false },
    });

    const metrics = await networkDetector.run();

    expect(get(metrics, 'network.effectiveType').confidence).toBe('approx');
    expect(value(metrics, 'network.effectiveType')).toBe('快（4g 档）');
    expect(zh(get(metrics, 'network.effectiveType').note)).toMatch(/不是网卡类型/);

    expect(get(metrics, 'network.downlink').confidence).toBe('approx');
    expect(zh(get(metrics, 'network.downlink').note)).toMatch(/上限/);

    expect(get(metrics, 'network.rtt').confidence).toBe('approx');
    expect(zh(get(metrics, 'network.rtt').note)).toMatch(/25/);

    // saveData 是真实布尔值，不是分档
    expect(get(metrics, 'network.saveData').confidence).toBe('exact');
  });
});

describe('network 探测器 —— 电池', () => {
  it('用 getBattery() 读取电量与充电状态', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      getBattery: async () => ({
        level: 0.85,
        charging: false,
        chargingTime: Number.POSITIVE_INFINITY,
        dischargingTime: 7200,
      }),
    });

    const metrics = await networkDetector.run();

    expect(value(metrics, 'battery.level')).toBe('85%');
    expect(get(metrics, 'battery.level').confidence).toBe('approx');
    expect(value(metrics, 'battery.charging')).toBe('使用电池');
    expect(value(metrics, 'battery.time')).toBe('2 小时');
  });

  it('chargingTime 为 Infinity 时不渲染成 Infinity', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      getBattery: async () => ({
        level: 1,
        charging: true,
        chargingTime: Number.POSITIVE_INFINITY,
        dischargingTime: Number.POSITIVE_INFINITY,
      }),
    });

    const metrics = await networkDetector.run();
    const time = get(metrics, 'battery.time');
    expect(time.confidence).toBe('unavailable');
    expect(time.value).toBeNull();
    expect(zh(time.note)).toMatch(/Infinity/);
  });

  it('getBattery reject 时标不可用', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      getBattery: () => Promise.reject(new Error('not allowed')),
    });

    const metrics = await networkDetector.run();
    expect(get(metrics, 'battery.level').confidence).toBe('unavailable');
  });
});

describe('network 探测器 —— 接口缺失（Firefox / Safari）', () => {
  it('没有 connection 与 getBattery 时全部降级且不抛错', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    const metrics = await networkDetector.run();

    for (const id of [
      'network.effectiveType',
      'network.downlink',
      'network.rtt',
      'network.saveData',
      'battery.level',
    ]) {
      expect(get(metrics, id).confidence).toBe('unavailable');
      expect(get(metrics, id).value).toBeNull();
    }
    // onLine 各浏览器都有
    expect(get(metrics, 'network.online').confidence).toBe('exact');
  });

  it('电池不可用时说明是浏览器移除了接口', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const metrics = await networkDetector.run();
    expect(zh(get(metrics, 'battery.level').note)).toMatch(/移除/);
  });
});

describe('network 探测器 —— 诚实性', () => {
  it('IP 与 MAC 明确列为不实现', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const metrics = await networkDetector.run();
    const m = get(metrics, 'network.address');
    expect(m.confidence).toBe('unavailable');
    expect(zh(m.note)).toMatch(/WebRTC/);
  });
});
