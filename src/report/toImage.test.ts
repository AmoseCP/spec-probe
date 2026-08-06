import { describe, expect, it } from 'vitest';
import { type Ctx, buildGroups, computeLayout, drawReport, layoutColumns } from './toImage';
import type { DetectorResult, Metric } from '../detect/types';

function metric(id: string, label: string, value: string | null): Metric {
  return value === null
    ? { id, group: 'cpu', label: { zh: label, en: label }, value: null, confidence: 'unavailable', source: 'test' }
    : { id, group: 'cpu', label: { zh: label, en: label }, value, confidence: 'exact', source: 'test' };
}

function result(id: string, title: string, metrics: Metric[]): DetectorResult {
  return {
    detector: { id, group: 'cpu', title: { zh: title, en: title }, subtitle: 'navigator.x', run: async () => [] },
    metrics,
    crashed: false,
    durationMs: 0,
  };
}

const results = [
  result('cpu', '处理器', [metric('cpu.threads', '逻辑核心数', '16 线程'), metric('cpu.name', '型号', null)]),
  result('gpu', '显卡', [metric('gpu.renderer', '显卡型号', 'NVIDIA GeForce RTX 3080 Ti')]),
  result('mem', '内存', [metric('mem.a', '系统内存', '≥ 8 GB')]),
];

/** 记录所有绘制调用的假 ctx，字宽按字符数估算 */
function fakeCtx() {
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const rects: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
  const circles: Array<{ x: number; y: number; r: number; fill: string }> = [];
  const ctx: Ctx = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, fill: ctx.fillStyle });
    },
    fillText(text, x, y) {
      texts.push({ text, x, y });
    },
    measureText: (text: string) => ({ width: text.length * 7 }),
    beginPath() {},
    arc(x, y, r) {
      circles.push({ x, y, r, fill: ctx.fillStyle });
    },
    fill() {},
    scale() {},
  };
  return { ctx, texts, rects, circles };
}

describe('layoutColumns', () => {
  it('把分组分到较矮的一列，两列高度不会失衡', () => {
    const groups = buildGroups(results, 'zh');
    const { columns, heights } = layoutColumns(groups);
    expect(columns).toHaveLength(2);
    expect(columns.flat()).toHaveLength(3);
    expect(Math.abs(heights[0] - heights[1])).toBeLessThan(Math.max(...heights));
  });
});

describe('computeLayout', () => {
  it('高度随行数增长，宽度固定', () => {
    const small = computeLayout([results[1]], 'zh');
    const big = computeLayout(results, 'zh');
    expect(small.width).toBe(big.width);
    expect(big.height).toBeGreaterThan(small.height);
  });

  it('没有数据时也给出合法尺寸，不会是 0 或 NaN', () => {
    const layout = computeLayout([], 'zh');
    expect(layout.height).toBeGreaterThan(0);
    expect(Number.isFinite(layout.height)).toBe(true);
  });
});

describe('drawReport', () => {
  it('画出识别行、分组标题与每一行的标签和值', () => {
    const { ctx, texts } = fakeCtx();
    drawReport(ctx, computeLayout(results, 'zh'), 'Windows 11 · 16 线程', 'zh');
    const all = texts.map((t) => t.text);

    expect(all).toContain('Windows 11 · 16 线程');
    expect(all).toContain('处理器');
    expect(all).toContain('逻辑核心数');
    expect(all).toContain('16 线程');
    expect(all).toContain('NVIDIA GeForce RTX 3080 Ti');
  });

  it('精度图例与每行色点都画出来了（精度不只靠文字）', () => {
    const { ctx, circles } = fakeCtx();
    drawReport(ctx, computeLayout(results, 'zh'), 'x', 'zh');

    // 3 个图例点 + 4 行各一个
    expect(circles).toHaveLength(3 + 4);
    expect(circles.some((c) => c.fill === '#4ade80')).toBe(true);
    expect(circles.some((c) => c.fill === '#8b96a7')).toBe(true);
  });

  it('不可用项画成"无此接口"而不是空白', () => {
    const { ctx, texts } = fakeCtx();
    drawReport(ctx, computeLayout(results, 'zh'), 'x', 'zh');
    expect(texts.map((t) => t.text)).toContain('无此接口');
  });

  it('精度说明与隐私声明跟着图片一起走', () => {
    const { ctx, texts } = fakeCtx();
    drawReport(ctx, computeLayout(results, 'zh'), 'x', 'zh');
    const joined = texts.map((t) => t.text).join(' ');
    expect(joined).toMatch(/精度说明/);
    expect(joined).toMatch(/数据未离开本机/);
  });

  it('过长的值被截断成省略号，不会画出画布', () => {
    const long = [result('x', 'g', [metric('x.a', '很长的项', 'A'.repeat(400))])];
    const { ctx, texts } = fakeCtx();
    drawReport(ctx, computeLayout(long, 'zh'), 'x', 'zh');
    const drawn = texts.find((t) => t.text.startsWith('AAAA'))!;
    expect(drawn.text.endsWith('…')).toBe(true);
    expect(drawn.text.length).toBeLessThan(400);
  });

  it('英文模式下画英文文案', () => {
    const { ctx, texts } = fakeCtx();
    drawReport(ctx, computeLayout(results, 'en'), 'x', 'en');
    const joined = texts.map((t) => t.text).join(' ');
    expect(joined).toMatch(/Confidence/);
    expect(joined).not.toMatch(/精度说明/);
  });
});
