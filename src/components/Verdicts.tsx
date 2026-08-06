import type { DetectorResult } from '../detect/types';
import { buildVerdicts } from '../report/verdicts';
import { UI, t, useLang } from '../i18n';

/**
 * "这台机器能干什么"。每条都注明依据的检测项 id，方便用户往回核对。
 * 依据只取硬解/硬编结果 —— 跑分是代理指标，拿它下结论就是猜测。
 */
export function Verdicts({ results }: { results: DetectorResult[] }) {
  const lang = useLang();
  const verdicts = buildVerdicts(results);

  if (verdicts.length === 0) return null;

  return (
    <section className="verdicts" aria-labelledby="verdicts-title">
      <h2 className="verdicts__title" id="verdicts-title">
        {t(UI.verdictsTitle, lang)}
      </h2>
      <p className="verdicts__intro">{t(UI.verdictsIntro, lang)}</p>
      <ul className="verdicts__list">
        {verdicts.map((v) => (
          <li className={`verdict verdict--${v.tone}`} key={v.id}>
            <span className={`dot dot--${v.tone === 'good' ? 'exact' : 'approx'}`} aria-hidden="true" />
            <div>
              <p className="verdict__text">{t(v.text, lang)}</p>
              <p className="verdict__basis">
                {t(UI.verdictBasis, lang)}
                {v.basis.join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
