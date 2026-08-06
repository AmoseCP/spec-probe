import { describe, expect, it } from 'vitest';
import { toJson, toJsonReport } from './toJson';
import type { DetectorResult } from '../detect/types';

const results: DetectorResult[] = [
  {
    detector: {
      id: 'cpu',
      group: 'cpu',
      title: { zh: '处理器', en: 'Processor' },
      subtitle: 'navigator.hardwareConcurrency',
      run: async () => [],
    },
    crashed: false,
    durationMs: 2,
    metrics: [
      {
        id: 'cpu.threads',
        group: 'cpu',
        label: { zh: '逻辑核心数', en: 'Logical cores' },
        value: { zh: '16 线程', en: '16 threads' },
        raw: 16,
        confidence: 'exact',
        source: 'navigator.hardwareConcurrency',
      },
      {
        id: 'cpu.name',
        group: 'cpu',
        label: { zh: '处理器型号', en: 'CPU model' },
        value: null,
        confidence: 'unavailable',
        source: '（无对应 Web API）',
        note: { zh: '浏览器不暴露', en: 'Not exposed by browsers' },
      },
    ],
  },
];

const at = new Date('2026-08-05T12:00:00.000Z');

describe('toJsonReport', () => {
  it('带上 raw 原始值，便于二次分析', () => {
    const report = toJsonReport(results, 'Windows 11', 'zh', at);
    expect(report.groups[0].metrics[0].raw).toBe(16);
  });

  it('精度含义随报告一起导出，脱离页面也能读懂', () => {
    const report = toJsonReport(results, '', 'zh', at);
    expect(report.confidenceMeaning.approx).toMatch(/取整|封顶/);
    expect(report.groups[0].metrics[0].confidence).toBe('exact');
  });

  it('不可用项的 value 为 null，不写成空字符串', () => {
    const report = toJsonReport(results, '', 'zh', at);
    const m = report.groups[0].metrics[1];
    expect(m.value).toBeNull();
    expect(m.confidence).toBe('unavailable');
  });

  it('没有 raw 的项不写这个键', () => {
    const report = toJsonReport(results, '', 'zh', at);
    expect('raw' in report.groups[0].metrics[1]).toBe(false);
  });

  it('按语言导出文案，并附"读不到的部分"', () => {
    const zhReport = toJsonReport(results, '', 'zh', at);
    const enReport = toJsonReport(results, '', 'en', at);
    expect(zhReport.groups[0].metrics[0].value).toBe('16 线程');
    expect(enReport.groups[0].metrics[0].value).toBe('16 threads');
    expect(enReport.unreadable[0].label).toBe('CPU model and clock speed');
    expect(zhReport.unreadable.length).toBeGreaterThan(10);
  });

  it('schema 与时间戳固定，便于机读', () => {
    const report = toJsonReport(results, '', 'zh', at);
    expect(report.schema).toBe('spec-probe/v1');
    expect(report.generatedAt).toBe('2026-08-05T12:00:00.000Z');
  });
});

describe('toJson', () => {
  it('输出合法 JSON', () => {
    const parsed = JSON.parse(toJson(results, 'Windows 11', 'zh', at));
    expect(parsed.groups[0].id).toBe('cpu');
    expect(parsed.groups[0].metrics[0].source).toBe('navigator.hardwareConcurrency');
  });
});
