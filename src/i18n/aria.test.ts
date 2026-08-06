import { describe, expect, it } from 'vitest';
import { UI } from './index';

/**
 * WCAG 2.5.3 Label in Name：可听见的名字必须包含看得见的文字，
 * 否则语音控制用户念出屏幕上的按钮文字点不动它。
 */
const PAIRS: Array<[keyof typeof UI, keyof typeof UI]> = [
  ['copy', 'copyAria'],
  ['exportJson', 'exportJsonAria'],
  ['exportPng', 'exportPngAria'],
  ['rerun', 'rerunAria'],
  ['grantDeviceNames', 'grantDeviceNamesAria'],
  ['grantScreens', 'grantScreensAria'],
];

describe('按钮的 aria-label', () => {
  it.each(PAIRS)('%s 的 aria-label 中英都非空', (_visibleKey, ariaKey) => {
    const aria = UI[ariaKey] as { zh: string; en: string };
    expect(aria.zh.length).toBeGreaterThan(0);
    expect(aria.en.length).toBeGreaterThan(0);
  });

  it.each(PAIRS)('%s 的 aria-label 必须包含按钮的可见文字', (visibleKey, ariaKey) => {
    const visible = UI[visibleKey] as { zh: string; en: string };
    const aria = UI[ariaKey] as { zh: string; en: string };
    // 语音控制用户会念屏幕上的字，可听见的名字不含这串字就点不动
    expect(aria.zh.includes(visible.zh), `${ariaKey}.zh 未包含「${visible.zh}」`).toBe(true);
    expect(aria.en.includes(visible.en), `${ariaKey}.en 未包含「${visible.en}」`).toBe(true);
  });

  it('语言切换按钮：可见文字就是目标语言，aria 也含这串字', () => {
    expect(UI.langToggleAria.zh.includes(UI.langToggle.zh)).toBe(true);
    expect(UI.langToggleAria.en.includes(UI.langToggle.en)).toBe(true);
  });

  it('授权类按钮额外说明会弹出权限框', () => {
    for (const [, ariaKey] of PAIRS.slice(4)) {
      const aria = UI[ariaKey] as { zh: string; en: string };
      expect(aria.zh).toMatch(/权限/);
      expect(aria.en).toMatch(/prompt/);
    }
  });
});
