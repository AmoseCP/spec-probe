import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRIMARY_IDS, detectors, runAll } from './detect/registry';
import type { DetectorResult, Lang, Text } from './detect/types';
import { LangContext, UI, initialLang, persistLang, t } from './i18n';
import { Nameplate, buildNameplate } from './components/Nameplate';
import { Legend } from './components/Legend';
import { MetricGroup } from './components/MetricGroup';
import { PermissionCard } from './components/PermissionCard';
import { UnavailablePanel } from './components/UnavailablePanel';
import { Verdicts } from './components/Verdicts';
import { Actions } from './components/Actions';

/** Safari / Firefox 屏蔽项明显更多，页首直接说明，免得用户以为是页面坏了。 */
function browserNote(): Text | null {
  const ua = navigator.userAgent;
  if ('userAgentData' in navigator) return null;
  if (/firefox/i.test(ua)) return UI.browserNoteFirefox;
  if (/safari/i.test(ua)) return UI.browserNoteSafari;
  return null;
}

export default function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [results, setResults] = useState<DetectorResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [runId, setRunId] = useState(0);

  // 语言偏好只在客户端读取（localStorage / navigator 在渲染期不可靠）
  useEffect(() => {
    setLang(initialLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t(UI.htmlTitle, lang);
  }, [lang]);

  useEffect(() => {
    // 所有探测只在 useEffect 里执行：渲染期读 navigator / screen 会在 SSR 下直接崩
    let alive = true;
    setResults([]);
    setBusy(true);

    // 并行执行，每个探测器完成即增量渲染，不等全部结束
    runAll((r) => {
      if (alive) setResults((prev) => [...prev, r]);
    })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [runId]);

  const rerun = useCallback(() => setRunId((n) => n + 1), []);
  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next: Lang = prev === 'zh' ? 'en' : 'zh';
      persistLang(next);
      return next;
    });
  }, []);

  // 按 registry 中的声明顺序展示，而不是完成顺序，避免卡片跳位
  const byId = useMemo(() => new Map(results.map((r) => [r.detector.id, r])), [results]);
  const ordered = useMemo(
    () => detectors.map((d) => byId.get(d.id)).filter((r): r is DetectorResult => Boolean(r)),
    [byId],
  );
  const primary = useMemo(
    () => detectors.filter((d) => (PRIMARY_IDS as readonly string[]).includes(d.id)),
    [],
  );
  const rest = useMemo(
    () => detectors.filter((d) => !(PRIMARY_IDS as readonly string[]).includes(d.id)),
    [],
  );
  const nameplate = useMemo(() => buildNameplate(ordered, lang).join(' · '), [ordered, lang]);
  const note = useMemo(() => browserNote(), []);

  return (
    <LangContext.Provider value={lang}>
      <div className="page">
        {/* 页面标题走屏幕阅读器：视觉上顶部是识别行，但文档需要一个 h1 */}
        <h1 className="visually-hidden">{t(UI.htmlTitle, lang)}</h1>

        <Nameplate results={ordered} done={!busy} />

        <p className="intro">
          {t(UI.intro, lang)}
          <strong>{t(UI.introStrong, lang)}</strong>
          {t(UI.introRest, lang)}
        </p>

        {note && <p className="browser-note">{t(note, lang)}</p>}

        <Legend />

        <Verdicts results={ordered} />

        {/* 身份三卡固定占第一行，其余走瀑布流 */}
        <div className="grid grid--primary">
          {primary.map((d) => (
            <MetricGroup key={d.id} detector={d} result={byId.get(d.id)} />
          ))}
        </div>

        <div className="grid">
          {rest.map((d) => (
            <MetricGroup key={d.id} detector={d} result={byId.get(d.id)} />
          ))}
          <PermissionCard />
        </div>

        <UnavailablePanel />

        <Actions
          results={ordered}
          nameplate={nameplate}
          busy={busy}
          onRerun={rerun}
          onToggleLang={toggleLang}
        />

        <footer className="footer">
          <p>{t(UI.footerPrivacy, lang)}</p>
          <p>{t(UI.footerBrowsers, lang)}</p>
        </footer>
      </div>
    </LangContext.Provider>
  );
}
