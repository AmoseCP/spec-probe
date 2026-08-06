import type { GroupId, L10n, Metric, PermissionKind, Text } from './types';

/** 同步调用包装：任何抛错都吞掉并返回 fallback。所有 Web API 调用必须经它。 */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** 异步版本。同时兜住同步抛错与 Promise reject。 */
export async function safeAsync<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    const v = await fn();
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** 给异步探测加超时，避免某个接口挂住导致整组永远不渲染。 */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      },
    );
  });
}

// ---------------------------------------------------------------- 构造 Metric

/** "没有对应接口"的占位来源。真实 API 名一律直接写字符串。 */
export const NO_API: L10n = { zh: '（无对应 Web API）', en: '(no such Web API)' };

interface MetricInit {
  id: string;
  group: GroupId;
  label: Text;
  source: Text;
  note?: Text;
  raw?: unknown;
  permission?: PermissionKind;
}

export function exact(init: MetricInit & { value: Text }): Metric {
  return { ...init, confidence: 'exact' };
}

export function approx(init: MetricInit & { value: Text; note: Text }): Metric {
  return { ...init, confidence: 'approx' };
}

export function unavailable(init: MetricInit & { note?: Text }): Metric {
  return { ...init, value: null, confidence: 'unavailable' };
}

// ------------------------------------------------------------------- 格式化

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** 二进制字节格式化。1024 进制，保留合适位数。 */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? String(Math.round(n)) : n.toFixed(digits).replace(/\.0+$/, '');
  return `${fixed} ${UNITS[i]}`;
}

/** 秒 → 时长。Infinity / NaN 返回 null，由调用方决定怎么显示。 */
export function formatDuration(seconds: number): L10n | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) {
    return m > 0
      ? { zh: `${h} 小时 ${m} 分钟`, en: `${h} h ${m} min` }
      : { zh: `${h} 小时`, en: `${h} h` };
  }
  const mm = Math.max(1, m);
  return { zh: `${mm} 分钟`, en: `${mm} min` };
}

/** 布尔值 → 双语文案。两种语言的措辞由调用方给全，避免机械直译。 */
export function boolText(v: boolean, yes: L10n, no: L10n): L10n {
  return v ? yes : no;
}

/**
 * 从 WebGL renderer 字符串里提取可读的 GPU 型号。
 * 典型输入：
 *   ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)
 *   ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)
 * 提取不出来时原样返回。
 */
export function prettyGpuName(renderer: string): string {
  const raw = renderer.trim();
  if (!raw) return raw;

  let body = raw;
  const angle = /^ANGLE\s*\((.*)\)$/is.exec(raw);
  if (angle) {
    const parts = splitTopLevel(angle[1]);
    // ANGLE 三段式：vendor, device, backend —— 取中间段
    body = parts.length >= 2 ? parts[1] : parts[0];
  }

  body = body.replace(/^ANGLE\s+Metal\s+Renderer:\s*/i, '');
  body = body.replace(/\s+(Direct3D\d+|OpenGL|Vulkan|Metal)\b.*$/i, '');
  body = body.replace(/\s+vs_\d+_\d+.*$/i, '');
  body = body.replace(/\s*\(0x[0-9A-F]+\)/gi, '');
  body = body.replace(/,\s*(Unspecified Version|D3D11|D3D9)\s*$/i, '');
  body = body.replace(/\s+/g, ' ').trim();
  return body || raw;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// --------------------------------------------------------- WebGL 上下文管理

export interface GlHandle {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  isWebGL2: boolean;
  /** 必须调用：释放上下文，否则多次重新检测会耗尽浏览器的上下文配额 */
  release(): void;
}

/**
 * 统一创建 WebGL 上下文。调用方 **必须** 在 finally 里调 release()。
 * 浏览器对同时存在的上下文数量有上限（通常 8–16），泄漏会让后续检测拿不到 GPU。
 */
export function acquireGl(): GlHandle | null {
  return safe(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false };
    const gl2 = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    const gl = gl2 ?? (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null);
    if (!gl) return null;

    let released = false;
    return {
      gl,
      isWebGL2: Boolean(gl2),
      release() {
        if (released) return;
        released = true;
        safe(() => {
          const lose = gl.getExtension('WEBGL_lose_context') as
            | { loseContext(): void }
            | null;
          lose?.loseContext();
          return null;
        }, null);
        canvas.width = 0;
        canvas.height = 0;
      },
    } satisfies GlHandle;
  }, null);
}

/** 只在这里判断"是不是能拿到真实型号"，避免各处重复写字符串判断。 */
export function isGenericGpuName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  return [
    'apple gpu',
    'webkit webgl',
    'mozilla',
    'generic renderer',
    'google swiftshader',
    'llvmpipe',
    'software rasterizer',
  ].some((g) => n.includes(g));
}
