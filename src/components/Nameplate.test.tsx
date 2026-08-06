import { describe, expect, it } from 'vitest';
import { buildNameplate } from './Nameplate';
import type { Detector, DetectorResult, Metric } from '../detect/types';

const detector = (id: string): Detector => ({
  id,
  group: 'cpu',
  title: id,
  subtitle: 'test',
  run: async () => [],
});

function result(id: string, metrics: Metric[]): DetectorResult {
  return { detector: detector(id), metrics, crashed: false, durationMs: 0 };
}

const m = (id: string, value: string | null): Metric =>
  value === null
    ? { id, group: 'cpu', label: id, value: null, confidence: 'unavailable', source: 'test' }
    : { id, group: 'cpu', label: id, value, confidence: 'exact', source: 'test' };

describe('buildNameplate', () => {
  it('按固定顺序拼接，并合并架构与位宽', () => {
    const parts = buildNameplate([
      result('system', [m('system.os', 'Windows 11')]),
      result('cpu', [m('cpu.architecture', 'x86'), m('cpu.bitness', '64 位'), m('cpu.threads', '16 线程')]),
      result('memory', [m('memory.deviceMemory', '≥ 8 GB')]),
      result('gpu', [m('gpu.renderer', 'NVIDIA GeForce RTX 3080 Ti')]),
    ]);

    expect(parts).toEqual([
      'Windows 11',
      'x86 64 位',
      '16 线程',
      '≥ 8 GB',
      'NVIDIA GeForce RTX 3080 Ti',
    ]);
  });

  it('读不到的项直接跳过，不占位也不猜测', () => {
    const parts = buildNameplate([
      result('system', [m('system.os', null)]),
      result('cpu', [m('cpu.threads', '8 线程')]),
    ]);
    expect(parts).toEqual(['8 线程']);
  });

  it('全部读不到时返回空数组', () => {
    expect(buildNameplate([result('cpu', [m('cpu.threads', null)])])).toEqual([]);
  });
});
