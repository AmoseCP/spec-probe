import { CONFIDENCE_LABEL, type DetectorResult, type Lang } from '../detect/types';
import { UNAVAILABLE_ITEMS } from '../detect/unavailable';
import { UI, t } from '../i18n';

/**
 * 纯文本报告。精度标签必须一起带出去 ——
 * 报告被贴到别处时，脱离图例的裸数值最容易被当成精确值。
 */
export function toText(results: DetectorResult[], nameplate: string, lang: Lang = 'zh'): string {
  const lines: string[] = [];
  // 中文用全角标点，英文用半角，别把"：""（）"带进英文报告
  const colon = lang === 'zh' ? '：' : ': ';
  const paren = (s: string) => (lang === 'zh' ? `（${s}）` : ` (${s})`);

  lines.push(t(UI.reportTitle, lang));
  lines.push('='.repeat(40));
  if (nameplate) lines.push(nameplate);
  lines.push('');
  lines.push(t(UI.reportLegend, lang));
  lines.push('');

  for (const r of results) {
    lines.push(`## ${t(r.detector.title, lang)}${paren(r.detector.subtitle)}`);
    for (const m of r.metrics) {
      const tag = `[${t(CONFIDENCE_LABEL[m.confidence], lang)}]`;
      const value = t(m.value, lang) ?? '—';
      lines.push(`- ${t(m.label, lang)}${colon}${value} ${tag}`);
      // source 可能是双语占位对象（如 NO_API），必须经 t() 取文本
      lines.push(`    ${t(UI.reportSource, lang)}${t(m.source, lang)}`);
      if (m.note) lines.push(`    ${t(UI.reportNote, lang)}${t(m.note, lang)}`);
    }
    lines.push('');
  }

  lines.push(`## ${t(UI.unavailableTitle, lang)}`);
  for (const item of UNAVAILABLE_ITEMS) {
    lines.push(`- ${t(item.label, lang)}${colon}${t(item.reason, lang)}`);
  }
  lines.push('');
  lines.push(t(UI.reportFooter, lang));

  return lines.join('\n');
}
