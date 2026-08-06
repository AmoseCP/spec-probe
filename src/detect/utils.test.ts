import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuration,
  isGenericGpuName,
  prettyGpuName,
  safe,
  safeAsync,
  withTimeout,
} from './utils';

describe('safe', () => {
  it('抛错时返回 fallback', () => {
    expect(
      safe(() => {
        throw new Error('boom');
      }, 'fb'),
    ).toBe('fb');
  });

  it('返回 undefined / null 也走 fallback', () => {
    expect(safe(() => undefined as unknown as string, 'fb')).toBe('fb');
    expect(safe(() => null as unknown as string, 'fb')).toBe('fb');
  });

  it('正常值原样返回，false 与 0 不被当作缺失', () => {
    expect(safe(() => false, true)).toBe(false);
    expect(safe(() => 0, 9)).toBe(0);
  });
});

describe('safeAsync', () => {
  it('reject 时返回 fallback', async () => {
    await expect(safeAsync(() => Promise.reject(new Error('x')), 'fb')).resolves.toBe('fb');
  });

  it('同步抛错也兜住', async () => {
    await expect(
      safeAsync(() => {
        throw new Error('x');
      }, 'fb'),
    ).resolves.toBe('fb');
  });
});

describe('withTimeout', () => {
  it('超时返回 fallback', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'fb')).resolves.toBe('fb');
  });

  it('及时 resolve 时返回真实值', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100, 'fb')).resolves.toBe('ok');
  });
});

describe('formatBytes', () => {
  it('按 1024 进制换算', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 3 * 2)).toBe('2 GB');
  });

  it('非法输入返回占位符', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('Infinity 返回 null（电池 chargingTime 常为 Infinity）', () => {
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });

  it('正常秒数转双语时长', () => {
    expect(formatDuration(3600)).toEqual({ zh: '1 小时', en: '1 h' });
    expect(formatDuration(5400)).toEqual({ zh: '1 小时 30 分钟', en: '1 h 30 min' });
    expect(formatDuration(120)).toEqual({ zh: '2 分钟', en: '2 min' });
  });
});

describe('prettyGpuName', () => {
  it('提取 ANGLE 三段式的中间段', () => {
    expect(
      prettyGpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ).toBe('NVIDIA GeForce RTX 3080 Ti');
  });

  it('处理 Apple Metal 前缀', () => {
    expect(
      prettyGpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)'),
    ).toBe('Apple M2 Pro');
  });

  it('非 ANGLE 字符串原样保留', () => {
    expect(prettyGpuName('Apple GPU')).toBe('Apple GPU');
  });
});

describe('isGenericGpuName', () => {
  it('识别笼统名称', () => {
    expect(isGenericGpuName('Apple GPU')).toBe(true);
    expect(isGenericGpuName('Google SwiftShader')).toBe(true);
    expect(isGenericGpuName('')).toBe(true);
  });

  it('真实型号不算笼统', () => {
    expect(isGenericGpuName('NVIDIA GeForce RTX 3080 Ti')).toBe(false);
  });
});
