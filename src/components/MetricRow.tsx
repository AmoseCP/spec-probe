import { CONFIDENCE_LABEL, type Metric } from '../detect/types';
import { UI, t, useLang } from '../i18n';

export function MetricRow({ metric }: { metric: Metric }) {
  const lang = useLang();
  const { confidence, permission } = metric;
  const value = t(metric.value, lang);
  const shown =
    value ??
    t(permission ? UI.needPermission[permission] ?? UI.needPermission.generic : UI.noApi, lang);

  return (
    <div className="row">
      <div className="row__main">
        <span className="row__label">{t(metric.label, lang)}</span>
        <span className={`row__value${value === null ? ' row__value--none' : ''}`}>{shown}</span>
        {/* 精度不只靠颜色传达：色点 + 文字标签同时存在 */}
        <span className={`tag tag--${confidence}`}>
          <span className={`dot dot--${confidence}`} aria-hidden="true" />
          {t(CONFIDENCE_LABEL[confidence], lang)}
        </span>
      </div>
      {metric.note && <p className="row__note">{t(metric.note, lang)}</p>}
      <p className="row__source">
        {t(UI.sourcePrefix, lang)}
        {t(metric.source, lang)}
      </p>
    </div>
  );
}
