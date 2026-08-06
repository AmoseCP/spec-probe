import type { Detector, L10n, Metric } from '../types';
import { NO_API, boolText, exact, safe, unavailable } from '../utils';

function mq(query: string): boolean | null {
  return safe(() => {
    if (typeof matchMedia !== 'function') return null;
    const m = matchMedia(query);
    // 不支持的特性在部分实现里 media 会被规范化成 'not all'
    if (m.media === 'not all') return null;
    return m.matches;
  }, null);
}

const ORIENTATION_LABEL: Record<string, L10n> = {
  'landscape-primary': { zh: '横向', en: 'Landscape' },
  'landscape-secondary': { zh: '横向（翻转）', en: 'Landscape (flipped)' },
  'portrait-primary': { zh: '纵向', en: 'Portrait' },
  'portrait-secondary': { zh: '纵向（翻转）', en: 'Portrait (flipped)' },
};

const NO_MEDIA_FEATURE = {
  zh: '本浏览器不支持该媒体特性',
  en: 'This browser does not support that media feature',
};

export const displayDetector: Detector = {
  id: 'display',
  group: 'display',
  title: { zh: '显示', en: 'Display' },
  subtitle: 'screen · devicePixelRatio · matchMedia',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];

    const w = safe(() => screen.width, 0);
    const h = safe(() => screen.height, 0);
    const dpr = safe(() => window.devicePixelRatio, 0);

    out.push(
      w > 0 && h > 0
        ? exact({
            id: 'display.resolution',
            group: 'display',
            label: { zh: '屏幕分辨率', en: 'Screen resolution' },
            value: `${w} × ${h}`,
            raw: { width: w, height: h },
            source: 'screen.width / screen.height',
            note: {
              zh: '单位是 CSS 像素，不是物理像素；缩放设置会影响该值',
              en: 'In CSS pixels, not physical pixels — display scaling changes this value',
            },
          })
        : unavailable({
            id: 'display.resolution',
            group: 'display',
            label: { zh: '屏幕分辨率', en: 'Screen resolution' },
            source: 'screen.width / screen.height',
          }),
    );

    out.push(
      dpr > 0
        ? exact({
            id: 'display.dpr',
            group: 'display',
            label: { zh: '像素比', en: 'Pixel ratio' },
            value: `${dpr}×`,
            raw: dpr,
            source: 'window.devicePixelRatio',
          })
        : unavailable({
            id: 'display.dpr',
            group: 'display',
            label: { zh: '像素比', en: 'Pixel ratio' },
            source: 'window.devicePixelRatio',
          }),
    );

    if (w > 0 && h > 0 && dpr > 0) {
      out.push(
        exact({
          id: 'display.physicalPixels',
          group: 'display',
          label: { zh: '物理像素', en: 'Physical pixels' },
          value: `${Math.round(w * dpr)} × ${Math.round(h * dpr)}`,
          raw: { width: Math.round(w * dpr), height: Math.round(h * dpr) },
          source: 'screen.width × window.devicePixelRatio',
          note: {
            zh: 'CSS 像素乘以像素比得到，与显示器原生分辨率一致（未开启显示缩放叠加时）',
            en: 'CSS pixels multiplied by the pixel ratio; matches the panel’s native resolution unless extra scaling is applied',
          },
        }),
      );
    }

    const availW = safe(() => screen.availWidth, 0);
    const availH = safe(() => screen.availHeight, 0);
    if (availW > 0 && availH > 0) {
      out.push(
        exact({
          id: 'display.available',
          group: 'display',
          label: { zh: '可用区域', en: 'Available area' },
          value: `${availW} × ${availH}`,
          raw: { width: availW, height: availH },
          source: 'screen.availWidth / screen.availHeight',
          note: {
            zh: '去掉任务栏、Dock、菜单栏之后的区域',
            en: 'What is left after the taskbar, Dock or menu bar',
          },
        }),
      );
    }

    const depth = safe(() => screen.colorDepth, 0);
    if (depth > 0) {
      out.push(
        exact({
          id: 'display.colorDepth',
          group: 'display',
          label: { zh: '色彩深度', en: 'Colour depth' },
          value: { zh: `${depth} 位`, en: `${depth}-bit` },
          raw: depth,
          source: 'screen.colorDepth',
        }),
      );
    }

    // isExtended：仅 Chromium 提供，且不需要权限
    const hasIsExtended = safe(() => 'isExtended' in screen, false);
    out.push(
      hasIsExtended
        ? exact({
            id: 'display.isExtended',
            group: 'display',
            label: { zh: '多显示器', en: 'Multiple displays' },
            value: boolText(
              safe(() => (screen as Screen & { isExtended?: boolean }).isExtended === true, false),
              { zh: '已连接多块显示器', en: 'More than one display connected' },
              { zh: '仅一块显示器', en: 'Single display' },
            ),
            raw: safe(() => (screen as Screen & { isExtended?: boolean }).isExtended, null),
            source: 'screen.isExtended',
            note: {
              zh: '只能判断有没有扩展屏，数量与排列需要 window-management 权限',
              en: 'Only tells you whether a second display exists; counts and layout need the window-management permission',
            },
          })
        : unavailable({
            id: 'display.isExtended',
            group: 'display',
            label: { zh: '多显示器', en: 'Multiple displays' },
            source: 'screen.isExtended',
            note: { zh: '本浏览器不提供该属性', en: 'This browser does not provide that property' },
          }),
    );

    const hdr = mq('(dynamic-range: high)');
    out.push(
      hdr === null
        ? unavailable({
            id: 'display.hdr',
            group: 'display',
            label: { zh: 'HDR', en: 'HDR' },
            source: 'matchMedia("(dynamic-range: high)")',
            note: NO_MEDIA_FEATURE,
          })
        : exact({
            id: 'display.hdr',
            group: 'display',
            label: { zh: 'HDR', en: 'HDR' },
            value: boolText(
              hdr,
              { zh: '支持高动态范围', en: 'High dynamic range' },
              { zh: '标准动态范围', en: 'Standard dynamic range' },
            ),
            raw: hdr,
            source: 'matchMedia("(dynamic-range: high)")',
          }),
    );

    const p3 = mq('(color-gamut: p3)');
    const rec2020 = mq('(color-gamut: rec2020)');
    out.push(
      p3 === null
        ? unavailable({
            id: 'display.colorGamut',
            group: 'display',
            label: { zh: '色域', en: 'Colour gamut' },
            source: 'matchMedia("(color-gamut: p3)")',
            note: NO_MEDIA_FEATURE,
          })
        : exact({
            id: 'display.colorGamut',
            group: 'display',
            label: { zh: '色域', en: 'Colour gamut' },
            value: rec2020 ? 'Rec. 2020' : p3 ? 'Display P3' : 'sRGB',
            raw: { p3, rec2020 },
            source: 'matchMedia("(color-gamut: …)")',
            note: {
              zh: '媒体查询只分三档，不给出具体覆盖百分比',
              en: 'The media query has only three buckets; it gives no coverage percentage',
            },
          }),
    );

    const orientation = safe(() => screen.orientation?.type, '');
    if (orientation) {
      out.push(
        exact({
          id: 'display.orientation',
          group: 'display',
          label: { zh: '屏幕方向', en: 'Orientation' },
          value: ORIENTATION_LABEL[orientation] ?? orientation,
          raw: orientation,
          source: 'screen.orientation.type',
        }),
      );
    }

    out.push(
      unavailable({
        id: 'display.panel',
        group: 'display',
        label: { zh: '显示器型号与物理尺寸', en: 'Monitor model and physical size' },
        source: NO_API,
        note: {
          zh: '浏览器不暴露显示器 EDID 信息，无法得到品牌、型号与英寸数',
          en: 'Browsers do not expose display EDID data, so brand, model and diagonal size are unknowable',
        },
      }),
    );

    return out;
  },
};
