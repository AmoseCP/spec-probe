import type { Detector, L10n, Metric } from '../types';
import { boolText, exact, safe, safeAsync, unavailable } from '../utils';

const NO_ENUM: L10n = {
  zh: '本浏览器不提供设备枚举（非安全上下文时也会缺失）',
  en: 'No device enumeration in this browser (also missing outside secure contexts)',
};

export const devicesDetector: Detector = {
  id: 'devices',
  group: 'devices',
  title: { zh: '外设', en: 'Peripherals' },
  subtitle: 'navigator.mediaDevices.enumerateDevices · maxTouchPoints',

  async run(): Promise<Metric[]> {
    const out: Metric[] = [];

    const hasEnum =
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.enumerateDevices === 'function';

    const list = hasEnum
      ? await safeAsync(() => navigator.mediaDevices.enumerateDevices(), [] as MediaDeviceInfo[])
      : null;

    const countOf = (kind: MediaDeviceKind) => (list ?? []).filter((d) => d.kind === kind).length;

    const mk = (id: string, label: L10n, kind: MediaDeviceKind, note?: L10n): Metric => {
      if (!list) {
        return unavailable({
          id,
          group: 'devices',
          label,
          source: 'navigator.mediaDevices.enumerateDevices()',
          note: NO_ENUM,
        });
      }
      const n = countOf(kind);
      return exact({
        id,
        group: 'devices',
        label,
        value: { zh: `${n} 个`, en: `${n}` },
        raw: n,
        source: 'navigator.mediaDevices.enumerateDevices()',
        note,
      });
    };

    out.push(mk('devices.videoinput', { zh: '摄像头数量', en: 'Cameras' }, 'videoinput'));
    out.push(mk('devices.audioinput', { zh: '音频输入数量', en: 'Audio inputs' }, 'audioinput'));
    out.push(
      mk('devices.audiooutput', { zh: '音频输出数量', en: 'Audio outputs' }, 'audiooutput', {
        zh: 'Safari 不返回 audiooutput 类别，在该浏览器上这里恒为 0',
        en: 'Safari never returns audiooutput devices, so this is always 0 there',
      }),
    );

    // 未授权时 label 为空字符串，显示"需授权"，不能渲染成空行
    if (list) {
      const named = list.filter((d) => Boolean(d.label));
      out.push(
        named.length > 0
          ? exact({
              id: 'devices.labels',
              group: 'devices',
              label: { zh: '设备名称', en: 'Device names' },
              value: named.map((d) => d.label).join(' · '),
              raw: list.map((d) => ({ kind: d.kind, label: d.label })),
              source: 'MediaDeviceInfo.label',
              note: {
                zh: '已获得媒体权限，因此能读到具体型号名',
                en: 'Media permission was granted, so the actual product names are readable',
              },
            })
          : unavailable({
              id: 'devices.labels',
              group: 'devices',
              label: { zh: '设备名称', en: 'Device names' },
              source: 'MediaDeviceInfo.label',
              note: {
                zh: '需授权摄像头或麦克风后才可读，本页默认不请求',
                en: 'Readable only after granting camera or microphone access; this page does not ask by default',
              },
              permission: 'microphone',
            }),
      );
    }

    const touch = safe(() => navigator.maxTouchPoints, 0);
    out.push(
      exact({
        id: 'devices.maxTouchPoints',
        group: 'devices',
        label: { zh: '触摸点数', en: 'Touch points' },
        value:
          touch > 0
            ? { zh: `${touch} 点触控`, en: `${touch}-point touch` }
            : { zh: '无触摸屏', en: 'No touchscreen' },
        raw: touch,
        source: 'navigator.maxTouchPoints',
      }),
    );

    const pointerFine = safe(
      () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches,
      false,
    );
    out.push(
      exact({
        id: 'devices.pointer',
        group: 'devices',
        label: { zh: '精确指针', en: 'Fine pointer' },
        value: boolText(
          pointerFine,
          { zh: '有（鼠标/触控笔）', en: 'Yes (mouse or stylus)' },
          { zh: '无', en: 'No' },
        ),
        raw: pointerFine,
        source: 'matchMedia("(pointer: fine)")',
      }),
    );

    out.push(
      unavailable({
        id: 'devices.usb',
        group: 'devices',
        label: { zh: 'USB / 蓝牙 / HID 设备清单', en: 'USB / Bluetooth / HID device list' },
        source: {
          zh: '（WebUSB / WebHID 不支持枚举）',
          en: '(WebUSB / WebHID cannot enumerate)',
        },
        note: {
          zh: 'WebUSB 与 WebHID 只能看到用户逐个手动授权过的设备，无法列出已连接设备',
          en: 'WebUSB and WebHID only see devices the user has individually approved; they cannot list what is connected',
        },
      }),
    );

    return out;
  },
};
