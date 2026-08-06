import { CONFIDENCE_LABEL, type Metric } from '../detect/types';
import { UI, t, useLang } from '../i18n';

interface Props {
  metric: Metric;
  /** 本卡内已展示过逐字相同的说明，这一行不再重复渲染（导出报告不受影响） */
  hideNote?: boolean;
}

export function MetricRow({ metric, hideNote = false }: Props) {
  const lang = useLang();
  const { confidence, permission } = metric;
  const value = t(metric.value, lang);
  const note = t(metric.note, lang);
  const shown =
    value ??
    t(permission ? UI.needPermission[permission] ?? UI.needPermission.generic : UI.noApi, lang);

  return (
    <div className="row">
      <div className="row__main">
        <span className="row__label">{t(metric.label, lang)}</span>
        {/* 点线引导：把标签与数值在视觉上连起来，数据表的老办法 */}
        <span className="row__leader" aria-hidden="true" />
        <span className={`row__value${value === null ? ' row__value--none' : ''}`}>{shown}</span>
        {/* 精度不只靠颜色传达：色点 + 文字标签同时存在 */}
        <span className={`tag tag--${confidence}`}>
          <span className={`dot dot--${confidence}`} aria-hidden="true" />
          {t(CONFIDENCE_LABEL[confidence], lang)}
        </span>
      </div>
      {note !== null && !hideNote && <p className="row__note">{note}</p>}
      {/* "来源："重复 70 遍是纯噪音，视觉上换成一个箭头，文字留给屏幕阅读器 */}
      <p className="row__source">
        <span className="visually-hidden">{t(UI.sourcePrefix, lang)}</span>
        {t(metric.source, lang)}
      </p>
    </div>
  );
}
