// 画面の切り替え（URLの # 以降で表示するページを決めます。GitHub Pages でもそのまま動きます）
import { loadAll } from './data.js';
import { esc, fmtDate, toast } from './util.js';
import { mapPage } from './page-map.js';
import {
  homePage, countryIndexPage, countryPage, fieldIndexPage, impactPage, prefPage, mouPage, nationalPage,
  comparePage, aboutPage, dataPage, searchPage, notFound,
} from './pages.js';

const app = document.getElementById('app');
let db = null;
let lastPath = null;
let keepScroll = false;

const ROUTES = [
  [/^\/$/, ctx => homePage(ctx), 'トップ', null],
  [/^\/map$/, ctx => mapPage(ctx), '日本地図から探す', 'map'],
  [/^\/country$/, ctx => countryIndexPage(ctx), '相手国から探す', 'country'],
  [/^\/country\/([A-Z]{2})$/, (ctx, m) => countryPage(ctx, m[1]), null, 'country'],
  [/^\/field$/, ctx => fieldIndexPage(ctx), '分野から探す', 'field'],
  [/^\/impact$/, ctx => impactPage(ctx), '地域への影響を見る', 'impact'],
  [/^\/pref\/(\d{2})$/, (ctx, m) => prefPage(ctx, m[1]), null, 'map'],
  [/^\/mou\/(.+)$/, (ctx, m) => mouPage(ctx, decodeURIComponent(m[1])), null, null],
  [/^\/national$/, ctx => nationalPage(ctx), '国・省庁のMOU', 'national'],
  [/^\/compare$/, ctx => comparePage(ctx), '比較グラフ', 'compare'],
  [/^\/about$/, ctx => aboutPage(ctx), '調査状況・使い方', 'about'],
  [/^\/data$/, ctx => dataPage(ctx), 'データ', 'data'],
  [/^\/search$/, ctx => searchPage(ctx), '検索', null],
];

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  const path = (i >= 0 ? h.slice(0, i) : h) || '/';
  return { path: path.startsWith('/') ? path : '/' + path, params: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
}

export function go(path, params = {}, opts = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)).toString();
  const h = '#' + path + (qs ? '?' + qs : '');
  keepScroll = !!opts.keepScroll;
  if (location.hash === h) render(); else location.hash = h;
}

function render() {
  const { path, params } = parseHash();
  const samePath = path === lastPath;
  const ctx = { db, app, path, params, samePath, go };
  let title = null, nav = null, matched = false;
  for (const [re, fn, t, n] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    matched = true;
    try { fn(ctx, m); } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="error">表示中にエラーが起きました：${esc(e.message)}</div>`;
    }
    title = t || app.querySelector('h1')?.textContent || null;
    nav = n;
    break;
  }
  if (!matched) notFound(ctx);
  document.title = (title ? `${title}｜` : '') + '日本と世界のMOUマップ';
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!keepScroll && !samePath) window.scrollTo(0, 0);
  keepScroll = false;
  lastPath = path;
}

// 用語ボタン（点線の下線）を押すと説明を表示
document.addEventListener('click', e => {
  const t = e.target.closest('.term[data-term]');
  if (t) toast(t.getAttribute('title'));
});
document.getElementById('global-search').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('global-q').value.trim();
  if (q) go('/search', { q });
});

async function start() {
  try {
    db = await loadAll();
  } catch (e) {
    console.error(e);
    const local = location.protocol === 'file:';
    app.innerHTML = `<div class="error"><b>データを読み込めませんでした。</b><br>${esc(e.message)}</div>
      ${local ? `<div class="info">ファイルを直接開いた場合（アドレスが file:// で始まる場合）、ブラウザの安全機能によりデータを読み込めません。
        GitHub Pages で公開するか、フォルダで <code>python -m http.server</code> を実行して <code>http://localhost:8000/</code> を開いてください。</div>` : ''}`;
    return;
  }
  const s = db.survey.stages || [];
  document.getElementById('footer-updated').innerHTML =
    `最終更新日：${esc(fmtDate(db.config.last_updated))}　／　調査済み範囲：${s.map(x => `第${x.no}段階 ${esc(x.status_ja)}`).join('、')}（<a href="#/about">詳しく</a>）`;
  if (db.warnings.length) console.warn(db.warnings);
  window.addEventListener('hashchange', render);
  render();
}
start();
