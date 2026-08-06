import { CONFIDENCE_LABEL, type Confidence, type DetectorResult, type Lang } from '../detect/types';
import { UI, t } from '../i18n';

/**
 * 把报告画成一张 PNG。自己用 Canvas 2D 画 —— 不引入 html2canvas：
 * 那类库要重新实现一遍 CSS 布局，体积大、结果还不稳定。
 *
 * 绘制逻辑写成对 Ctx 接口的调用，测试里可以传假 ctx 断言画了什么。
 */

/** 只用到的那部分 CanvasRenderingContext2D，方便测试传假实现 */
export interface Ctx {
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  scale(x: number, y: number): void;
}

const WIDTH = 1080;
const PAD = 44;
const COL_GAP = 28;
const COLS = 2;

const COLORS: Record<Confidence, string> = {
  exact: '#4ade80',
  approx: '#fbbf24',
  unavailable: '#8b96a7',
};

const BG = '#07090d';
const CARD_BG = '#0f131b';
const BORDER = '#232a36';
const TEXT = '#eef2f8';
const TEXT_DIM = '#a6b0c2';
const TEXT_FAINT = '#8b95a6';

const SANS = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface Row {
  label: string;
  value: string;
  confidence: Confidence;
}

interface Group {
  title: string;
  source: string;
  rows: Row[];
}

const ROW_H = 26;
const GROUP_HEAD_H = 52;
const GROUP_GAP = 18;
const CARD_PAD = 18;

function groupHeight(g: Group): number {
  return GROUP_HEAD_H + g.rows.length * ROW_H + CARD_PAD;
}

/** 两列贪心分栏：每次把下一组放进当前较矮的一列。 */
export function layoutColumns(groups: Group[], cols = COLS): { columns: Group[][]; heights: number[] } {
  const columns: Group[][] = Array.from({ length: cols }, () => []);
  const heights = new Array(cols).fill(0);

  for (const g of groups) {
    let target = 0;
    for (let i = 1; i < cols; i += 1) if (heights[i] < heights[target]) target = i;
    columns[target].push(g);
    heights[target] += groupHeight(g) + GROUP_GAP;
  }

  return { columns, heights };
}

export function buildGroups(results: DetectorResult[], lang: Lang): Group[] {
  return results.map((r) => ({
    title: t(r.detector.title, lang),
    source: r.detector.subtitle,
    rows: r.metrics.map((m) => ({
      label: t(m.label, lang),
      value: t(m.value, lang) ?? t(UI.noApi, lang),
      confidence: m.confidence,
    })),
  }));
}

/** 按可用宽度截断，超出部分用省略号。Canvas 没有自动省略。 */
function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

const HEADER_H = 150;
const FOOTER_H = 74;

export interface Layout {
  columns: Group[][];
  colWidth: number;
  width: number;
  height: number;
}

/** 纯计算，不碰 canvas —— 尺寸要在建画布之前就知道。 */
export function computeLayout(results: DetectorResult[], lang: Lang): Layout {
  const groups = buildGroups(results, lang);
  const { columns, heights } = layoutColumns(groups);
  return {
    columns,
    colWidth: (WIDTH - PAD * 2 - COL_GAP * (COLS - 1)) / COLS,
    width: WIDTH,
    height: HEADER_H + Math.max(...heights, 0) + FOOTER_H,
  };
}

export function drawReport(ctx: Ctx, layout: Layout, nameplate: string, lang: Lang): Layout {
  const { columns, colWidth, height } = layout;
  const headerH = HEADER_H;
  const footerH = FOOTER_H;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, height);

  // 标题与识别行
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT_FAINT;
  ctx.font = `13px ${SANS}`;
  ctx.fillText(t(UI.reportTitle, lang), PAD, 46);

  ctx.fillStyle = TEXT;
  ctx.font = `26px ${MONO}`;
  ctx.fillText(ellipsize(ctx, nameplate, WIDTH - PAD * 2), PAD, 84);

  // 图例：三个精度等级
  let legendX = PAD;
  ctx.font = `13px ${SANS}`;
  for (const key of ['exact', 'approx', 'unavailable'] as const) {
    ctx.fillStyle = COLORS[key];
    ctx.beginPath();
    ctx.arc(legendX + 4, 115, 4, 0, Math.PI * 2);
    ctx.fill();

    const label = t(CONFIDENCE_LABEL[key], lang);
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText(label, legendX + 16, 120);
    legendX += 16 + ctx.measureText(label).width + 22;
  }

  // 分组卡片
  columns.forEach((column, colIndex) => {
    const x = PAD + colIndex * (colWidth + COL_GAP);
    let y = headerH;

    for (const g of column) {
      const h = groupHeight(g);

      ctx.fillStyle = CARD_BG;
      ctx.fillRect(x, y, colWidth, h);
      ctx.fillStyle = BORDER;
      ctx.fillRect(x, y, colWidth, 1);

      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT;
      ctx.font = `15px ${SANS}`;
      ctx.fillText(g.title, x + CARD_PAD, y + 28);

      ctx.fillStyle = TEXT_FAINT;
      ctx.font = `11px ${MONO}`;
      ctx.fillText(ellipsize(ctx, g.source, colWidth - CARD_PAD * 2), x + CARD_PAD, y + 44);

      let rowY = y + GROUP_HEAD_H;
      for (const row of g.rows) {
        // 精度色点
        ctx.fillStyle = COLORS[row.confidence];
        ctx.beginPath();
        ctx.arc(x + CARD_PAD + 3, rowY + 4, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.fillStyle = TEXT_DIM;
        ctx.font = `13px ${SANS}`;
        const labelX = x + CARD_PAD + 14;
        const labelMax = (colWidth - CARD_PAD * 2 - 14) * 0.52;
        ctx.fillText(ellipsize(ctx, row.label, labelMax), labelX, rowY + 9);

        ctx.textAlign = 'right';
        ctx.fillStyle = row.confidence === 'unavailable' ? TEXT_FAINT : TEXT;
        ctx.font = `13px ${MONO}`;
        const valueMax = colWidth - CARD_PAD * 2 - labelMax - 20;
        ctx.fillText(ellipsize(ctx, row.value, valueMax), x + colWidth - CARD_PAD, rowY + 9);

        rowY += ROW_H;
      }

      y += h + GROUP_GAP;
    }
  });

  // 页脚：精度含义 + 隐私声明，跟着图片一起走
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT_FAINT;
  ctx.font = `12px ${SANS}`;
  ctx.fillText(
    ellipsize(ctx, t(UI.reportLegend, lang), WIDTH - PAD * 2),
    PAD,
    height - footerH + 28,
  );
  ctx.fillText(
    ellipsize(ctx, t(UI.reportFooter, lang), WIDTH - PAD * 2),
    PAD,
    height - footerH + 50,
  );

  return layout;
}

/** 真实渲染：按 devicePixelRatio 出图，避免在高分屏上糊。 */
export function renderReportCanvas(
  results: DetectorResult[],
  nameplate: string,
  lang: Lang,
): HTMLCanvasElement | null {
  const layout = computeLayout(results, lang);
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

  const canvas = document.createElement('canvas');
  // 设置 width/height 会重置上下文状态，所以必须先定尺寸再取上下文并 scale
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  drawReport(ctx as unknown as Ctx, layout, nameplate, lang);
  return canvas;
}

export function downloadPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve();
    }, 'image/png');
  });
}
