import { CONFIDENCE_LABEL } from '../detect/types';
import { UI, t, useLang } from '../i18n';

const KEYS = ['exact', 'approx', 'unavailable'] as const;

export function Legend() {
  const lang = useLang();

  return (
    <section className="legend" aria-labelledby="legend-title">
      <div className="legend__title" id="legend-title">
        {t(UI.legendTitle, lang)}
      </div>
      <ul className="legend__list">
        {KEYS.map((key) => (
          <li className="legend__item" key={key}>
            <span className={`dot dot--${key}`} aria-hidden="true" />
            <span>
              <b>{t(CONFIDENCE_LABEL[key], lang)}</b>
              {' — '}
              {t(UI.legend[key], lang)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
