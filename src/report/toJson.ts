import type { DetectorResult, Lang, Metric } from '../detect/types';
import { UNAVAILABLE_ITEMS } from '../detect/unavailable';
import { t } from '../i18n';

export interface JsonMetric {
  id: string;
  group: string;
  label: string;
  value: string | null;
  /** 原始值，便于二次分析；没有就不写这个键 */
  raw?: unknown;
  confidence: Metric['confidence'];
  source: string;
  note?: string;
  permission?: string;
}

export interface JsonReport {
  schema: 'spec-probe/v1';
  generatedAt: string;
  lang: Lang;
  nameplate: string;
  /** 精度等级的含义，随报告一起带走，避免脱离页面后被误读 */
  confidenceMeaning: Record<Metric['confidence'], string>;
  groups: Array<{
    id: string;
    title: string;
    source: string;
    metrics: JsonMetric[];
  }>;
  unreadable: Array<{ label: string; reason: string }>;
}

export function toJsonReport(
  results: DetectorResult[],
  nameplate: string,
  lang: Lang = 'zh',
  now: Date = new Date(),
): JsonReport {
  return {
    schema: 'spec-probe/v1',
    generatedAt: now.toISOString(),
    lang,
    nameplate,
    confidenceMeaning: {
      exact:
        lang === 'zh'
          ? '浏览器返回的就是真实值，未做模糊化'
          : 'The browser returns the real value, unmodified',
      approx:
        lang === 'zh'
          ? '被取整、封顶、分档，或是代理指标；见每项的 note'
          : 'Rounded, capped, bucketed or a proxy measure; see each note',
      unavailable:
        lang === 'zh' ? '当前浏览器不提供该接口' : 'This browser does not provide the API',
    },
    groups: results.map((r) => ({
      id: r.detector.id,
      title: t(r.detector.title, lang),
      source: r.detector.subtitle,
      metrics: r.metrics.map((m) => {
        const item: JsonMetric = {
          id: m.id,
          group: m.group,
          label: t(m.label, lang),
          value: t(m.value, lang),
          confidence: m.confidence,
          source: t(m.source, lang),
        };
        if (m.raw !== undefined) item.raw = m.raw;
        if (m.note) item.note = t(m.note, lang);
        if (m.permission) item.permission = m.permission;
        return item;
      }),
    })),
    unreadable: UNAVAILABLE_ITEMS.map((u) => ({
      label: t(u.label, lang),
      reason: t(u.reason, lang),
    })),
  };
}

export function toJson(
  results: DetectorResult[],
  nameplate: string,
  lang: Lang = 'zh',
  now?: Date,
): string {
  return JSON.stringify(toJsonReport(results, nameplate, lang, now), null, 2);
}

/** 触发下载。纯本地 Blob，不经过任何服务器。 */
export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻回收，避免持有大字符串
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
