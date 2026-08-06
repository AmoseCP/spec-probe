# 本机配置探测器 · 开发计划

> 交付给 AI 编码工具执行的完整规格。项目代号 `spec-probe`，可自行改名。
> 阅读顺序：先读第 1、2、4 节确定边界和数据结构，再按第 8 节的优先级逐个实现探测器。
> **第 6 节是硬约束，里面的 API 名称和调用方式不要改写、不要凭记忆替换。**

---

## 1. 项目目标

一个纯前端静态网页。用户打开即自动检测并展示本机可探测到的硬件与环境信息，**并明确标注每一项的可信程度**，同时列出浏览器根本读不到的项目。

### 核心设计立场

这类"在线硬件检测"页面的常见失败模式是把模糊值当精确值展示——把 `navigator.deviceMemory` 返回的 `8` 写成"内存：8GB"，而实际机器可能是 64GB。本项目的差异点就在于**诚实**：

- 每个数据项必须带精度标签：`精确` / `近似` / `不可用`
- 每个数据项必须写明来源 API
- 近似项必须解释为什么近似（取整、封顶、分档、代理指标）
- 必须有独立区块列出"读不到的部分"及原因

这个精度体系是产品的主要价值，不是装饰。实现时不允许为了界面好看而省略。

### 非目标（明确不做）

- 不做后端。没有服务器，没有数据库，没有账号
- 不做任何数据上报。零 analytics、零埋点、零第三方脚本（字体除外）
- 不做本地 Agent / 桌面伴侣程序（如需完整配置，另立项目）
- 不用 WebRTC 探测内网 IP。该手法已被主流浏览器封堵，且属于隐私侵犯，不实现
- 不做用户指纹、不生成设备唯一 ID、不做跨会话追踪
- 不宣称能读出 CPU 型号、内存条数、显存容量、硬盘容量等任何浏览器不提供的信息

---

## 2. 技术栈

| 项目 | 选择 | 理由 |
|---|---|---|
| 构建 | Vite 5 + TypeScript（strict） | 纯静态，无需 SSR；比 Next.js 轻，且避免水合问题 |
| 框架 | React 18 | 组件化足够，探测逻辑与 UI 解耦 |
| 样式 | CSS Modules 或单文件 CSS + CSS 变量 | 不引入 UI 库；页面结构简单 |
| 状态 | React 内置（`useState` / `useReducer`） | 无需 Redux/Zustand |
| 测试 | Vitest（单元）+ Playwright（跨浏览器 E2E） | 见第 9 节测试矩阵 |
| 部署 | 任意静态托管（Cloudflare Pages / Vercel / S3+CloudFront） | 产物为纯静态文件 |

**若必须用 Next.js**：使用 App Router + `output: 'export'` 静态导出，所有探测组件加 `'use client'`，且探测逻辑**只能在 `useEffect` 内执行**——服务端渲染时 `navigator`、`screen` 不存在，直接在渲染体内读取会导致构建失败或水合不一致。

**不要引入**：`platform.js`、`ua-parser-js`、`detect-gpu`、`bowser` 等库。UA 解析库依赖已被浏览器冻结的 UA 字符串，结果比原生 `userAgentData` 更差；`detect-gpu` 是跑分数据库匹配，与本项目的诚实原则冲突。

---

## 3. 目录结构

```
src/
  main.tsx
  App.tsx
  detect/
    types.ts            # Metric / Detector / Confidence 定义
    registry.ts         # 探测器注册表 + 统一执行入口
    utils.ts            # safe() 包装、字节格式化、WebGL 上下文管理
    detectors/
      cpu.ts
      gpu.ts            # WebGL + WebGPU
      memory.ts         # deviceMemory + performance.memory + storage
      display.ts
      network.ts        # NetInfo + Battery
      codec.ts          # MediaCapabilities
      devices.ts        # MediaDevices
      system.ts         # UA / Intl / 偏好设置
      benchmark.ts      # Worker 内跑分
    unavailable.ts      # 静态的"读不到的部分"清单
  components/
    Nameplate.tsx       # 顶部机器识别行
    Legend.tsx          # 精度图例
    MetricGroup.tsx     # 分组卡片
    MetricRow.tsx       # 单行：标签 / 值 / 精度标签 / 说明
    UnavailablePanel.tsx
    PermissionCard.tsx  # 需授权的增强项
    Actions.tsx         # 复制报告 / 导出 JSON / 重新检测
  report/
    toText.ts
    toJson.ts
  styles/
    tokens.css
    app.css
public/
  favicon.svg
```

---

## 4. 数据模型（核心，先实现这一层）

```ts
// src/detect/types.ts

/** 精度等级。语义严格，不得随意套用 */
export type Confidence =
  | 'exact'        // 浏览器返回的就是真实值，未做模糊化
  | 'approx'       // 被取整、封顶、分档，或是代理指标而非直接测量
  | 'unavailable'; // 当前浏览器不提供该接口，或调用失败

export type GroupId =
  | 'cpu' | 'gpu' | 'memory' | 'display'
  | 'network' | 'codec' | 'devices' | 'system';

export interface Metric {
  /** 稳定 ID，用于报告导出和测试断言，如 'cpu.threads' */
  id: string;
  group: GroupId;
  /** 界面展示的名称 */
  label: string;
  /** 已格式化的展示值；不可用时为 null */
  value: string | null;
  /** 原始值，导出 JSON 时使用，便于二次分析 */
  raw?: unknown;
  confidence: Confidence;
  /** 来源 API 的字面名称，必填，会展示给用户 */
  source: string;
  /** 精度说明。confidence 为 approx 时必填 */
  note?: string;
  /** 该项需要用户授权才能获得（或获得更详细结果） */
  permission?: 'camera' | 'microphone' | 'window-management';
}

export interface Detector {
  id: string;
  group: GroupId;
  /** 分组标题与副标题（副标题写来源 API） */
  title: string;
  subtitle: string;
  /** 必须永不抛出。内部所有调用自行 try/catch，失败则返回 unavailable 项 */
  run(): Promise<Metric[]>;
}
```

### 强制约定

1. **`run()` 永不抛出。** 在 `utils.ts` 提供 `safe<T>(fn: () => T, fallback: T): T` 和异步版本，所有 API 调用必须经它包裹。任何一个探测器崩溃都不能影响其他探测器。
2. **`confidence: 'approx'` 时 `note` 必填。** 用 TS 做类型级约束（判别联合）或在单测中断言。
3. **`source` 必填且必须是真实 API 名。** 例如 `navigator.hardwareConcurrency`、`WEBGL_debug_renderer_info`。不允许写"浏览器接口"这类含糊表述。
4. 探测器之间不共享可变状态。WebGL 上下文由 `utils.ts` 统一创建和释放（见第 7 节）。

---

## 5. 界面规格

### 布局（自上而下）

1. **顶部识别行（Nameplate）**：把最有辨识度的几项拼成一行大字等宽文本，如
   `Windows 11 · x86 64-bit · 16 线程 · ≥8GB · GeForce RTX 3080 Ti`
   检测未完成时显示占位与光标动画。GPU 名称需从 `ANGLE (NVIDIA, GeForce RTX 3080 Ti Direct3D11 vs_5_0, ...)` 这类字符串里提取中间的型号段。
2. **一句话说明**：解释这个页面在做什么，以及为什么标注精度。
3. **精度图例**：三色点 + 三个等级的定义。必须在数据之前出现，否则用户看不懂标签。
4. **分组卡片网格**：`repeat(auto-fit, minmax(330px, 1fr))`。每组一张卡片，标题右侧小字标来源 API。
5. **需授权的增强项**（P1）：单独卡片，默认不请求权限。用按钮显式触发，按钮文案写清代价，如"授权摄像头以读取设备名称"。
6. **读不到的部分**：虚线边框区块，与上方实线卡片视觉上区分开。每行写"项目 + 为什么读不到"。
7. **操作区**：复制报告 / 导出 JSON / 重新检测。
8. **页脚**：说明数据不离开本机；说明换浏览器结果会不同（Safari 与开启防追踪的 Firefox 会屏蔽更多项）。

### 视觉与交互底线

- 深色仪表盘风格。三个精度等级各占一个语义色，**颜色只用于表达精度，不得用于装饰**。
- 数值一律等宽字体右对齐；标签用比例字体。
- 移动端单列，标签与值可换行，不允许横向滚动。
- 键盘焦点可见（`:focus-visible`），按钮有 aria-label。
- `prefers-reduced-motion: reduce` 时关闭所有动画。
- 首屏不阻塞：探测器**并行**执行，每个完成即渲染（`Promise.allSettled` + 增量 setState），不要 `await` 全部完成后才显示。

### 文案原则

- 用用户认识的词，不用系统术语。写"逻辑核心数"，不写 `hardwareConcurrency`（后者放在 source 里）。
- 不可用项写"无此接口"，不写"检测失败"——后者暗示可以重试。
- 不要道歉式文案。"Firefox 已移除该接口" 就是完整的说明。

---

## 6. 探测器实现细则（硬约束）

以下 API 名称、参数、返回结构均经过核对。**实现时按此照抄，不要替换成记忆中的相似名称。**

### 6.1 CPU（`cpu.ts`）

```ts
navigator.hardwareConcurrency            // number，逻辑核心数（含超线程）→ exact
                                         // note: 这是逻辑线程数，不是物理核心数
```

架构信息只能通过 User-Agent Client Hints 获取，仅 Chromium 系支持：

```ts
const hi = await navigator.userAgentData?.getHighEntropyValues([
  'architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList'
]);
// hi.architecture: 'x86' | 'arm' | ...   → exact
// hi.bitness: '64'                       → exact
// hi.model: 桌面端恒为空字符串，仅 Android 返回机型 → 桌面标 unavailable
```

`navigator.userAgentData` 在 Firefox / Safari 上为 `undefined`，必须先做存在性判断。

**CPU 型号与主频：无任何 Web API 提供，直接放入"读不到的部分"，不要尝试用 UA 猜测。**

### 6.2 GPU（`gpu.ts`）

两个独立来源，都要实现，互为补充。

**WebGL（兼容性最好）**

```ts
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
const ext = gl.getExtension('WEBGL_debug_renderer_info');
const renderer = ext
  ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)   // 真实型号 → exact
  : gl.getParameter(gl.RENDERER);                  // 通用名称 → approx
const vendor = ext
  ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
  : gl.getParameter(gl.VENDOR);
gl.getParameter(gl.MAX_TEXTURE_SIZE);              // → exact
```

- 拿到 `ext` 才算 `exact`；拿不到扩展时返回的是通用字符串，必须降级为 `approx` 并在 note 说明"扩展被屏蔽"。
- Safari 返回的往往是 `Apple GPU` 这类笼统值 → `approx`。
- 用完必须释放：`gl.getExtension('WEBGL_lose_context')?.loseContext()`。浏览器对同时存在的 WebGL 上下文数量有上限（通常 8–16），泄漏会导致后续检测失败。

**WebGPU（信息更结构化，支持面较窄）**

```ts
if (navigator.gpu) {
  const adapter = await navigator.gpu.requestAdapter();
  // 新版：adapter.info 是同步属性（Chrome 128+）
  // 旧版：adapter.requestAdapterInfo() 返回 Promise，已废弃
  const info = adapter.info ?? await adapter.requestAdapterInfo?.();
  // info: { vendor, architecture, device, description } —— 字段常为空字符串，需过滤
  adapter.limits.maxBufferSize;   // 与显存相关但≠显存容量 → approx
  adapter.features;               // Set<string>，可列出支持的特性
}
```

`requestAdapter()` 可能 resolve 为 `null`（无可用适配器），必须判空。

**显存容量、GPU 温度、风扇转速：读不到。** `maxBufferSize` 不是显存，不许当显存展示。

### 6.3 内存与存储（`memory.ts`）

```ts
navigator.deviceMemory
// number | undefined。单位 GiB。取值只可能是 0.25/0.5/1/2/4/8
// 向下取整到 2 的幂，且封顶 8 —— 64GB 的机器同样返回 8
// → 必须标 approx，note 写明封顶规则。仅 Chromium 系提供
```

```ts
(performance as any).memory?.jsHeapSizeLimit
// 非标准，仅 Chromium。是当前标签页的 JS 堆上限，与物理内存无直接关系
// → approx，note 必须说明这不是系统内存
```

```ts
const { quota, usage } = await navigator.storage.estimate();
// quota: 可分配配额，通常是剩余磁盘空间的一个比例（Chrome 约 60%）→ approx
// usage: 本站已用量 → exact
```

可由 `quota` **粗略**反推磁盘剩余空间，但反推系数各浏览器不同且会变。**不要在界面上展示反推出的磁盘容量**，只展示配额原值。

### 6.4 显示（`display.ts`）

```ts
screen.width, screen.height          // CSS 像素 → exact，note 说明非物理像素
window.devicePixelRatio              // → exact
Math.round(screen.width * devicePixelRatio)  // 物理像素估算 → exact
screen.colorDepth                    // → exact
screen.availWidth / availHeight      // 去掉任务栏后的可用区域 → exact
'isExtended' in screen && screen.isExtended   // 是否接了多显示器 → exact（Chromium）
matchMedia('(dynamic-range: high)').matches   // HDR
matchMedia('(color-gamut: p3)').matches       // 广色域
screen.orientation?.type
```

**多显示器详情**（数量、排列、各自分辨率）需要权限，列为 P1 增强项：

```ts
// 需 'window-management' 权限，且必须由用户手势触发
const details = await window.getScreenDetails();
details.screens.forEach(s => { s.width, s.height, s.isPrimary, s.label });
```

**刷新率**：无直接 API。可用连续 `requestAnimationFrame` 采样帧间隔反推（P2），但误差大且受节流影响，实现时标 `approx` 并说明是"实测推算"。**显示器型号与物理尺寸读不到。**

### 6.5 网络与电源（`network.ts`）

```ts
const c = (navigator as any).connection;   // NetworkInformation，仅 Chromium
c.effectiveType   // 'slow-2g'|'2g'|'3g'|'4g' —— 按实测延迟带宽分档，不是网卡类型 → approx
c.downlink        // Mbps，滚动平均，上限约 10 → approx
c.rtt             // ms，取整到 25 的倍数 → approx
c.saveData        // boolean → exact
```

```ts
const battery = await navigator.getBattery();   // 返回 Promise，注意是 getBattery 不是 getBatteryManager
battery.level      // 0–1，部分实现取整到 5% → approx
battery.charging   // → exact
battery.chargingTime / dischargingTime  // 常为 Infinity，需处理
```

Battery Status API 已从 Firefox 和 Safari 移除 → 这两个浏览器标 `unavailable`，note 写"该浏览器已移除此接口"。

**本机 IP、MAC 地址：不实现，见非目标。**

### 6.6 编解码硬件加速（`codec.ts`）

这是本页少有的能真实反映硬件能力、且精度为 `exact` 的项，价值高，务必实现。

```ts
const r = await navigator.mediaCapabilities.decodingInfo({
  type: 'file',
  video: { contentType: 'video/mp4; codecs="avc1.42E01E"',
           width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 }
});
r.supported       // 是否能播
r.powerEfficient  // true ≈ 有对应硬件解码单元 → 展示为"硬解"/"软解"
r.smooth          // 能否流畅播放
```

至少覆盖这几路，各测 1080p30 与 4K60 两档：

| 编码 | contentType |
|---|---|
| H.264 | `video/mp4; codecs="avc1.42E01E"` |
| H.265/HEVC | `video/mp4; codecs="hev1.1.6.L93.B0"` |
| VP9 | `video/webm; codecs="vp09.00.10.08"` |
| AV1 | `video/mp4; codecs="av01.0.05M.08"` |

编码能力（`encodingInfo`）也可测，用于判断能不能做浏览器内推流，列 P1。

### 6.7 外设（`devices.ts`）

```ts
const list = await navigator.mediaDevices.enumerateDevices();
// 未授权时：能拿到设备数量和 kind，但 label 为空字符串、deviceId 为空
// 授权后：label 可读（如 "Mackie ProFX16v3"）
list.filter(d => d.kind === 'videoinput').length     // 摄像头数量 → exact
list.filter(d => d.kind === 'audioinput').length     // 音频输入数量 → exact
list.filter(d => d.kind === 'audiooutput').length    // Safari 不返回此类 → 需说明
navigator.maxTouchPoints                              // → exact
```

设备名称作为 P1 增强项：按钮触发 `getUserMedia({audio:true})` 获取授权后重新枚举，拿到后**立即** `stream.getTracks().forEach(t => t.stop())` 关闭设备，不留占用。

USB / 蓝牙 / HID 设备清单读不到——WebUSB 与 WebHID 只能看到用户逐个手动授权的设备，不能枚举。

### 6.8 系统与环境（`system.ts`）

```ts
navigator.userAgentData?.platform + hi.platformVersion   // 有 UACH 时 → exact
navigator.platform                                        // 降级方案 → approx，UA 已被冻结
hi.fullVersionList        // [{brand, version}]，浏览器完整版本 → exact
navigator.languages       // → exact
Intl.DateTimeFormat().resolvedOptions().timeZone          // → exact
matchMedia('(prefers-color-scheme: dark)').matches
matchMedia('(prefers-reduced-motion: reduce)').matches
navigator.pdfViewerEnabled
navigator.cookieEnabled
```

Windows 11 的识别：UACH 的 `platformVersion` 主版本号 ≥ 13 表示 Win11，UA 字符串里永远是 `Windows NT 10.0`。若做此映射，标 `approx` 并说明依据。

### 6.9 跑分（`benchmark.ts`）

作为 CPU 型号缺失的**代理指标**，只用于粗略分档。

- **必须在 Web Worker 里跑**，不能阻塞主线程和首屏渲染。
- 固定迭代次数的浮点循环，测耗时，换算成相对分数。
- 结果一律 `approx`，note 必须写"仅供分档，受后台负载和节能策略影响，多次运行会有波动"。
- 分数不要映射成"你的 CPU 大约是 i5-12400"这类猜测——那是编造。
- 可选加一个 WebGL 填充率测试作为 GPU 代理指标（P2）。

---

## 7. 必须避开的陷阱

按 AI 实现时出错频率排序：

1. **API 名称记错。** `navigator.deviceMemory` 不是 `deviceMemoryGB`；`navigator.getBattery()` 不是 `getBatteryManager()`；`WEBGL_debug_renderer_info` 不带复数。严格照第 6 节。
2. **在渲染期读取 `navigator` / `screen`。** 必须在 `useEffect` 内。用 Next.js 时这是构建失败的头号原因。
3. **WebGL 上下文泄漏。** 每次"重新检测"都新建 canvas 而不释放，点几次后 GPU 探测就返回空。必须调 `WEBGL_lose_context`。
4. **未做存在性判断就调用。** `navigator.connection`、`navigator.userAgentData`、`performance.memory`、`navigator.gpu` 在部分浏览器上是 `undefined`，直接访问属性会抛错并中断整个探测流程。
5. **把 `approx` 当 `exact` 展示。** 尤其是内存和存储配额。这是产品失败点，不只是 bug。
6. **未授权时把空字符串 label 渲染成空白行。** 应显示"需授权"。
7. **串行 `await` 所有探测器。** 跑分和 WebGPU 各需数百毫秒，串行会让首屏空白 1 秒以上。用 `Promise.allSettled` 并行 + 增量渲染。
8. **在无用户手势的情况下调 `getScreenDetails()` 或 `getUserMedia()`。** 会被拒绝。必须绑在按钮点击上。
9. **未处理 `Infinity`。** 电池的 `chargingTime` / `dischargingTime` 常为 `Infinity`，格式化前要判断。
10. **引入 UA 解析库。** 见第 2 节。

---

## 8. 交付优先级

### P0 — 可用的最小版本

- [ ] `types.ts` 数据模型 + `registry.ts` 执行框架 + `safe()` 包装
- [ ] 探测器：CPU、GPU（WebGL）、内存与存储、显示、系统与环境
- [ ] 编解码硬解检测（1080p30 四路）
- [ ] 外设数量统计（不含授权增强）
- [ ] 三档精度标签体系 + 图例
- [ ] "读不到的部分"静态区块（内容见 `unavailable.ts`）
- [ ] 分组卡片布局，移动端单列
- [ ] 复制文本报告
- [ ] 无第三方脚本，无任何数据外发

### P1 — 完整体验

- [ ] WebGPU 适配器信息
- [ ] 网络信息 + 电池
- [ ] Worker 内 CPU 跑分
- [ ] 授权增强区：设备名称（getUserMedia）、多显示器详情（getScreenDetails）
- [ ] 4K60 编解码档位 + 编码能力检测
- [ ] 导出 JSON（含 `raw` 原始值）
- [ ] 重新检测（正确释放并重建 WebGL 上下文）
- [ ] 浏览器差异提示：检出 Safari / Firefox 时在页首说明"该浏览器屏蔽项较多"
- [ ] 中英文切换

### P2 — 加分项

- [ ] 刷新率推算
- [ ] WebGL 填充率作为 GPU 代理指标
- [ ] 导出为图片（Canvas 绘制，不引入 html2canvas）
- [ ] "为什么读不到"折叠说明，每条附规范链接
- [ ] 与常见配置对比的分档提示（如"能否胜任 1080p60 推流"），**必须基于硬解检测结果而非跑分猜测**

---

## 9. 验收标准

### 功能

1. 首屏在 300ms 内出现骨架与至少一组已完成的数据，不出现整页空白等待。
2. 任意单个探测器抛错时，其余分组正常渲染，错误项显示为 `unavailable`，控制台无未捕获异常。
3. 每个 `confidence === 'approx'` 的项都有非空 `note`（写成单测断言）。
4. 每个项都有非空 `source`（写成单测断言）。
5. 连续点击"重新检测"10 次，GPU 信息始终能读出（验证上下文未泄漏）。
6. 授权类功能在未点击按钮前不触发任何权限弹窗。
7. 授权摄像头/麦克风获取 label 后，设备指示灯熄灭（track 已 stop）。
8. Network 面板确认：除字体外无任何外部请求，无任何 POST/beacon。

### 跨浏览器测试矩阵

| 环境 | 必须验证 |
|---|---|
| Chrome / Edge 桌面 | 全量项可读，GPU 型号为真实型号 |
| Firefox 桌面 | `userAgentData`、`deviceMemory`、`connection`、`getBattery` 全部走降级路径不报错 |
| Firefox + `privacy.resistFingerprinting` | GPU 名称被屏蔽时正确降级为 `approx` |
| Safari macOS | GPU 返回笼统值时标 `approx`；`audiooutput` 缺失时有说明 |
| Safari iOS | 布局单列可读；不可用项数量多但界面不塌 |
| Chrome Android | `hi.model` 有值时正确展示机型 |

### 可访问性

- Lighthouse Accessibility ≥ 95
- 全部交互元素可键盘到达，焦点可见
- 精度信息不只靠颜色传达（同时有文字标签）

---

## 10. 给 AI 执行者的指令

1. **先搭骨架再填探测器。** 顺序：`types.ts` → `utils.ts`（`safe`、字节格式化、WebGL 上下文管理）→ `registry.ts` → 一个最简探测器（`cpu.ts`）打通端到端 → UI 组件 → 其余探测器。
2. **每个探测器独立一个文件、独立一份单测。** 用 `vi.stubGlobal` 模拟 `navigator` 的存在与缺失两种情况，两种都要测。
3. **第 6 节的 API 签名不要改。** 如果你觉得某个名称不对，先在浏览器控制台验证，不要凭印象改成"更常见"的写法。
4. **不确定精度归类时，往低了标。** 宁可把 `exact` 标成 `approx`，不可反向。
5. **不要为了填满界面而编造数据项。** 读不到就是读不到，放进"读不到的部分"比给一个猜测值更有价值。
6. 每完成一个优先级层级，输出一份自查清单，逐条对照第 9 节验收标准。

### 复制到 AI 工具时的开场提示词

> 按附带的《本机配置探测器 · 开发计划》从零实现这个项目。技术栈按第 2 节，先完成 P0 全部条目。
> 注意三点：第 6 节的所有 Web API 名称与调用方式已核对过，请照抄不要替换；所有探测调用必须包裹错误处理，单个失败不得中断整体；精度标签体系是产品核心，不得为简化实现而省略。
> 完成 P0 后停下来，输出对照第 9 节验收标准的自查结果，等我确认再做 P1。
