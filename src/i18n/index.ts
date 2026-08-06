import { createContext, useContext } from 'react';
import type { Lang, Text } from '../detect/types';

/** 取出对应语言的文本。纯字符串（型号名、API 名）原样返回。 */
export function t(text: Text, lang: Lang): string;
export function t(text: Text | null | undefined, lang: Lang): string | null;
export function t(text: Text | null | undefined, lang: Lang): string | null {
  if (text === null || text === undefined) return null;
  return typeof text === 'string' ? text : text[lang];
}

export const LangContext = createContext<Lang>('zh');
export const useLang = (): Lang => useContext(LangContext);

const STORAGE_KEY = 'spec-probe.lang';

/** 初始语言：上次选择 > 浏览器语言 > 中文 */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* 隐私模式下 localStorage 可能抛错，忽略 */
  }
  try {
    return (navigator.languages ?? []).some((l) => l.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 存不下就算了，不影响功能 */
  }
}

/** 界面静态文案。探测结果里的文案随 Metric 一起走，不在这里。 */
export const UI = {
  htmlTitle: { zh: '本机配置探测器', en: 'Device Spec Probe' },
  nameplateLabel: { zh: '本机识别', en: 'This machine' },
  detecting: { zh: '检测中', en: 'Detecting' },
  allBlocked: {
    zh: '本浏览器屏蔽了全部识别项',
    en: 'This browser blocks every identifying value',
  },
  intro: {
    zh: '这个页面只用浏览器原生接口读取本机信息，',
    en: 'This page reads your machine using browser APIs only, ',
  },
  introStrong: { zh: '并逐项标注可信程度', en: 'and labels how trustworthy each value is' },
  introRest: {
    zh: '。浏览器出于隐私考虑会把很多数值取整、封顶或分档 —— 把这类值当成真实配置展示是常见的误导，所以每一项都写明来源接口，近似的地方也写明为什么近似。数据全部在本机处理，不会发往任何服务器。',
    en: '. Browsers round, cap and bucket many of these numbers for privacy — presenting them as real specs is the usual way these pages mislead people. So every row names the API it came from, and every approximate row says why it is approximate. Everything runs locally; nothing is sent anywhere.',
  },
  legendTitle: { zh: '精度图例', en: 'Confidence legend' },
  legend: {
    exact: {
      zh: '浏览器返回的就是真实值，没有做模糊化处理。',
      en: 'The browser returns the real value, unmodified.',
    },
    approx: {
      zh: '被取整、封顶、分档，或只是代理指标。每一项都会写明为什么近似。',
      en: 'Rounded, capped, bucketed, or a proxy measure. Each row says why.',
    },
    unavailable: {
      zh: '本浏览器不提供该接口。不是检测失败，重试也读不到。',
      en: 'This browser has no such API. Not a failure — retrying will not help.',
    },
  },
  pending: { zh: '检测中…', en: 'detecting…' },
  noApi: { zh: '无此接口', en: 'No such API' },
  needPermission: {
    camera: { zh: '需授权摄像头', en: 'Camera permission needed' },
    microphone: { zh: '需授权麦克风', en: 'Microphone permission needed' },
    'window-management': { zh: '需授权窗口管理', en: 'Window management permission needed' },
    generic: { zh: '需授权', en: 'Permission needed' },
  },
  sourcePrefix: { zh: '来源：', en: 'Source: ' },
  unavailableTitle: { zh: '读不到的部分', en: 'What cannot be read' },
  unavailableIntro: {
    zh: '以下项目浏览器根本不提供，任何网页都读不到。列出来是为了说明边界 —— 声称能在网页里读出这些的工具，给的是猜测值。',
    en: 'Browsers simply do not expose the following — no web page can read them. This list marks the boundary: any site claiming to show these is guessing.',
  },
  whyMore: { zh: '为什么读不到', en: 'Why not' },
  specLinkNote: {
    zh: '规范链接会打开外部站点。本页自身不发起任何外部请求，点不点由你决定。',
    en: 'Spec links open external sites. This page itself makes no outside requests — following them is your choice.',
  },
  verdictsTitle: { zh: '这台机器能干什么', en: 'What this machine can do' },
  verdictsIntro: {
    zh: '以下结论只由编解码硬件加速的检测结果推出，每条都标了依据的检测项。跑分是代理指标，不参与这里的判断。',
    en: 'These follow only from the codec hardware-acceleration results, and each one names the rows it rests on. The benchmark is a proxy measure and is deliberately not used here.',
  },
  verdictBasis: { zh: '依据：', en: 'Based on: ' },
  permissionTitle: { zh: '需授权的增强项', en: 'Opt-in extras' },
  permissionIntro: {
    zh: '以下项目需要你主动授权才能读取。页面默认不请求任何权限 —— 点按钮才会弹出授权框，用完立即释放设备。',
    en: 'These need your explicit permission. Nothing is requested until you press a button, and devices are released the moment the value is read.',
  },
  grantDeviceNames: { zh: '授权麦克风以读取设备名称', en: 'Grant microphone to read device names' },
  // aria-label 必须以可见文案开头（WCAG 2.5.3 Label in Name），后面才补充后果说明
  grantDeviceNamesAria: {
    zh: '授权麦克风以读取设备名称，会弹出浏览器权限请求，读到名称后立即关闭麦克风',
    en: 'Grant microphone to read device names — the browser will prompt, and the microphone is released as soon as the names are read',
  },
  grantScreens: { zh: '授权窗口管理以读取显示器详情', en: 'Grant window management to read display details' },
  grantScreensAria: {
    zh: '授权窗口管理以读取显示器详情，会弹出浏览器权限请求',
    en: 'Grant window management to read display details — the browser will prompt',
  },
  granting: { zh: '等待授权…', en: 'Waiting for permission…' },
  deviceNamesHint: {
    zh: '未授权时只能拿到设备数量。授权后立刻关闭音频轨，指示灯会随之熄灭。',
    en: 'Without permission only device counts are available. The audio track is stopped immediately after reading, so the indicator light goes out.',
  },
  screensHint: {
    zh: '未授权时只知道有没有扩展屏。授权后可读到每块显示器的分辨率与主屏标记。',
    en: 'Without permission only "extended or not" is known. With it, each display reports its resolution and primary flag.',
  },
  denied: { zh: '授权被拒绝，其余项不受影响', en: 'Permission denied; everything else is unaffected' },
  copy: { zh: '复制报告', en: 'Copy report' },
  copyAria: {
    zh: '复制报告：纯文本格式，每项都带精度标签',
    en: 'Copy report — plain text, every row carries its confidence label',
  },
  copied: { zh: '报告已复制到剪贴板', en: 'Report copied to clipboard' },
  copyFailed: {
    zh: '复制被浏览器拒绝，请手动选择文本',
    en: 'The browser refused the copy; select the text manually',
  },
  exportJson: { zh: '导出 JSON', en: 'Export JSON' },
  exportJsonAria: {
    zh: '导出 JSON：机读报告，含 raw 原始值',
    en: 'Export JSON — machine-readable report including raw values',
  },
  exported: { zh: 'JSON 已下载', en: 'JSON downloaded' },
  exportPng: { zh: '导出图片', en: 'Export image' },
  exportPngAria: {
    zh: '导出图片：把报告画成一张 PNG',
    en: 'Export image — the report drawn as a single PNG',
  },
  exportedPng: { zh: '图片已下载', en: 'Image downloaded' },
  exportPngFailed: {
    zh: '本浏览器不支持 Canvas 导出',
    en: 'This browser cannot export a canvas',
  },
  rerun: { zh: '重新检测', en: 'Re-detect' },
  rerunAria: { zh: '重新检测：再跑一遍全部探测器', en: 'Re-detect — run every detector again' },
  rerunning: { zh: '检测中…', en: 'Detecting…' },
  langToggle: { zh: 'English', en: '中文' },
  langToggleAria: { zh: 'Switch to English', en: '切换到中文' },
  footerPrivacy: {
    zh: '全部检测在浏览器本地完成，没有任何数据上报：无后端、无 analytics、无第三方脚本。',
    en: 'Everything runs locally in your browser. No backend, no analytics, no third-party scripts, nothing reported anywhere.',
  },
  footerBrowsers: {
    zh: '换一个浏览器结果会不同。Chrome / Edge 能读到的项最多；Safari 与开启防追踪的 Firefox 会屏蔽更多项，这属于正常行为，不是检测失败。',
    en: 'Results differ by browser. Chrome and Edge expose the most; Safari and Firefox with tracking protection block more. That is normal behaviour, not a detection failure.',
  },
  browserNoteFirefox: {
    zh: 'Firefox 未实现 UA Client Hints、deviceMemory、NetworkInformation 等接口，并已移除电池接口，因此本页的不可用项会明显多于 Chrome。开启防指纹模式后 GPU 型号也会被屏蔽。',
    en: 'Firefox implements neither UA Client Hints, deviceMemory nor NetworkInformation, and removed the Battery API, so more rows here read "unavailable" than in Chrome. With resistFingerprinting on, the GPU name is masked too.',
  },
  browserNoteSafari: {
    zh: 'Safari 出于反指纹考虑屏蔽了较多硬件接口：GPU 通常只返回笼统名称，没有 deviceMemory、网络与电池信息，也不返回音频输出设备。',
    en: 'Safari blocks a number of hardware APIs to resist fingerprinting: the GPU usually reports a generic name, and there is no deviceMemory, network or battery information, nor audio output devices.',
  },
  reportTitle: { zh: '本机配置探测报告', en: 'Device spec report' },
  reportLegend: {
    zh: '精度说明：[精确] 浏览器返回真实值；[近似] 被取整/封顶/分档或为代理指标；[不可用] 无此接口',
    en: 'Confidence: [Exact] real value from the browser; [Approximate] rounded, capped, bucketed or a proxy; [Unavailable] no such API',
  },
  reportSource: { zh: '来源：', en: 'Source: ' },
  reportNote: { zh: '说明：', en: 'Note: ' },
  reportFooter: {
    zh: '本报告在浏览器本地生成，数据未离开本机。换用不同浏览器结果会不同。',
    en: 'Generated locally in the browser; no data left this machine. Results differ between browsers.',
  },
} as const;
