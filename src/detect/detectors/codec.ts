import type { Detector, L10n, Metric, Text } from '../types';
import { exact, safeAsync, unavailable, withTimeout } from '../utils';

interface CodecSpec {
  id: string;
  label: string;
  contentType: string;
}

/** 第 6.6 节给定的四路编码，不要替换 codecs 参数字符串。 */
export const CODECS: CodecSpec[] = [
  { id: 'h264', label: 'H.264 / AVC', contentType: 'video/mp4; codecs="avc1.42E01E"' },
  { id: 'hevc', label: 'H.265 / HEVC', contentType: 'video/mp4; codecs="hev1.1.6.L93.B0"' },
  { id: 'vp9', label: 'VP9', contentType: 'video/webm; codecs="vp09.00.10.08"' },
  { id: 'av1', label: 'AV1', contentType: 'video/mp4; codecs="av01.0.05M.08"' },
];

interface Profile {
  key: string;
  label: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
}

export const PROFILES: Profile[] = [
  { key: '1080p30', label: '1080p30', width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 },
  { key: '4k60', label: '4K60', width: 3840, height: 2160, bitrate: 25_000_000, framerate: 60 },
];

/**
 * 编码能力，用于判断能不能在浏览器里推流。
 * 注意 encodingInfo 的 type 与 contentType 写法与解码不同：
 * 'webrtc' 档用 WebRTC 的 mime 名（video/H264），不是 mp4 的 codecs 参数写法。
 * 老浏览器只认已废弃的 'record'，因此保留 fileType 作为降级。
 */
export interface EncodeSpec {
  id: string;
  label: string;
  webrtcType: string;
  fileType: string;
}

export const ENCODE_CODECS: EncodeSpec[] = [
  {
    id: 'h264',
    label: 'H.264 / AVC',
    webrtcType: 'video/H264',
    fileType: 'video/mp4; codecs="avc1.42E01E"',
  },
  {
    id: 'vp9',
    label: 'VP9',
    webrtcType: 'video/VP9',
    fileType: 'video/webm; codecs="vp09.00.10.08"',
  },
  {
    id: 'av1',
    label: 'AV1',
    webrtcType: 'video/AV1',
    fileType: 'video/mp4; codecs="av01.0.05M.08"',
  },
];

interface CapabilityResult {
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}

interface MediaCapabilitiesLike {
  decodingInfo?(cfg: unknown): Promise<CapabilityResult>;
  encodingInfo?(cfg: unknown): Promise<CapabilityResult>;
}

function mediaCapabilities(): MediaCapabilitiesLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { mediaCapabilities?: MediaCapabilitiesLike }).mediaCapabilities;
}

async function probeDecode(spec: CodecSpec, p: Profile): Promise<CapabilityResult | null> {
  const mc = mediaCapabilities();
  if (typeof mc?.decodingInfo !== 'function') return null;

  return safeAsync(
    () =>
      withTimeout(
        mc.decodingInfo!({
          type: 'file',
          video: {
            contentType: spec.contentType,
            width: p.width,
            height: p.height,
            bitrate: p.bitrate,
            framerate: p.framerate,
          },
        }),
        3000,
        null as CapabilityResult | null,
      ),
    null as CapabilityResult | null,
  );
}

async function probeEncode(spec: EncodeSpec, p: Profile): Promise<CapabilityResult | null> {
  const mc = mediaCapabilities();
  if (typeof mc?.encodingInfo !== 'function') return null;

  const ask = (type: string, contentType: string) =>
    safeAsync(
      () =>
        withTimeout(
          mc.encodingInfo!({
            type,
            video: {
              contentType,
              width: p.width,
              height: p.height,
              bitrate: p.bitrate,
              framerate: p.framerate,
            },
          }),
          3000,
          null as CapabilityResult | null,
        ),
      null as CapabilityResult | null,
    );

  // 现行浏览器只认 'webrtc'；'record' 已从枚举里移除，仅作老版本降级
  return (await ask('webrtc', spec.webrtcType)) ?? (await ask('record', spec.fileType));
}

const UNSUPPORTED: L10n = { zh: '不支持', en: 'Not supported' };

function describe(r: CapabilityResult, hardware: L10n, software: L10n): Text {
  if (!r.supported) return UNSUPPORTED;
  const accel = r.powerEfficient ? hardware : software;
  return r.smooth
    ? { zh: `${accel.zh} · 流畅`, en: `${accel.en} · smooth` }
    : { zh: `${accel.zh} · 可能卡顿`, en: `${accel.en} · may stutter` };
}

const DECODE_NOTE: L10n = {
  zh: '"硬解"表示 powerEfficient 为真，即由专用解码单元处理；"软解"由 CPU 承担',
  en: '"Hardware" means powerEfficient is true — a dedicated decode block handles it; "software" means the CPU does',
};

const ENCODE_NOTE: L10n = {
  zh: '按 WebRTC 推流场景查询。"硬编"表示 powerEfficient 为真，可在浏览器内推流而不吃满 CPU；不少平台即使有编码单元也会报 false',
  en: 'Queried as a WebRTC streaming case. "Hardware" means powerEfficient is true — streaming from the browser will not saturate the CPU. Several platforms report false even when an encoder block exists',
};

const QUERY_FAILED: L10n = { zh: '查询失败或超时', en: 'The query failed or timed out' };

export const codecDetector: Detector = {
  id: 'codec',
  group: 'codec',
  title: { zh: '视频编解码', en: 'Video codecs' },
  subtitle: 'navigator.mediaCapabilities.decodingInfo / encodingInfo',

  async run(): Promise<Metric[]> {
    const mc = mediaCapabilities();

    if (typeof mc?.decodingInfo !== 'function') {
      return CODECS.flatMap((c) =>
        PROFILES.map((p) =>
          unavailable({
            id: `codec.${c.id}.${p.key}`,
            group: 'codec',
            label: `${c.label} ${p.label}`,
            source: 'navigator.mediaCapabilities.decodingInfo',
            note: {
              zh: '本浏览器无 Media Capabilities 接口',
              en: 'This browser has no Media Capabilities API',
            },
          }),
        ),
      );
    }

    // 各路编码与档位并行探测，互不阻塞
    const decodeJobs = CODECS.flatMap((c) =>
      PROFILES.map(async (p) => ({ c, p, r: await probeDecode(c, p) })),
    );
    const encodeJobs = ENCODE_CODECS.map(async (c) => ({
      c,
      p: PROFILES[0],
      r: await probeEncode(c, PROFILES[0]),
    }));

    const [decoded, encoded] = await Promise.all([
      Promise.all(decodeJobs),
      Promise.all(encodeJobs),
    ]);

    const out: Metric[] = [];

    for (const { c, p, r } of decoded) {
      out.push(
        r
          ? exact({
              id: `codec.${c.id}.${p.key}`,
              group: 'codec',
              label: { zh: `${c.label} ${p.label} 解码`, en: `${c.label} ${p.label} decode` },
              value: describe(r, { zh: '硬解', en: 'Hardware' }, { zh: '软解', en: 'Software' }),
              raw: r,
              source: 'navigator.mediaCapabilities.decodingInfo',
              note: r.supported ? DECODE_NOTE : undefined,
            })
          : unavailable({
              id: `codec.${c.id}.${p.key}`,
              group: 'codec',
              label: { zh: `${c.label} ${p.label} 解码`, en: `${c.label} ${p.label} decode` },
              source: 'navigator.mediaCapabilities.decodingInfo',
              note: QUERY_FAILED,
            }),
      );
    }

    for (const { c, p, r } of encoded) {
      out.push(
        r
          ? exact({
              id: `codec.encode.${c.id}.${p.key}`,
              group: 'codec',
              label: { zh: `${c.label} ${p.label} 推流编码`, en: `${c.label} ${p.label} encode` },
              value: describe(r, { zh: '硬编', en: 'Hardware' }, { zh: '软编', en: 'Software' }),
              raw: r,
              source: 'navigator.mediaCapabilities.encodingInfo',
              note: r.supported ? ENCODE_NOTE : undefined,
            })
          : unavailable({
              id: `codec.encode.${c.id}.${p.key}`,
              group: 'codec',
              label: { zh: `${c.label} ${p.label} 推流编码`, en: `${c.label} ${p.label} encode` },
              source: 'navigator.mediaCapabilities.encodingInfo',
              note: {
                zh: '本浏览器不提供 encodingInfo，或不接受该编码的查询',
                en: 'This browser has no encodingInfo, or rejected the query for this codec',
              },
            }),
      );
    }

    return out;
  },
};
