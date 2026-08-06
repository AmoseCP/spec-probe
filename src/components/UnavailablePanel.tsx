import { UNAVAILABLE_ITEMS } from '../detect/unavailable';
import { UI, t, useLang } from '../i18n';

export function UnavailablePanel() {
  const lang = useLang();

  return (
    <section className="unavailable" aria-labelledby="unavailable-title">
      <h2 className="unavailable__title" id="unavailable-title">
        {t(UI.unavailableTitle, lang)}
      </h2>
      <p className="unavailable__intro">{t(UI.unavailableIntro, lang)}</p>
      <ul className="unavailable__list">
        {UNAVAILABLE_ITEMS.map((item) => (
          <li className="unavailable__item" key={t(item.label, 'en')}>
            <b>{t(item.label, lang)}</b>
            <span>{t(item.reason, lang)}</span>

            {(item.detail || item.spec) && (
              <details className="unavailable__more">
                <summary>{t(UI.whyMore, lang)}</summary>
                {item.detail && <p className="unavailable__detail">{t(item.detail, lang)}</p>}
                {item.spec && (
                  <p className="unavailable__spec">
                    <a href={item.spec.url} target="_blank" rel="noreferrer noopener">
                      {item.spec.label} ↗
                    </a>
                  </p>
                )}
              </details>
            )}
          </li>
        ))}
      </ul>
      <p className="unavailable__footnote">{t(UI.specLinkNote, lang)}</p>
    </section>
  );
}
