import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODECS, ENCODE_CODECS, PROFILES, codecDetector } from './codec';
import { get, value } from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('codec 探测器 —— 接口存在', () => {
  it('powerEfficient 映射为硬解 / 软解，且为 exact', async () => {
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async (cfg: { video: { contentType: string } }) => ({
          supported: true,
          smooth: true,
          powerEfficient: cfg.video.contentType.includes('avc1'),
        }),
      },
    });

    const metrics = await codecDetector.run();

    expect(get(metrics, 'codec.h264.1080p30')).toMatchObject({
      confidence: 'exact',
      source: 'navigator.mediaCapabilities.decodingInfo',
    });
    expect(value(metrics, 'codec.h264.1080p30')).toBe('硬解 · 流畅');
    expect(value(metrics, 'codec.av1.1080p30')).toBe('软解 · 流畅');
  });

  it('1080p30 与 4K60 两档都测', async () => {
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async (cfg: { video: { height: number } }) => ({
          supported: true,
          smooth: cfg.video.height <= 1080,
          powerEfficient: true,
        }),
      },
    });

    const metrics = await codecDetector.run();
    expect(value(metrics, 'codec.h264.1080p30')).toBe('硬解 · 流畅');
    expect(value(metrics, 'codec.h264.4k60')).toBe('硬解 · 可能卡顿');
  });

  it('不支持的编码显示"不支持"', async () => {
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async () => ({ supported: false, smooth: false, powerEfficient: false }),
      },
    });

    const metrics = await codecDetector.run();
    expect(value(metrics, 'codec.hevc.1080p30')).toBe('不支持');
  });

  it('传给 decodingInfo 的参数符合第 6.6 节', async () => {
    const calls: Array<{ video: { contentType: string } }> = [];
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async (cfg: { video: { contentType: string } }) => {
          calls.push(cfg);
          return { supported: true, smooth: true, powerEfficient: true };
        },
      },
    });

    await codecDetector.run();

    expect(calls).toHaveLength(CODECS.length * PROFILES.length);
    expect(calls[0]).toEqual({
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="avc1.42E01E"',
        width: 1920,
        height: 1080,
        bitrate: 4_000_000,
        framerate: 30,
      },
    });
  });

  it('encodingInfo 用 type:"webrtc" 与 WebRTC mime 名查询', async () => {
    const encodeCalls: Array<{ type: string; video: { contentType: string } }> = [];
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }),
        encodingInfo: async (cfg: { type: string; video: { contentType: string } }) => {
          encodeCalls.push(cfg);
          return { supported: true, smooth: true, powerEfficient: true };
        },
      },
    });

    const metrics = await codecDetector.run();
    expect(encodeCalls).toHaveLength(ENCODE_CODECS.length);
    expect(encodeCalls[0].type).toBe('webrtc');
    expect(encodeCalls[0].video.contentType).toBe('video/H264');
    expect(value(metrics, 'codec.encode.h264.1080p30')).toBe('硬编 · 流畅');
  });

  it('浏览器拒绝 webrtc 档时降级到已废弃的 record 档', async () => {
    const types: string[] = [];
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }),
        encodingInfo: async (cfg: { type: string }) => {
          types.push(cfg.type);
          if (cfg.type === 'webrtc') throw new TypeError('not a valid enum value');
          return { supported: true, smooth: false, powerEfficient: false };
        },
      },
    });

    const metrics = await codecDetector.run();
    expect(types).toContain('webrtc');
    expect(types).toContain('record');
    expect(value(metrics, 'codec.encode.h264.1080p30')).toBe('软编 · 可能卡顿');
  });

  it('只有 decodingInfo 时编码项标不可用', async () => {
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }),
      },
    });

    const metrics = await codecDetector.run();
    expect(get(metrics, 'codec.encode.h264.1080p30').confidence).toBe('unavailable');
    expect(get(metrics, 'codec.h264.1080p30').confidence).toBe('exact');
  });

  it('单路查询 reject 时该路标不可用，其余仍有结果', async () => {
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: async (cfg: { video: { contentType: string } }) => {
          if (cfg.video.contentType.includes('hev1')) throw new Error('unsupported config');
          return { supported: true, smooth: true, powerEfficient: true };
        },
      },
    });

    const metrics = await codecDetector.run();
    expect(get(metrics, 'codec.hevc.1080p30').confidence).toBe('unavailable');
    expect(get(metrics, 'codec.h264.1080p30').confidence).toBe('exact');
  });
});

describe('codec 探测器 —— 接口缺失', () => {
  it('无 mediaCapabilities 时每路每档都标不可用', async () => {
    vi.stubGlobal('navigator', {});

    const metrics = await codecDetector.run();
    expect(metrics).toHaveLength(CODECS.length * PROFILES.length);
    for (const m of metrics) {
      expect(m.confidence).toBe('unavailable');
      expect(m.value).toBeNull();
    }
  });
});
