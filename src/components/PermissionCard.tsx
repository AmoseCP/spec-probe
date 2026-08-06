import { useState } from 'react';
import type { Metric } from '../detect/types';
import { exact, safeAsync } from '../detect/utils';
import { UI, t, useLang } from '../i18n';
import { MetricRow } from './MetricRow';

type State = 'idle' | 'busy' | 'done' | 'denied';

interface ScreenDetailed {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  devicePixelRatio: number;
  isPrimary: boolean;
  isInternal: boolean;
  label: string;
}

/**
 * 授权增强区。默认不请求任何权限 —— 只有点击按钮（用户手势）才会发起，
 * 且拿到数据后立即释放设备。
 */
export function PermissionCard() {
  const lang = useLang();
  const [deviceState, setDeviceState] = useState<State>('idle');
  const [deviceMetrics, setDeviceMetrics] = useState<Metric[]>([]);
  const [screenState, setScreenState] = useState<State>('idle');
  const [screenMetrics, setScreenMetrics] = useState<Metric[]>([]);

  const canScreens = typeof window !== 'undefined' && 'getScreenDetails' in window;

  async function grantDeviceNames() {
    setDeviceState('busy');
    // 必须由按钮点击触发，无用户手势时浏览器会直接拒绝
    const stream = await safeAsync(
      () => navigator.mediaDevices.getUserMedia({ audio: true }),
      null as MediaStream | null,
    );

    if (!stream) {
      setDeviceState('denied');
      return;
    }

    const list = await safeAsync(
      () => navigator.mediaDevices.enumerateDevices(),
      [] as MediaDeviceInfo[],
    );

    // 拿到 label 后立刻停掉音轨，设备指示灯随之熄灭
    stream.getTracks().forEach((track) => track.stop());

    const named = list.filter((d) => Boolean(d.label));
    setDeviceMetrics(
      named.map((d, i) =>
        exact({
          id: `permission.device.${d.kind}.${i}`,
          group: 'devices',
          label: KIND_LABEL[d.kind] ?? d.kind,
          value: d.label,
          raw: { kind: d.kind, label: d.label },
          source: 'MediaDeviceInfo.label',
        }),
      ),
    );
    setDeviceState('done');
  }

  async function grantScreens() {
    setScreenState('busy');
    const details = await safeAsync(
      () =>
        (
          window as Window & { getScreenDetails?: () => Promise<{ screens: ScreenDetailed[] }> }
        ).getScreenDetails?.() ?? Promise.resolve(null),
      null as { screens: ScreenDetailed[] } | null,
    );

    if (!details) {
      setScreenState('denied');
      return;
    }

    setScreenMetrics(
      details.screens.map((s, i) =>
        exact({
          id: `permission.screen.${i}`,
          group: 'display',
          label: s.label || { zh: `显示器 ${i + 1}`, en: `Display ${i + 1}` },
          value: `${s.width} × ${s.height} @ ${s.devicePixelRatio}×`,
          raw: {
            width: s.width,
            height: s.height,
            availWidth: s.availWidth,
            availHeight: s.availHeight,
            devicePixelRatio: s.devicePixelRatio,
            isPrimary: s.isPrimary,
            isInternal: s.isInternal,
            label: s.label,
          },
          source: 'window.getScreenDetails().screens',
          note: {
            zh: `${s.isPrimary ? '主显示器' : '扩展显示器'}${s.isInternal ? ' · 内置屏' : ''} · CSS 像素`,
            en: `${s.isPrimary ? 'Primary' : 'Extended'} display${s.isInternal ? ' · built-in' : ''} · CSS pixels`,
          },
        }),
      ),
    );
    setScreenState('done');
  }

  return (
    <section className="card card--permission" aria-labelledby="permission-title">
      <header className="card__head">
        <h2 className="card__title" id="permission-title">
          {t(UI.permissionTitle, lang)}
        </h2>
        <span className="card__source">getUserMedia · getScreenDetails</span>
      </header>

      <p className="permission__intro">{t(UI.permissionIntro, lang)}</p>

      <div className="permission__block">
        <p className="permission__hint">{t(UI.deviceNamesHint, lang)}</p>
        <button
          type="button"
          className="btn"
          onClick={grantDeviceNames}
          disabled={deviceState === 'busy' || deviceState === 'done'}
          aria-label={t(UI.grantDeviceNamesAria, lang)}
        >
          {deviceState === 'busy' ? t(UI.granting, lang) : t(UI.grantDeviceNames, lang)}
        </button>
        {deviceState === 'denied' && <p className="permission__denied">{t(UI.denied, lang)}</p>}
        {deviceMetrics.map((m) => (
          <MetricRow metric={m} key={m.id} />
        ))}
      </div>

      {canScreens && (
        <div className="permission__block">
          <p className="permission__hint">{t(UI.screensHint, lang)}</p>
          <button
            type="button"
            className="btn"
            onClick={grantScreens}
            disabled={screenState === 'busy' || screenState === 'done'}
            aria-label={t(UI.grantScreensAria, lang)}
          >
            {screenState === 'busy' ? t(UI.granting, lang) : t(UI.grantScreens, lang)}
          </button>
          {screenState === 'denied' && <p className="permission__denied">{t(UI.denied, lang)}</p>}
          {screenMetrics.map((m) => (
            <MetricRow metric={m} key={m.id} />
          ))}
        </div>
      )}
    </section>
  );
}

const KIND_LABEL: Record<string, { zh: string; en: string }> = {
  audioinput: { zh: '麦克风', en: 'Microphone' },
  audiooutput: { zh: '扬声器', en: 'Speaker' },
  videoinput: { zh: '摄像头', en: 'Camera' },
};
