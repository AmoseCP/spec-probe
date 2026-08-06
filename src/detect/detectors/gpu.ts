import type { Detector, Metric } from '../types';
import {
  NO_API,
  acquireGl,
  approx,
  exact,
  formatBytes,
  isGenericGpuName,
  prettyGpuName,
  safe,
  safeAsync,
  unavailable,
  withTimeout,
} from '../utils';

interface AdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface AdapterLike {
  info?: AdapterInfo;
  requestAdapterInfo?: () => Promise<AdapterInfo>;
  limits?: Record<string, number>;
  features?: Set<string>;
}

function webglMetrics(): Metric[] {
  const out: Metric[] = [];
  const handle = acquireGl();

  if (!handle) {
    return [
      unavailable({
        id: 'gpu.renderer',
        group: 'gpu',
        label: { zh: '显卡型号', en: 'GPU model' },
        source: 'WebGLRenderingContext.getParameter',
        note: {
          zh: 'WebGL 上下文创建失败，可能被浏览器设置或显卡驱动禁用',
          en: 'Could not create a WebGL context; it may be disabled by browser settings or the driver',
        },
      }),
      unavailable({
        id: 'gpu.vendor',
        group: 'gpu',
        label: { zh: '显卡厂商', en: 'GPU vendor' },
        source: 'WebGLRenderingContext.getParameter',
        note: { zh: 'WebGL 上下文创建失败', en: 'Could not create a WebGL context' },
      }),
    ];
  }

  try {
    const { gl, isWebGL2 } = handle;

    // 拿到扩展才是真实型号；拿不到时 RENDERER 返回的是通用字符串
    const ext = safe(
      () =>
        gl.getExtension('WEBGL_debug_renderer_info') as {
          UNMASKED_RENDERER_WEBGL: number;
          UNMASKED_VENDOR_WEBGL: number;
        } | null,
      null,
    );

    const rendererRaw = safe(
      () =>
        String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      '',
    );
    const vendorRaw = safe(
      () => String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      '',
    );

    const rendererLabel = { zh: '显卡型号', en: 'GPU model' };

    if (!rendererRaw) {
      out.push(
        unavailable({
          id: 'gpu.renderer',
          group: 'gpu',
          label: rendererLabel,
          source: 'WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL',
          note: {
            zh: '本浏览器屏蔽了渲染器名称',
            en: 'This browser masks the renderer name',
          },
        }),
      );
    } else if (!ext) {
      out.push(
        approx({
          id: 'gpu.renderer',
          group: 'gpu',
          label: rendererLabel,
          value: prettyGpuName(rendererRaw),
          raw: rendererRaw,
          source: 'WebGLRenderingContext.RENDERER',
          note: {
            zh: 'WEBGL_debug_renderer_info 扩展被屏蔽（常见于 Firefox 防指纹模式），这里是通用名称而非真实型号',
            en: 'The WEBGL_debug_renderer_info extension is blocked (common with Firefox resistFingerprinting), so this is a generic name, not the real model',
          },
        }),
      );
    } else if (isGenericGpuName(rendererRaw)) {
      out.push(
        approx({
          id: 'gpu.renderer',
          group: 'gpu',
          label: rendererLabel,
          value: prettyGpuName(rendererRaw),
          raw: rendererRaw,
          source: 'WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL',
          note: {
            zh: '本浏览器返回的是笼统名称（如 Apple GPU / SwiftShader），不是具体型号',
            en: 'This browser returns a catch-all name (e.g. Apple GPU / SwiftShader) rather than a specific model',
          },
        }),
      );
    } else {
      out.push(
        exact({
          id: 'gpu.renderer',
          group: 'gpu',
          label: rendererLabel,
          value: prettyGpuName(rendererRaw),
          raw: rendererRaw,
          source: 'WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL',
        }),
      );
    }

    const vendorLabel = { zh: '显卡厂商', en: 'GPU vendor' };
    if (vendorRaw) {
      const item = { id: 'gpu.vendor', group: 'gpu' as const, label: vendorLabel, value: vendorRaw, raw: vendorRaw };
      out.push(
        ext
          ? exact({ ...item, source: 'WEBGL_debug_renderer_info.UNMASKED_VENDOR_WEBGL' })
          : approx({
              ...item,
              source: 'WebGLRenderingContext.VENDOR',
              note: {
                zh: '扩展被屏蔽，这里是浏览器的通用厂商字符串',
                en: 'The extension is blocked, so this is the browser’s generic vendor string',
              },
            }),
      );
    } else {
      out.push(
        unavailable({
          id: 'gpu.vendor',
          group: 'gpu',
          label: vendorLabel,
          source: 'WEBGL_debug_renderer_info.UNMASKED_VENDOR_WEBGL',
          note: { zh: '本浏览器屏蔽了厂商名称', en: 'This browser masks the vendor name' },
        }),
      );
    }

    out.push(
      exact({
        id: 'gpu.webglVersion',
        group: 'gpu',
        label: { zh: 'WebGL 版本', en: 'WebGL version' },
        value: isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0',
        raw: isWebGL2 ? 2 : 1,
        source: 'canvas.getContext("webgl2") ?? canvas.getContext("webgl")',
      }),
    );

    const maxTexture = safe(() => Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)), 0);
    out.push(
      maxTexture > 0
        ? exact({
            id: 'gpu.maxTextureSize',
            group: 'gpu',
            label: { zh: '最大纹理尺寸', en: 'Max texture size' },
            value: `${maxTexture} px`,
            raw: maxTexture,
            source: 'gl.getParameter(gl.MAX_TEXTURE_SIZE)',
            note: {
              zh: '驱动上报的能力上限，与显存容量无关',
              en: 'A driver-reported capability limit; unrelated to VRAM size',
            },
          })
        : unavailable({
            id: 'gpu.maxTextureSize',
            group: 'gpu',
            label: { zh: '最大纹理尺寸', en: 'Max texture size' },
            source: 'gl.getParameter(gl.MAX_TEXTURE_SIZE)',
          }),
    );

    const shadingLang = safe(() => String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)), '');
    if (shadingLang) {
      out.push(
        exact({
          id: 'gpu.shadingLanguage',
          group: 'gpu',
          label: { zh: '着色器语言', en: 'Shading language' },
          value: shadingLang,
          raw: shadingLang,
          source: 'gl.getParameter(gl.SHADING_LANGUAGE_VERSION)',
        }),
      );
    }
  } finally {
    // 必须释放，否则连点几次"重新检测"就会耗尽上下文配额
    handle.release();
  }

  return out;
}

async function webgpuMetrics(): Promise<Metric[]> {
  const gpuApi = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<AdapterLike | null> } })
    .gpu;

  const adapterLabel = { zh: 'WebGPU 适配器', en: 'WebGPU adapter' };

  if (!gpuApi || typeof gpuApi.requestAdapter !== 'function') {
    return [
      unavailable({
        id: 'gpu.webgpu.adapter',
        group: 'gpu',
        label: adapterLabel,
        source: 'navigator.gpu.requestAdapter()',
        note: {
          zh: '本浏览器不提供 WebGPU（Firefox 与旧版 Safari 默认关闭）',
          en: 'No WebGPU in this browser (off by default in Firefox and older Safari)',
        },
      }),
    ];
  }

  // requestAdapter 可能 resolve 为 null（无可用适配器），也可能长时间不返回
  const adapter = await safeAsync(
    () => withTimeout(gpuApi.requestAdapter(), 3000, null as AdapterLike | null),
    null as AdapterLike | null,
  );

  if (!adapter) {
    return [
      unavailable({
        id: 'gpu.webgpu.adapter',
        group: 'gpu',
        label: adapterLabel,
        source: 'navigator.gpu.requestAdapter()',
        note: {
          zh: '接口存在但没有返回可用适配器（常见于虚拟机或显卡被列入黑名单）',
          en: 'The API exists but returned no usable adapter (common in VMs or when the GPU is blocklisted)',
        },
      }),
    ];
  }

  const out: Metric[] = [];

  // 新版 adapter.info 是同步属性；旧版 requestAdapterInfo() 已废弃
  const info = await safeAsync<AdapterInfo>(
    () => adapter.info ?? adapter.requestAdapterInfo?.() ?? {},
    {},
  );
  const parts = [info.vendor, info.architecture, info.device, info.description]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));

  out.push(
    unique.length > 0
      ? exact({
          id: 'gpu.webgpu.adapter',
          group: 'gpu',
          label: adapterLabel,
          value: unique.join(' · '),
          raw: info,
          source: 'GPUAdapter.info',
          note: {
            zh: '字段常为空字符串，这里只展示非空部分',
            en: 'These fields are often empty strings; only the non-empty ones are shown',
          },
        })
      : unavailable({
          id: 'gpu.webgpu.adapter',
          group: 'gpu',
          label: adapterLabel,
          source: 'GPUAdapter.info',
          note: {
            zh: '适配器可用，但 vendor / architecture / device 字段全为空字符串（浏览器出于反指纹考虑清空）',
            en: 'The adapter works, but vendor / architecture / device are all empty strings (cleared by the browser to resist fingerprinting)',
          },
        }),
  );

  const maxBuffer = safe(() => Number(adapter.limits?.maxBufferSize), 0);
  if (maxBuffer > 0) {
    out.push(
      approx({
        id: 'gpu.webgpu.maxBufferSize',
        group: 'gpu',
        label: { zh: '单缓冲区上限', en: 'Max buffer size' },
        value: formatBytes(maxBuffer),
        raw: maxBuffer,
        source: 'GPUAdapter.limits.maxBufferSize',
        note: {
          zh: '这是单个 GPU 缓冲区的分配上限，与显存容量相关但不等于显存，不能当显存看',
          en: 'The largest single GPU buffer that can be allocated. Related to VRAM but not the same thing — do not read it as VRAM',
        },
      }),
    );
  }

  const features = safe(() => Array.from(adapter.features ?? []), [] as string[]);
  if (features.length > 0) {
    out.push(
      exact({
        id: 'gpu.webgpu.features',
        group: 'gpu',
        label: { zh: 'WebGPU 特性', en: 'WebGPU features' },
        value: { zh: `${features.length} 项`, en: `${features.length} supported` },
        raw: features.sort(),
        source: 'GPUAdapter.features',
        note: {
          zh: `可选特性清单：${features.slice(0, 6).join(', ')}${features.length > 6 ? ' …' : ''}`,
          en: `Optional features: ${features.slice(0, 6).join(', ')}${features.length > 6 ? ' …' : ''}`,
        },
      }),
    );
  }

  return out;
}

export const gpuDetector: Detector = {
  id: 'gpu',
  group: 'gpu',
  title: { zh: '显卡', en: 'Graphics' },
  subtitle: 'WEBGL_debug_renderer_info · GPUAdapter.info',

  async run(): Promise<Metric[]> {
    // WebGL 与 WebGPU 互为补充，两个来源都要读
    const [webgl, webgpu] = await Promise.all([
      Promise.resolve().then(webglMetrics),
      webgpuMetrics(),
    ]);

    return [
      ...webgl,
      ...webgpu,
      unavailable({
        id: 'gpu.vram',
        group: 'gpu',
        label: { zh: '显存容量', en: 'VRAM size' },
        source: NO_API,
        note: {
          zh: '没有任何 Web 接口返回显存大小。WebGPU 的 maxBufferSize 是缓冲区上限，不是显存',
          en: 'No web API returns VRAM size. WebGPU’s maxBufferSize is a buffer limit, not VRAM',
        },
      }),
    ];
  },
};
