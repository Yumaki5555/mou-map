// X（旧Twitter）向けの画像（横長16:9のPNG）を作ります。
// どの画像にも、タイトル・対象地域・対象期間・出典・確認日を必ず入れます。
// スマートフォンで見ても読めるよう、本文は32px以上を基本にしています。
import { drawMapCanvas, swatchStyle, PATTERNS } from './map.js';
import { drawHBarCanvas } from './charts.js';
import { downloadBlob, toast } from './util.js';

const W = 1600, H = 900;
const FONT = '"BIZ UDPGothic","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
const GREEN = '#1d7347', TEXT = '#1c2621', MUTED = '#56655c';
const FOOT_H = 152;

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  return { c, ctx };
}

// 日本語は単語の区切りがないので1文字ずつ折り返す
export function wrap(ctx, text, maxW, maxLines = 99) {
  const lines = [];
  let cur = '';
  for (const ch of String(text || '')) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = last + '…';
    return cut;
  }
  return lines;
}
function text(ctx, s, x, y, { size = 32, bold = false, color = TEXT, align = 'left', maxW = 9999, maxLines = 1, lh = 1.35 } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  const lines = wrap(ctx, s, maxW, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  return y + lines.length * size * lh;
}

function header(ctx, title, sub) {
  ctx.fillStyle = GREEN; ctx.fillRect(0, 0, W, 14);
  let y = text(ctx, title, 56, 38, { size: 54, bold: true, maxW: W - 112, maxLines: 2, lh: 1.25 });
  if (sub) y = text(ctx, sub, 56, y + 6, { size: 32, color: GREEN, bold: true, maxW: W - 112, maxLines: 1 });
  return y + 18;
}

function footer(ctx, meta) {
  const y0 = H - FOOT_H;
  ctx.fillStyle = '#f3f7f4'; ctx.fillRect(0, y0, W, FOOT_H);
  ctx.fillStyle = GREEN; ctx.fillRect(0, y0, W, 4);
  text(ctx, `対象地域：${meta.region}`, 56, y0 + 14, { size: 27, bold: true, maxW: W - 112 });
  text(ctx, `対象期間：${meta.period}　確認日：${meta.checked}`, 56, y0 + 50, { size: 25, bold: true, maxW: W - 112 });
  text(ctx, `出典：${meta.source}`, 56, y0 + 84, { size: 23, color: TEXT, maxW: W - 112, maxLines: 1 });
  text(ctx, '日本と世界のMOU・協定マップ　※公式資料で確認できた範囲の集計。不明・未調査を0件とはしていません', 56, y0 + 116, { size: 21, color: MUTED, maxW: W - 112, maxLines: 1 });
}

function save(c, filename) {
  c.toBlob(b => { downloadBlob(filename, b); toast('画像（PNG）を保存しました'); }, 'image/png');
}

function legendSwatch(ctx, x, y, fill, size = 34) {
  if (fill === PATTERNS.not_found || fill === PATTERNS.not_surveyed) {
    ctx.fillStyle = fill === PATTERNS.not_found ? '#f4f6f5' : '#fff'; ctx.fillRect(x, y, size, size * 0.72);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size * 0.72); ctx.clip();
    if (fill === PATTERNS.not_found) {
      ctx.strokeStyle = '#a3aea8'; ctx.lineWidth = 2.5;
      for (let i = -size; i < size * 2; i += 7) { ctx.beginPath(); ctx.moveTo(x + i, y + size); ctx.lineTo(x + i + size, y - 2); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#7d8a83';
      for (let i = 4; i < size; i += 7) for (let j = 4; j < size * 0.72; j += 7) { ctx.beginPath(); ctx.arc(x + i, y + j, 1.4, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  } else { ctx.fillStyle = fill; ctx.fillRect(x, y, size, size * 0.72); }
  ctx.strokeStyle = '#9aa8a0'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, size, size * 0.72);
}

// ① 都道府県別の地図（表示中の地図モードのまま）
// opts: { title, sub, fill(code), label(code), selected, legend:[{label, fill}], side:[文字列], meta }
export function exportMap(db, opts) {
  const { c, ctx } = newCanvas();
  const top = header(ctx, opts.title, opts.sub);
  const mh = H - FOOT_H - top - 16;
  const mw = mh * 600 / 640;
  const box = { x: 40, y: top, w: mw, h: mh };
  drawMapCanvas(ctx, db, box, opts.fill, { font: FONT, selected: opts.selected, label: opts.label });
  let x = box.x + mw + 40, y = top + 6;
  const maxW = W - x - 50;
  if (opts.legendTitle) y = text(ctx, opts.legendTitle, x, y, { size: 30, bold: true, maxW }) + 6;
  for (const l of opts.legend || []) {
    legendSwatch(ctx, x, y + 6, l.fill, 40);
    y = text(ctx, l.label, x + 54, y, { size: 30, maxW: maxW - 54 }) + 8;
  }
  y += 10;
  for (const s of opts.side || []) {
    if (y > H - FOOT_H - 50) break;
    y = text(ctx, s.text ?? s, x, y, { size: s.size || 32, bold: !!s.bold, color: s.color || TEXT, maxW, maxLines: 2 }) + 6;
  }
  footer(ctx, opts.meta);
  save(c, opts.filename || 'mou-map.png');
}

// ③ 分野別件数などの棒グラフ
export function exportBars(opts) {
  const { c, ctx } = newCanvas();
  const top = header(ctx, opts.title, opts.sub);
  const items = opts.items.slice(0, 10);
  drawHBarCanvas(ctx, { x: 56, y: top + 4, w: W - 112, h: H - FOOT_H - top - 24 }, items, { font: FONT, unit: opts.unit, maxRow: 66 });
  footer(ctx, opts.meta);
  save(c, opts.filename || 'mou-chart.png');
}

// ④ 個別MOUの要約
// opts: { title, who, facts:[[見出し, 内容]], purpose, points:[], meta }
export function exportMouSummary(opts) {
  const { c, ctx } = newCanvas();
  ctx.fillStyle = GREEN; ctx.fillRect(0, 0, W, 14);
  let y = text(ctx, opts.who, 56, 36, { size: 36, bold: true, color: GREEN, maxW: W - 112, maxLines: 1 });
  y = text(ctx, opts.title, 56, y + 8, { size: 46, bold: true, maxW: W - 112, maxLines: 2, lh: 1.25 }) + 22;
  const colW = 600;
  let ly = y;
  for (const [k, v] of opts.facts) {
    if (ly > H - FOOT_H - 60) break;
    text(ctx, k, 56, ly, { size: 27, color: MUTED, bold: true });
    ly = text(ctx, v, 56, ly + 34, { size: 32, bold: true, maxW: colW - 20, maxLines: 2 }) + 12;
  }
  const rx = 56 + colW + 30, rw = W - rx - 56;
  ctx.fillStyle = '#f3f7f4'; ctx.fillRect(rx - 24, y - 8, rw + 48, H - FOOT_H - y - 12);
  let ry = text(ctx, '目的', rx, y + 4, { size: 27, color: MUTED, bold: true });
  ry = text(ctx, opts.purpose || '（公式資料に記載なし）', rx, ry + 4, { size: 32, maxW: rw, maxLines: 3 }) + 14;
  if (opts.points?.length) {
    ry = text(ctx, '主な合意内容', rx, ry, { size: 27, color: MUTED, bold: true }) + 4;
    for (const p of opts.points) {
      if (ry > H - FOOT_H - 70) break;
      text(ctx, '・', rx, ry, { size: 32 });
      ry = text(ctx, p, rx + 32, ry, { size: 32, maxW: rw - 32, maxLines: 2 }) + 8;
    }
  }
  footer(ctx, opts.meta);
  save(c, opts.filename || 'mou-summary.png');
}

// ⑤ 地域への影響の整理図（6分野×3段階）
// opts: { title, sub, rows:[{label, cells:[{n, text}×3]}], stages:[3つの見出し], meta }
export function exportImpactGrid(opts) {
  const { c, ctx } = newCanvas();
  const top = header(ctx, opts.title, opts.sub);
  const x0 = 40, labelW = 300, colW = (W - 80 - labelW) / 3;
  const headH = 52;
  const rowH = (H - FOOT_H - top - headH - 16) / opts.rows.length;
  const stageColors = ['#eef2ff', '#e3f5ea', '#fff0db'];
  opts.stages.forEach((s, i) => {
    ctx.fillStyle = stageColors[i]; ctx.fillRect(x0 + labelW + i * colW, top, colW - 4, headH);
    text(ctx, s, x0 + labelW + i * colW + 14, top + 10, { size: 30, bold: true, maxW: colW - 28 });
  });
  opts.rows.forEach((r, ri) => {
    const y = top + headH + 6 + ri * rowH;
    ctx.fillStyle = ri % 2 ? '#ffffff' : '#f7faf8'; ctx.fillRect(x0, y, W - 80, rowH - 4);
    text(ctx, r.label, x0 + 12, y + 10, { size: 30, bold: true, maxW: labelW - 24, maxLines: 2, lh: 1.2 });
    r.cells.forEach((cell, ci) => {
      const cx = x0 + labelW + ci * colW + 14;
      if (!cell.n) { text(ctx, '記録なし', cx, y + 12, { size: 28, color: '#8a968f' }); return; }
      text(ctx, cell.text, cx, y + 8, { size: 28, maxW: colW - 30, maxLines: Math.max(1, Math.floor((rowH - 12) / 36)), lh: 1.25 });
    });
  });
  footer(ctx, opts.meta);
  save(c, opts.filename || 'mou-impact.png');
}

export { swatchStyle };
