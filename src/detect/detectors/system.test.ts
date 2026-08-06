import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickBrand, systemDetector, windowsNameFromPlatformVersion } from './system';
import { get, value, zh } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('windowsNameFromPlatformVersion', () => {
  it('主版本号 ≥ 13 判为 Windows 11', () => {
    expect(windowsNameFromPlatformVersion('15.0.0')).toBe('Windows 11');
    expect(windowsNameFromPlatformVersion('13.0.0')).toBe('Windows 11');
    expect(windowsNameFromPlatformVersion('10.0.0')).toBe('Windows 10');
    expect(windowsNameFromPlatformVersion('0.1.0')).toBe('Windows 7/8.1');
    expect(windowsNameFromPlatformVersion('')).toBeNull();
  });
});

describe('pickBrand —— 不能按位置取，brands 顺序由浏览器打乱', () => {
  const edge = { brand: 'Microsoft Edge', version: '131.0.2903.86' };
  const chromium = { brand: 'Chromium', version: '131.0.6778.86' };
  const grease = { brand: 'Not/A)Brand', version: '99' };

  it('Edge：无论 Chromium 排在前还是后，都显示 Microsoft Edge', () => {
    expect(pickBrand([grease, chromium, edge])).toEqual(edge);
    expect(pickBrand([edge, chromium, grease])).toEqual(edge);
    expect(pickBrand([chromium, grease, edge])).toEqual(edge);
  });

  it('Chrome 同理', () => {
    const chrome = { brand: 'Google Chrome', version: '131.0.6778.86' };
    expect(pickBrand([chrome, chromium, grease])).toEqual(chrome);
    expect(pickBrand([grease, chromium, chrome])).toEqual(chrome);
  });

  it('只有 Chromium 时才显示 Chromium（如 Electron、部分内核浏览器）', () => {
    expect(pickBrand([grease, chromium])).toEqual(chromium);
  });

  it('识别各种写法的 GREASE 占位品牌', () => {
    for (const fake of ['Not/A)Brand', 'Not_A Brand', ';Not A Brand', 'Not-A.Brand']) {
      expect(pickBrand([{ brand: fake, version: '99' }])).toBeNull();
    }
  });

  it('空列表返回 null，交给 UA 降级路径', () => {
    expect(pickBrand([])).toBeNull();
  });
});

describe('system 探测器 —— UACH 可用', () => {
  it('Windows 11 判定标 approx 并说明依据', async () => {
    vi.stubGlobal('navigator', {
      userAgentData: {
        platform: 'Windows',
        mobile: false,
        getHighEntropyValues: async () => ({
          platformVersion: '15.0.0',
          fullVersionList: [
            { brand: 'Not/A)Brand', version: '99' },
            { brand: 'Chromium', version: '131.0.6778.86' },
            { brand: 'Google Chrome', version: '131.0.6778.86' },
          ],
        }),
      },
      languages: ['zh-CN', 'en'],
      cookieEnabled: true,
      pdfViewerEnabled: true,
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: q.includes('dark') }));

    const metrics = await systemDetector.run();
    const os = get(metrics, 'system.os');

    expect(value(metrics, 'system.os')).toBe('Windows 11');
    expect(os.confidence).toBe('approx');
    expect(zh(os.note)).toMatch(/platformVersion/);

    expect(get(metrics, 'system.browser').confidence).toBe('exact');
    expect(value(metrics, 'system.browser')).toBe('Google Chrome 131.0.6778.86');
    expect(value(metrics, 'system.mobile')).toBe('桌面设备');
    expect(value(metrics, 'system.languages')).toBe('zh-CN, en');
    expect(value(metrics, 'system.colorScheme')).toBe('深色');
  });

  it('Edge 的 UACH 形状：显示 Microsoft Edge 而不是 Chromium', async () => {
    vi.stubGlobal('navigator', {
      userAgentData: {
        platform: 'Windows',
        mobile: false,
        getHighEntropyValues: async () => ({
          platformVersion: '15.0.0',
          fullVersionList: [
            { brand: 'Chromium', version: '131.0.6778.86' },
            { brand: 'Microsoft Edge', version: '131.0.2903.86' },
            { brand: 'Not_A Brand', version: '24.0.0.0' },
          ],
        }),
      },
      languages: ['zh-CN'],
      cookieEnabled: true,
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await systemDetector.run();
    expect(value(metrics, 'system.browser')).toBe('Microsoft Edge 131.0.2903.86');
    // 完整列表仍在 raw 里，导出 JSON 时能看到 Chromium 版本
    expect((get(metrics, 'system.browser').raw as unknown[]).length).toBe(3);
  });

  it('非 Windows 平台直接给 exact 版本号', async () => {
    vi.stubGlobal('navigator', {
      userAgentData: {
        platform: 'macOS',
        getHighEntropyValues: async () => ({ platformVersion: '15.1.0', fullVersionList: [] }),
      },
      languages: ['en-US'],
      cookieEnabled: true,
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await systemDetector.run();
    expect(get(metrics, 'system.os').confidence).toBe('exact');
    expect(value(metrics, 'system.os')).toBe('macOS 15.1.0');
  });
});

describe('system 探测器 —— UACH 缺失（Firefox / Safari）', () => {
  it('降级到 navigator.platform 并标 approx', async () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/133.0',
      languages: ['zh-CN'],
      cookieEnabled: true,
    });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await systemDetector.run();

    const os = get(metrics, 'system.os');
    expect(os.confidence).toBe('approx');
    expect(value(metrics, 'system.os')).toBe('MacIntel');
    expect(zh(os.note)).toMatch(/冻结/);

    const browser = get(metrics, 'system.browser');
    expect(browser.confidence).toBe('approx');
    expect(browser.source).toBe('navigator.userAgent');
  });

  it('时区与语言在任何浏览器都应可读', async () => {
    vi.stubGlobal('navigator', { languages: ['zh-CN'], cookieEnabled: true });
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));

    const metrics = await systemDetector.run();
    expect(get(metrics, 'system.timezone').confidence).toBe('exact');
    expect(value(metrics, 'system.timezone')).toBeTruthy();
  });

  it('navigator 几乎全空时不抛错', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('matchMedia', undefined);

    await expect(systemDetector.run()).resolves.toBeInstanceOf(Array);
  });
});
