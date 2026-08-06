import type { Detector, Metric } from '../types';
import { approx, boolText, exact, safe, unavailable } from '../utils';
import { getHighEntropy, getUserAgentData } from '../uach';

const PLATFORM_LABEL: Record<string, string> = {
  Windows: 'Windows',
  macOS: 'macOS',
  Linux: 'Linux',
  Android: 'Android',
  'Chrome OS': 'ChromeOS',
};

/**
 * UACH 的 platformVersion 主版本号 ≥ 13 表示 Windows 11。
 * UA 字符串里永远是 Windows NT 10.0，据此无法区分。
 */
export function windowsNameFromPlatformVersion(platformVersion: string): string | null {
  const major = Number.parseInt(platformVersion.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major)) return null;
  if (major >= 13) return 'Windows 11';
  if (major > 0) return 'Windows 10';
  return 'Windows 7/8.1';
}

/**
 * 从 fullVersionList 里挑出该显示的浏览器。
 *
 * 不能按位置取：UA-CH 规范要求实现打乱 brands 顺序（GREASE），
 * 各家的真实品牌顺序也不一致 —— Edge 会同时列出 "Chromium" 和 "Microsoft Edge"，
 * 按位置取有可能把 Edge 显示成 Chromium。规则改为：优先取具体厂商品牌，
 * 只剩通用引擎名时才用它。
 */
export function pickBrand(
  list: Array<{ brand: string; version: string }>,
): { brand: string; version: string } | null {
  // GREASE 占位品牌，形如 "Not/A)Brand"、"Not_A Brand"、";Not A Brand"
  const real = list.filter((b) => !/not.?[/_ ]?a.?[/_ ]?brand/i.test(b.brand));
  if (real.length === 0) return null;

  const vendor = real.find((b) => !/^chromium$/i.test(b.brand));
  return vendor ?? real[0];
}

export const systemDetector: Detector = {
  id: 'system',
  group: 'system',
  title: { zh: '系统与环境', en: 'System & environment' },
  subtitle: 'navigator.userAgentData · Intl · matchMedia',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];
    const uaData = getUserAgentData();
    const hi = await getHighEntropy();

    const osLabel = { zh: '操作系统', en: 'Operating system' };

    // 操作系统
    const platform = uaData?.platform ?? hi?.platform ?? '';
    if (platform && hi?.platformVersion) {
      const isWindows = platform === 'Windows';
      const winName = isWindows ? windowsNameFromPlatformVersion(hi.platformVersion) : null;
      out.push(
        winName
          ? approx({
              id: 'system.os',
              group: 'system',
              label: osLabel,
              value: winName,
              raw: { platform, platformVersion: hi.platformVersion },
              source: 'navigator.userAgentData.getHighEntropyValues(["platformVersion"])',
              note: {
                zh: 'Windows 10 与 11 靠 platformVersion 主版本号区分（≥13 视为 11）；UA 字符串里两者都是 Windows NT 10.0',
                en: 'Windows 10 and 11 are told apart by the platformVersion major number (≥13 means 11); the UA string says Windows NT 10.0 for both',
              },
            })
          : exact({
              id: 'system.os',
              group: 'system',
              label: osLabel,
              value: `${PLATFORM_LABEL[platform] ?? platform} ${hi.platformVersion}`,
              raw: { platform, platformVersion: hi.platformVersion },
              source: 'navigator.userAgentData.getHighEntropyValues(["platformVersion"])',
            }),
      );
    } else {
      const legacy = safe(() => navigator.platform, '');
      out.push(
        legacy
          ? approx({
              id: 'system.os',
              group: 'system',
              label: osLabel,
              value: legacy,
              raw: legacy,
              source: 'navigator.platform',
              note: {
                zh: '降级来源。该字段已被浏览器冻结，只给出粗略平台名，不含版本号',
                en: 'Fallback source. This field is frozen by browsers: a coarse platform name, no version',
              },
            })
          : unavailable({
              id: 'system.os',
              group: 'system',
              label: osLabel,
              source: 'navigator.userAgentData / navigator.platform',
            }),
      );
    }

    // 浏览器版本
    const browserLabel = { zh: '浏览器', en: 'Browser' };
    const fvl = hi?.fullVersionList ?? [];
    const main = pickBrand(fvl);
    if (main) {
      out.push(
        exact({
          id: 'system.browser',
          group: 'system',
          label: browserLabel,
          value: `${main.brand} ${main.version}`,
          // raw 保留完整列表：Edge 之类会同时列出 Chromium 与厂商品牌
          raw: fvl,
          source: 'navigator.userAgentData.getHighEntropyValues(["fullVersionList"])',
        }),
      );
    } else {
      const ua = safe(() => navigator.userAgent, '');
      out.push(
        ua
          ? approx({
              id: 'system.browser',
              group: 'system',
              label: browserLabel,
              value: ua,
              raw: ua,
              source: 'navigator.userAgent',
              note: {
                zh: '降级来源。UA 字符串已被浏览器冻结/裁剪，版本号可能不准确',
                en: 'Fallback source. UA strings are frozen and trimmed, so the version may be inaccurate',
              },
            })
          : unavailable({
              id: 'system.browser',
              group: 'system',
              label: browserLabel,
              source: 'navigator.userAgent',
            }),
      );
    }

    const mobile = uaData?.mobile;
    if (typeof mobile === 'boolean') {
      out.push(
        exact({
          id: 'system.mobile',
          group: 'system',
          label: { zh: '设备形态', en: 'Form factor' },
          value: mobile ? { zh: '移动设备', en: 'Mobile' } : { zh: '桌面设备', en: 'Desktop' },
          raw: mobile,
          source: 'navigator.userAgentData.mobile',
        }),
      );
    }

    const langs = safe(() => Array.from(navigator.languages ?? []), [] as string[]);
    out.push(
      langs.length > 0
        ? exact({
            id: 'system.languages',
            group: 'system',
            label: { zh: '语言偏好', en: 'Language preferences' },
            value: langs.join(', '),
            raw: langs,
            source: 'navigator.languages',
          })
        : unavailable({
            id: 'system.languages',
            group: 'system',
            label: { zh: '语言偏好', en: 'Language preferences' },
            source: 'navigator.languages',
          }),
    );

    const tz = safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, '');
    out.push(
      tz
        ? exact({
            id: 'system.timezone',
            group: 'system',
            label: { zh: '时区', en: 'Time zone' },
            value: tz,
            raw: tz,
            source: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
          })
        : unavailable({
            id: 'system.timezone',
            group: 'system',
            label: { zh: '时区', en: 'Time zone' },
            source: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
          }),
    );

    const dark = safe(
      () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
      false,
    );
    out.push(
      exact({
        id: 'system.colorScheme',
        group: 'system',
        label: { zh: '主题偏好', en: 'Colour scheme' },
        value: dark ? { zh: '深色', en: 'Dark' } : { zh: '浅色', en: 'Light' },
        raw: dark ? 'dark' : 'light',
        source: 'matchMedia("(prefers-color-scheme: dark)")',
      }),
    );

    const reduced = safe(
      () =>
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      false,
    );
    out.push(
      exact({
        id: 'system.reducedMotion',
        group: 'system',
        label: { zh: '减少动效', en: 'Reduced motion' },
        value: boolText(reduced, { zh: '已开启', en: 'On' }, { zh: '未开启', en: 'Off' }),
        raw: reduced,
        source: 'matchMedia("(prefers-reduced-motion: reduce)")',
      }),
    );

    const pdf = safe(
      () => (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled,
      undefined as boolean | undefined,
    );
    if (typeof pdf === 'boolean') {
      out.push(
        exact({
          id: 'system.pdfViewer',
          group: 'system',
          label: { zh: '内置 PDF 阅读器', en: 'Built-in PDF viewer' },
          value: boolText(pdf, { zh: '已启用', en: 'Enabled' }, { zh: '未启用', en: 'Disabled' }),
          raw: pdf,
          source: 'navigator.pdfViewerEnabled',
        }),
      );
    }

    const cookie = safe(() => navigator.cookieEnabled, false);
    out.push(
      exact({
        id: 'system.cookieEnabled',
        group: 'system',
        label: { zh: 'Cookie', en: 'Cookies' },
        value: boolText(cookie, { zh: '已启用', en: 'Enabled' }, { zh: '已禁用', en: 'Disabled' }),
        raw: cookie,
        source: 'navigator.cookieEnabled',
      }),
    );

    return out;
  },
};
