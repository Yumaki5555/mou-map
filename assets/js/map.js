// 日本地図（47都道府県）。画面表示（SVG）と画像出力（Canvas）の両方で使います。
// 沖縄県は左上に枠で囲んで縮小表示します（縮尺は本土と異なります）。
/* global d3, topojson */

export const MAP_W = 600;
export const MAP_H = 640;

// 本土側の表示範囲（経度128〜149度、北緯26.9〜45.6度）。範囲外の一部離島は表示されません
const MAIN_EXTENT = { type: 'MultiPoint', coordinates: [[128.0, 26.9], [148.9, 45.6]] };
const OKINAWA_EXTENT = { type: 'MultiPoint', coordinates: [[122.9, 24.0], [128.35, 26.95]] };

let _features = null;
export function getFeatures(topo) {
  if (!_features) _features = topojson.feature(topo, topo.objects.prefectures).features;
  return _features;
}

// 指定した四角形の中に地図を配置する投影法を作る
export function makeProjections(features, x, y, w, h) {
  const pad = Math.min(w, h) * 0.02;
  const main = d3.geoMercator().fitExtent([[x + pad, y + pad], [x + w - pad, y + h - pad]], MAIN_EXTENT);
  // 沖縄本島〜先島諸島が見やすいよう、大東諸島は枠の外（表示しない）
  const ib = { x: x + w * 0.03, y: y + h * 0.03, w: w * 0.36, h: h * 0.2 };
  const inset = d3.geoMercator().fitExtent([[ib.x + 6, ib.y + 18], [ib.x + ib.w - 6, ib.y + ib.h - 6]], OKINAWA_EXTENT);
  return { main, inset, insetBox: ib };
}

// 飛び地の多い県でもラベルが本体に付くよう、一番大きい島の中心を使う
function labelPoint(feature, path) {
  const g = feature.geometry;
  if (g.type !== 'MultiPolygon') return path.centroid(feature);
  let best = null, bestA = -1;
  for (const poly of g.coordinates) {
    const f = { type: 'Feature', geometry: { type: 'Polygon', coordinates: poly } };
    const a = path.area(f);
    if (a > bestA) { bestA = a; best = f; }
  }
  return path.centroid(best);
}
// 混み合う県のラベル位置の微調整（画面座標でのずれ）
const LABEL_NUDGE = { '13': [2, 3], '14': [0, 4], '11': [0, -2], '12': [6, 4], '27': [-3, 2], '26': [-2, -6], '28': [-6, -2], '29': [2, 6], '25': [2, 0], '23': [0, 4], '34': [0, 2], '40': [0, -2] };

export class JapanMap {
  constructor(container, db, opts = {}) {
    this.el = container;
    this.db = db;
    this.opts = opts;
    this.features = getFeatures(db.topo);
    this.state = { fill: () => '#eee', label: () => null, tip: () => '', selected: null };
    this.build();
  }

  build() {
    const { features } = this;
    this.el.innerHTML = '';
    this.el.classList.add('map-box');
    const svg = d3.select(this.el).append('svg')
      .attr('viewBox', `0 0 ${MAP_W} ${MAP_H}`)
      .attr('role', 'img')
      .attr('aria-label', this.opts.ariaLabel || '日本地図');
    this.svg = svg;
    addPatterns(svg.append('defs'));
    const zoomLayer = svg.append('g');
    this.zoomLayer = zoomLayer;
    const P = makeProjections(features, 0, 0, MAP_W, MAP_H);
    this.P = P;
    const pathMain = d3.geoPath(P.main);
    const pathInset = d3.geoPath(P.inset);
    this.pathFor = f => f.properties.code === '47' ? pathInset : pathMain;

    const ib = P.insetBox;
    zoomLayer.append('rect').attr('class', 'inset-frame').attr('x', ib.x).attr('y', ib.y).attr('width', ib.w).attr('height', ib.h).attr('rx', 6);
    zoomLayer.append('text').attr('class', 'inset-label').attr('x', ib.x + 8).attr('y', ib.y + 14).text('沖縄県（縮尺は異なります）');

    svg.select('defs').append('clipPath').attr('id', 'inset-clip')
      .append('rect').attr('x', ib.x).attr('y', ib.y).attr('width', ib.w).attr('height', ib.h);
    const self = this;
    this.paths = zoomLayer.append('g').selectAll('path').data(features).join('path')
      .attr('class', 'pref')
      .attr('d', f => this.pathFor(f)(f))
      .attr('clip-path', f => f.properties.code === '47' ? 'url(#inset-clip)' : null)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', f => f.properties.name)
      .on('pointermove', function (ev, f) { self.showTip(ev, f); d3.select(this).raise(); })
      .on('pointerleave', () => this.hideTip())
      .on('click', (ev, f) => { this.opts.onClick && this.opts.onClick(f.properties.code); })
      .on('keydown', (ev, f) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.opts.onClick && this.opts.onClick(f.properties.code); }
      })
      .on('focus', function (ev, f) { const b = this.getBoundingClientRect(); self.showTipAt(b.left + b.width / 2, b.top + b.height / 2, f); })
      .on('blur', () => this.hideTip());

    this.labelPos = new Map(features.map(f => {
      const p = labelPoint(f, this.pathFor(f));
      const n = LABEL_NUDGE[f.properties.code] || [0, 0];
      return [f.properties.code, [p[0] + n[0], p[1] + n[1]]];
    }));
    this.labels = zoomLayer.append('g');

    this.tip = d3.select(this.el).append('div').attr('class', 'map-tip').attr('role', 'tooltip');

    // 拡大・縮小（ボタン操作。拡大中だけドラッグで移動できます）
    this.k = 1;
    this.zoom = d3.zoom().scaleExtent([1, 6])
      .translateExtent([[0, 0], [MAP_W, MAP_H]])
      .filter(ev => ev.type !== 'wheel' && ev.type !== 'dblclick' && (this.k > 1 || ev.type === 'zoomprogrammatic'))
      .on('zoom', ev => {
        this.k = ev.transform.k;
        zoomLayer.attr('transform', ev.transform);
        this.el.classList.toggle('zoomed', this.k > 1.01);
        this.drawLabels();
      });
    svg.call(this.zoom).on('dblclick.zoom', null);
    const zc = d3.select(this.el).append('div').attr('class', 'map-zoom');
    zc.append('button').attr('type', 'button').attr('aria-label', '拡大').text('＋').on('click', () => svg.transition().duration(250).call(this.zoom.scaleBy, 1.6));
    zc.append('button').attr('type', 'button').attr('aria-label', '縮小').text('−').on('click', () => svg.transition().duration(250).call(this.zoom.scaleBy, 1 / 1.6));
    zc.append('button').attr('type', 'button').attr('class', 'reset').attr('aria-label', '元の大きさに戻す').text('元に').on('click', () => svg.transition().duration(250).call(this.zoom.transform, d3.zoomIdentity));
  }

  // fill(code) → 色、または 'url(#pattern)'。label(code) → 文字 or null。tip(code) → HTML
  update(state) {
    Object.assign(this.state, state);
    const { fill, selected } = this.state;
    this.paths
      .attr('fill', f => fill(f.properties.code))
      .classed('selected', f => f.properties.code === selected)
      .attr('aria-pressed', f => f.properties.code === selected ? 'true' : 'false')
      .attr('aria-label', f => {
        // 説明文が県名で始まるときは、県名を重ねない
        const t = stripTags(this.state.tip(f.properties.code));
        return t.startsWith(f.properties.name) ? t.replace(f.properties.name, `${f.properties.name}：`).replace('： ', '：') : `${f.properties.name}：${t}`;
      });
    this.paths.filter(f => f.properties.code === selected).raise();
    this.drawLabels();
  }

  drawLabels() {
    const { label, fill } = this.state;
    const data = this.features.map(f => ({ code: f.properties.code, text: label(f.properties.code) })).filter(d => d.text);
    const k = this.k || 1;
    this.labels.selectAll('text').data(data, d => d.code).join('text')
      .attr('class', d => 'map-label' + (isDark(fill(d.code)) ? ' on-dark' : ''))
      .attr('x', d => this.labelPos.get(d.code)[0])
      .attr('y', d => this.labelPos.get(d.code)[1])
      .style('font-size', `${Math.max(7, 12 / Math.sqrt(k))}px`)
      .text(d => d.text);
  }

  showTip(ev, f) {
    const html = this.state.tip(f.properties.code);
    const box = this.el.getBoundingClientRect();
    this.tip.html(html).style('display', 'block');
    const tw = this.tip.node().offsetWidth, th = this.tip.node().offsetHeight;
    let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
    if (x + tw > box.width - 4) x = ev.clientX - box.left - tw - 14;
    if (y + th > box.height - 4) y = ev.clientY - box.top - th - 14;
    this.tip.style('left', `${Math.max(4, x)}px`).style('top', `${Math.max(4, y)}px`);
  }
  showTipAt(cx, cy, f) { this.showTip({ clientX: cx, clientY: cy }, f); }
  hideTip() { this.tip.style('display', 'none'); }
}

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

export function isDark(color) {
  if (!color || color[0] !== '#' || color.length < 7) return false;
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

// 「調査したが確認できず」「未調査」を色だけでなく模様でも区別する
export const PATTERNS = {
  none: '#d9dfdb',
  scope_zero: '#f3ead2',
  not_found: 'url(#pat-notfound)',
  partial: 'url(#pat-partial)',
  not_surveyed: 'url(#pat-unsurveyed)',
};
function addPatterns(defs) {
  const p1 = defs.append('pattern').attr('id', 'pat-notfound').attr('patternUnits', 'userSpaceOnUse').attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  p1.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#f4f6f5');
  p1.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', '#a3aea8').attr('stroke-width', 2);
  const p2 = defs.append('pattern').attr('id', 'pat-unsurveyed').attr('patternUnits', 'userSpaceOnUse').attr('width', 6).attr('height', 6);
  p2.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#ffffff');
  p2.append('circle').attr('cx', 3).attr('cy', 3).attr('r', 1.1).attr('fill', '#7d8a83');
  // 調査が一部のみ：うすい黄色に横線
  const p3 = defs.append('pattern').attr('id', 'pat-partial').attr('patternUnits', 'userSpaceOnUse').attr('width', 6).attr('height', 6);
  p3.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#fbf4e2');
  p3.append('line').attr('x1', 0).attr('y1', 3).attr('x2', 6).attr('y2', 3).attr('stroke', '#d6b46a').attr('stroke-width', 1.4);
}

// 凡例で使う見本（CSS用）
export function swatchStyle(fill) {
  if (fill === PATTERNS.not_found) return 'background: repeating-linear-gradient(135deg,#f4f6f5 0 3px,#a3aea8 3px 5px)';
  if (fill === PATTERNS.not_surveyed) return 'background: radial-gradient(#7d8a83 1.1px, #fff 1.3px) 0 0/6px 6px';
  if (fill === PATTERNS.partial) return 'background: repeating-linear-gradient(0deg,#fbf4e2 0 3px,#d6b46a 3px 4.5px)';
  return `background:${fill}`;
}

// ---------- 画像出力用：Canvasに地図を描く ----------
export function canvasPattern(ctx, kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = kind === 'not_found' ? '#f4f6f5' : kind === 'partial' ? '#fbf4e2' : '#fff'; x.fillRect(0, 0, 8, 8);
  if (kind === 'partial') {
    x.strokeStyle = '#d6b46a'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(0, 4); x.lineTo(8, 4); x.stroke();
  } else if (kind === 'not_found') {
    x.strokeStyle = '#a3aea8'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
  } else {
    x.fillStyle = '#7d8a83'; x.beginPath(); x.arc(4, 4, 1.4, 0, Math.PI * 2); x.fill();
  }
  return ctx.createPattern(c, 'repeat');
}

export function drawMapCanvas(ctx, db, box, fillFn, opts = {}) {
  const features = getFeatures(db.topo);
  const P = makeProjections(features, box.x, box.y, box.w, box.h);
  const pats = { not_found: canvasPattern(ctx, 'not_found'), not_surveyed: canvasPattern(ctx, 'not_surveyed'), partial: canvasPattern(ctx, 'partial') };
  const resolve = f => f === PATTERNS.not_found ? pats.not_found : f === PATTERNS.not_surveyed ? pats.not_surveyed : f === PATTERNS.partial ? pats.partial : f;
  const ib = P.insetBox;
  ctx.save();
  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#9aa8a0'; ctx.lineWidth = 1.5;
  ctx.strokeRect(ib.x, ib.y, ib.w, ib.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#56655c'; ctx.font = `${Math.round(box.w * 0.022)}px ${opts.font}`;
  ctx.textBaseline = 'top';
  ctx.fillText('沖縄県（縮尺は異なります）', ib.x + 8, ib.y + 6);
  for (const f of features) {
    const oki = f.properties.code === '47';
    const path = d3.geoPath(oki ? P.inset : P.main, ctx);
    if (oki) { ctx.save(); ctx.beginPath(); ctx.rect(ib.x, ib.y, ib.w, ib.h); ctx.clip(); }
    ctx.beginPath(); path(f);
    ctx.fillStyle = resolve(fillFn(f.properties.code));
    ctx.fill();
    ctx.strokeStyle = '#7f8c85'; ctx.lineWidth = 0.8; ctx.stroke();
    if (oki) ctx.restore();
  }
  if (opts.selected) {
    const f = features.find(x => x.properties.code === opts.selected);
    if (f) {
      const path = d3.geoPath(f.properties.code === '47' ? P.inset : P.main, ctx);
      ctx.beginPath(); path(f); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  if (opts.label) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(box.w * 0.024)}px ${opts.font}`;
    for (const f of features) {
      const t = opts.label(f.properties.code);
      if (!t) continue;
      const path = d3.geoPath(f.properties.code === '47' ? P.inset : P.main);
      const p = labelPoint(f, path);
      const n = LABEL_NUDGE[f.properties.code] || [0, 0];
      const s = box.w / MAP_W;
      const x = p[0] + n[0] * s, y = p[1] + n[1] * s;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineJoin = 'round';
      ctx.strokeText(t, x, y);
      ctx.fillStyle = '#1c2621'; ctx.fillText(t, x, y);
    }
  }
  ctx.restore();
}
