import type { Detector, L10n, Metric } from '../types';
import { approx, boolText, exact, formatDuration, safe, safeAsync, unavailable, withTimeout } from '../utils';

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

interface BatteryManagerLike {
  level?: number;
  charging?: boolean;
  chargingTime?: number;
  dischargingTime?: number;
}

const EFFECTIVE_TYPE: Record<string, L10n> = {
  'slow-2g': { zh: '极慢（slow-2g 档）', en: 'Very slow (slow-2g bucket)' },
  '2g': { zh: '慢（2g 档）', en: 'Slow (2g bucket)' },
  '3g': { zh: '中等（3g 档）', en: 'Medium (3g bucket)' },
  '4g': { zh: '快（4g 档）', en: 'Fast (4g bucket)' },
};

const NO_NETINFO: L10n = {
  zh: '本浏览器不提供 NetworkInformation（Firefox 与 Safari 未实现）',
  en: 'No NetworkInformation in this browser (not implemented by Firefox or Safari)',
};

const NO_BATTERY: L10n = {
  zh: '该浏览器已移除此接口（Firefox 与 Safari 出于隐私考虑下线了 Battery Status API）',
  en: 'This browser removed the API — Firefox and Safari dropped Battery Status for privacy reasons',
};

export const networkDetector: Detector = {
  id: 'network',
  group: 'network',
  title: { zh: '网络与电源', en: 'Network & power' },
  subtitle: 'navigator.connection · navigator.getBattery',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];

    // NetworkInformation：分档与滚动平均，全部是近似值
    const c = safe(
      () => (navigator as Navigator & { connection?: NetworkInformationLike }).connection,
      undefined as NetworkInformationLike | undefined,
    );

    out.push(
      c?.effectiveType
        ? approx({
            id: 'network.effectiveType',
            group: 'network',
            label: { zh: '连接质量分档', en: 'Connection bucket' },
            value: EFFECTIVE_TYPE[c.effectiveType] ?? c.effectiveType,
            raw: c.effectiveType,
            source: 'navigator.connection.effectiveType',
            note: {
              zh: '按实测延迟与带宽归入 2g/3g/4g 四档，反映的是当前网速表现，不是网卡类型 —— 千兆有线也可能因链路拥塞被判为 3g',
              en: 'Buckets measured latency and bandwidth into 2g/3g/4g. It reflects current performance, not the adapter — a congested gigabit link can report 3g',
            },
          })
        : unavailable({
            id: 'network.effectiveType',
            group: 'network',
            label: { zh: '连接质量分档', en: 'Connection bucket' },
            source: 'navigator.connection.effectiveType',
            note: NO_NETINFO,
          }),
    );

    out.push(
      typeof c?.downlink === 'number'
        ? approx({
            id: 'network.downlink',
            group: 'network',
            label: { zh: '下行带宽估算', en: 'Estimated downlink' },
            value: `${c.downlink} Mbps`,
            raw: c.downlink,
            source: 'navigator.connection.downlink',
            note: {
              zh: '近期请求的滚动平均，且上限约 10 Mbps —— 千兆宽带同样只会显示 10 左右',
              en: 'A rolling average over recent requests, capped around 10 Mbps — gigabit connections also report ~10',
            },
          })
        : unavailable({
            id: 'network.downlink',
            group: 'network',
            label: { zh: '下行带宽估算', en: 'Estimated downlink' },
            source: 'navigator.connection.downlink',
            note: NO_NETINFO,
          }),
    );

    out.push(
      typeof c?.rtt === 'number'
        ? approx({
            id: 'network.rtt',
            group: 'network',
            label: { zh: '往返延迟估算', en: 'Estimated round-trip time' },
            value: `${c.rtt} ms`,
            raw: c.rtt,
            source: 'navigator.connection.rtt',
            note: {
              zh: '取整到 25 毫秒的倍数后返回，用于降低指纹精度',
              en: 'Rounded to a multiple of 25 ms to reduce fingerprinting precision',
            },
          })
        : unavailable({
            id: 'network.rtt',
            group: 'network',
            label: { zh: '往返延迟估算', en: 'Estimated round-trip time' },
            source: 'navigator.connection.rtt',
            note: NO_NETINFO,
          }),
    );

    out.push(
      typeof c?.saveData === 'boolean'
        ? exact({
            id: 'network.saveData',
            group: 'network',
            label: { zh: '省流量模式', en: 'Data saver' },
            value: boolText(c.saveData, { zh: '已开启', en: 'On' }, { zh: '未开启', en: 'Off' }),
            raw: c.saveData,
            source: 'navigator.connection.saveData',
          })
        : unavailable({
            id: 'network.saveData',
            group: 'network',
            label: { zh: '省流量模式', en: 'Data saver' },
            source: 'navigator.connection.saveData',
            note: NO_NETINFO,
          }),
    );

    out.push(
      exact({
        id: 'network.online',
        group: 'network',
        label: { zh: '联网状态', en: 'Online status' },
        value: boolText(
          safe(() => navigator.onLine, true),
          { zh: '已连接', en: 'Online' },
          { zh: '离线', en: 'Offline' },
        ),
        raw: safe(() => navigator.onLine, null),
        source: 'navigator.onLine',
        note: {
          zh: '只表示有没有网络接口可用，不代表真的能访问外网',
          en: 'Only means a network interface is up; it does not prove the internet is reachable',
        },
      }),
    );

    // 电池：注意是 getBattery()，不是 getBatteryManager()
    const battery = await safeAsync(
      () => {
        const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> })
          .getBattery;
        if (typeof getBattery !== 'function') return Promise.resolve(null);
        return withTimeout(getBattery.call(navigator), 2000, null as BatteryManagerLike | null);
      },
      null as BatteryManagerLike | null,
    );

    out.push(
      battery && typeof battery.level === 'number'
        ? approx({
            id: 'battery.level',
            group: 'network',
            label: { zh: '电量', en: 'Battery level' },
            value: `${Math.round(battery.level * 100)}%`,
            raw: battery.level,
            source: 'navigator.getBattery().level',
            note: {
              zh: '部分实现会把电量取整到 5% 的倍数，因此与系统显示可能有几个百分点的出入',
              en: 'Some implementations round to the nearest 5%, so it can differ from the OS reading by a few points',
            },
          })
        : unavailable({
            id: 'battery.level',
            group: 'network',
            label: { zh: '电量', en: 'Battery level' },
            source: 'navigator.getBattery()',
            note: NO_BATTERY,
          }),
    );

    if (battery && typeof battery.charging === 'boolean') {
      out.push(
        exact({
          id: 'battery.charging',
          group: 'network',
          label: { zh: '充电状态', en: 'Charging' },
          value: boolText(
            battery.charging,
            { zh: '充电中', en: 'Charging' },
            { zh: '使用电池', en: 'On battery' },
          ),
          raw: battery.charging,
          source: 'navigator.getBattery().charging',
        }),
      );

      // chargingTime / dischargingTime 常为 Infinity，格式化前必须判断
      const seconds = battery.charging ? battery.chargingTime : battery.dischargingTime;
      const duration = formatDuration(Number(seconds));
      out.push(
        duration
          ? approx({
              id: 'battery.time',
              group: 'network',
              label: battery.charging
                ? { zh: '预计充满', en: 'Time until full' }
                : { zh: '预计可用', en: 'Time remaining' },
              value: duration,
              raw: seconds,
              source: battery.charging
                ? 'navigator.getBattery().chargingTime'
                : 'navigator.getBattery().dischargingTime',
              note: {
                zh: '系统按当前功耗外推的估算值，负载一变就会跳动',
                en: 'An extrapolation from current power draw; it jumps as soon as the load changes',
              },
            })
          : unavailable({
              id: 'battery.time',
              group: 'network',
              label: battery.charging
                ? { zh: '预计充满', en: 'Time until full' }
                : { zh: '预计可用', en: 'Time remaining' },
              source: battery.charging
                ? 'navigator.getBattery().chargingTime'
                : 'navigator.getBattery().dischargingTime',
              note: {
                zh: '系统返回 Infinity，表示暂时估算不出剩余时间（接电源或刚插拔时常见）',
                en: 'The system returned Infinity — no estimate available yet (common on AC power or right after plugging in)',
              },
            }),
      );
    }

    out.push(
      unavailable({
        id: 'network.address',
        group: 'network',
        label: { zh: '本机 IP 与 MAC 地址', en: 'Local IP and MAC address' },
        source: { zh: '（不实现）', en: '(deliberately not implemented)' },
        note: {
          zh: 'WebRTC 探测内网 IP 的手法已被主流浏览器封堵，且属于隐私侵犯，本页不实现',
          en: 'The WebRTC trick for local IPs is blocked by major browsers and invades privacy; this page does not do it',
        },
      }),
    );

    return out;
  },
};
