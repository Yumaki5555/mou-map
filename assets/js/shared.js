// ページ間で共有する設定と小物
import { fmtDate, yearOf, esc } from './util.js';
import { VALIDITY_SCOPES, VALIDITY_SCOPE, DOC_SCOPES, DOC_SCOPE, VALIDITY, filterGroups, validityCounts } from './data.js';

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
  return `<label class="check"><input type="checkbox" class="news-toggle" ${settings.includeNews ? 'checked' : ''}> 報道のみで公式資料が未確認の情報も含める</label>`;
}
export function bindNewsToggle(root, onChange) {
  root.querySelectorAll('.news-toggle').forEach(cb => cb.addEventListener('change', () => {
    settings.includeNews = cb.checked;
    try { localStorage.setItem('mou.includeNews', cb.checked ? '1' : '0'); } catch (e) { /* 無視 */ }
    onChange();
  }));
  bindScopeBar(root, onChange);
}

// 件数・地図のそばに出す、いまの数え方の説明（「有効確認のみ」なら未確認を含まないことを必ず書く）
export function scopeNote() {
  return VALIDITY_SCOPE[settings.validity].note;
}
export function scopeNoteHTML() {
  return `<p class="scope-note" role="note">${esc(scopeNote())}</p>`;
}

// 件数の数え方の切り替え（有効性の範囲・文書の範囲）。どのページでも同じ部品を使い、結果は全ページに反映。
// 初期設定に戻すボタンは、初期設定から変えているときだけ表示します。
export function scopeBarHTML(opts = {}) {
  const docs = opts.docs !== false;
  const validity = opts.validity !== false;
  const changed = (validity && settings.validity !== 'valid') || (docs && settings.docScope !== 'mou') || settings.includeNews;
  return `<div class="scope-bar" role="group" aria-label="件数の数え方">
    ${validity ? `<div class="scope-row"><span class="scope-k">協定の有効性</span>
      <div class="seg seg-sm">${VALIDITY_SCOPES.map(v => `<button type="button" data-scope-v="${v.code}" aria-pressed="${settings.validity === v.code}">${esc(v.ja)}</button>`).join('')}</div></div>
    ${opts.note === false ? '' : scopeNoteHTML()}` : ''}
    ${docs ? `<div class="scope-row"><span class="scope-k">数える文書</span>
      <div class="seg seg-sm">${DOC_SCOPES.map(d => `<button type="button" data-scope-d="${d.code}" aria-pressed="${settings.docScope === d.code}">${esc(d.ja)}</button>`).join('')}</div></div>` : ''}
    <div class="scope-foot">${opts.hideNews ? '' : newsToggleHTML()}
      ${changed ? '<button type="button" class="btn btn-small btn-outline" data-scope-reset>数え方を初期設定に戻す</button>' : ''}</div>
    ${opts.defaults === false ? '' : defaultsNoteHTML()}
  </div>`;
}

// 初期値がページによって違うことの説明（地図などの件数と、検索の件数が違っても不具合ではないことを伝える）
export function defaultsNoteHTML(page) {
  return page === 'search'
    ? '<p class="scope-default">サイト内検索は、有効性・文書の種類・期間を問わず、<b>登録したすべての文書</b>から探します。地図・相手国などの件数の初期設定（有効確認のみ・MOUのみ）とは範囲が違うため、件数が多くなることがあります。</p>'
    : '<p class="scope-default">件数の初期設定は「有効確認のみ・MOUのみ」です（初めて開いたとき）。<a href="#/search">サイト内検索</a>は有効性を問わず全件から探すため、件数が違うことがあります。</p>';
}

// 件数のそばに出す有効性の内訳：同じ条件で数えた「有効確認 ○件／有効性未確認 ○件／終了確認 ○件／開始前 ○件」と、
// いまの数え方で表示しているか（表示中・非表示）。非表示の件数があれば、表示に切り替えるボタンを出す。
// f はページの条件（都道府県・相手国など）。ボタンは bindScopeBar（bindNewsToggle）で動く
export function scopeCountsHTML(db, f = {}, opts = {}) {
  const base = baseFilter(f);
  const c = validityCounts(filterGroups(db, { ...base, validity: 'all', includePlanned: true }));
  const on = new Set(VALIDITY_SCOPE[settings.validity].states);
  const codes = ['valid_confirmed', 'unconfirmed', 'ended_confirmed', 'signed_not_started'];
  const shown = codes.filter(k => on.has(k)).reduce((a, k) => a + c[k], 0);
  const outDocs = base.docScope === 'all' ? 0 : filterGroups(db, { ...base, docScope: 'all' }).length - shown;
  const items = codes.map(k => `<li class="sc-i ${on.has(k) ? 'is-on' : 'is-off'}"><span class="sc-k">${esc(VALIDITY[k].ja)}</span> <b>${c[k]}</b>件<span class="sc-s">${on.has(k) ? '表示中' : '非表示'}</span></li>`).join('');
  const btns = [
    settings.validity === 'valid' && c.unconfirmed ? '<button type="button" class="btn btn-small btn-outline" data-scope-v="valid_unk">有効性未確認も表示する</button>' : '',
    settings.validity !== 'all' && (c.ended_confirmed || c.signed_not_started) ? '<button type="button" class="btn btn-small btn-outline" data-scope-v="all">締結済みすべてを表示する</button>' : '',
    outDocs > 0 ? '<button type="button" class="btn btn-small btn-outline" data-scope-d="all">すべての国際文書を表示する</button>' : '',
  ].filter(Boolean).join('');
  return `<div class="scope-counts" role="note">
    <p class="sc-h">${esc(opts.label || 'この条件の登録件数')}：締結済み ${c.signed_total}件のうち <b>${shown}件</b>を表示中</p>
    <ul class="sc-list">${items}</ul>
    ${c.planned ? `<p class="small muted sc-x">このほか締結予定 ${c.planned}件（締結済みの件数には含めません）</p>` : ''}
    ${outDocs > 0 ? `<p class="small sc-x">このほか「${esc(DOC_SCOPE[base.docScope].ja)}」の範囲の外にある文書（R/D・EPA・交換公文・取決めなど）が <b>${outDocs}件</b>あります（非表示）</p>` : ''}
    ${btns ? `<div class="btn-row sc-btns">${btns}</div>` : ''}
  </div>`;
}
// 画像（PNG）・CSVの注記に使う、非表示の件数の短い説明
export function hiddenSummary(db, f = {}) {
  const base = baseFilter(f);
  const c = validityCounts(filterGroups(db, { ...base, validity: 'all' }));
  const on = new Set(VALIDITY_SCOPE[settings.validity].states);
  const off = ['unconfirmed', 'ended_confirmed', 'signed_not_started'].filter(k => !on.has(k) && c[k]).map(k => `${VALIDITY[k].ja} ${c[k]}件`);
  return off.length ? `表示していない協定：${off.join('・')}` : '';
}
export function bindScopeBar(root, onChange) {
  root.querySelectorAll('[data-scope-v]').forEach(b => b.addEventListener('click', () => { if (setScope('validity', b.dataset.scopeV)) onChange(); }));
  root.querySelectorAll('[data-scope-d]').forEach(b => b.addEventListener('click', () => { if (setScope('docScope', b.dataset.scopeD)) onChange(); }));
  root.querySelectorAll('[data-scope-reset]').forEach(b => b.addEventListener('click', () => {
    setScope('validity', 'valid'); setScope('docScope', 'mou');
    settings.includeNews = false;
    try { localStorage.setItem('mou.includeNews', '0'); } catch (e) { /* 無視 */ }
    onChange();
  }));
}
export function scopeLabel(docs = true) {
  return `${VALIDITY_SCOPE[settings.validity].ja}${docs ? '／' + DOC_SCOPE[settings.docScope].ja : ''}${settings.includeNews ? '／報道のみの情報を含む' : ''}`;
}

// 画像の下に入れる「対象地域・件数の条件・対象時点・出典・確認日」
export function metaFor(db, groups, region, opts = {}) {
  const years = groups.flatMap(g => g.versions.map(v => yearOf(v.signed_date))).filter(Boolean);
  const from = years.length ? Math.min(...years) : null;
  const asOf = db.config.data_as_of;
  return {
    region,
    cond: opts.cond || `${scopeLabel(opts.docs !== false)}（${scopeNote()}）`,
    period: from ? `${from}年〜${fmtDate(asOf)}時点` : `${fmtDate(asOf)}時点`,
    source: '各都道府県・省庁・相手国政府の公式発表、協定原文ほか（個別の出典はサイトの各協定のページに掲載）',
    checked: fmtDate(asOf),
  };
}
