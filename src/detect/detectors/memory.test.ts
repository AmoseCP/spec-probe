import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryDetector } from './memory';
import { get, value, zh } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('memory 探测器 —— 接口存在（Chromium）', () => {
  it('deviceMemory 必须标 approx 并说明封顶规则', async () => {
    vi.stubGlobal('navigator', {
      deviceMemory: 8,
      storage: { estimate: async () => ({ quota: 300 * 1024 ** 3, usage: 1024 * 1024 }) },
    });
    vi.stubGlobal('performance', {
      memory: { jsHeapSizeLimit: 4 * 1024 ** 3, usedJSHeapSize: 10 * 1024 ** 2 },
      now: () => 0,
    });

    const metrics = await memoryDetector.run();
    const dm = get(metrics, 'memory.deviceMemory');

    expect(dm.confidence).toBe('approx');
    expect(value(metrics, 'memory.deviceMemory')).toBe('≥ 8 GB');
    expect(zh(dm.note)).toMatch(/封顶|取整/);
  });

  it('小内存设备显示"约 N GB"', async () => {
    vi.stubGlobal('navigator', { deviceMemory: 4 });
    const metrics = await memoryDetector.run();
    expect(value(metrics, 'memory.deviceMemory')).toBe('约 4 GB');
  });

  it('jsHeapSizeLimit 标 approx 且说明不是系统内存', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('performance', { memory: { jsHeapSizeLimit: 4 * 1024 ** 3 }, now: () => 0 });

    const metrics = await memoryDetector.run();
    const heap = get(metrics, 'memory.jsHeapLimit');
    expect(heap.confidence).toBe('approx');
    expect(zh(heap.note)).toMatch(/没有直接换算|不是/);
  });

  it('storage 配额为 approx，用量为 exact', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 1024 ** 3, usage: 2048 }) },
    });

    const metrics = await memoryDetector.run();
    expect(get(metrics, 'storage.quota').confidence).toBe('approx');
    expect(value(metrics, 'storage.quota')).toBe('1 GB');
    expect(get(metrics, 'storage.usage').confidence).toBe('exact');
    expect(value(metrics, 'storage.usage')).toBe('2 KB');
  });
});

describe('memory 探测器 —— 接口缺失（Firefox / Safari）', () => {
  it('全部缺失时走降级路径且不抛错', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('performance', { now: () => 0 });

    const metrics = await memoryDetector.run();
    for (const id of [
      'memory.deviceMemory',
      'memory.jsHeapLimit',
      'storage.quota',
      'storage.usage',
    ]) {
      expect(get(metrics, id).confidence).toBe('unavailable');
      expect(get(metrics, id).value).toBeNull();
    }
  });

  it('estimate() reject 时不中断', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: () => Promise.reject(new Error('denied')) },
    });
    const metrics = await memoryDetector.run();
    expect(get(metrics, 'storage.quota').confidence).toBe('unavailable');
  });
});

describe('memory 探测器 —— 诚实性', () => {
  it('不展示由配额反推的磁盘容量', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 300 * 1024 ** 3, usage: 0 }) },
    });
    const metrics = await memoryDetector.run();
    expect(metrics.some((m) => /磁盘剩余|硬盘剩余/.test(zh(m.label) ?? ''))).toBe(false);
    expect(get(metrics, 'memory.physical').confidence).toBe('unavailable');
  });
});
