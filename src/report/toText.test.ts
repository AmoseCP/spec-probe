import { describe, expect, it } from 'vitest';
import { toText } from './toText';
import type { DetectorResult } from '../detect/types';

const results: DetectorResult[] = [
  {
    detector: {
      id: 'memory',
      group: 'memory',
      title: { zh: '内存与存储', en: 'Memory & storage' },
      subtitle: 'navigator.deviceMemory',
      run: async () => [],
    },
    crashed: false,
    durationMs: 1,
    metrics: [
      {
        id: 'memory.deviceMemory',
        group: 'memory',
        label: { zh: '系统内存', en: 'System memory' },
        value: '≥ 8 GB',
        confidence: 'approx',
        source: 'navigator.deviceMemory',
        note: { zh: '封顶在 8', en: 'Capped at 8' },
      },
      {
        id: 'memory.x',
        group: 'memory',
        label: { zh: '缺失项', en: 'Missing' },
        value: null,
        confidence: 'unavailable',
        source: 'navigator.x',
      },
    ],
  },
];

describe('toText', () => {
  it('每一项都带精度标签，脱离页面也不会被误读为精确值', () => {
    const text = toText(results, 'Windows 11 · 16 线程', 'zh');
    expect(text).toContain('系统内存：≥ 8 GB [近似]');
    expect(text).toContain('说明：封顶在 8');
    expect(text).toContain('缺失项：— [不可用]');
    expect(text).toContain('来源：navigator.deviceMemory');
  });

  it('带上识别行、精度说明与"读不到的部分"', () => {
    const text = toText(results, 'Windows 11', 'zh');
    expect(text).toContain('Windows 11');
    expect(text).toContain('精度说明');
    expect(text).toContain('读不到的部分');
    expect(text).toContain('CPU 型号与主频');
    expect(text).toContain('数据未离开本机');
  });

  it('英文报告整体走英文文案', () => {
    const text = toText(results, 'Windows 11', 'en');
    expect(text).toContain('System memory：≥ 8 GB [Approximate]');
    expect(text).toContain('Note: Capped at 8');
    expect(text).toContain('What cannot be read');
    expect(text).toContain('CPU model and clock speed');
    expect(text).not.toContain('读不到的部分');
  });
});
