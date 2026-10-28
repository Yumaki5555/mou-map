// 日本地図（47都道府県）。画面表示（SVG）と画像出力（Canvas）の両方で使います。
// 地図の形は tools/build_data.mjs が画面の座標に変換した data/build/geo.json（db.geo）を使い、地図用の部品（d3）は読み込みません。
// 沖縄県は左上に枠で囲んで縮小表示します（縮尺は本土と異なります）。
export const MAP_W = 600;
export const MAP_H = 640;
const NS = 'http://www.w3.org/2000/svg';
const ZOOM_MAX = 6;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export class JapanMap {
  // container：地図を入れる要素／db：db.geo（地図の形）を持つデータ／opts.onClick(code)：県を押したとき
  constructor(container, db, opts = {}) {
    this.el = container;
    this.geo = db.geo;
    this.opts = opts;
    this.state = { fill: () => '#eee', label: () => null, tip: () => '', selected: null };
    this.k = 1; this.tx = 0; this.ty = 0;
    this.build();
  }

  build() {
    const { geo } = this;
    this.el.innerHTML = '';
    this.el.classList.add('map-box');
    const svg = el('svg', { viewBox: `0 0 ${MAP_W} ${MAP_H}`, role: 'group', 'aria-label': this.opts.ariaLabel || '日本地図' }, this.el);
    this.svg = svg;
    addPatterns(el('defs', {}, svg));
    const ib = geo.inset;
    const clip = el('clipPath', { id: 'inset-clip' }, svg.querySelector('defs'));
    el('rect', { x: ib.x, y: ib.y, width: ib.w, height: ib.h }, clip);
    this.layer = el('g', {}, svg);
    el('rect', { class: 'inset-frame', x: ib.x, y: ib.y, width: ib.w, height: ib.h, rx: 6 }, this.layer);
    el('text', { class: 'inset-label', x: ib.x + 8, y: ib.y + 14 }, this.layer).textContent = '沖縄県（縮尺は異なります）';
    const pg = el('g', {}, this.layer);
    this.paths = new Map();
    for (const [code, p] of Object.entries(geo.prefs)) {
      const path = el('path', { class: 'pref', d: p.d, 'fill-rule': 'evenodd', tabindex: 0, role: 'button', 'aria-label': p.name, 'data-code': code }, pg);
      if (code === '47') path.setAttribute('clip-path', 'url(#inset-clip)');
      this.paths.set(code, path);
    }
    this.pg = pg;
    this.labels = el('g', { class: 'map-labels', 'aria-hidden': 'true' }, this.layer);
    this.tip = document.createElement('div');
    this.tip.className = 'map-tip';
    this.tip.setAttribute('role', 'tooltip');
    this.el.appendChild(this.tip);

    // 操作はまとめて1か所で受け取る（県ごとに受け取る仕組みを作らない）
    const codeOf = e => e.target.closest?.('path.pref')?.dataset.code;
    let down = null;
    svg.addEventListener('pointermove', e => {
      if (down && e.buttons === 0) down = null; // 地図の外でボタンを離したとき
      if (down && this.k > 1) return this.drag(e, down);
      const c = codeOf(e);
      if (c && e.pointerType !== 'touch') { this.showTip(e, c); this.raise(c); } else this.hideTip();
    });
    svg.addEventListener('pointerleave', () => this.hideTip());
    svg.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false }; });
    const up = () => { setTimeout(() => { down = null; }, 0); };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('click', e => {
      if (down?.moved) return; // 拡大中に地図を動かしたときは、県を選ばない
      const c = codeOf(e);
      if (c && this.opts.onClick) this.opts.onClick(c);
    });
    svg.addEventListener('keydown', e => {
      const c = codeOf(e);
      if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.opts.onClick && this.opts.onClick(c); }
    });
    svg.addEventListener('focusin', e => { const c = codeOf(e); if (c) { const b = e.target.getBoundingClientRect(); this.showTip({ clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }, c); } });
    svg.addEventListener('focusout', () => this.hideTip());

    // 拡大・縮小（ボタン操作。拡大中だけドラッグで移動できます）。条件を変えても拡大の状態はそのまま
    const zc = document.createElement('div');
    zc.className = 'map-zoom';
    zc.innerHTML = '<button type="button" data-z="in" aria-label="拡大">＋</button><button type="button" data-z="out" aria-label="縮小">−</button><button type="button" class="reset" data-z="reset" aria-label="元の大きさに戻す">元に</button>';
    zc.addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'in') this.zoomBy(1.6);
      else if (b.dataset.z === 'out') this.zoomBy(1 / 1.6);
      else this.setView(1, 0, 0);
    });
    this.el.appendChild(zc);
  }

  zoomBy(f) {
    const k = Math.min(ZOOM_MAX, Math.max(1, this.k * f));
    // 画面の中央を中心に拡大する
    const cx = MAP_W / 2, cy = MAP_H / 2;
    const tx = cx - (cx - this.tx) * (k / this.k), ty = cy - (cy - this.ty) * (k / this.k);
    this.setView(k, tx, ty);
  }
  setView(k, tx, ty) {
    // 地図が枠の外へ出ていかないようにする
    this.k = k;
    this.tx = Math.min(0, Math.max(MAP_W - MAP_W * k, tx));
    this.ty = Math.min(0, Math.max(MAP_H - MAP_H * k, ty));
    this.layer.setAttribute('transform', k === 1 ? '' : `translate(${this.tx.toFixed(1)} ${this.ty.toFixed(1)}) scale(${k.toFixed(3)})`);
    this.el.classList.toggle('zoomed', k > 1.01);
    this.drawLabels();
  }
  drag(e, down) {
    const r = this.svg.getBoundingClientRect();
    const s = MAP_W / r.width;
    const dx = (e.clientX - down.x) * s, dy = (e.clientY - down.y) * s;
    if (Math.abs(dx) + Math.abs(dy) > 3) down.moved = true;
    this.setView(this.k, down.tx + dx, down.ty + dy);
  }
  raise(code) {
    const p = this.paths.get(code);
    if (p && p !== this.pg.lastChild) this.pg.appendChild(p);
    // 選択中の県の枠は、いつもいちばん上に描く
    const s = this.paths.get(this.state.selected);
    if (s && s !== p) this.pg.appendChild(s);
  }

  // fill(code) → 色、または 'url(#pattern)'。label(code) → 文字 or null。tip(code) → HTML。selected：選択中の県（コードまたはコードの配列）
  update(state) {
    Object.assign(this.state, state);
    const { fill, selected, tip } = this.state;
    const sel = new Set([].concat(selected || []));
    for (const [code, p] of this.paths) {
      const f = fill(code);
      if (p.getAttribute('fill') !== f) p.setAttribute('fill', f);
      const on = sel.has(code);
      p.classList.toggle('selected', on);
      p.setAttribute('aria-pressed', on ? 'true' : 'false');
      // 読み上げ用の説明（説明文が県名で始まるときは、県名を重ねない）
      const name = this.geo.prefs[code].name;
      const t = stripTags(tip(code));
      p.setAttribute('aria-label', t.startsWith(name) ? t.replace(name, `${name}：`).replace('： ', '：') : `${name}：${t}`);
    }
    for (const code of sel) { const p = this.paths.get(code); if (p) this.pg.appendChild(p); }
    this.drawLabels();
  }

  drawLabels() {
    const { label, fill } = this.state;
    const fs = Math.max(7, 12 / Math.sqrt(this.k || 1));
    const frag = document.createDocumentFragment();
    for (const [code, p] of Object.entries(this.geo.prefs)) {
      const t = label(code);
      if (!t) continue;
      const e = el('text', { class: 'map-label' + (isDark(fill(code)) ? ' on-dark' : ''), x: p.lx, y: p.ly, style: `font-size:${fs}px` });
      e.textContent = t;
      frag.appendChild(e);
    }
    this.labels.replaceChildren(frag);
  }

  showTip(ev, code) {
    const html = this.state.tip(code);
    const box = this.el.getBoundingClientRect();
    this.tip.innerHTML = html;
    this.tip.style.display = 'block';
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
    if (x + tw > box.width - 4) x = ev.clientX - box.left - tw - 14;
    if (y + th > box.height - 4) y = ev.clientY - box.top - th - 14;
    this.tip.style.left = `${Math.max(4, x)}px`;
    this.tip.style.top = `${Math.max(4, y)}px`;
  }
  hideTip() { this.tip.style.display = 'none'; }
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
  defs.insertAdjacentHTML('beforeend', `
    <pattern id="pat-notfound" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f4f6f5"/><line x1="0" y1="0" x2="0" y2="6" stroke="#a3aea8" stroke-width="2"/></pattern>
    <pattern id="pat-unsurveyed" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#ffffff"/><circle cx="3" cy="3" r="1.1" fill="#7d8a83"/></pattern>
    <pattern id="pat-partial" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#fbf4e2"/><line x1="0" y1="3" x2="6" y2="3" stroke="#d6b46a" stroke-width="1.4"/></pattern>`);
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

// box：描く場所（x, y, w, h）。地図の座標（幅600×高さ640）を box に合わせて拡大・縮小して描く
export function drawMapCanvas(ctx, db, box, fillFn, opts = {}) {
  const geo = db.geo;
  const s = Math.min(box.w / MAP_W, box.h / MAP_H);
  const pats = { not_found: canvasPattern(ctx, 'not_found'), not_surveyed: canvasPattern(ctx, 'not_surveyed'), partial: canvasPattern(ctx, 'partial') };
  const resolve = f => f === PATTERNS.not_found ? pats.not_found : f === PATTERNS.not_surveyed ? pats.not_surveyed : f === PATTERNS.partial ? pats.partial : f;
  const ib = geo.inset;
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.scale(s, s);
  ctx.setLineDash([6 / s, 4 / s]); ctx.strokeStyle = '#9aa8a0'; ctx.lineWidth = 1.5 / s;
  ctx.strokeRect(ib.x, ib.y, ib.w, ib.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#56655c'; ctx.font = `${Math.round(MAP_W * 0.022)}px ${opts.font}`;
  ctx.textBaseline = 'top';
  ctx.fillText('沖縄県（縮尺は異なります）', ib.x + 8, ib.y + 6);
  const paths = Object.fromEntries(Object.entries(geo.prefs).map(([c, p]) => [c, new Path2D(p.d)]));
  for (const [code, path] of Object.entries(paths)) {
    const oki = code === '47';
    if (oki) { ctx.save(); ctx.beginPath(); ctx.rect(ib.x, ib.y, ib.w, ib.h); ctx.clip(); }
    ctx.fillStyle = resolve(fillFn(code));
    ctx.fill(path, 'evenodd');
    ctx.strokeStyle = '#7f8c85'; ctx.lineWidth = 0.8 / s; ctx.stroke(path);
    if (oki) ctx.restore();
  }
  for (const code of [].concat(opts.selected || [])) {
    if (paths[code]) { ctx.strokeStyle = '#000'; ctx.lineWidth = 3 / s; ctx.stroke(paths[code]); }
  }
  if (opts.label) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(MAP_W * 0.024)}px ${opts.font}`;
    for (const [code, p] of Object.entries(geo.prefs)) {
      const t = opts.label(code);
      if (!t) continue;
      ctx.lineWidth = 4 / s; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineJoin = 'round';
      ctx.strokeText(t, p.lx, p.ly);
      ctx.fillStyle = '#1c2621'; ctx.fillText(t, p.lx, p.ly);
    }
  }
  ctx.restore();
}
