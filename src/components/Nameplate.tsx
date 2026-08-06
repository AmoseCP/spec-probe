import type { DetectorResult, Lang, Metric } from '../detect/types';
import { UI, t, useLang } from '../i18n';

function find(results: DetectorResult[], id: string): Metric | undefined {
  for (const r of results) {
    const m = r.metrics.find((x) => x.id === id);
    if (m) return m;
  }
  return undefined;
}

/**
 * 把最有辨识度的几项拼成一行。
 * 只取已探到的项，读不到的直接跳过 —— 不占位、不猜测。
 */
export function buildNameplate(results: DetectorResult[], lang: Lang = 'zh'): string[] {
  const ids = [
    'system.os',
    'cpu.architecture',
    'cpu.threads',
    'memory.deviceMemory',
    'gpu.renderer',
  ];
  const parts: string[] = [];

  for (const id of ids) {
    const m = find(results, id);
    if (!m || m.value === null) continue;
    const value = t(m.value, lang);
    if (id === 'cpu.architecture') {
      const bits = find(results, 'cpu.bitness');
      const bitsValue = bits ? t(bits.value, lang) : null;
      parts.push(bitsValue ? `${value} ${bitsValue}` : value);
    } else {
      parts.push(value);
    }
  }

  return parts;
}

interface Props {
  results: DetectorResult[];
  done: boolean;
}

export function Nameplate({ results, done }: Props) {
  const lang = useLang();
  const parts = buildNameplate(results, lang);

  return (
    <header className="nameplate">
      <div className="nameplate__label">{t(UI.nameplateLabel, lang)}</div>
      <div className="nameplate__value" aria-live="polite">
        {parts.length === 0 && !done && (
          <>
            <span style={{ color: 'var(--text-faint)' }}>{t(UI.detecting, lang)}</span>
            <span className="nameplate__caret" aria-hidden="true" />
          </>
        )}
        {parts.length === 0 && done && (
          <span style={{ color: 'var(--text-faint)' }}>{t(UI.allBlocked, lang)}</span>
        )}
        {parts.map((p, i) => (
          <span key={p + i}>
            {i > 0 && (
              <span className="nameplate__sep" aria-hidden="true">
                ·
              </span>
            )}
            {p}
          </span>
        ))}
        {parts.length > 0 && !done && <span className="nameplate__caret" aria-hidden="true" />}
      </div>
    </header>
  );
}
