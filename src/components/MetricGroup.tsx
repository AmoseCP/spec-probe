import type { Detector, DetectorResult } from '../detect/types';
import { UI, t, useLang } from '../i18n';
import { MetricRow } from './MetricRow';

interface Props {
  detector: Detector;
  result?: DetectorResult;
}

export function MetricGroup({ detector, result }: Props) {
  const lang = useLang();
  const pending = !result;

  // 同一张卡里，编解码这类分档项的说明是逐字相同的（八行解码共用同一段"硬解=powerEfficient"）。
  // 重复渲染十来遍只是噪音，说明在本卡内出现过一次就够了 —— 导出报告仍逐项携带。
  const shownNotes = new Set<string>();

  return (
    <section className={`card${pending ? ' card--pending' : ''}`} aria-busy={pending}>
      <header className="card__head">
        <h2 className="card__title">
          {t(detector.title, lang)}
          {pending && <span className="card__pending">{t(UI.pending, lang)}</span>}
        </h2>
        {/* 来源 API 独占一行：放在标题右侧时，长串会在词中间折断 */}
        <span className="card__source">{detector.subtitle}</span>
      </header>

      {pending ? (
        <div aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="row" key={i}>
              <div className="skeleton" style={{ width: `${70 - i * 12}%` }} />
            </div>
          ))}
        </div>
      ) : (
        result.metrics.map((m) => {
          const note = t(m.note, lang);
          const duplicate = note !== null && shownNotes.has(note);
          if (note !== null) shownNotes.add(note);
          return <MetricRow metric={m} key={m.id} hideNote={duplicate} />;
        })
      )}
    </section>
  );
}
