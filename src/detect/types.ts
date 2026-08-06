/** 精度等级。语义严格，不得随意套用 */
export type Confidence =
  | 'exact' // 浏览器返回的就是真实值，未做模糊化
  | 'approx' // 被取整、封顶、分档，或是代理指标而非直接测量
  | 'unavailable'; // 当前浏览器不提供该接口，或调用失败

export type Lang = 'zh' | 'en';

/** 双语文本。型号名、数字等无需翻译的内容直接给字符串。 */
export interface L10n {
  zh: string;
  en: string;
}
export type Text = string | L10n;

export type GroupId =
  | 'cpu'
  | 'gpu'
  | 'memory'
  | 'display'
  | 'network'
  | 'codec'
  | 'devices'
  | 'system';

export type PermissionKind = 'camera' | 'microphone' | 'window-management';

interface MetricBase {
  /** 稳定 ID，用于报告导出和测试断言，如 'cpu.threads' */
  id: string;
  group: GroupId;
  /** 界面展示的名称 */
  label: Text;
  /** 原始值，导出 JSON 时使用，便于二次分析 */
  raw?: unknown;
  /**
   * 来源 API 的字面名称，必填，会展示给用户。
   * API 名一律原样给字符串；只有"无对应接口"这类占位说明才用双语对象。
   */
  source: Text;
  /** 该项需要用户授权才能获得（或获得更详细结果） */
  permission?: PermissionKind;
}

/** 判别联合：approx 必带 note，unavailable 的 value 必为 null。 */
export type Metric =
  | (MetricBase & { confidence: 'exact'; value: Text; note?: Text })
  | (MetricBase & { confidence: 'approx'; value: Text; note: Text })
  | (MetricBase & { confidence: 'unavailable'; value: null; note?: Text });

export interface Detector {
  id: string;
  group: GroupId;
  /** 分组标题 */
  title: Text;
  /** 副标题写来源 API，不翻译 */
  subtitle: string;
  /** 必须永不抛出。内部所有调用自行 try/catch，失败则返回 unavailable 项 */
  run(): Promise<Metric[]>;
}

/** 读不到的项目：静态清单，不是探测结果 */
export interface UnavailableItem {
  /** 项目名 */
  label: Text;
  /** 为什么读不到，一句话 */
  reason: Text;
  /** 展开后的详细说明：规范怎么规定的、为什么这么规定 */
  detail?: Text;
  /** 对应规范链接。没有相关规范的条目不写 */
  spec?: { label: string; url: string };
}

/** registry 执行过程中向 UI 增量推送的结果单元 */
export interface DetectorResult {
  detector: Detector;
  metrics: Metric[];
  /** 探测器自身崩溃时的兜底标记（正常路径下恒为 false） */
  crashed: boolean;
  /** 耗时，毫秒 */
  durationMs: number;
}

export const CONFIDENCE_LABEL: Record<Confidence, L10n> = {
  exact: { zh: '精确', en: 'Exact' },
  approx: { zh: '近似', en: 'Approximate' },
  unavailable: { zh: '不可用', en: 'Unavailable' },
};
