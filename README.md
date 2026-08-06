# spec-probe · 本机配置探测器

纯前端静态网页。打开即检测本机可探测到的硬件与环境信息，**每一项都标注精确 / 近似 / 不可用，并写明来源 API**。

无后端、无埋点、无第三方脚本，数据不离开浏览器。

**在线体验：https://amosecp.github.io/spec-probe/**（静态托管，页面本身不发起任何外部请求）

## 为什么又做一个

这类"在线硬件检测"页面的常见失败模式是把模糊值当精确值展示——把 `navigator.deviceMemory` 返回的 `8` 写成"内存：8GB"，而实际机器可能是 64GB。

本项目的差异点是**诚实**：

- 每个数据项带精度标签：`精确` / `近似` / `不可用`
- 每个数据项写明来源 API（`navigator.hardwareConcurrency`，不是"浏览器接口"这种含糊表述）
- 近似项必须解释为什么近似：取整、封顶、分档，还是代理指标
- 有独立区块列出**浏览器根本读不到的部分**及原因，每条附规范链接

读不到就是读不到。放进"读不到的部分"比给一个猜测值更有价值。

明确不做：不用 WebRTC 探测内网 IP，不做指纹，不生成设备 ID，不引入 UA 解析库，不把跑分映射成"你的 CPU 大约是 i5-12400"。

## 命令

```bash
npm install
npm run dev        # 开发
npm run build      # 产物在 dist/，纯静态，可直接丢到任意静态托管
npm run preview    # 预览构建产物
npm test           # Vitest 单测
```

技术栈：Vite 5 + React 18 + TypeScript strict。运行时依赖只有 `react` 与 `react-dom`。

## 能读到什么

| 分组 | 主要来源 |
|---|---|
| 系统与环境 | `userAgentData` · `Intl` · `matchMedia` |
| 处理器 | `hardwareConcurrency` · UA-CH 高熵字段 |
| 显卡 | `WEBGL_debug_renderer_info` · `GPUAdapter.info` |
| 内存与存储 | `deviceMemory` · `performance.memory` · `storage.estimate` |
| 显示 | `screen` · `devicePixelRatio` · `matchMedia` |
| 视频编解码 | `mediaCapabilities.decodingInfo` / `encodingInfo`（四路 × 1080p30/4K60 解码 + 三路 WebRTC 推流编码） |
| 外设 | `mediaDevices.enumerateDevices` · `maxTouchPoints` |
| 网络与电源 | `navigator.connection` · `getBattery` |
| 性能跑分 | Web Worker 内浮点循环，结果以吞吐量给出，不换算成自造分数 |
| 实测推算 | `requestAnimationFrame` 反推刷新率 · WebGL 填充率 |

另有：授权增强区（设备名称 / 多显示器详情，默认不请求任何权限，点按钮才发起）、由硬解结果推出的"这台机器能干什么"、复制文本报告、导出 JSON（含 `raw` 原始值）、导出 PNG（自绘 Canvas，不引入 html2canvas）、中英文切换。

## 结构

```
src/
  detect/
    types.ts        判别联合定义的 Metric：approx 必带 note，unavailable 的 value 必为 null
    utils.ts        safe() / safeAsync() / withTimeout()、字节格式化、WebGL 上下文获取与释放
    registry.ts     并行执行 + 每个探测器完成即回调（增量渲染）
    uach.ts         User-Agent Client Hints 读取（Firefox / Safari 上为 null）
    unavailable.ts  "读不到的部分"静态清单 + 规范链接
    detectors/      每个探测器一个文件、一份单测；跑分另有 benchmark.worker.ts
  i18n/             双语文案与 t()
  components/       Nameplate / Legend / MetricGroup / MetricRow / PermissionCard /
                    UnavailablePanel / Verdicts / Actions
  report/           toText.ts 纯文本、toJson.ts 机读、toImage.ts 自绘 PNG
                    verdicts.ts 由硬解结果推结论 —— 只读 codec.*，永不读跑分
```

文案不走 key 查表：`Metric` 的 `label` / `value` / `note` 直接携带 `{zh, en}`，型号名等无需翻译的值仍是普通字符串。切换语言不会重新探测。

## 三条硬约束

1. `Detector.run()` 永不抛出，所有 Web API 调用经 `safe()` / `safeAsync()` 包裹；单个探测器崩溃由 `registry` 兜底成一条 `unavailable`，不影响其他分组。
2. 精度归类不确定时往低了标。`deviceMemory`、`storage.quota`、`performance.memory` 一律 `approx`，note 里写明取整 / 封顶 / 代理指标的原因。
3. WebGL 上下文用完必须 `release()`（内部调 `WEBGL_lose_context`），否则连点几次"重新检测"就会耗尽浏览器的上下文配额。

## 验证状态

已验证（真机 Chrome 150 / macOS / Apple M1 Max）：

- 156 个单测通过，`tsc -b` strict 无错误
- 连续 10 次"重新检测"读数稳定，无 WebGL 上下文泄漏
- 骨架 36ms 出现，9/10 组在 50ms 内落地，跑分组 1048ms 才回来而其余组不等它
- 全流程跑完后 mic / camera / window-management 三项权限仍为 `prompt`
- 网络面板只有 4 条同源 GET，产物中 `fetch` / `XHR` / `sendBeacon` / `WebSocket` 计数为 0
- 378 个文本节点对比度最低 5.32:1，全部交互元素键盘可达且满足 WCAG 2.5.3

**尚未验证**：Firefox / Safari / iOS / Android / Edge 的真机表现（降级路径目前只有 `vi.stubGlobal` 单测覆盖）；前台窗口下的刷新率读数（后台标签页里 Chrome 不派发 `requestAnimationFrame`）；Lighthouse 官方跑分。

欢迎提 issue 补充其他浏览器的实际结果。

## 开发计划

`spec-probe-开发计划.md` 是本项目的完整规格，含精度体系的设计立场、各探测器的 API 细则、以及一份"按 AI 实现时出错频率排序"的避坑清单。

## 许可证

Apache License 2.0，见 [LICENSE](LICENSE)。Copyright 2026 Amose。
