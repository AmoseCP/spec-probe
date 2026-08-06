import { safeAsync } from './utils';

/** User-Agent Client Hints 的高熵字段。仅 Chromium 系提供。 */
export interface HighEntropy {
  architecture?: string;
  bitness?: string;
  model?: string;
  platformVersion?: string;
  fullVersionList?: Array<{ brand: string; version: string }>;
  platform?: string;
}

interface UADataLike {
  platform?: string;
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  getHighEntropyValues?(hints: string[]): Promise<HighEntropy>;
}

export function getUserAgentData(): UADataLike | undefined {
  return (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
}

const HINTS = ['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList'];

/**
 * 读取高熵 UA 信息。Firefox / Safari 上 `navigator.userAgentData` 为 undefined，
 * 必须先做存在性判断；无状态，各探测器各自调用。
 */
export async function getHighEntropy(): Promise<HighEntropy | null> {
  const uaData = getUserAgentData();
  if (!uaData || typeof uaData.getHighEntropyValues !== 'function') return null;
  return safeAsync(() => uaData.getHighEntropyValues!(HINTS), null);
}
