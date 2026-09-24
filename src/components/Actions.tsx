import { useCallback, useState } from 'react';
import type { DetectorResult, L10n, Lang } from '../detect/types';
import { toText } from '../report/toText';
import { downloadJson, toJson } from '../report/toJson';
import { downloadPng, renderReportCanvas } from '../report/toImage';
import { UI, t, useLang } from '../i18n';

interface Props {
  results: DetectorResult[];
  nameplate: string;
  busy: boolean;
  onRerun: () => void;
  onToggleLang: () => void;
}

function filename(lang: Lang, ext: 'json' | 'png'): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return lang === 'zh' ? `本机配置-${stamp}.${ext}` : `device-spec-${stamp}.${ext}`;
}

export function Actions({ results, nameplate, busy, onRerun, onToggleLang }: Props) {
  const lang = useLang();
  // 存双语文案而不是某一语言的字符串：切换语言后状态提示跟着切
  const [status, setStatus] = useState<L10n | null>(null);

  const copy = useCallback(async () => {
    const text = toText(results, nameplate, lang);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(UI.copied);
    } catch {
      // 剪贴板被拒时退回选中文本，用户仍可手动复制
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand?.('copy');
      document.body.removeChild(ta);
      setStatus(ok ? UI.copied : UI.copyFailed);
    }
  }, [results, nameplate, lang]);

  const exportJson = useCallback(() => {
    downloadJson(filename(lang, 'json'), toJson(results, nameplate, lang));
    setStatus(UI.exported);
  }, [results, nameplate, lang]);

  const exportPng = useCallback(async () => {
    const canvas = renderReportCanvas(results, nameplate, lang);
    if (!canvas) {
      setStatus(UI.exportPngFailed);
      return;
    }
    const ok = await downloadPng(canvas, filename(lang, 'png'));
    setStatus(ok ? UI.exportedPng : UI.exportPngFailed);
  }, [results, nameplate, lang]);

  return (
    <div className="actions">
      <button
        type="button"
        className="btn"
        onClick={copy}
        disabled={busy || results.length === 0}
        aria-label={t(UI.copyAria, lang)}
      >
        {t(UI.copy, lang)}
      </button>
      <button
        type="button"
        className="btn"
        onClick={exportJson}
        disabled={busy || results.length === 0}
        aria-label={t(UI.exportJsonAria, lang)}
      >
        {t(UI.exportJson, lang)}
      </button>
      <button
        type="button"
        className="btn"
        onClick={exportPng}
        disabled={busy || results.length === 0}
        aria-label={t(UI.exportPngAria, lang)}
      >
        {t(UI.exportPng, lang)}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setStatus(null);
          onRerun();
        }}
        disabled={busy}
        aria-label={t(UI.rerunAria, lang)}
      >
        {busy ? t(UI.rerunning, lang) : t(UI.rerun, lang)}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onToggleLang}
        aria-label={t(UI.langToggleAria, lang)}
        lang={lang === 'zh' ? 'en' : 'zh'}
      >
        {t(UI.langToggle, lang)}
      </button>
      <span className="actions__status" role="status">
        {status && t(status, lang)}
      </span>
    </div>
  );
}
