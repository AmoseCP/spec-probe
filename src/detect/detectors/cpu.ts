import type { Detector, Metric } from '../types';
import { NO_API, exact, safe, unavailable } from '../utils';
import { getHighEntropy } from '../uach';

const ARCH_LABEL: Record<string, string> = {
  x86: 'x86',
  arm: 'ARM',
  arm64: 'ARM64',
  ppc: 'PowerPC',
  sparc: 'SPARC',
};

const NO_UACH = {
  zh: '本浏览器无 User-Agent Client Hints 接口',
  en: 'This browser has no User-Agent Client Hints API',
};

export const cpuDetector: Detector = {
  id: 'cpu',
  group: 'cpu',
  title: { zh: '处理器', en: 'Processor' },
  subtitle: 'navigator.hardwareConcurrency · userAgentData',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];

    // 逻辑线程数 —— 浏览器直接返回真实值
    const threads = safe(() => navigator.hardwareConcurrency, 0);
    out.push(
      threads > 0
        ? exact({
            id: 'cpu.threads',
            group: 'cpu',
            label: { zh: '逻辑核心数', en: 'Logical cores' },
            value: { zh: `${threads} 线程`, en: `${threads} threads` },
            raw: threads,
            source: 'navigator.hardwareConcurrency',
            note: {
              zh: '这是逻辑线程数，不是物理核心数。开启超线程/SMT 的处理器会是物理核心数的两倍',
              en: 'Logical threads, not physical cores. With hyper-threading/SMT this is twice the physical core count',
            },
          })
        : unavailable({
            id: 'cpu.threads',
            group: 'cpu',
            label: { zh: '逻辑核心数', en: 'Logical cores' },
            source: 'navigator.hardwareConcurrency',
            note: { zh: '无此接口', en: 'No such API' },
          }),
    );

    // 架构与位宽 —— 只有 UACH 提供，Firefox / Safari 没有
    const hi = await getHighEntropy();

    out.push(
      hi?.architecture
        ? exact({
            id: 'cpu.architecture',
            group: 'cpu',
            label: { zh: '指令集架构', en: 'Architecture' },
            value: ARCH_LABEL[hi.architecture] ?? hi.architecture,
            raw: hi.architecture,
            source: 'navigator.userAgentData.getHighEntropyValues(["architecture"])',
          })
        : unavailable({
            id: 'cpu.architecture',
            group: 'cpu',
            label: { zh: '指令集架构', en: 'Architecture' },
            source: 'navigator.userAgentData.getHighEntropyValues(["architecture"])',
            note: NO_UACH,
          }),
    );

    out.push(
      hi?.bitness
        ? exact({
            id: 'cpu.bitness',
            group: 'cpu',
            label: { zh: '位宽', en: 'Bitness' },
            value: { zh: `${hi.bitness} 位`, en: `${hi.bitness}-bit` },
            raw: hi.bitness,
            source: 'navigator.userAgentData.getHighEntropyValues(["bitness"])',
          })
        : unavailable({
            id: 'cpu.bitness',
            group: 'cpu',
            label: { zh: '位宽', en: 'Bitness' },
            source: 'navigator.userAgentData.getHighEntropyValues(["bitness"])',
            note: NO_UACH,
          }),
    );

    // model 桌面端恒为空字符串，只有 Android 会返回机型
    out.push(
      hi?.model
        ? exact({
            id: 'cpu.model',
            group: 'cpu',
            label: { zh: '设备机型', en: 'Device model' },
            value: hi.model,
            raw: hi.model,
            source: 'navigator.userAgentData.getHighEntropyValues(["model"])',
          })
        : unavailable({
            id: 'cpu.model',
            group: 'cpu',
            label: { zh: '设备机型', en: 'Device model' },
            source: 'navigator.userAgentData.getHighEntropyValues(["model"])',
            note: {
              zh: '该字段仅在 Android 上有值，桌面端恒为空',
              en: 'Only Android returns a value here; on desktop it is always empty',
            },
          }),
    );

    // 处理器型号：没有任何 Web API 提供。这里显式占位，避免用户以为是漏掉了
    out.push(
      unavailable({
        id: 'cpu.name',
        group: 'cpu',
        label: { zh: '处理器型号与主频', en: 'CPU model and clock speed' },
        source: NO_API,
        note: {
          zh: '浏览器不暴露 CPU 型号。用 UA 字符串猜测属于编造，本页不做',
          en: 'No browser exposes the CPU model. Guessing it from the UA string is fabrication, so this page does not',
        },
      }),
    );

    return out;
  },
};
