import { afterEach, describe, expect, it, vi } from 'vitest';
import { devicesDetector } from './devices';
import { get, value, zh } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('devices 探测器 —— 未授权', () => {
  it('能统计数量，label 为空时提示需授权而不是空白', async () => {
    vi.stubGlobal('navigator', {
      maxTouchPoints: 0,
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'videoinput', label: '', deviceId: '' },
          { kind: 'audioinput', label: '', deviceId: '' },
          { kind: 'audioinput', label: '', deviceId: '' },
          { kind: 'audiooutput', label: '', deviceId: '' },
        ],
      },
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: true }));

    const metrics = await devicesDetector.run();

    expect(value(metrics, 'devices.videoinput')).toBe('1 个');
    expect(value(metrics, 'devices.audioinput')).toBe('2 个');
    expect(value(metrics, 'devices.audiooutput')).toBe('1 个');

    const labels = get(metrics, 'devices.labels');
    expect(labels.confidence).toBe('unavailable');
    expect(labels.permission).toBe('microphone');
    expect(zh(labels.note)).toMatch(/需授权/);
  });

  it('未点击按钮时不调用 getUserMedia', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', {
      maxTouchPoints: 0,
      mediaDevices: { enumerateDevices: async () => [], getUserMedia },
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    await devicesDetector.run();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('devices 探测器 —— 已授权', () => {
  it('label 可读时展示具体型号名', async () => {
    vi.stubGlobal('navigator', {
      maxTouchPoints: 10,
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', label: 'Mackie ProFX16v3', deviceId: 'abc' },
        ],
      },
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await devicesDetector.run();
    expect(get(metrics, 'devices.labels').confidence).toBe('exact');
    expect(value(metrics, 'devices.labels')).toBe('Mackie ProFX16v3');
    expect(value(metrics, 'devices.maxTouchPoints')).toBe('10 点触控');
  });
});

describe('devices 探测器 —— 接口缺失', () => {
  it('无 mediaDevices 时标不可用且不抛错', async () => {
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await devicesDetector.run();
    expect(get(metrics, 'devices.videoinput').confidence).toBe('unavailable');
    expect(value(metrics, 'devices.maxTouchPoints')).toBe('无触摸屏');
  });

  it('enumerateDevices reject 时按空列表处理', async () => {
    vi.stubGlobal('navigator', {
      maxTouchPoints: 0,
      mediaDevices: { enumerateDevices: () => Promise.reject(new Error('blocked')) },
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await devicesDetector.run();
    expect(value(metrics, 'devices.videoinput')).toBe('0 个');
  });
});
