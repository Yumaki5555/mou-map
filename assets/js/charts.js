// 棒グラフ・折れ線グラフ。マウスを重ねる／タップすると数値が出ます。
/* global d3 */
import { esc } from './util.js';

const FONT = getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif';
const GREEN = '#1d7347';

function setupTip(el) {
  el.classList.add('chart');
  let tip = el.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; el.appendChild(tip); }
  const show = (ev, html) => {
    tip.innerHTML = html;
    tip.style.display = 'block';
    const b = el.getBoundingClientRect();
    let x = ev.clientX - b.left + 12, y = ev.clientY - b.top - 36;
    if (x + tip.offsetWidth > b.width) x = ev.clientX - b.left - tip.offsetWidth - 12;
    tip.style.left = `${Math.max(0, x)}px`; tip.style.top = `${Math.max(0, y)}px`;
  };
  const hide = () => { tip.style.display = 'none'; };
  return { show, hide };
}

function observe(el, draw) {
  draw();
  if (el._ro) el._ro.disconnect();
  let w = el.clientWidth;
  el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } });
  el._ro.observe(el);
}

// 横棒グラフ（都道府県・国の比較など項目が多いとき）
// items: [{label, value, tip?, onClick?}]
export function hbar(el, items, opts = {}) {
  const unit = opts.unit ?? '件';
  const fmt = opts.format || (v => `${v.toLocaleString('ja-JP')}${unit}`);
  observe(el, () => {
    el.querySelector('svg')?.remove();
    const { show, hide } = setupTip(el);
    const W = Math.max(280, el.clientWidth);
    const rowH = opts.rowHeight || 28;
    const labelW = Math.min(170, Math.max(56, d3.max(items, d => d.label.length) * 14 + 10));
    const valueW = opts.valueWidth || Math.max(64, d3.max(items, d => (d.valueLabel || '').length * 8 + 12) || 0);
    const H = items.length * rowH + 8;
    const x = d3.scaleLinear().domain([0, d3.max(items, d => d.value) || 1]).range([0, W - labelW - valueW]);
    const svg = d3.select(el).insert('svg', ':first-child').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
      .attr('role', 'img').attr('aria-label', opts.ariaLabel || 'グラフ');
    const row = svg.selectAll('g').data(items).join('g').attr('transform', (d, i) => `translate(0,${i * rowH + 4})`);
    row.append('text').attr('class', 'clabel').attr('x', labelW - 8).attr('y', rowH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(d => d.label);
    row.append('rect').attr('class', 'bar').attr('x', labelW).attr('y', 4).attr('height', rowH - 9).attr('rx', 3)
      .attr('width', d => Math.max(d.value > 0 ? 2 : 0, x(d.value)))
      .style('fill', d => d.color || null);
    row.append('text').attr('class', 'vlabel').attr('x', d => labelW + x(d.value) + 6).attr('y', rowH / 2).attr('dominant-baseline', 'middle').text(d => d.valueLabel || fmt(d.value));
    // 行全体を当たり判定にして、タップしやすくする
    row.append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', rowH).attr('fill', 'transparent')
      .style('cursor', d => d.onClick ? 'pointer' : 'default')
      .on('pointermove pointerdown', (ev, d) => show(ev, d.tip || `<b>${esc(d.label)}</b>：${esc(fmt(d.value))}`))
      .on('pointerleave', hide)
      .on('click', (ev, d) => d.onClick && d.onClick());
  });
}

// 縦棒グラフ（年ごとの推移など）。line: true で累計の折れ線を重ねる
export function vbar(el, items, opts = {}) {
  const unit = opts.unit ?? '件';
  observe(el, () => {
    el.querySelector('svg')?.remove();
    const { show, hide } = setupTip(el);
    const W = Math.max(280, el.clientWidth);
    const H = opts.height || 260;
    const m = { t: 18, r: opts.line ? 44 : 12, b: 34, l: 40 };
    const x = d3.scaleBand().domain(items.map(d => d.label)).range([m.l, W - m.r]).padding(0.25);
    let cum = 0;
    const cumData = items.map(d => ({ label: d.label, value: (cum += d.value) }));
    const y = d3.scaleLinear().domain([0, d3.max(items, d => d.value) || 1]).nice().range([H - m.b, m.t]);
    const y2 = d3.scaleLinear().domain([0, d3.max(cumData, d => d.value) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).insert('svg', ':first-child').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
      .attr('role', 'img').attr('aria-label', opts.ariaLabel || 'グラフ');
    const every = Math.ceil(items.length / Math.max(1, Math.floor((W - 60) / 42)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues(items.map(d => d.label).filter((d, i) => i % every === 0)).tickSizeOuter(0));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => Number.isInteger(d) ? d : ''));
    svg.append('g').selectAll('rect').data(items).join('rect').attr('class', 'bar')
      .attr('x', d => x(d.label)).attr('width', x.bandwidth())
      .attr('y', d => y(d.value)).attr('height', d => y(0) - y(d.value)).attr('rx', 2);
    if (opts.line) {
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${W - m.r},0)`)
        .call(d3.axisRight(y2).ticks(5).tickFormat(d => Number.isInteger(d) ? d : ''));
      svg.append('text').attr('class', 'vlabel').attr('x', W - 4).attr('y', 10).attr('text-anchor', 'end').style('fill', '#a35f00').text('累計');
      svg.append('text').attr('class', 'vlabel').attr('x', 4).attr('y', 10).text('件数');
      svg.append('path').datum(cumData).attr('fill', 'none').attr('stroke', '#d17a00').attr('stroke-width', 2.5)
        .attr('d', d3.line().x(d => x(d.label) + x.bandwidth() / 2).y(d => y2(d.value)));
      svg.append('g').selectAll('circle').data(cumData).join('circle').attr('r', 3.5).attr('fill', '#d17a00')
        .attr('cx', d => x(d.label) + x.bandwidth() / 2).attr('cy', d => y2(d.value));
    }
    svg.append('g').selectAll('rect').data(items).join('rect')
      .attr('x', d => x(d.label) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b)
      .attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, d) => {
        const i = items.indexOf(d);
        show(ev, d.tip || `<b>${esc(d.label)}</b>：${d.value.toLocaleString('ja-JP')}${unit}` + (opts.line ? `<br>累計：${cumData[i].value.toLocaleString('ja-JP')}${unit}` : ''));
      })
      .on('pointerleave', hide);
  });
}

// ---------- 画像出力用：Canvasに横棒グラフを描く ----------
export function drawHBarCanvas(ctx, box, items, opts = {}) {
  const font = opts.font || FONT;
  const n = items.length;
  const rowH = Math.min(opts.maxRow || 56, box.h / Math.max(1, n));
  const fs = Math.max(18, Math.min(30, rowH * 0.55));
  ctx.save();
  ctx.font = `bold ${fs}px ${font}`;
  const labelW = Math.min(box.w * 0.4, Math.max(...items.map(d => ctx.measureText(d.label).width)) + 20);
  const valueW = 130;
  const max = Math.max(1, ...items.map(d => d.value));
  items.forEach((d, i) => {
    const y = box.y + i * rowH;
    ctx.fillStyle = '#1c2621'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${fs}px ${font}`;
    ctx.fillText(d.label, box.x + labelW - 12, y + rowH / 2);
    const bw = (box.w - labelW - valueW) * d.value / max;
    ctx.fillStyle = d.color || GREEN;
    ctx.fillRect(box.x + labelW, y + rowH * 0.18, Math.max(d.value > 0 ? 3 : 0, bw), rowH * 0.64);
    ctx.fillStyle = '#1c2621'; ctx.textAlign = 'left';
    ctx.fillText(opts.format ? opts.format(d.value) : `${d.value}${opts.unit ?? '件'}`, box.x + labelW + bw + 10, y + rowH / 2);
  });
  ctx.restore();
}
