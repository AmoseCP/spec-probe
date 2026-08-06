import type { UnavailableItem } from './types';

/**
 * 浏览器根本读不到的项目。静态清单，不参与探测。
 * 写在这里比给一个猜测值更有价值 —— 这是产品立场的一部分。
 *
 * spec 是可选的：确实存在相关规范时才给链接，纯粹"不属于浏览器可见范围"的条目不硬凑。
 * 链接全部核对过可达（2026-08）。
 */
export const UNAVAILABLE_ITEMS: UnavailableItem[] = [
  {
    label: { zh: 'CPU 型号与主频', en: 'CPU model and clock speed' },
    reason: {
      zh: '没有任何 Web API 暴露处理器型号。用 UA 字符串反推属于编造，本页不做。',
      en: 'No web API exposes the processor model. Inferring it from the UA string is fabrication, so this page does not.',
    },
    detail: {
      zh: 'UA Client Hints 是目前唯一能拿到硬件相关信息的通道，但它的高熵字段只有架构、位宽、平台版本和 Android 机型，规范里没有型号与频率 —— 这是刻意的，型号会让指纹精度大幅上升。',
      en: 'UA Client Hints is the only channel that surfaces hardware-ish data, and its high-entropy fields stop at architecture, bitness, platform version and the Android model. Model and clock speed are deliberately absent: they would sharply raise fingerprinting precision.',
    },
    spec: { label: 'UA Client Hints', url: 'https://wicg.github.io/ua-client-hints/' },
  },
  {
    label: { zh: '物理核心数', en: 'Physical core count' },
    reason: {
      zh: 'hardwareConcurrency 只给逻辑线程数，无法区分超线程与物理核心。',
      en: 'hardwareConcurrency reports logical threads only; hyper-threading cannot be separated from physical cores.',
    },
    detail: {
      zh: '规范定义它是"可并行运行的 Worker 数"，浏览器还允许出于隐私考虑上报更低的值。8 线程可能是 8 核，也可能是 4 核 8 线程，甚至是被限流后的读数。',
      en: 'The spec defines it as the number of workers that can run in parallel, and browsers may report a lower number for privacy. "8" can mean 8 cores, 4 cores with SMT, or a deliberately clamped value.',
    },
    spec: {
      label: 'HTML Standard · navigator.hardwareConcurrency',
      url: 'https://html.spec.whatwg.org/multipage/workers.html#dom-navigator-hardwareconcurrency',
    },
  },
  {
    label: { zh: '内存真实容量', en: 'Actual RAM size' },
    reason: {
      zh: 'deviceMemory 向下取整到 2 的幂并封顶 8GB，只能判断"8GB 及以上"。',
      en: 'deviceMemory rounds down to a power of two and caps at 8 GB, so all you learn is "8 GB or more".',
    },
    detail: {
      zh: '规范直接规定了这套模糊化：先向下取整到 2 的幂，再裁到 0.25–8 的区间。它的设计目的是让站点区分低端机与普通机，不是报告配置。',
      en: 'The spec mandates the blurring: round down to a power of two, then clamp into 0.25–8. It exists so sites can spot low-end devices, not to report specs.',
    },
    spec: { label: 'Device Memory API', url: 'https://www.w3.org/TR/device-memory/' },
  },
  {
    label: { zh: '内存条数量、频率与通道数', en: 'DIMM count, speed and channels' },
    reason: { zh: '不属于浏览器可见范围。', en: 'Outside anything a browser can see.' },
    detail: {
      zh: '这类信息要读 SPD/SMBIOS，属于操作系统特权接口，网页沙箱里没有任何通路。',
      en: 'Reading these means going through SPD/SMBIOS, an OS-privileged path with no route into the web sandbox.',
    },
  },
  {
    label: { zh: '显存容量', en: 'VRAM size' },
    reason: {
      zh: 'WebGL 与 WebGPU 都不返回显存大小。WebGPU 的 maxBufferSize 是缓冲区上限，不是显存。',
      en: 'Neither WebGL nor WebGPU returns VRAM size. WebGPU’s maxBufferSize is a buffer limit, not memory size.',
    },
    detail: {
      zh: 'WebGPU 的 limits 是一组"保证可用"的下限承诺，浏览器常年返回固定档位（如 2GB / 4GB），与实际显存无对应关系。把它当显存展示，在集显机器上会得出荒谬结论。',
      en: 'WebGPU limits are guaranteed-minimum promises; browsers report fixed tiers (2 GB / 4 GB) unrelated to installed memory. Presenting them as VRAM produces nonsense on integrated GPUs.',
    },
    spec: { label: 'WebGPU · limits', url: 'https://www.w3.org/TR/webgpu/#limits' },
  },
  {
    label: { zh: 'GPU 温度、风扇转速、功耗', en: 'GPU temperature, fan speed, power draw' },
    reason: {
      zh: '没有传感器接口，浏览器完全接触不到硬件监控数据。',
      en: 'There is no sensor API; hardware monitoring data is entirely out of reach.',
    },
    detail: {
      zh: 'Generic Sensor API 只覆盖加速度计、陀螺仪、环境光这类设备传感器，不含机箱内的硬件监控。功耗侧只有 powerEfficient 这种布尔提示。',
      en: 'The Generic Sensor API covers accelerometers, gyroscopes and ambient light — not in-chassis hardware monitoring. On the power side all you get is booleans like powerEfficient.',
    },
  },
  {
    label: { zh: '硬盘容量与型号', en: 'Drive capacity and model' },
    reason: {
      zh: 'storage.estimate() 给的是浏览器分配给本站点的配额，各浏览器换算系数不同且会变。',
      en: 'storage.estimate() reports the quota granted to this origin; the ratio to real free space differs per browser and changes.',
    },
    detail: {
      zh: '规范明确允许实现"出于隐私考虑返回不精确的值"。Chrome 大致按剩余空间的一个比例给，无痕模式下则是一个固定小值 —— 据此反推硬盘大小会错得离谱。',
      en: 'The spec explicitly lets implementations return imprecise values for privacy. Chrome hands out a fraction of free space; in incognito it returns a small fixed number. Back-computing drive size from it is wildly unreliable.',
    },
    spec: {
      label: 'Storage Standard · estimate()',
      url: 'https://storage.spec.whatwg.org/#dom-storagemanager-estimate',
    },
  },
  {
    label: { zh: '主板、BIOS、机箱信息', en: 'Motherboard, BIOS, chassis' },
    reason: { zh: '不属于浏览器可见范围。', en: 'Outside anything a browser can see.' },
    detail: {
      zh: '同样需要 SMBIOS 级别的读取权限，没有任何 Web 接口涉及这一层。',
      en: 'Same SMBIOS-level access as memory modules; no web API touches that layer.',
    },
  },
  {
    label: { zh: '显示器型号与物理尺寸', en: 'Monitor model and physical size' },
    reason: {
      zh: '浏览器不暴露显示器 EDID，拿不到品牌、型号与英寸数。',
      en: 'Browsers do not expose display EDID data, so brand, model and diagonal size are unknowable.',
    },
    detail: {
      zh: 'Window Management API 授权后能拿到每块屏的分辨率、缩放与 label，但 label 是系统给的显示名，规范也提醒它可能为空，且不包含物理尺寸与 EDID 字段。',
      en: 'With permission, the Window Management API exposes each screen’s resolution, scale and label, but the label is just the OS display name — the spec notes it may be empty — and there is no physical size or EDID field.',
    },
    spec: { label: 'Window Management API', url: 'https://w3c.github.io/window-management/' },
  },
  {
    label: { zh: '刷新率（无直接接口）', en: 'Refresh rate (no direct API)' },
    reason: {
      zh: '没有任何接口直接返回刷新率。本页用逐帧采样推算，所以那一项标的是"近似"。',
      en: 'No API returns it. This page samples frame intervals instead, which is why that row is labelled approximate.',
    },
    detail: {
      zh: 'requestAnimationFrame 的回调节奏跟随合成器，正常情况下与刷新率一致，但后台标签会被节流到 1Hz 左右，省电模式和多屏切换也会改变节奏。推算值只能当参考。',
      en: 'requestAnimationFrame follows the compositor, which normally matches the panel, but background tabs get throttled to about 1 Hz, and power saving or moving between displays changes the cadence. Treat the estimate as indicative.',
    },
    spec: {
      label: 'HTML Standard · requestAnimationFrame',
      url: 'https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-animationframeprovider-requestanimationframe',
    },
  },
  {
    label: { zh: '内网 IP 与 MAC 地址', en: 'Local IP and MAC address' },
    reason: {
      zh: '曾可用 WebRTC 探测，现已被主流浏览器封堵；且属于隐私侵犯，本页不实现。',
      en: 'The old WebRTC trick is blocked by major browsers, and it invades privacy — this page does not implement it.',
    },
    detail: {
      zh: 'RFC 8828 要求把本地地址替换成一次性的 mDNS 名称（形如 xxxx.local），因此即使去枚举 ICE candidate 也拿不到真实内网 IP。MAC 地址则从来没有 Web 接口。',
      en: 'RFC 8828 requires local addresses to be replaced by ephemeral mDNS names (xxxx.local), so enumerating ICE candidates no longer yields a real LAN IP. MAC addresses never had a web API at all.',
    },
    spec: { label: 'RFC 8828 · WebRTC IP Address Handling', url: 'https://www.rfc-editor.org/rfc/rfc8828' },
  },
  {
    label: { zh: '已连接的 USB / 蓝牙 / HID 设备', en: 'Connected USB / Bluetooth / HID devices' },
    reason: {
      zh: 'WebUSB 与 WebHID 只能看到用户逐个手动授权过的设备，无法枚举。',
      en: 'WebUSB and WebHID only see individually approved devices; enumeration is not possible.',
    },
    detail: {
      zh: '两个规范都采用同一套模型：requestDevice() 弹出选择器，用户选中哪个才授予哪个；getDevices() 返回的也只是已授权列表，未授权的设备完全不可见。',
      en: 'Both specs use the same model: requestDevice() opens a chooser and only the picked device is granted. getDevices() returns just the already-granted list; everything else stays invisible.',
    },
    spec: { label: 'WebHID API', url: 'https://wicg.github.io/webhid/' },
  },
  {
    label: { zh: '已安装的软件与字体清单', en: 'Installed software and fonts' },
    reason: {
      zh: '字体枚举已被限制为指纹手段，本页不做探测。',
      en: 'Font enumeration is treated as a fingerprinting vector and is not attempted here.',
    },
    detail: {
      zh: 'Local Font Access API 需要显式授权才能列出本地字体，且尚未在各浏览器普及。传统的"逐个字体量宽度"做法属于指纹技术，与本项目立场冲突，不实现。',
      en: 'The Local Font Access API needs explicit permission and is not widely shipped. The classic width-probing trick is a fingerprinting technique and conflicts with this project’s stance, so it is not implemented.',
    },
    spec: { label: 'Local Font Access API', url: 'https://wicg.github.io/local-font-access/' },
  },
  {
    label: { zh: '电池健康度与循环次数', en: 'Battery health and cycle count' },
    reason: {
      zh: 'Battery Status API 只给电量与充电状态，且已从 Firefox 与 Safari 移除。',
      en: 'The Battery Status API only reports level and charging state, and Firefox and Safari removed it entirely.',
    },
    detail: {
      zh: '规范里只有 level / charging / chargingTime / dischargingTime 四个属性，没有设计容量、循环次数、健康度。当年的研究显示这几个值组合起来足以短时间追踪用户，因此两家浏览器直接下线了整个接口。',
      en: 'The spec has only level, charging, chargingTime and dischargingTime — no design capacity, cycle count or health. Research showed those four values combined could track users short-term, which is why two browsers dropped the API outright.',
    },
    spec: { label: 'Battery Status API', url: 'https://www.w3.org/TR/battery-status/' },
  },
];
