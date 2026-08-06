import type { Detector, Metric } from '../types';
import { NO_API, approx, exact, formatBytes, safe, safeAsync, unavailable } from '../utils';

interface PerfMemory {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

export const memoryDetector: Detector = {
  id: 'memory',
  group: 'memory',
  title: { zh: '内存与存储', en: 'Memory & storage' },
  subtitle: 'navigator.deviceMemory · navigator.storage.estimate',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];

    // deviceMemory：向下取整到 2 的幂并封顶 8，64GB 的机器同样返回 8
    const dm = safe(
      () => (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      undefined as number | undefined,
    );
    out.push(
      typeof dm === 'number'
        ? approx({
            id: 'memory.deviceMemory',
            group: 'memory',
            label: { zh: '系统内存', en: 'System memory' },
            value:
              dm >= 8 ? '≥ 8 GB' : { zh: `约 ${dm} GB`, en: `about ${dm} GB` },
            raw: dm,
            source: 'navigator.deviceMemory',
            note: {
              zh: '该接口把真实容量向下取整到 2 的幂，并封顶在 8。返回 8 只代表"8GB 及以上"，64GB 的机器同样返回 8',
              en: 'This API rounds down to a power of two and caps at 8. A value of 8 only means "8 GB or more" — a 64 GB machine also reports 8',
            },
          })
        : unavailable({
            id: 'memory.deviceMemory',
            group: 'memory',
            label: { zh: '系统内存', en: 'System memory' },
            source: 'navigator.deviceMemory',
            note: {
              zh: '本浏览器不提供该接口（Firefox 与 Safari 从未实现）',
              en: 'Not provided by this browser (Firefox and Safari never implemented it)',
            },
          }),
    );

    // performance.memory：非标准，且是标签页的 JS 堆上限，不是物理内存
    const pm = safe(
      () => (performance as Performance & { memory?: PerfMemory }).memory,
      undefined as PerfMemory | undefined,
    );
    out.push(
      pm && typeof pm.jsHeapSizeLimit === 'number'
        ? approx({
            id: 'memory.jsHeapLimit',
            group: 'memory',
            label: { zh: '页面可用 JS 堆上限', en: 'JS heap limit for this tab' },
            value: formatBytes(pm.jsHeapSizeLimit),
            raw: pm.jsHeapSizeLimit,
            source: 'performance.memory.jsHeapSizeLimit',
            note: {
              zh: '这是当前标签页的 JavaScript 堆上限，由浏览器策略决定，与系统物理内存没有直接换算关系。非标准接口，仅 Chromium 系提供',
              en: 'A per-tab JavaScript heap ceiling set by browser policy. It does not convert to physical RAM. Non-standard, Chromium only',
            },
          })
        : unavailable({
            id: 'memory.jsHeapLimit',
            group: 'memory',
            label: { zh: '页面可用 JS 堆上限', en: 'JS heap limit for this tab' },
            source: 'performance.memory.jsHeapSizeLimit',
            note: {
              zh: '非标准接口，本浏览器不提供',
              en: 'Non-standard API, not provided by this browser',
            },
          }),
    );

    if (pm && typeof pm.usedJSHeapSize === 'number') {
      out.push(
        exact({
          id: 'memory.jsHeapUsed',
          group: 'memory',
          label: { zh: '本页已用 JS 堆', en: 'JS heap used by this page' },
          value: formatBytes(pm.usedJSHeapSize),
          raw: pm.usedJSHeapSize,
          source: 'performance.memory.usedJSHeapSize',
        }),
      );
    }

    // storage.estimate：quota 是浏览器分配给本站的配额，不是磁盘容量
    const est = await safeAsync(
      () =>
        navigator.storage && typeof navigator.storage.estimate === 'function'
          ? navigator.storage.estimate()
          : Promise.resolve(null),
      null as StorageEstimate | null,
    );

    out.push(
      est && typeof est.quota === 'number'
        ? approx({
            id: 'storage.quota',
            group: 'memory',
            label: { zh: '本站存储配额', en: 'Storage quota for this site' },
            value: formatBytes(est.quota),
            raw: est.quota,
            source: 'navigator.storage.estimate().quota',
            note: {
              zh: '浏览器分配给本站点的可用配额，通常是磁盘剩余空间的一个比例（Chrome 约 60%），并非磁盘容量。系数各浏览器不同且会变，本页不据此反推硬盘大小',
              en: 'The quota granted to this origin, usually a fraction of free disk space (~60% in Chrome). It is not disk size, the ratio differs per browser and changes, so this page does not infer drive capacity from it',
            },
          })
        : unavailable({
            id: 'storage.quota',
            group: 'memory',
            label: { zh: '本站存储配额', en: 'Storage quota for this site' },
            source: 'navigator.storage.estimate().quota',
            note: {
              zh: '本浏览器不提供 Storage 配额估算',
              en: 'This browser provides no storage quota estimate',
            },
          }),
    );

    out.push(
      est && typeof est.usage === 'number'
        ? exact({
            id: 'storage.usage',
            group: 'memory',
            label: { zh: '本站已用存储', en: 'Storage used by this site' },
            value: formatBytes(est.usage),
            raw: est.usage,
            source: 'navigator.storage.estimate().usage',
          })
        : unavailable({
            id: 'storage.usage',
            group: 'memory',
            label: { zh: '本站已用存储', en: 'Storage used by this site' },
            source: 'navigator.storage.estimate().usage',
            note: {
              zh: '本浏览器不提供 Storage 用量估算',
              en: 'This browser provides no storage usage estimate',
            },
          }),
    );

    out.push(
      unavailable({
        id: 'memory.physical',
        group: 'memory',
        label: { zh: '硬盘容量 / 内存条数与频率', en: 'Disk size, DIMM count and speed' },
        source: NO_API,
        note: {
          zh: '浏览器不暴露磁盘总量、内存条数量、内存频率与通道数',
          en: 'Browsers expose neither total disk size nor memory module count, speed or channel configuration',
        },
      }),
    );

    return out;
  },
};
