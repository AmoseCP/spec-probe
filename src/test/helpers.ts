import { t } from '../i18n';
import type { Metric, Text } from '../detect/types';

/** 取中文文案，测试里断言用。 */
export const zh = (text: Text | null | undefined): string | null => t(text, 'zh');
/** 取英文文案。 */
export const en = (text: Text | null | undefined): string | null => t(text, 'en');

export function get(metrics: Metric[], id: string): Metric {
  const m = metrics.find((x) => x.id === id);
  if (!m) throw new Error(`missing metric ${id}`);
  return m;
}

/** 值的中文文案，unavailable 时为 null。 */
export const value = (metrics: Metric[], id: string): string | null => zh(get(metrics, id).value);
