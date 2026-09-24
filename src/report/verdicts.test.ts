import { describe, expect, it } from 'vitest';
import { buildVerdicts } from './verdicts';
import type { DetectorResult, Metric } from '../detect/types';

function codec(id: string, facts: Partial<Record<'supported' | 'smooth' | 'powerEfficient', boolean>>): Metric {
  return {
    id,
    group: 'codec',
    label: id,
    value: 'x',
    raw: { supported: true, smooth: true, powerEfficient: false, ...facts },
    confidence: 'exact',
    source: 'navigator.mediaCapabilities.decodingInfo',
  };
}

function wrap(metrics: Metric[]): DetectorResult[] {
  return [
    {
      detector: {
        id: 'codec',
        group: 'codec',
        title: 'codec',
        subtitle: 'test',
        run: async () => [],
      },
      metrics,
      crashed: false,
      durationMs: 0,
    },
  ];
}

describe('buildVerdicts', () => {
  it('H.264 硬解给正面结论，软解给提醒', () => {
    const good = buildVerdicts(wrap([codec('codec.h264.1080p30', { powerEfficient: true })]));
    expect(good[0].tone).toBe('good');
    expect(good[0].basis).toEqual(['codec.h264.1080p30']);

    const bad = buildVerdicts(wrap([codec('codec.h264.1080p30', { powerEfficient: false })]));
    expect(bad[0].tone).toBe('caution');
  });

  it('4K 结论要求 powerEfficient 且 smooth', () => {
    const hw = buildVerdicts(
      wrap([codec('codec.vp9.4k60', { powerEfficient: true, smooth: true })]),
    ).find((v) => v.id === 'verdict.4k')!;
    expect(hw.tone).toBe('good');

    const sw = buildVerdicts(
      wrap([codec('codec.vp9.4k60', { powerEfficient: false, smooth: true })]),
    ).find((v) => v.id === 'verdict.4k')!;
    expect(sw.tone).toBe('caution');
  });

  it('有硬解但不流畅时，不能说成"没有硬解"', () => {
    const v = buildVerdicts(
      wrap([codec('codec.hevc.4k60', { powerEfficient: true, smooth: false })]),
    ).find((x) => x.id === 'verdict.4k')!;
    expect(v.tone).toBe('caution');
    expect(v.text.zh).toContain('有硬件解码');
    expect(v.text.zh).not.toContain('没有硬解');
    expect(v.basis).toEqual(['codec.hevc.4k60']);
  });

  it('数据缺失时不给结论，绝不猜', () => {
    expect(buildVerdicts(wrap([]))).toEqual([]);
    expect(buildVerdicts([])).toEqual([]);
  });

  it('confidence 不是 exact 的项不作为依据', () => {
    const approxMetric: Metric = {
      id: 'codec.h264.1080p30',
      group: 'codec',
      label: 'x',
      value: 'x',
      raw: { supported: true, smooth: true, powerEfficient: true },
      confidence: 'approx',
      note: '降级值',
      source: 'test',
    };
    expect(buildVerdicts(wrap([approxMetric]))).toEqual([]);
  });

  it('永远不读跑分结果', () => {
    const bench: Metric = {
      id: 'benchmark.score',
      group: 'cpu',
      label: '跑分',
      value: '999 M 次/秒',
      raw: 999_000_000,
      confidence: 'approx',
      note: '代理指标',
      source: 'Web Worker',
    };
    // 只有跑分、没有编解码数据时，一条结论都不应该出现
    expect(buildVerdicts(wrap([bench]))).toEqual([]);

    // 有编解码数据时，结论的依据里也不能出现 benchmark
    const mixed = buildVerdicts(wrap([bench, codec('codec.h264.1080p30', { powerEfficient: true })]));
    expect(mixed.length).toBeGreaterThan(0);
    for (const v of mixed) {
      for (const b of v.basis) expect(b.startsWith('codec.')).toBe(true);
    }
  });

  it('每条结论都带非空依据与中英文案', () => {
    const verdicts = buildVerdicts(
      wrap([
        codec('codec.h264.1080p30', { powerEfficient: true }),
        codec('codec.hevc.4k60', { powerEfficient: true, smooth: true }),
        codec('codec.av1.1080p30', { powerEfficient: false }),
        codec('codec.encode.h264.1080p30', { powerEfficient: false }),
      ]),
    );

    expect(verdicts).toHaveLength(4);
    for (const v of verdicts) {
      expect(v.basis.length).toBeGreaterThan(0);
      expect(v.text.zh.length).toBeGreaterThan(0);
      expect(v.text.en.length).toBeGreaterThan(0);
    }
  });

  it('不支持 AV1 时说清楚是放不了，而不是"慢"', () => {
    const v = buildVerdicts(
      wrap([codec('codec.av1.1080p30', { supported: false, smooth: false })]),
    ).find((x) => x.id === 'verdict.av1')!;
    expect(v.tone).toBe('caution');
    expect(v.text.zh).toMatch(/无法播放/);
  });
});
