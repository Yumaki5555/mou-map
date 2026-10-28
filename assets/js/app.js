// 画面の切り替え（URLの # 以降で表示するページを決めます。GitHub Pages でもそのまま動きます）
// ページごとのプログラムとデータは、そのページを開いたときに読み込みます（最初の画面を早く出すため）。
//   ・トップ・協定を探す（地図と一覧）・協定の詳細・3分でわかる：索引（data/build/core.json）だけで表示
//   ・分析・比較・資料などのページ：全データを読み込んでから表示
import { loadCore, loadFull, loadGeo, loadParts, hasFull, cityCheckDigit } from './data.js';
import { esc, fmtDate, toast } from './util.js';
import { setScope } from './shared.js';

const app = document.getElementById('app');
let lastPath = null;
let keepScroll = false;
let seq = 0;
let geo = null;

const MODS = {
  home: () => import('./home.js'),
  explore: () => import('./explore.js'),
  detail: () => import('./detail.js'),
  guide: () => import('./guide.js'),
  pages: () => import('./pages.js'),
};
// 協定の詳細を開く前に、その協定が入っている元のデータのファイルだけを読む（全データは読まない）
const detailPrep = async (ctx, m) => {
  const id = decodeURIComponent(m[1]);
  const lite = ctx.db.mouById.get(id);
  if (lite) ctx.db = await loadParts([lite._file], { stats: lite.japan_level === 'prefecture' });
};
// 3分でわかる：件数は索引で数え、例の協定（宮城県）の事業・予算と参考統計だけを元のデータから読む
const guidePrep = async ctx => { ctx.parts = await loadParts(['pref-04.json'], { stats: true }); };

// full：全データが必要なページ／geo：地図を使うページ／d3：グラフを使うページ／nav：上のメニューで強調する項目
const ROUTES = [
  { re: /^\/$/, mod: 'home', fn: 'homePage', nav: 'home' },
  { re: /^\/map$/, mod: 'explore', fn: 'explorePage', nav: 'map', geo: true, title: '協定を探す' },
  { re: /^\/search$/, mod: 'explore', fn: 'explorePage', nav: 'map', geo: true, title: '協定を探す' },
  { re: /^\/mou\/(.+)$/, mod: 'detail', fn: 'detailPage', arg: m => decodeURIComponent(m[1]), prep: detailPrep },
  { re: /^\/guide$/, mod: 'guide', fn: 'guidePage', nav: 'guide', title: '3分でわかるMOU', prep: guidePrep },
  { re: /^\/issues$/, mod: 'guide', fn: 'issuesPage', nav: 'issues', full: true, title: '制度の課題を考える' },
  { re: /^\/country$/, mod: 'pages', fn: 'countryIndexPage', nav: 'country', full: true, title: '相手国から探す' },
  { re: /^\/country\/([A-Z]{2})$/, mod: 'pages', fn: 'countryPage', arg: m => m[1], nav: 'country', full: true, geo: true, d3: true },
  { re: /^\/types$/, mod: 'pages', fn: 'typesPage', nav: 'types', full: true, title: '協定・取決めの種類から探す' },
  { re: /^\/field$/, mod: 'pages', fn: 'fieldIndexPage', nav: 'field', full: true, d3: true, title: '分野・省庁から探す' },
  { re: /^\/actors$/, mod: 'pages', fn: 'actorsPage', nav: 'actors', full: true, title: '締結主体から探す' },
  { re: /^\/list$/, mod: 'pages', fn: 'listPage', nav: 'list', full: true, title: '有効性の区分で探す' },
  { re: /^\/impact$/, mod: 'pages', fn: 'impactPage', nav: 'impact', full: true, geo: true, title: '地域への影響を調べる' },
  { re: /^\/pref\/(\d{2})$/, mod: 'pages', fn: 'prefPage', arg: m => m[1], nav: 'map', full: true, d3: true },
  { re: /^\/city\/(\d{6})$/, mod: 'pages', fn: 'cityPage', arg: m => m[1], nav: 'map', full: true },
  { re: /^\/national$/, mod: 'pages', fn: 'nationalPage', nav: 'national', full: true, title: '国・省庁の協定' },
  { re: /^\/compare$/, mod: 'pages', fn: 'comparePage', nav: 'compare', full: true, d3: true, title: '比較グラフ' },
  { re: /^\/about$/, mod: 'pages', fn: 'aboutPage', nav: 'about', full: true, title: '調査状況・出典・使い方' },
  { re: /^\/data$/, mod: 'pages', fn: 'dataPage', nav: 'data', full: true, title: 'データ' },
];

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  const path = (i >= 0 ? h.slice(0, i) : h) || '/';
  return { path: path.startsWith('/') ? path : '/' + path, params: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
}

export function go(path, params = {}, opts = {}) {
  const qs = (params instanceof URLSearchParams ? params : new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false))).toString();
  const h = '#' + path + (qs ? '?' + qs : '');
  keepScroll = !!opts.keepScroll;
  if (location.hash === h) render(); else location.hash = h;
}

// 以前のアドレスを、新しいページに読み替える（共有されたリンク・ブックマークが使えるように）
function redirect(path, params) {
  if (path === '/' && params.get('to') === 'sanpun') return '#/guide';
  if (path === '/map' && params.get('mode') === 'impact') return '#/impact?' + new URLSearchParams({ ...(params.get('i') ? { i: params.get('i') } : {}), to: 'imp-map' });
  // 市区町村：#/pref/14?city=141003 は #/city/141003 へ。5けたのコード（検査用の数字なし）は6けたに直す。
  // 都道府県そのもののコード（140007 など）は都道府県のページへ
  const city = path.match(/^\/city\/(\d{5,6})$/)?.[1] || (/^\/pref\/\d{2}$/.test(path) && /^\d{5,6}$/.test(params.get('city') || '') ? params.get('city') : null);
  if (city) {
    const rest = new URLSearchParams(params);
    rest.delete('city');
    const qs = rest.toString() ? '?' + rest : '';
    if (city.slice(2, 5) === '000') return `#/pref/${city.slice(0, 2)}${qs}`;
    if (city.length === 5) return `#/city/${city}${cityCheckDigit(city)}${qs}`;
    if (path.startsWith('/pref/')) return `#/city/${city}${qs}`;
  }
  return null;
}

let d3Promise = null;
function loadD3() {
  if (window.d3) return Promise.resolve();
  if (!d3Promise) {
    d3Promise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'assets/vendor/d3.min.js';
      s.onload = res;
      s.onerror = () => { d3Promise = null; rej(new Error('グラフの部品（d3）を読み込めませんでした')); };
      document.head.appendChild(s);
    });
  }
  return d3Promise;
}

async function render() {
  const token = ++seq;
  const { path, params } = parseHash();
  const to = redirect(path, params);
  if (to) { location.replace(to); return; }
  // 「戻る」「進む」で前に見たページへ戻ったときは、そのページで最後に見ていた位置に戻す（位置は下の scroll で記録）
  const savedY = history.state && typeof history.state.y === 'number' ? history.state.y : null;
  // 共有されたリンクに「数え方」が入っていれば、それに合わせる（v＝有効性の範囲、doc＝数える文書）
  if (params.get('v')) setScope('validity', params.get('v'));
  if (params.get('doc')) setScope('docScope', params.get('doc'));
  const route = ROUTES.find(r => r.re.test(path));
  const samePath = path === lastPath;
  // 読み込みに時間がかかるときだけ「読み込んでいます」を出す（すぐ表示できるときは画面をちらつかせない）
  const slow = setTimeout(() => { if (token === seq && !samePath) app.innerHTML = `<p class="loading">${route?.full && !hasFull() ? '詳しいデータを読み込んでいます…' : '読み込んでいます…'}</p>`; }, 180);
  let ctx, page, m;
  try {
    m = route ? path.match(route.re) : null;
    const [mod, db, g] = await Promise.all([
      route ? MODS[route.mod]() : MODS.pages(),
      route?.full ? loadFull() : hasFull() ? loadFull() : loadCore(),
      route?.geo ? (geo ? geo : loadGeo()) : null,
      route?.d3 ? loadD3() : null,
    ]);
    if (g) geo = g;
    ctx = { db, app, path, params, samePath, prevPath: lastPath, go, needFull, rerender: render };
    if (route?.prep) await route.prep(ctx, m);
    if (geo) ctx.db.geo = geo;
    page = route ? mod[route.fn] : mod.notFound;
  } catch (e) {
    clearTimeout(slow);
    if (token !== seq) return;
    console.error(e);
    showError(e);
    return;
  }
  clearTimeout(slow);
  if (token !== seq) return; // 読み込みの間に別のページへ移った
  setFooter(ctx.db);
  try {
    route ? page(ctx, route.arg ? route.arg(m) : undefined) : page(ctx);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="error">表示中にエラーが起きました：${esc(e.message)}</div>`;
  }
  const title = route?.title || app.querySelector('h1')?.textContent || null;
  const nav = route?.nav || null;
  document.title = (title && nav !== 'home' ? `${title}｜` : '') + '日本と世界のMOU・協定マップ';
  markNav(nav, params);
  setMenu(false);
  // 上の検索欄には、キーワード検索のページ以外では前の言葉を残さない
  const gq = document.getElementById('global-q');
  if (gq && document.activeElement !== gq) gq.value = (route?.mod === 'explore' && params.get('q')) || '';
  // ページ内の見出しへの移動（#/about?to=ab-clair など）
  const toId = params.get('to');
  if (toId && document.getElementById(toId)) {
    requestAnimationFrame(() => jumpTo(toId, false));
  } else if (savedY !== null && !samePath) {
    requestAnimationFrame(() => window.scrollTo(0, savedY));
  } else if (!keepScroll && !samePath) window.scrollTo(0, 0);
  keepScroll = false;
  lastPath = path;
}

function showError(e) {
  const local = location.protocol === 'file:';
  app.innerHTML = `<div class="error"><b>データを読み込めませんでした。</b><br>${esc(e.message)}
    <p style="margin:10px 0 0"><button type="button" class="btn" id="retry">もう一度読み込む</button></p></div>
    ${local ? `<div class="info">ファイルを直接開いた場合（アドレスが file:// で始まる場合）、ブラウザの安全機能によりデータを読み込めません。
      GitHub Pages で公開するか、フォルダで <code>python tools/serve.py</code> を実行して <code>http://127.0.0.1:8000/</code> を開いてください。</div>` : ''}`;
  app.querySelector('#retry').addEventListener('click', () => render());
}

// キーワード検索・CSV保存など、全データが必要な操作のとき。読み込んだら、いまのページを全データで表示し直す
let needing = null;
function needFull() {
  if (hasFull()) return loadFull();
  if (!needing) {
    needing = loadFull().then(db => { needing = null; keepScroll = true; render(); return db; }, e => { needing = null; toast('データを読み込めませんでした。もう一度お試しください'); throw e; });
  }
  return needing;
}

let footerDone = false;
function setFooter(db) {
  if (footerDone || !db?.config) return;
  footerDone = true;
  document.getElementById('footer-updated').innerHTML =
    `最終更新日：${esc(fmtDate(db.config.last_updated))}　／　掲載内容：${esc(fmtDate(db.config.data_as_of))}時点（<a href="#/about">調査範囲と方法</a>）`;
}

// 上のメニュー：いまのページの項目と、それを含むグループを強調する
function markNav(nav, params) {
  const key = nav === 'about' && params.get('to') === 'ab-clair' ? 'about-clair' : nav;
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.querySelectorAll('.nav-group').forEach(d => {
    d.classList.toggle('is-current', !!d.querySelector('[aria-current="page"]'));
    d.open = false;
  });
}

// ページ内の移動。見出しの位置まで動かし、キーボード操作のために見出しにフォーカスを移す
function jumpTo(id, smooth = true) {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' });
  const focusEl = el.matches('h1,h2,h3,[tabindex]') ? el : el.querySelector('h2,h3');
  if (focusEl) { if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1'); focusEl.focus({ preventScroll: true }); }
  return true;
}

// スマートフォンのメニュー（「メニュー」ボタンで開閉。項目を押すか Esc キーで閉じる）
const menuBtn = document.getElementById('menu-btn');
const narrow = () => window.matchMedia('(max-width: 760px)').matches;
function setMenu(open) {
  if (!menuBtn) return;
  menuBtn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
  // スマートフォンでは、メニューを開いたときに3つのグループの中身もすべて見せる
  if (narrow()) document.querySelectorAll('.nav-group').forEach(d => { d.open = open; });
}
menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const openGroup = document.querySelector('.nav-group[open]');
  if (openGroup) { openGroup.open = false; openGroup.querySelector('summary').focus(); return; }
  if (document.body.classList.contains('menu-open')) { setMenu(false); menuBtn.focus(); }
});
// メニューのグループ（詳しく調べる・統計・分析・資料・出典）は、1つ開くとほかを閉じる。外を押すと閉じる
document.querySelectorAll('.nav-group').forEach(d => d.addEventListener('toggle', () => {
  if (d.open && !document.body.classList.contains('menu-open')) document.querySelectorAll('.nav-group[open]').forEach(o => { if (o !== d) o.open = false; });
}));

document.addEventListener('click', e => {
  if (e.target.closest('.site-nav a')) setMenu(false);
  if (!e.target.closest('.nav-group') && !document.body.classList.contains('menu-open')) document.querySelectorAll('.nav-group[open]').forEach(o => { o.open = false; });
  // 用語ボタン（点線の下線）を押すと説明を表示
  const t = e.target.closest('.term[data-term]');
  if (t) toast(t.getAttribute('title'));
  // 同じページの中の目次リンク（data-jump）。ページを作り直さずに移動し、アドレスだけ書き換える
  const j = e.target.closest('a[data-jump]');
  if (j && document.getElementById(j.dataset.jump)) {
    e.preventDefault();
    history.replaceState(history.state, '', j.getAttribute('href'));
    jumpTo(j.dataset.jump);
  }
});
document.getElementById('global-search').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('global-q').value.trim();
  // 上の検索欄からの検索は、登録したすべての協定から探す（有効性・文書の種類を問わない）
  go('/search', q ? { q } : {});
});

// リンクに指を置いた・マウスを重ねたときに、次のページのプログラムとデータを先に読み始める（押したときにすぐ表示するため）
const prefetched = new Set();
function prefetch(href) {
  const p = href.replace(/^#/, '').split('?')[0];
  const key = /^\/(map|search)$/.test(p) ? 'explore' : p.startsWith('/mou/') ? 'detail' : p === '/guide' ? 'guide' : p === '/' ? 'home' : 'pages';
  if (prefetched.has(key)) return;
  prefetched.add(key);
  MODS[key]().catch(() => prefetched.delete(key));
  if (key === 'explore') loadGeo().catch(() => {});
}
['pointerover', 'touchstart', 'focusin'].forEach(type => document.addEventListener(type, e => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (a) prefetch(a.getAttribute('href'));
}, { passive: true }));

// いま見ているページの位置を、ブラウザの履歴の項目に記録する（詳細ページから「戻る」で一覧に戻ったときに使う）
let saveTimer = 0;
window.addEventListener('scroll', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { history.replaceState({ ...(history.state || {}), y: Math.round(window.scrollY) }, ''); } catch (e) { /* 記録できない環境では何もしない */ }
  }, 200);
}, { passive: true });

// 上に戻るボタン（少し下まで読んだら表示）
const toTop = document.getElementById('to-top');
if (toTop) {
  const onScroll = () => toTop.classList.toggle('show', window.scrollY > 600);
  window.addEventListener('scroll', onScroll, { passive: true });
  toTop.addEventListener('click', () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    document.querySelector('.brand')?.focus({ preventScroll: true });
  });
  onScroll();
}

window.addEventListener('hashchange', render);
render();
