import { afterEach, describe, expect, it, vi } from 'vitest';
import { UI, initialLang, t } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('t()', () => {
  it('纯字符串（型号名、API 名）原样返回，不翻译', () => {
    expect(t('NVIDIA GeForce RTX 3080 Ti', 'en')).toBe('NVIDIA GeForce RTX 3080 Ti');
    expect(t('NVIDIA GeForce RTX 3080 Ti', 'zh')).toBe('NVIDIA GeForce RTX 3080 Ti');
  });

  it('双语对象按语言取值', () => {
    expect(t({ zh: '精确', en: 'Exact' }, 'zh')).toBe('精确');
    expect(t({ zh: '精确', en: 'Exact' }, 'en')).toBe('Exact');
  });

  it('null / undefined 返回 null', () => {
    expect(t(null, 'zh')).toBeNull();
    expect(t(undefined, 'en')).toBeNull();
  });
});

describe('initialLang', () => {
  it('优先用上次的选择', () => {
    localStorage.setItem('spec-probe.lang', 'en');
    expect(initialLang()).toBe('en');
  });

  it('没有记录时按浏览器语言判断', () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP', 'en-US'] });
    expect(initialLang()).toBe('en');
    vi.stubGlobal('navigator', { languages: ['zh-CN'] });
    expect(initialLang()).toBe('zh');
  });

  it('localStorage 抛错时不崩', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('navigator', { languages: ['zh-CN'] });
    expect(initialLang()).toBe('zh');
  });
});

describe('UI 文案完整性', () => {
  it('每条文案中英都不为空', () => {
    const walk = (node: unknown, path: string) => {
      if (node && typeof node === 'object') {
        if ('zh' in node && 'en' in node) {
          const v = node as { zh: string; en: string };
          expect(v.zh.length, `${path}.zh 为空`).toBeGreaterThan(0);
          expect(v.en.length, `${path}.en 为空`).toBeGreaterThan(0);
          return;
        }
        for (const [k, child] of Object.entries(node)) walk(child, `${path}.${k}`);
      }
    };
    walk(UI, 'UI');
  });
});
