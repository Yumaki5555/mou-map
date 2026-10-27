// ページ間で共有する設定と小物
import { fmtDate, yearOf, esc } from './util.js';
import { VALIDITY_SCOPES, VALIDITY_SCOPE, DOC_SCOPES, DOC_SCOPE } from './data.js';

// 「報道のみ（公式資料未確認）の情報も含める」設定。初期値は含めない。
// 「有効性の範囲」の初期値は「有効確認のみ」、「文書の範囲」の初期値は「MOUのみ」。
// 有効性・文書の範囲は、開いているあいだだけ覚えます（次に開いたときは初期値に戻る）。
export const settings = { includeNews: false, validity: 'valid', docScope: 'mou' };
try { settings.includeNews = localStorage.getItem('mou.includeNews') === '1'; } catch (e) { /* 保存できない環境では初期値のまま */ }
try {
  const v = sessionStorage.getItem('mou.validity'); if (VALIDITY_SCOPE[v]) settings.validity = v;
  const d = sessionStorage.getItem('mou.docScope'); if (DOC_SCOPE[d]) settings.docScope = d;
} catch (e) { /* 無視 */ }

export function setScope(key, value) {
  if (key === 'validity' && !VALIDITY_SCOPE[value]) return false;
  if (key === 'docScope' && !DOC_SCOPE[value]) return false;
  if (settings[key] === value) return false;
  settings[key] = value;
  try { sessionStorage.setItem('mou.' + key, value); } catch (e) { /* 無視 */ }
  return true;
}

// すべての件数で使う共通の条件
export function baseFilter(extra = {}) {
  return { includeNews: settings.includeNews, validity: settings.validity, docScope: settings.docScope, ...extra };
}

export function newsToggleHTML() {
  return `<label class="small"><input type="checkbox" class="news-toggle" ${settings.includeNews ? 'checked' : ''}> 報道のみで公式資料が未確認の情報も含める</label>`;
}
export function bindNewsToggle(root, onChange) {
  root.querySelectorAll('.news-toggle').forEach(cb => cb.addEventListener('change', () => {
    settings.includeNews = cb.checked;
    try { localStorage.setItem('mou.includeNews', cb.checked ? '1' : '0'); } catch (e) { /* 無視 */ }
    onChange();
  }));
  bindScopeBar(root, onChange);
}

// 件数の数え方の切り替え（有効性の範囲・文書の範囲）。どのページでも同じ部品を使い、結果は全ページに反映。
export function scopeBarHTML(opts = {}) {
  const docs = opts.docs !== false;
  return `<div class="scope-bar" role="group" aria-label="件数の数え方">
    <div class="scope-row"><span class="scope-k">協定の有効性</span>
      <div class="seg seg-sm">${VALIDITY_SCOPES.map(v => `<button type="button" data-scope-v="${v.code}" aria-pressed="${settings.validity === v.code}" title="${esc(v.desc)}">${esc(v.ja)}</button>`).join('')}</div></div>
    ${docs ? `<div class="scope-row"><span class="scope-k">数える文書</span>
      <div class="seg seg-sm">${DOC_SCOPES.map(d => `<button type="button" data-scope-d="${d.code}" aria-pressed="${settings.docScope === d.code}" title="${esc(d.desc)}">${esc(d.ja)}</button>`).join('')}</div></div>` : ''}
    <p class="scope-now small">いまの数え方：<b>${esc(scopeLabel(docs))}</b>${opts.hideNews ? '' : `　${newsToggleHTML()}`}</p>
  </div>`;
}
export function bindScopeBar(root, onChange) {
  root.querySelectorAll('[data-scope-v]').forEach(b => b.addEventListener('click', () => { if (setScope('validity', b.dataset.scopeV)) onChange(); }));
  root.querySelectorAll('[data-scope-d]').forEach(b => b.addEventListener('click', () => { if (setScope('docScope', b.dataset.scopeD)) onChange(); }));
}
export function scopeLabel(docs = true) {
  return `${VALIDITY_SCOPE[settings.validity].ja}${docs ? '／' + DOC_SCOPE[settings.docScope].ja : ''}${settings.includeNews ? '／報道のみの情報を含む' : ''}`;
}

// 画像の下に入れる「対象地域・対象期間・出典・確認日」（数え方も必ず書く）
export function metaFor(db, groups, region, opts = {}) {
  const years = groups.flatMap(g => g.versions.map(v => yearOf(v.signed_date))).filter(Boolean);
  const from = years.length ? Math.min(...years) : null;
  const asOf = db.config.data_as_of;
  return {
    region: `${region}（数え方：${scopeLabel(opts.docs !== false)}）`,
    period: from ? `${from}年〜${fmtDate(asOf)}時点` : `${fmtDate(asOf)}時点`,
    source: '各都道府県・省庁・相手国政府の公式発表、協定原文ほか（個別の出典はサイトの各協定のページに掲載）',
    checked: fmtDate(asOf),
  };
}
