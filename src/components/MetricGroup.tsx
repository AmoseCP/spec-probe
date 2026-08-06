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

  return (
    <section className={`card${pending ? ' card--pending' : ''}`} aria-busy={pending}>
      <header className="card__head">
        <h2 className="card__title">
          {t(detector.title, lang)}
          {pending && <span className="card__pending">{t(UI.pending, lang)}</span>}
        </h2>
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
        result.metrics.map((m) => <MetricRow metric={m} key={m.id} />)
      )}
    </section>
  );
}
