// 画面の切り替え（URLの # 以降で表示するページを決めます。GitHub Pages でもそのまま動きます）
import { loadAll } from './data.js';
import { esc, fmtDate, toast } from './util.js';
import { mapPage } from './page-map.js';
import {
  homePage, countryIndexPage, countryPage, fieldIndexPage, impactPage, prefPage, mouPage, nationalPage,
  comparePage, aboutPage, dataPage, notFound, typesPage, issuesPage, listPage, actorsPage,
} from './pages.js';
import { searchPage } from './page-search.js';
import { setScope } from './shared.js';

const app = document.getElementById('app');
let db = null;
let lastPath = null;
let keepScroll = false;

const ROUTES = [
  [/^\/$/, ctx => homePage(ctx), 'トップ', 'home'],
  [/^\/map$/, ctx => mapPage(ctx), '日本地図から探す', 'map'],
  [/^\/country$/, ctx => countryIndexPage(ctx), '相手国から探す', 'country'],
  [/^\/country\/([A-Z]{2})$/, (ctx, m) => countryPage(ctx, m[1]), null, 'country'],
  [/^\/types$/, ctx => typesPage(ctx), '協定・取決めの種類から探す', 'types'],
  [/^\/field$/, ctx => fieldIndexPage(ctx), '分野・省庁から探す', 'field'],
  [/^\/actors$/, ctx => actorsPage(ctx), '締結主体から探す', 'actors'],
  [/^\/list$/, ctx => listPage(ctx), '有効性の区分で探す', 'list'],
  [/^\/impact$/, ctx => impactPage(ctx), '地域への影響を調べる', 'impact'],
  [/^\/pref\/(\d{2})$/, (ctx, m) => prefPage(ctx, m[1]), null, 'map'],
  [/^\/mou\/(.+)$/, (ctx, m) => mouPage(ctx, decodeURIComponent(m[1])), null, null],
  [/^\/national$/, ctx => nationalPage(ctx), '国・省庁の協定', 'field'],
  [/^\/compare$/, ctx => comparePage(ctx), '比較グラフ', 'compare'],
  [/^\/issues$/, ctx => issuesPage(ctx), '制度の課題を考える', 'issues'],
  [/^\/about$/, ctx => aboutPage(ctx), '調査状況・出典・使い方', 'about'],
  [/^\/data$/, ctx => dataPage(ctx), 'データ', 'data'],
  [/^\/search$/, ctx => searchPage(ctx), 'サイト内検索', 'search'],
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
  // 共有されたリンクに「数え方」が入っていれば、それに合わせる（v＝有効性の範囲、doc＝数える文書）
  if (params.get('v')) setScope('validity', params.get('v'));
  if (params.get('doc')) setScope('docScope', params.get('doc'));
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
  // 検索のページ以外では、上の検索欄に前の言葉を残さない
  const gq = document.getElementById('global-q');
  if (gq && path !== '/search' && document.activeElement !== gq) gq.value = '';
  document.title = (title && nav !== 'home' ? `${title}｜` : '') + '日本と世界のMOU・協定マップ';
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  setMenu(false);
  // ページ内の見出しへの移動（#/?to=sanpun など）
  const to = params.get('to');
  if (to && document.getElementById(to)) {
    requestAnimationFrame(() => jumpTo(to, false));
  } else if (!keepScroll && !samePath) window.scrollTo(0, 0);
  keepScroll = false;
  lastPath = path;
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
function setMenu(open) {
  if (!menuBtn) return;
  menuBtn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
}
menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); menuBtn.focus(); } });

document.addEventListener('click', e => {
  if (e.target.closest('.site-nav a')) setMenu(false);
  // 用語ボタン（点線の下線）を押すと説明を表示
  const t = e.target.closest('.term[data-term]');
  if (t) toast(t.getAttribute('title'));
  // 同じページの中の目次リンク（data-jump）。ページを作り直さずに移動し、アドレスだけ書き換える
  const j = e.target.closest('a[data-jump]');
  if (j && document.getElementById(j.dataset.jump)) {
    e.preventDefault();
    history.replaceState(null, '', j.getAttribute('href'));
    jumpTo(j.dataset.jump);
  }
});
document.getElementById('global-search').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('global-q').value.trim();
  go('/search', q ? { q } : {});
});

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
  document.getElementById('footer-updated').innerHTML =
    `最終更新日：${esc(fmtDate(db.config.last_updated))}　／　掲載内容：${esc(fmtDate(db.config.data_as_of))}時点（<a href="#/about">調査範囲と方法</a>）`;
  if (db.warnings.length) console.warn(db.warnings);
  window.addEventListener('hashchange', render);
  render();
}
start();
