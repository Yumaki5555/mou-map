// 「協定を探す」ページ（日本地図・件数・協定の一覧を、ひとつの検索条件で切り替える）
// ・条件（地域・相手国・分野・事業の実施状況・有効性・文書の種類、詳細条件）を変えると、地図の色・件数・一覧がその場で変わる
// ・ページの部品は作り直さず、変わったところだけを書き換える（地図の拡大・位置もそのまま）
// ・一覧は最初の10件だけを作り、「もっと見る」で続きを足す
// ・キーワード検索は本文・出典まで探すため、キーワードを入れたときだけ全データを読み込む
import { esc, fmtDate, debounce } from './util.js';
import {
  FIELDS, STATUSES, STATUS, VALIDITIES, DOC_KINDS, JAPAN_ORG_TYPES, PAIR_KINDS, ZERO_STATES, LEVEL_ORDER, SURVEY_RESULT,
  zeroState, fieldCoverageNote, countryName, prefName,
} from './data.js';
import { JapanMap, PATTERNS, swatchStyle } from './map.js';
import { mouCard, legendHTML } from './components.js';
import { seqScale, COUNTRY_COLORS } from './map-model.js';
import { settings, setScope } from './shared.js';
import {
  readState, writeState, computeResults, facetCounts, conditionTags, removeTag, clearAll, defaults, passBase, regionRole,
  V_PRESETS, V_PRESET, DOC_PRESETS, SORTS, PAGE_FIRST, PAGE_MORE, presetOf, ROLE_LABEL,
} from './explore-state.js';

const MULTI = '#2d3748'; // 選んだ国のうち2か国以上
const EXAMPLES = ['宮城県 ベトナム', 'インドネシア 介護', 'NAGOMi', 'JITCO R/D', '外務省 EPA', 'ベトナム 技能実習'];
const LV_LABEL = { national: '国・省庁', prefecture: '都道府県', municipality: '市区町村', organization: '団体・企業など' };

let view = null;       // ページの部品（同じページの中の操作では作り直さない）
let S = null;          // キーワード検索の仕組み（search.js・orgs.js。キーワードを入れたときだけ読み込む）

export function explorePage(ctx) {
  const { db, app } = ctx;
  if (!view || !app.contains(view.root) || view.geo !== db.geo) build(ctx);
  view.ctx = ctx;
  refresh();
}

function build(ctx) {
  const { db, app } = ctx;
  app.innerHTML = `<div data-page="explore" class="ex">
    <div class="page-head ex-head">
      <div class="crumbs"><a href="#/">トップ</a> ＞ 協定を探す</div>
      <h1>協定を探す</h1>
      <p class="lead">条件を選ぶと、地図・件数・一覧がすぐに切り替わります。都道府県は地図を押しても選べます。</p>
    </div>
    <section class="ex-panel" id="ex-panel" aria-labelledby="ex-panel-h">
      <div class="ex-panel-top">
        <h2 id="ex-panel-h" class="ex-panel-h">検索条件</h2>
        <button type="button" class="btn btn-small btn-outline ex-panel-toggle" data-panel aria-expanded="true" aria-controls="ex-panel-body">条件を閉じる</button>
      </div>
      <div class="ex-panel-body" id="ex-panel-body">
        <form class="ex-q" role="search" id="ex-qform">
          <label class="ex-label" for="ex-q">キーワード</label>
          <div class="ex-q-row"><input type="search" id="ex-q" placeholder="例：宮城県 ベトナム／NAGOMi" autocomplete="off" enterkeyhint="search"><button class="btn" type="submit">検索</button></div>
          <p class="ex-q-ex small"><span class="muted">例：</span>${EXAMPLES.map(x => `<button type="button" class="linklike" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</p>
        </form>
        <div class="ex-basic">
          <label class="ex-field"><span class="ex-label">地域（都道府県）</span><select id="ex-p"></select></label>
          <label class="ex-field"><span class="ex-label">相手国・地域</span><select id="ex-c"></select></label>
          <label class="ex-field"><span class="ex-label">協定の分野</span><select id="ex-f"></select></label>
          <label class="ex-field"><span class="ex-label">事業の実施状況</span><select id="ex-s"></select></label>
          <div class="ex-field ex-wide"><span class="ex-label" id="ex-v-h">協定の有効性</span><div class="seg seg-sm" role="group" aria-labelledby="ex-v-h" id="ex-v"></div></div>
          <div class="ex-field ex-wide"><span class="ex-label" id="ex-d-h">文書の種類</span><div class="seg seg-sm" role="group" aria-labelledby="ex-d-h" id="ex-d"></div></div>
        </div>
        <details class="ex-adv" id="ex-adv"><summary>詳細条件（報道情報・締結主体・締結年・地図の表示など）</summary><div id="ex-adv-body"></div></details>
      </div>
    </section>
    <div class="ex-now" id="ex-now" aria-live="polite"></div>
    <div class="ex-sum" id="ex-sum" aria-live="polite"></div>
    <div class="ex-body">
      <section class="ex-mapcol" aria-labelledby="ex-map-h">
        <h2 class="ex-map-h" id="ex-map-h"></h2>
        <div id="ex-map"></div>
        <div id="ex-sel" aria-live="polite"></div>
        <div id="ex-legend"></div>
        <div id="ex-nat"></div>
        <details class="note-d"><summary>地図の見方・都道府県別の件数表</summary><div id="ex-table"></div></details>
        <p class="btn-row"><button type="button" class="btn btn-outline btn-small" id="ex-png">この地図を画像で保存</button></p>
      </section>
      <section class="ex-listcol" aria-labelledby="ex-list-h">
        <h2 class="visually-hidden" id="ex-list-h">協定の一覧</h2>
        <div id="ex-org" aria-live="polite"></div>
        <div class="ex-tabs" id="ex-tabs" role="group" aria-label="締結主体で分ける"></div>
        <div class="ex-tools" id="ex-tools"></div>
        <div id="ex-list" class="mou-list"></div>
        <div id="ex-more"></div>
      </section>
    </div>
  </div>`;
  const root = app.querySelector('[data-page="explore"]');
  const map = new JapanMap(root.querySelector('#ex-map'), db, {
    ariaLabel: '都道府県別の協定の件数の地図。都道府県を押すと、その地域の協定に絞り込みます',
    onClick: code => {
      const st = view.st;
      // 同じ県をもう一度押すと選択を解除
      apply({ p: st.p.length === 1 && st.p[0] === code ? [] : [code], lv: 'all' });
    },
  });
  view = { root, map, geo: db.geo, st: null, limit: PAGE_FIRST, ctx };
  // スマートフォンでは条件を最初は閉じておく（いまの条件はタグで見える）
  if (window.matchMedia('(max-width: 760px)').matches) setPanel(false);

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  const q = root.querySelector('#ex-q');
  const live = debounce(() => { if (q.value.trim() !== view.st.q) apply({ q: q.value.trim(), sort: q.value.trim() ? 'rel' : 'new' }, { replace: true }); }, 350);
  q.addEventListener('input', e => { if (!e.isComposing) live(); });
  q.addEventListener('compositionend', live);
  // キーワードを入れようとしたら、検索に使う全データを先に読み始める
  q.addEventListener('focus', () => { ensureSearch().catch(() => {}); }, { once: true });
  root.querySelector('#ex-qform').addEventListener('submit', e => { e.preventDefault(); apply({ q: q.value.trim(), sort: q.value.trim() ? 'rel' : 'new' }); });
}

function setPanel(open) {
  const b = view.root.querySelector('[data-panel]');
  view.root.querySelector('#ex-panel').classList.toggle('is-closed', !open);
  b.setAttribute('aria-expanded', String(open));
  b.textContent = open ? '条件を閉じる' : '条件を変える';
}

// 条件を変える。replace：履歴を増やさない（キーワードの入力中など）
function apply(patch, opts = {}) {
  const st = { ...view.st, ...patch };
  view.limit = PAGE_FIRST;
  const qs = writeState(st).toString();
  const h = '#/map' + (qs ? '?' + qs : '');
  if (opts.replace) {
    history.replaceState({ ...(history.state || {}), limit: PAGE_FIRST }, '', h);
    refresh();
  } else {
    view.ctx.go('/map', writeState(st), { keepScroll: true });
  }
}

function ensureSearch() {
  if (S) return Promise.resolve(S);
  const ctx = view?.ctx;
  return Promise.all([import('./search.js'), import('./orgs.js'), ctx ? ctx.needFull() : null]).then(([search, orgs]) => {
    S = { ...search, ...orgs };
    if (view && view.root.isConnected && view.st?.q) refresh();
    return S;
  });
}

function refresh() {
  const { ctx, root, map } = view;
  const db = ctx.db;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const path = location.hash.replace(/^#/, '').split('?')[0];
  const st = readState(db, params, path === '/search' ? '/search' : '/map', settings);
  const first = !view.st;
  view.st = st;
  // 以前のアドレス（#/search、mode=… など）は、新しい書き方に置き換える（履歴は増やさない）
  const canon = '#/map?' + writeState(st).toString();
  if (location.hash !== canon) history.replaceState(history.state, '', canon);
  // 「戻る」で一覧に戻ったときは、前に表示していた件数まで表示する
  if (first || ctx.samePath === false) view.limit = Math.max(PAGE_FIRST, Number(history.state?.limit) || PAGE_FIRST);
  // ほかのページでも同じ数え方で表示する（有効性の範囲・数える文書）
  const pre = presetOf(st.vs);
  if (pre && pre !== 'any') setScope('validity', pre);
  setScope('docScope', st.doc);

  // キーワード：全データと検索の仕組みがそろうまでは「準備中」
  let keyword = null, parsed = null;
  const qInput = root.querySelector('#ex-q');
  if (document.activeElement !== qInput) qInput.value = st.q;
  const waiting = st.q && (!db.full || !S);
  if (st.q && !waiting) {
    parsed = S.parseQuery(db, st.q);
    keyword = new Map(S.searchGroups(db, parsed).map(r => [r.g.key, r]));
  }
  if (waiting) ensureSearch().catch(() => {
    // 読み込みに失敗したときは、もう一度試せるようにする
    const sum = view?.root.querySelector('#ex-sum');
    if (sum) sum.innerHTML = '<div class="error">キーワード検索に使うデータを読み込めませんでした。通信の状態を確かめて、もう一度お試しください。<p style="margin:8px 0 0"><button type="button" class="btn btn-small" data-retry>もう一度読み込む</button></p></div>';
  });

  const res = waiting ? null : computeResults(db, st, keyword);
  const fc = waiting ? null : facetCounts(db, st, keyword);
  renderPanel(db, st, fc);
  renderNow(db, st);
  if (waiting) {
    root.querySelector('#ex-sum').innerHTML = `<p class="ex-wait" role="status">キーワード「${esc(st.q)}」で探す準備をしています…<span class="small">（協定の本文・出典・事業などからも探すため、詳しいデータを読み込んでいます）</span></p>`;
    for (const id of ['#ex-list', '#ex-more', '#ex-tabs', '#ex-tools', '#ex-org']) root.querySelector(id).innerHTML = '';
    renderMap(db, st, null, null);
    return;
  }
  renderSummary(db, st, res, keyword, fc);
  renderMap(db, st, res, keyword);
  renderList(db, st, res, keyword, parsed);
  if (first && ctx.params.get('focus')) focusFor(ctx.params.get('focus'));
}

function focusFor(f) {
  if (f === 'country' || f === 'q' || f === 'pref' || f === 'status') {
    setPanel(true);
    const el = view.root.querySelector({ country: '#ex-c', q: '#ex-q', pref: '#ex-p', status: '#ex-s' }[f]);
    requestAnimationFrame(() => { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' }); });
  } else if (f === 'map') requestAnimationFrame(() => view.root.querySelector('#ex-map').scrollIntoView({ block: 'start' }));
}

// ---------- 条件の部品 ----------
function opt(value, label, selected, disabled) {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${esc(label)}</option>`;
}
function selectHTML(chosen, items, none, multiLabel) {
  // 1つを選んでいるときはその値、複数（以前のリンクなど）のときは「複数を選択中」と表示する
  const one = chosen.length === 1 ? chosen[0] : '';
  return opt('', none, !chosen.length)
    + (chosen.length > 1 ? opt('__multi', `${multiLabel}（${chosen.length}件を選択中）`, true, true) : '')
    + items.map(([v, label]) => opt(v, label, v === one)).join('');
}
function renderPanel(db, st, fc) {
  const r = view.root;
  const n = (m, k) => (m ? ` (${m.get(k) || 0})` : '');
  r.querySelector('#ex-p').innerHTML = selectHTML(st.p, db.prefs.map(p => [p.code, p.name + n(fc?.p, p.code)]), '全国（指定なし）', '都道府県');
  // 相手国：いまの条件で協定がある国と、選んでいる国（件数の多い順）
  const cs = fc ? [...fc.c].filter(([, k]) => k > 0) : [];
  for (const c of st.c) if (!cs.some(([x]) => x === c)) cs.push([c, 0]);
  cs.sort((a, b) => b[1] - a[1] || countryName(db, a[0]).localeCompare(countryName(db, b[0]), 'ja'));
  r.querySelector('#ex-c').innerHTML = selectHTML(st.c, cs.map(([c, k]) => [c, `${countryName(db, c)}${fc ? ` (${k})` : ''}`]), 'すべての国・地域', '相手国');
  r.querySelector('#ex-f').innerHTML = selectHTML(st.f, FIELDS.map(f => [f.code, f.ja + n(fc?.f, f.code)]), 'すべての分野', '分野');
  r.querySelector('#ex-s').innerHTML = selectHTML(st.s, [...STATUSES, STATUS.planned].map(s => [s.code, s.ja + n(fc?.s, s.code)]), '指定なし', '実施状況');
  const pre = presetOf(st.vs);
  r.querySelector('#ex-v').innerHTML = V_PRESETS.slice(0, 3).map(p => `<button type="button" data-v="${p.code}" aria-pressed="${pre === p.code}">${esc(p.ja)}${fc ? `<span class="fc">${fc.vPreset.get(p.code)}</span>` : ''}</button>`).join('')
    + (pre === 'any' ? '<span class="small muted ex-v-note">締結予定も含めています</span>' : !pre ? '<span class="small muted ex-v-note">詳細条件で個別に選択中</span>' : '');
  r.querySelector('#ex-d').innerHTML = DOC_PRESETS.map(d => `<button type="button" data-doc="${d.code}" aria-pressed="${st.doc === d.code}">${esc(d.ja)}${fc ? `<span class="fc">${fc.doc.get(d.code) || 0}</span>` : ''}</button>`).join('');
  // 詳細条件（開いているときだけ中身を作る）
  const adv = r.querySelector('#ex-adv');
  if (!adv._bound) { adv._bound = true; adv.addEventListener('toggle', () => { if (adv.open) renderAdv(view.ctx.db, view.st, view.fc); }); }
  view.fc = fc;
  if (adv.open) renderAdv(db, st, fc);
}
function renderAdv(db, st, fc) {
  const ck = (key, v, label, on, n, desc) => `<label class="check"${desc ? ` title="${esc(desc)}"` : ''}><input type="checkbox" data-ck="${key}" value="${esc(v)}"${on ? ' checked' : ''}> ${esc(label)}${n !== undefined ? `<span class="fc">${n}</span>` : ''}</label>`;
  const cnt = (m, k) => (m ? m.get(k) || 0 : undefined);
  const years = [...new Set(db.groups.map(g => g.first_year).filter(Boolean))].sort((a, b) => b - a);
  const yopt = cur => `<option value="">指定なし</option>${years.map(y => `<option value="${y}"${cur === y ? ' selected' : ''}>${y}年</option>`).join('')}`;
  const cs = [...new Set(db.groups.flatMap(g => g.countries))].sort((a, b) => countryName(db, a).localeCompare(countryName(db, b), 'ja'));
  view.root.querySelector('#ex-adv-body').innerHTML = `
    <fieldset class="ex-fs"><legend>報道情報</legend>
      <label class="check"><input type="checkbox" id="ex-news"${!st.ev.length || st.ev.includes('news') ? ' checked' : ''}> 報道のみで公式資料が未確認の情報も含める${fc ? `<span class="fc">報道のみ ${cnt(fc.ev, 'news')}</span>` : ''}</label></fieldset>
    <fieldset class="ex-fs"><legend>協定の有効性（個別に選ぶ）</legend><div class="ex-cks">${VALIDITIES.map(v => ck('vs', v.code, v.ja, st.vs.includes(v.code), cnt(fc?.vs, v.code), v.desc)).join('')}</div></fieldset>
    <fieldset class="ex-fs"><legend>文書の種類（詳しい区分）</legend><div class="ex-cks">${DOC_KINDS.map(k => ck('cat', k.code, k.ja, st.cat.includes(k.code), cnt(fc?.cat, k.code), k.desc)).join('')}</div>
      <p class="small muted">上の「文書の種類」と両方に当てはまるものを表示します。</p></fieldset>
    <fieldset class="ex-fs"><legend>日本側の締結主体</legend><div class="ex-cks">${JAPAN_ORG_TYPES.map(t => ck('ot', t.code, t.ja, st.ot.includes(t.code), cnt(fc?.ot, t.code), t.desc)).join('')}</div></fieldset>
    <fieldset class="ex-fs"><legend>当事者の組み合わせ</legend><div class="ex-cks">${PAIR_KINDS.map(t => ck('pk', t.code, t.ja, st.pk.includes(t.code), cnt(fc?.pk, t.code), t.desc)).join('')}</div></fieldset>
    <fieldset class="ex-fs"><legend>締結年（更新・再締結がある協定は最初に締結した年）</legend>
      <div class="ex-years"><select id="ex-y1" aria-label="締結年（から）">${yopt(st.y1)}</select><span>から</span><select id="ex-y2" aria-label="締結年（まで）">${yopt(st.y2)}</select><span>まで</span></div></fieldset>
    <fieldset class="ex-fs"><legend>相手国を比べる（4か国まで）</legend>
      <select id="ex-c2"><option value="">国・地域を追加…</option>${cs.filter(c => !st.c.includes(c)).map(c => `<option value="${c}">${esc(countryName(db, c))}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="ex-color"${st.color === 'country' ? ' checked' : ''}${st.c.length < 2 ? ' disabled' : ''}> 地図を相手国ごとに色分けする（2〜4か国を選んだとき）</label></fieldset>
    <fieldset class="ex-fs"><legend>地図の表示</legend><label class="check"><input type="checkbox" id="ex-names"${st.names ? ' checked' : ''}> 地図に県名を表示する</label>
      <p class="small"><a href="#/impact">地域への影響の記録を地図で見る</a>（別のページ）</p></fieldset>
    <p><button type="button" class="btn btn-small btn-outline" data-defaults>件数の初期設定に戻す（有効確認のみ・MOUのみ）</button></p>`;
}

function renderNow(db, st) {
  const tags = conditionTags(db, st, { pref: c => prefName(db, c), country: c => countryName(db, c) });
  const changed = tags.length || st.doc !== 'all';
  view.root.querySelector('#ex-now').innerHTML = `<div class="ex-now-in"><span class="ex-now-k">いまの条件</span>
    <span class="chips">${tags.map(t => `<span class="chip">${esc(t.label)}<button type="button" data-rm="${t.key}" data-rv="${esc(t.value || '')}" aria-label="「${esc(t.label)}」の条件を外す">×</button></span>`).join('') || '<span class="small muted">条件なし（登録した締結済みの協定すべて。公式資料で確認できたもの）</span>'}</span>
    ${changed ? '<button type="button" class="btn btn-small btn-outline" data-clear>すべて解除</button>' : ''}</div>`;
}

// ---------- 件数 ----------
function renderSummary(db, st, res, keyword, fc) {
  const one = st.p.length === 1 ? prefName(db, st.p[0]) : st.p.length ? '選んだ地域' : null;
  const parts = st.p.length
    ? ['prefecture', 'municipality', 'organization'].map(l => `${ROLE_LABEL[l](one)} ${res.byLevel[l]}件`)
    : LEVEL_ORDER.filter(l => res.byLevel[l] || ['prefecture', 'national'].includes(l)).map(l => `${LV_LABEL[l]} ${res.byLevel[l]}件`);
  // 有効性の内訳：同じ条件で有効性だけを問わずに数え、いまの条件で表示しているか・していないかを示す
  // 選択肢ごとの件数（facetCounts）をそのまま使う：有効性だけを問わない件数・文書の種類だけを問わない件数・実施状況ごとの件数
  const vAll = Object.fromEntries(VALIDITIES.map(v => [v.code, fc.vs.get(v.code) || 0]));
  const vItems = VALIDITIES.filter(v => vAll[v.code]).map(v => `<li class="${st.vs.includes(v.code) ? 'is-on' : 'is-off'}">${esc(v.ja)} <b>${vAll[v.code]}</b>件<span class="sc-s">${st.vs.includes(v.code) ? '表示中' : '非表示'}</span></li>`).join('');
  const docOut = (fc.doc.get('all') || 0) - (fc.doc.get(st.doc) || 0);
  const btns = [
    !st.vs.includes('unconfirmed') && vAll.unconfirmed ? `<button type="button" class="btn btn-small btn-outline" data-widen="valid_unk">有効性未確認も表示する（＋${vAll.unconfirmed}件）</button>` : '',
    st.doc !== 'all' && docOut > 0 ? `<button type="button" class="btn btn-small btn-outline" data-doc="all">MOU以外の文書も表示する（＋${docOut}件）</button>` : '',
  ].filter(Boolean).join('');
  const coverage = !st.f.length || st.f.some(f => f !== 'labor') ? fieldCoverageNote(db, st.f.length === 1 ? st.f[0] : null) : null;
  // 事業の実施状況の内訳（有効性とは別に数える）。押すとその実施状況に絞り込む
  const sc = fc.s;
  const sItems = [...STATUSES, STATUS.planned].filter(s => sc.get(s.code)).map(s => `<li><button type="button" class="linklike" data-s1="${s.code}" aria-pressed="${st.s.length === 1 && st.s[0] === s.code}" title="${esc(s.desc)}">${esc(s.ja)}</button> <b>${sc.get(s.code)}</b>件</li>`).join('');
  const openVd = view.root.querySelector('#ex-vd')?.open || view.ctx.params.get('focus') === 'status';
  view.root.querySelector('#ex-sum').innerHTML = `<div class="ex-count">
      <p class="ex-count-main"><span class="ex-count-k">${esc(one ? `${one}に関係する協定` : '条件に合う協定')}</span><b>${res.scoped.length}</b>件</p>
      <p class="ex-count-sub">${esc(parts.join('・'))}${st.p.length && res.nationalOut ? `<br><span class="small">このほか国・省庁の協定（全国が対象）${res.nationalOut}件は、地域の件数に含めていません。<button type="button" class="linklike" data-rm="p" data-rv="${esc(st.p[0])}" data-lv-after="national">国・省庁の協定を見る</button></span>` : ''}</p>
    </div>
    ${vItems || sItems ? `<details class="ex-vd" id="ex-vd"${openVd ? ' open' : ''}><summary>有効性・事業の実施状況の内訳と、表示していない協定</summary>
      <div class="ex-vd-in"><div><p class="ex-vd-h">協定の有効性（同じ条件で、有効性を問わずに数えた件数）</p><ul class="ex-vlist">${vItems}</ul>
      ${docOut > 0 && st.doc !== 'all' ? `<p class="small">このほか「${esc(DOC_PRESETS.find(d => d.code === st.doc).ja)}」以外の文書（R/D・EPA・交換公文・取決めなど）${docOut}件は表示していません。</p>` : ''}</div>
      <div><p class="ex-vd-h">事業の実施状況（協定の有効性とは別のもの）</p><ul class="ex-slist">${sItems}</ul></div></div>
      <p class="small muted">同じ協定の更新・再締結は1件と数えます。「有効性未確認」は、今も有効かを公式資料で確かめられていないもので、終了したという意味ではありません。「有効確認」の協定でも、具体的な事業が確認できていないものがあります。<a href="#/about?to=ab-read">件数の数え方</a></p></details>` : ''}
    ${btns ? `<div class="btn-row ex-widen">${btns}</div>` : ''}
    ${coverage && !keyword ? `<p class="ex-cover small">${esc(coverage)}</p>` : ''}`;
}

// ---------- 地図 ----------
function renderMap(db, st, res, keyword) {
  const { map, root } = view;
  const geoNames = code => db.prefByCode.get(code)?.name || '';
  if (!res) {
    map.update({ fill: () => '#eef2ef', label: () => null, tip: c => `<b>${esc(geoNames(c))}</b>`, selected: st.p });
    root.querySelector('#ex-map-h').textContent = '都道府県が締結した協定の件数';
    return;
  }
  const counts = res.mapCounts;
  // 都道府県ごとの、市区町村・団体などの協定の数（地図の色には含めない。吹き出しと選択中の欄で別に示す）
  const city = new Map(), org = new Map();
  for (const g of res.base) {
    if (g.level === 'municipality' && g.pref_code) city.set(g.pref_code, (city.get(g.pref_code) || 0) + 1);
    if (g.level === 'organization') for (const r of new Set(g.regions)) org.set(r, (org.get(r) || 0) + 1);
  }
  // いまの条件では0件だが、有効性・文書の範囲を広げると締結済みの協定がある県（「該当なし」などと区別する）
  const wst = { ...st, vs: V_PRESET.all.states, doc: 'all', cat: [] };
  const wider = new Map();
  for (const g of db.groups) if (g.level === 'prefecture' && g.pref_code && (!keyword || keyword.has(g.key)) && passBase(g, wst)) wider.set(g.pref_code, (wider.get(g.pref_code) || 0) + 1);
  const zero = code => wider.get(code) ? 'scope_zero' : zeroState(db, code, st.f.length === 1 ? st.f[0] : null);
  const present = new Set(db.prefs.filter(p => !counts.get(p.code)).map(p => zero(p.code)));
  const zeroLegend = Object.entries(ZERO_STATES).filter(([k]) => present.has(k)).map(([k, v]) => ({ label: v.ja, fill: PATTERNS[k] }));
  let fill, legend, legendTitle;
  const max = Math.max(0, ...counts.values());
  const byCountry = st.color === 'country' && st.c.length > 1;
  if (byCountry) {
    const cs = st.c.slice(0, 4);
    const colorOf = new Map(cs.map((c, i) => [c, COUNTRY_COLORS[i]]));
    const perPref = new Map();
    for (const g of res.base) if (g.level === 'prefecture' && g.pref_code) {
      const s = perPref.get(g.pref_code) || new Set();
      for (const c of g.countries) if (colorOf.has(c)) s.add(c);
      perPref.set(g.pref_code, s);
    }
    fill = code => { const s = perPref.get(code); if (!s || !s.size) return PATTERNS[zero(code)]; return s.size > 1 ? MULTI : colorOf.get([...s][0]); };
    legendTitle = '色＝都道府県が締結した協定の相手国';
    legend = [...cs.map((c, i) => ({ label: countryName(db, c), fill: COUNTRY_COLORS[i] })), { label: '選んだ国のうち2か国以上', fill: MULTI }, ...zeroLegend];
  } else {
    const sc = seqScale(max);
    fill = code => counts.get(code) ? sc.color(counts.get(code)) : PATTERNS[zero(code)];
    legendTitle = '都道府県が締結した協定の件数（色が濃いほど多い）';
    legend = [...(max ? sc.bins.map(b => ({ label: b.label, fill: b.fill })) : []), ...zeroLegend];
  }
  const tipLine = code => {
    const n = counts.get(code) || 0;
    const head = n ? `県が締結：${n}件` : `県が締結：${zero(code) === 'scope_zero' ? `${ZERO_STATES.scope_zero.ja}（範囲を広げると${wider.get(code)}件）` : ZERO_STATES[zero(code)].ja}`;
    const extra = [city.get(code) ? `県内の市区町村 ${city.get(code)}件` : '', org.get(code) ? `関連事業（団体など）${org.get(code)}件` : ''].filter(Boolean).join('・');
    return head + (extra ? `<br><span class="small">別に数えるもの：${extra}</span>` : '');
  };
  const label = code => {
    const n = counts.get(code);
    const short = db.prefByCode.get(code).short;
    if (st.names) return n ? `${short} ${n}` : short;
    return n ? String(n) : null;
  };
  map.update({ fill, label, selected: st.p, tip: code => `<b>${esc(geoNames(code))}</b><br>${tipLine(code)}` });
  root.querySelector('#ex-map-h').textContent = byCountry ? `${st.c.slice(0, 4).map(c => countryName(db, c)).join('・')}と協定を結んだ都道府県` : '都道府県が締結した協定の件数';
  root.querySelector('#ex-legend').innerHTML = legendHTML(legendTitle, legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })))
    + '<p class="small muted ex-legend-note">地図の色と数字は、都道府県が自ら締結した協定だけを数えています（県内の市区町村・団体などの協定、国・省庁の協定は含みません）。</p>';

  // 選択中の地域（マウスを重ねなくても、押せば件数が分かるように地図のすぐ下に表示）
  const sel = root.querySelector('#ex-sel');
  if (st.p.length === 1) {
    const code = st.p[0], pn = geoNames(code);
    sel.innerHTML = `<div class="sel-box"><span class="sel-k">選択中</span><b>${esc(pn)}</b>
      <span class="sel-n">${tipLine(code).replace(/<br>/, '／')}</span>
      <span class="sel-btns"><a class="btn btn-small" href="#ex-list" data-jump-list>一覧を見る</a><a class="btn btn-small btn-outline" href="#/pref/${code}">${esc(pn)}の詳しいページ</a>
      <button type="button" class="btn btn-small btn-outline" data-rm="p" data-rv="${code}">選択を解除</button></span></div>`;
  } else if (st.p.length > 1) {
    sel.innerHTML = `<div class="sel-box"><span class="sel-k">選択中</span><b>${esc(st.p.map(geoNames).join('・'))}</b><button type="button" class="btn btn-small btn-outline" data-clear-p>選択を解除</button></div>`;
  } else {
    sel.innerHTML = '<p class="sel-hint">都道府県を押すと、その地域の協定に絞り込めます（もう一度押すと解除）。</p>';
  }
  // 全国が対象の協定（国・省庁）は、都道府県の件数とは別
  const nat = res.base.filter(g => g.level === 'national').length;
  root.querySelector('#ex-nat').innerHTML = `<div class="national-box"><span class="small"><b>全国が対象：国・省庁が締結した協定</b></span>
    <span><span class="n">${nat}</span> 件（同じ条件。都道府県の件数とは別に数えます）</span>
    ${nat ? `<button type="button" class="linklike" data-lv="national"${st.p.length ? ' data-clear-p-first' : ''}>一覧で見る</button>` : ''}</div>`;
  // 都道府県別の件数表（開いたときだけ作る）
  const det = root.querySelector('#ex-table').closest('details');
  const table = () => {
    const rows = db.prefs.map(p => {
      const n = counts.get(p.code) || 0;
      return `<tr class="clickable${st.p.includes(p.code) ? ' is-selected' : ''}" data-pref="${p.code}" tabindex="0"><td>${esc(p.name)}</td><td class="num">${n || '—'}</td><td class="num">${city.get(p.code) || '—'}</td><td class="num">${org.get(p.code) || '—'}</td><td>${esc(n ? '' : (zero(p.code) === 'scope_zero' ? ZERO_STATES.scope_zero.ja : ZERO_STATES[zero(p.code)].ja))}</td></tr>`;
    }).join('');
    root.querySelector('#ex-table').innerHTML = `<p class="small">国の省庁が締結した協定は全国が対象のため、都道府県の件数に含めず別に数えています。同じ協定の更新・再締結は1件と数えます。色のない県（模様）は、0件の理由（該当なし／調査したが確認できず／調査が一部のみ／未調査／いまの条件では0件）で塗り分けています。地図：国土数値情報（行政区域データ）を加工。一部の離島は表示していません。</p>
      <div class="table-wrap"><table><thead><tr><th>都道府県</th><th class="num">県が締結</th><th class="num">県内の市区町村</th><th class="num">関連事業（団体など）</th><th>0件の理由</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">行を押すと、その都道府県を選択します。</p>`;
  };
  if (!det._bound) { det._bound = true; det.addEventListener('toggle', () => { if (det.open) view.table(); }); }
  view.table = table;
  if (det.open) table();
  view.mapExport = { fill, label: byCountry ? null : code => counts.get(code) ? String(counts.get(code)) : null, legend, legendTitle, counts, title: root.querySelector('#ex-map-h').textContent };
}

// ---------- 一覧 ----------
function renderList(db, st, res, keyword, parsed) {
  const { root } = view;
  const one = st.p.length === 1 ? prefName(db, st.p[0]) : '選んだ地域';
  const tabs = st.p.length ? ['prefecture', 'municipality', 'organization'] : LEVEL_ORDER;
  const label = l => st.p.length ? ROLE_LABEL[l](one) : LV_LABEL[l];
  root.querySelector('#ex-tabs').innerHTML = `<span class="ex-tabs-k">締結主体：</span>`
    + `<button type="button" data-lv="all" aria-pressed="${st.lv === 'all'}">すべて<span class="fc">${res.scoped.length}</span></button>`
    + tabs.filter(l => res.byLevel[l] || st.lv === l).map(l => `<button type="button" data-lv="${l}" aria-pressed="${st.lv === l}">${esc(label(l))}<span class="fc">${res.byLevel[l]}</span></button>`).join('');
  const sorts = keyword ? ['rel', 'new', 'old'] : ['new', 'old'];
  root.querySelector('#ex-tools').innerHTML = res.shown.length ? `<label class="small" for="ex-sort">並べ方</label>
    <select id="ex-sort">${sorts.map(k => opt(k, SORTS[k], st.sort === k)).join('')}</select>
    <button type="button" class="btn btn-small btn-outline" id="ex-csv">この一覧をCSVで保存（${res.shown.length}件）</button>` : '';
  // 組織名として一致したとき（締結主体として結んだ協定と、出典の資料を出しただけの協定を分けて案内）
  root.querySelector('#ex-org').innerHTML = keyword ? orgNoticeHTML(db, parsed) : '';
  view.list = { db, st, res, keyword, parsed };
  const list = root.querySelector('#ex-list');
  if (!res.shown.length) {
    list.innerHTML = zeroHTML(db, st, res, keyword, parsed);
    root.querySelector('#ex-more').innerHTML = '';
    return;
  }
  list.innerHTML = cardsHTML(0, Math.min(view.limit, res.shown.length));
  moreButton();
}
function cardsHTML(from, to) {
  const { db, st, res, keyword } = view.list;
  const one = st.p.length === 1 ? prefName(db, st.p[0]) : '選んだ地域';
  return res.shown.slice(from, to).map(g => mouCard(db, g, {
    role: st.p.length ? ROLE_LABEL[res.role.get(g)](one) + (res.role.get(g) === 'organization' ? `。${one}が締結した協定ではありません` : '') : '',
    extra: keyword ? hitHTML(keyword.get(g.key)) : '',
    showSources: !!keyword,
  })).join('');
}
function moreButton() {
  const { res } = view.list;
  const shownN = Math.min(view.limit, res.shown.length);
  const rest = res.shown.length - shownN;
  view.root.querySelector('#ex-more').innerHTML = `<p class="ex-range small muted">${res.shown.length}件中 ${shownN}件を表示しています</p>`
    + (rest > 0 ? `<p><button type="button" class="btn btn-outline ex-more-btn" data-more>もっと見る（残り${rest}件）</button></p>` : '');
}
function showMore() {
  const { res } = view.list;
  const from = Math.min(view.limit, res.shown.length);
  view.limit += PAGE_MORE;
  const to = Math.min(view.limit, res.shown.length);
  // 作り直さず、続きのカードだけを足す
  const list = view.root.querySelector('#ex-list');
  list.insertAdjacentHTML('beforeend', cardsHTML(from, to));
  history.replaceState({ ...(history.state || {}), limit: view.limit }, '');
  moreButton();
  list.children[from]?.querySelector('a')?.focus({ preventScroll: true });
}

// キーワードに一致した項目（言葉ごと）と、本文などの一致した箇所
function hitHTML(r) {
  if (!r || !r.hits.length) return '';
  const TEXTY = ['content', 'title', 'project', 'number', 'budget', 'note', 'signatory', 'related_org', 'related_region', 'source', 'partner_org', 'japan_org'];
  const lines = r.hits.map(h => {
    const fields = h.fields.map(k => S.SEARCH_FIELD[k].ja);
    const k = TEXTY.find(x => h.fields.includes(x) && x !== 'title');
    const show = k && !h.fields.includes('title') && !['country', 'region'].some(x => h.fields.includes(x)) ? `<span class="sr-snip">${S.SEARCH_FIELD[k].ja}：${S.snippet(h.at[k], esc)}</span>` : '';
    return `<li><b>「${esc(h.token.text)}」</b>→ ${esc(fields.join('、'))}${show}</li>`;
  });
  return `<div class="sr-hit"><span class="sr-hit-k">一致した項目</span><ul>${lines.join('')}</ul></div>`;
}

// 言葉が組織の名前（略称・別名を含む）とぴったり一致したときの案内
function orgNoticeHTML(db, parsed) {
  if (!parsed) return '';
  const lines = [];
  const seen = new Set();
  for (const t of parsed.tokens) for (const e of S.exactOrgs(db, t).slice(0, 3)) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    const signed = e.sign.filter(g => !g.planned).length;
    const roles = [
      e.sign.length ? `<b>締結主体として ${signed}件</b>` : '<b>締結主体としての登録はありません</b>',
      e.co.length ? `共同の締結者として ${e.co.length}件` : '',
      e.src.length ? `情報源${e.clair ? '・照合資料' : ''}として ${e.src.length}件（この組織が締結した協定ではありません）` : '',
    ].filter(Boolean).join('／');
    lines.push(`<li><span class="small muted">「${esc(t.text)}」→</span> <a href="#/actors?${new URLSearchParams({ o: e.key, q: t.text })}">${esc(e.name)}</a> <span class="small">（${esc(S.orgTypeLabel(e))}）</span><br>${roles}
      ${e.clair ? '<br><span class="small">CLAIRは協定の当事者ではなく、2020年1月時点の「協定等締結状況」の作成元です（<a href="#/about?to=ab-clair">照合結果</a>）。</span>' : ''}</li>`);
  }
  if (!lines.length) return '';
  return `<div class="org-notice"><p class="org-notice-h">組織名として一致</p><ul>${lines.join('')}</ul>
    <p class="small muted">名前を押すと、その組織が締結した協定を有効性を問わず一覧にします。下の一覧には、本文・出典などに名前が出てくる協定も含まれます（「一致した項目」で区別できます）。</p></div>`;
}

// 0件のとき：条件を1つ外すと何件になるかを示す。キーワードに一致する登録がそもそもないときは、そのことを区別して説明する
function zeroHTML(db, st, res, keyword, parsed) {
  if (keyword && !keyword.size) {
    const notes = [];
    for (const t of parsed.tokens) for (const k of t.kinds) {
      if (k.kind === 'pref') {
        const s = db.survey.prefectures?.[k.code] || {};
        notes.push(`${esc(prefName(db, k.code))}の調査状況：外国人材・労働の協定＝${esc(SURVEY_RESULT[s.stage1?.result || 'not_surveyed'])}、その他の分野＝${esc(SURVEY_RESULT[s.stage2?.result || 'not_surveyed'])}`);
      }
      if (k.kind === 'country') notes.push(`${esc(countryName(db, k.code))}との協定は「相手国・地域」の条件で選べます`);
    }
    const tc = parsed.tokens.length > 1 ? S.tokenCounts(db, parsed) : [];
    return `<div class="zero zero-unknown"><p class="zero-h">現在の登録データでは確認できません</p>
      <p>このサイトに登録した文書の中に、${parsed.tokens.length > 1 ? 'すべての言葉を含む' : 'この言葉を含む'}ものはありません。<b>協定が存在しないという意味ではありません。</b>このサイトは、調査した範囲で公式資料により確認できた協定だけを登録しています。</p>
      ${tc.length ? `<p class="small">言葉ごとの件数：${tc.map(x => `「${esc(x.token.text)}」${x.n}件`).join('／')}</p>` : ''}
      ${notes.length ? `<ul class="small">${[...new Set(notes)].map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      <p class="small">言葉を短くする、別の言い方（略称・正式名称・英語名）にすると見つかることがあります。調べた範囲は<a href="#/about?to=ab-scope">調査状況</a>で確認できます。</p></div>`;
  }
  const tags = conditionTags(db, st, { pref: c => prefName(db, c), country: c => countryName(db, c) }).filter(t => t.key !== 'q');
  const okKw = g => !keyword || keyword.has(g.key);
  const countWithout = t => {
    const n = removeTag(st, t.key, t.value);
    return db.groups.filter(g => okKw(g) && passBase(g, n) && (!n.p.length || regionRole(g, n.p))).length;
  };
  const lvNote = st.lv !== 'all' && res.scoped.length ? `<p>締結主体を「すべて」にすると ${res.scoped.length}件あります。<button type="button" class="btn btn-small btn-outline" data-lv="all">すべてを表示</button></p>` : '';
  const zp = st.p.length === 1 && !keyword ? ZERO_STATES[zeroState(db, st.p[0], st.f.length === 1 ? st.f[0] : null)] : null;
  return `<div class="zero zero-none"><p class="zero-h">条件に合う協定はありません</p>
    ${lvNote}
    ${zp ? `<p class="small">${esc(prefName(db, st.p[0]))}の調査状況：${esc(zp.ja)}（${esc(zp.desc)}）。<a href="#/pref/${st.p[0]}">${esc(prefName(db, st.p[0]))}の詳しいページ</a></p>` : ''}
    ${tags.length ? `<p class="small">条件を1つ外すと見つかる件数：</p><ul class="zero-list">${tags.map(t => `<li><button type="button" class="btn btn-small btn-outline" data-rm="${t.key}" data-rv="${esc(t.value || '')}">「${esc(t.label)}」を外す（${countWithout(t)}件）</button></li>`).join('')}</ul>` : ''}</div>`;
}

// ---------- 操作 ----------
function onClick(e) {
  const t = e.target;
  const st = view.st;
  const b = t.closest('button, a, tr[data-pref]');
  if (!b) return;
  if (b.matches('[data-panel]')) return setPanel(view.root.querySelector('#ex-panel').classList.contains('is-closed'));
  if (b.matches('[data-retry]')) return refresh();
  if (b.matches('[data-ex]')) { view.root.querySelector('#ex-q').value = b.dataset.ex; return apply({ q: b.dataset.ex, sort: 'rel' }); }
  if (b.matches('[data-v]')) return apply({ vs: [...V_PRESET[b.dataset.v].states] });
  if (b.matches('[data-widen]')) return apply({ vs: [...new Set([...st.vs, ...V_PRESET[b.dataset.widen].states])].sort((x, y) => V_PRESET.any.states.indexOf(x) - V_PRESET.any.states.indexOf(y)) });
  if (b.matches('[data-doc]')) return apply({ doc: b.dataset.doc });
  if (b.matches('[data-s1]')) return apply({ s: st.s.length === 1 && st.s[0] === b.dataset.s1 ? [] : [b.dataset.s1] });
  if (b.matches('[data-rm]')) {
    const n = removeTag(st, b.dataset.rm, b.dataset.rv);
    if (b.dataset.lvAfter) n.lv = b.dataset.lvAfter;
    if (b.dataset.rm === 'q') view.root.querySelector('#ex-q').value = '';
    return apply(n);
  }
  if (b.matches('[data-clear]')) { view.root.querySelector('#ex-q').value = ''; return apply(clearAll(st)); }
  if (b.matches('[data-clear-p]')) return apply({ p: [], lv: 'all' });
  if (b.matches('[data-defaults]')) { view.root.querySelector('#ex-q').value = ''; return apply(defaults(st)); }
  if (b.matches('[data-lv]')) return apply(b.dataset.clearPFirst !== undefined ? { lv: b.dataset.lv, p: [] } : { lv: b.dataset.lv });
  if (b.matches('[data-more]')) return showMore();
  if (b.matches('[data-jump-list]')) { e.preventDefault(); view.root.querySelector('#ex-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (b.matches('tr[data-pref]')) return apply({ p: st.p.length === 1 && st.p[0] === b.dataset.pref ? [] : [b.dataset.pref], lv: 'all' });
  if (b.id === 'ex-csv') return saveCSV();
  if (b.id === 'ex-png') return savePNG();
}
function onChange(e) {
  const t = e.target;
  const st = view.st;
  const val = t.value;
  if (t.id === 'ex-p') return apply({ p: val ? [val] : [], lv: 'all' });
  if (t.id === 'ex-c') return apply({ c: val ? [val] : [], color: 'count' });
  if (t.id === 'ex-c2' && val) { const c = [...st.c, val].slice(-4); return apply({ c, color: c.length > 1 ? 'country' : 'count' }); }
  if (t.id === 'ex-f') return apply({ f: val ? [val] : [] });
  if (t.id === 'ex-s') return apply({ s: val ? [val] : [] });
  if (t.id === 'ex-sort') return apply({ sort: val });
  if (t.id === 'ex-y1' || t.id === 'ex-y2') return apply({ [t.id === 'ex-y1' ? 'y1' : 'y2']: Number(val) || null });
  if (t.id === 'ex-names') return apply({ names: t.checked }, { replace: true });
  if (t.id === 'ex-color') return apply({ color: t.checked ? 'country' : 'count' });
  if (t.id === 'ex-news') {
    // 報道のみの情報を含めるかは、ほかのページと共有する設定（次に開いたときも同じ）
    settings.includeNews = t.checked;
    try { localStorage.setItem('mou.includeNews', t.checked ? '1' : '0'); } catch (err) { /* 保存できない環境では何もしない */ }
    return apply({ ev: t.checked ? [] : ['official'] });
  }
  if (t.dataset.ck) {
    const k = t.dataset.ck;
    const cur = st[k];
    const next = t.checked ? [...new Set([...cur, val])] : cur.filter(x => x !== val);
    return apply({ [k]: k === 'vs' ? V_PRESET.any.states.filter(s => next.includes(s)) : next });
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('[data-page="explore"] tr[data-pref]')) e.target.click();
});

async function saveCSV() {
  const ctx = view.ctx;
  const btn = view.root.querySelector('#ex-csv');
  if (btn) btn.disabled = true;
  try {
    const [db, csv] = await Promise.all([ctx.needFull(), import('./csv.js')]);
    // 全データで同じ条件の一覧を作り直してから保存する（索引には出典などが入っていないため）
    const st = view.st;
    let keyword = null;
    if (st.q) { const s = await ensureSearch(); keyword = new Map(s.searchGroups(db, s.parseQuery(db, st.q)).map(r => [r.g.key, r])); }
    const res = computeResults(db, st, keyword);
    const cond = conditionTags(db, st, { pref: c => prefName(db, c), country: c => countryName(db, c) }).map(t => t.label).join('／') || '条件なし';
    csv.downloadMouCSV(db, csv.groupsToMous(res.shown), 'mou_list.csv', `協定を探す：${cond}${st.lv !== 'all' ? `（締結主体：${LV_LABEL[st.lv]}）` : ''}`);
  } finally {
    const b = view.root.querySelector('#ex-csv');
    if (b) b.disabled = false;
  }
}
async function savePNG() {
  const { ctx, st, mapExport: m } = view;
  if (!m) return;
  const db = ctx.db;
  const ex = await import('./export.js');
  const top = [...m.counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${prefName(db, c)}　${n}件`);
  const cond = conditionTags(db, st, { pref: c => prefName(db, c), country: c => countryName(db, c) }).map(t => t.label).join('／') || '条件なし（締結済みすべて）';
  const sum = [...m.counts.values()].reduce((a, b) => a + b, 0);
  ex.exportMap(db, {
    title: m.title,
    sub: `都道府県が締結 ${sum}件（市区町村・団体・国の協定は含まない）／${cond}`,
    fill: m.fill, label: m.label, selected: st.p, legend: m.legend, legendTitle: m.legendTitle,
    side: top.length && m.label ? [{ text: '件数の多い都道府県', bold: true, size: 30 }, { text: top.join('、'), size: 28 }] : [],
    meta: {
      region: '全国47都道府県（都道府県が締結したもの）',
      cond,
      period: `${fmtDate(db.config.data_as_of)}時点`,
      source: '各都道府県・省庁・相手国政府の公式発表、協定原文ほか（個別の出典はサイトの各協定のページに掲載）',
      checked: fmtDate(db.config.data_as_of),
    },
    filename: 'mou-map.png',
  });
}
