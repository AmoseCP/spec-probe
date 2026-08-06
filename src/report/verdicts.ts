import type { DetectorResult, L10n, Metric } from '../detect/types';

/**
 * 由硬解/硬编检测结果推出的实用结论。
 *
 * 硬性约束：只允许读 codec.* 这些 confidence 为 exact 的项。
 * 跑分是代理指标，拿它推"能不能剪 4K"就是猜测，本文件永不读取 benchmark.*。
 */

export interface Verdict {
  id: string;
  /** 结论本身 */
  text: L10n;
  /** 依据的 metric id，会展示给用户，便于自行核对 */
  basis: string[];
  tone: 'good' | 'caution';
}

interface CodecFacts {
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}

function factsOf(metrics: Map<string, Metric>, id: string): CodecFacts | null {
  const m = metrics.get(id);
  // 只认 exact：降级值不足以支撑结论
  if (!m || m.confidence !== 'exact') return null;
  const raw = m.raw as Partial<CodecFacts> | undefined;
  if (!raw || typeof raw.supported !== 'boolean') return null;
  return {
    supported: raw.supported,
    smooth: raw.smooth === true,
    powerEfficient: raw.powerEfficient === true,
  };
}

export function buildVerdicts(results: DetectorResult[]): Verdict[] {
  const metrics = new Map<string, Metric>();
  for (const r of results) for (const m of r.metrics) metrics.set(m.id, m);

  const out: Verdict[] = [];

  // 1. 常见网页视频（几乎全是 H.264 1080p）
  const h264 = factsOf(metrics, 'codec.h264.1080p30');
  if (h264?.supported) {
    out.push(
      h264.powerEfficient
        ? {
            id: 'verdict.web-video',
            tone: 'good',
            basis: ['codec.h264.1080p30'],
            text: {
              zh: '常见网页视频（H.264 1080p）走硬件解码，长时间播放不吃 CPU、不明显耗电。',
              en: 'Everyday web video (H.264 1080p) decodes in hardware — long playback costs little CPU or battery.',
            },
          }
        : {
            id: 'verdict.web-video',
            tone: 'caution',
            basis: ['codec.h264.1080p30'],
            text: {
              zh: '连最常见的 H.264 1080p 都只能软解，播放时 CPU 占用与发热会明显偏高。',
              en: 'Even ordinary H.264 1080p falls back to software decoding, so playback will run the CPU hot.',
            },
          },
    );
  }

  // 2. 4K 播放：任一路 4K60 硬解且流畅就算过
  const fourK: Array<[string, CodecFacts | null]> = [
    ['codec.hevc.4k60', factsOf(metrics, 'codec.hevc.4k60')],
    ['codec.vp9.4k60', factsOf(metrics, 'codec.vp9.4k60')],
    ['codec.av1.4k60', factsOf(metrics, 'codec.av1.4k60')],
    ['codec.h264.4k60', factsOf(metrics, 'codec.h264.4k60')],
  ];
  const hw4k = fourK.filter(([, f]) => f?.supported && f.powerEfficient && f.smooth);
  const any4k = fourK.filter(([, f]) => f?.supported);

  if (hw4k.length > 0) {
    out.push({
      id: 'verdict.4k',
      tone: 'good',
      basis: hw4k.map(([id]) => id),
      text: {
        zh: `4K60 视频有硬件解码单元（${hw4k.length} 路编码可硬解），播放 4K 片源不需要靠 CPU 硬扛。`,
        en: `4K60 video has a hardware decode path (${hw4k.length} codec${hw4k.length > 1 ? 's' : ''}), so 4K playback does not lean on the CPU.`,
      },
    });
  } else if (any4k.length > 0) {
    out.push({
      id: 'verdict.4k',
      tone: 'caution',
      basis: any4k.map(([id]) => id),
      text: {
        zh: '4K60 能播但没有硬解，播放时 CPU 占用会很高，笔记本上会明显掉电。',
        en: '4K60 plays but only in software: expect heavy CPU use and, on a laptop, noticeably faster battery drain.',
      },
    });
  }

  // 3. AV1 —— YouTube 高码率与部分流媒体已在用
  const av1 = factsOf(metrics, 'codec.av1.1080p30');
  if (av1) {
    out.push(
      av1.supported && av1.powerEfficient
        ? {
            id: 'verdict.av1',
            tone: 'good',
            basis: ['codec.av1.1080p30'],
            text: {
              zh: 'AV1 有硬件解码，YouTube 等平台的 AV1 片源可以放心开。',
              en: 'AV1 decodes in hardware, so AV1 streams (YouTube and others) are fine to use.',
            },
          }
        : {
            id: 'verdict.av1',
            tone: 'caution',
            basis: ['codec.av1.1080p30'],
            text: {
              zh: av1.supported
                ? 'AV1 只能软解。YouTube 等平台会优先下发 AV1，长视频会比 H.264 更费电，必要时可在播放器里改选 VP9/H.264。'
                : '本机不支持 AV1，遇到只提供 AV1 的片源会无法播放。',
              en: av1.supported
                ? 'AV1 is software-only. Platforms like YouTube prefer AV1, so long videos cost more battery than H.264; forcing VP9/H.264 in the player helps.'
                : 'AV1 is unsupported here, so AV1-only sources will not play.',
            },
          },
    );
  }

  // 4. 浏览器内推流 / 录制
  const enc = factsOf(metrics, 'codec.encode.h264.1080p30');
  if (enc?.supported) {
    out.push(
      enc.powerEfficient
        ? {
            id: 'verdict.stream',
            tone: 'good',
            basis: ['codec.encode.h264.1080p30'],
            text: {
              zh: '浏览器内 1080p 推流可以走硬件编码，直播、会议、录屏的 CPU 开销小。',
              en: 'In-browser 1080p streaming can use hardware encoding — live streams, calls and screen recording stay cheap.',
            },
          }
        : {
            id: 'verdict.stream',
            tone: 'caution',
            basis: ['codec.encode.h264.1080p30'],
            text: {
              zh: '浏览器内 1080p 推流走软件编码，直播或长时间会议时 CPU 占用会明显上升（不少平台即使有编码单元也报软编，实际体验可能好于这里的读数）。',
              en: 'In-browser 1080p streaming encodes in software, so long calls or streams push CPU use up. Note several platforms report software even when an encoder block exists.',
            },
          },
    );
  }

  return out;
}
