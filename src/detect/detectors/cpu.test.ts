import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpuDetector } from './cpu';
import { en, get, value, zh } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cpu 探测器 —— 接口存在（Chromium）', () => {
  it('读出线程数、架构与位宽', async () => {
    vi.stubGlobal('navigator', {
      hardwareConcurrency: 16,
      userAgentData: {
        platform: 'Windows',
        getHighEntropyValues: async () => ({
          architecture: 'x86',
          bitness: '64',
          model: '',
          platformVersion: '15.0.0',
        }),
      },
    });

    const metrics = await cpuDetector.run();

    expect(get(metrics, 'cpu.threads')).toMatchObject({
      confidence: 'exact',
      source: 'navigator.hardwareConcurrency',
    });
    expect(value(metrics, 'cpu.threads')).toBe('16 线程');
    expect(en(get(metrics, 'cpu.threads').value)).toBe('16 threads');
    expect(value(metrics, 'cpu.architecture')).toBe('x86');
    expect(value(metrics, 'cpu.bitness')).toBe('64 位');
    // 桌面端 model 恒为空 → 不可用
    expect(get(metrics, 'cpu.model').confidence).toBe('unavailable');
  });

  it('Android 上 model 有值时展示机型', async () => {
    vi.stubGlobal('navigator', {
      hardwareConcurrency: 8,
      userAgentData: {
        getHighEntropyValues: async () => ({ architecture: 'arm', bitness: '64', model: 'Pixel 8' }),
      },
    });

    const metrics = await cpuDetector.run();
    expect(get(metrics, 'cpu.model').confidence).toBe('exact');
    expect(value(metrics, 'cpu.model')).toBe('Pixel 8');
  });
});

describe('cpu 探测器 —— 接口缺失（Firefox / Safari）', () => {
  it('没有 userAgentData 时走降级路径且不抛错', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });

    const metrics = await cpuDetector.run();

    expect(value(metrics, 'cpu.threads')).toBe('8 线程');
    for (const id of ['cpu.architecture', 'cpu.bitness', 'cpu.model']) {
      expect(get(metrics, id).confidence).toBe('unavailable');
      expect(get(metrics, id).value).toBeNull();
    }
  });

  it('getHighEntropyValues 抛错时不影响其他项', async () => {
    vi.stubGlobal('navigator', {
      hardwareConcurrency: 4,
      userAgentData: {
        getHighEntropyValues: () => Promise.reject(new Error('rejected')),
      },
    });

    const metrics = await cpuDetector.run();
    expect(value(metrics, 'cpu.threads')).toBe('4 线程');
    expect(get(metrics, 'cpu.architecture').confidence).toBe('unavailable');
  });

  it('hardwareConcurrency 缺失时标为不可用', async () => {
    vi.stubGlobal('navigator', {});
    const metrics = await cpuDetector.run();
    expect(get(metrics, 'cpu.threads').confidence).toBe('unavailable');
  });
});

describe('cpu 探测器 —— 诚实性', () => {
  it('CPU 型号始终列为读不到，不做 UA 猜测', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 16, userAgent: 'Intel Core i9-13900K' });
    const metrics = await cpuDetector.run();
    expect(get(metrics, 'cpu.name').confidence).toBe('unavailable');
    expect(get(metrics, 'cpu.name').value).toBeNull();
    expect(zh(get(metrics, 'cpu.name').note)).toMatch(/编造/);
  });
});
