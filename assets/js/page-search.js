// 「サイト内検索」のページ。キーワードは消さずに、結果の中で締結主体・相手国・都道府県・文書の種類・有効性・分野・締結年で絞り込める。
// 条件を変えると件数と一覧がその場で変わり、条件はアドレス（#/search?q=…）にも残るので、共有したリンクでも同じ結果になる。
import { esc, debounce } from './util.js';
import { validityCounts, levelBreakdown, countTriple, prefName, countryName, SURVEY_RESULT, VALIDITY, FIELD } from './data.js';
import { parseQuery, searchGroups, applyFacets, facetCounts, sortResults, tokenCounts, snippet, expandKinds, FACETS, SEARCH_FIELD } from './search.js';
import { exactOrgs, orgTypeLabel } from './orgs.js';
import { mouCard } from './components.js';
import { downloadMouCSV, groupsToMous } from './csv.js';
import { defaultsNoteHTML } from './shared.js';

const EXAMPLES = ['NAGOMi', 'JITCO R/D', 'CLAIR', '宮城県 ベトナム', 'インドネシア 介護', '外務省 EPA', 'ベトナム 技能実習', '団体間'];
const PAGE = 40;
const FACET_SHOW = { c: 12, p: 12 };

// アドレスの条件を読む（v・doc は「数え方」に使っているので、有効性は vs とする）
function readState(db, params) {
  const list = k => (params.get(k) || '').split(',').filter(Boolean);
  const year = k => { const y = Number(params.get(k)); return y >= 1900 && y <= 2100 ? y : null; };
  const sel = Object.fromEntries(FACETS.map(f => [f.key, list(f.key)]));
  // 文書の種類は詳しい区分で選ぶ（以前のリンクの cat=mou_moc は、MOU・MOC・協定書などの3つに読み替える）
  sel.cat = expandKinds(sel.cat);
  return {
    q: params.get('q') || '',
    sel: { ...sel, y1: year('y1'), y2: year('y2') },
    sort: ['rel', 'new', 'old'].includes(params.get('sort')) ? params.get('sort') : 'rel',
    limit: PAGE,
  };
}
function stateHash(st) {
  const p = new URLSearchParams();
  if (st.q) p.set('q', st.q);
  for (const f of FACETS) if (st.sel[f.key].length) p.set(f.key, st.sel[f.key].join(','));
  if (st.sel.y1) p.set('y1', st.sel.y1);
  if (st.sel.y2) p.set('y2', st.sel.y2);
  if (st.sort !== 'rel') p.set('sort', st.sort);
  const qs = p.toString();
  return '#/search' + (qs ? '?' + qs : '');
}
const selCount = sel => FACETS.reduce((a, f) => a + sel[f.key].length, 0) + (sel.y1 ? 1 : 0) + (sel.y2 ? 1 : 0);

export function searchPage(ctx) {
  const { db, app } = ctx;
  const st = readState(db, ctx.params);
  app.innerHTML = `<div data-page="search"><div class="page-head">
      <div class="crumbs"><a href="#/">トップ</a> ＞ サイト内検索</div>
      <h1>サイト内検索</h1>
      <p class="lead">協定名・本文・締結機関・署名者・担当省庁・地域・相手国・制度・事業・人数・予算・出典など、登録したすべての項目から探せます。</p>
    </div>
    <form class="sr-form" id="sr-form" role="search">
      <label class="visually-hidden" for="sr-q">検索する言葉</label>
      <input type="search" id="sr-q" value="${esc(st.q)}" placeholder="例：宮城県 ベトナム" autocomplete="off">
      <button class="btn" type="submit">検索</button>
    </form>
    <p class="sr-hint">言葉をスペースで区切ると、<b>すべての言葉を含む協定</b>を探します（例：「インドネシア 介護」）。
      表記ゆれ（CLAIR／クレア／自治体国際化協会、ベトナム／Viet Nam、R/D／討議議事録 など）は同じ言葉として探します。</p>
    <p class="sr-examples"><span class="small muted">例：</span>${EXAMPLES.map(x => `<button type="button" class="chip-link" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</p>
    ${defaultsNoteHTML('search')}
    <div id="sr-cond" class="result-bar" aria-live="polite"></div>
    <div id="sr-org" aria-live="polite"></div>
    <div class="sr-layout">
      <aside class="sr-facets" aria-labelledby="sr-f-h">
        <details id="sr-fd" open><summary id="sr-f-h">結果をさらに絞り込む</summary><div id="sr-facets"></div></details>
      </aside>
      <div class="sr-main">
        <div id="sr-sum" aria-live="polite"></div>
        <div id="sr-res"></div>
      </div>
    </div></div>`;
  const input = app.querySelector('#sr-q');
  const header = document.getElementById('global-q');
  if (header) header.value = st.q;
  // スマートフォンでは絞り込みを最初は閉じておく
  if (window.matchMedia('(max-width: 860px)').matches && !selCount(st.sel)) app.querySelector('#sr-fd').open = false;

  const update = (opts = {}) => {
    // 入力の途中でほかのページへ移ったときは何もしない
    if (!app.contains(input)) return;
    history.replaceState(null, '', stateHash(st));
    render(ctx, st, opts);
  };
  const live = debounce(() => { st.q = input.value.trim(); st.limit = PAGE; update(); }, 250);
  input.addEventListener('input', e => { if (!e.isComposing) live(); });
  input.addEventListener('compositionend', live);
  app.querySelector('#sr-form').addEventListener('submit', e => { e.preventDefault(); st.q = input.value.trim(); st.limit = PAGE; update(); });
  app.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.ex; st.q = b.dataset.ex; st.limit = PAGE; update(); }));
  // 絞り込みの操作（キーワードはそのまま残す）。ページの部品に付けるので、ほかのページに移ると一緒に消える
  const root = app.querySelector('[data-page="search"]');
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-fk]');
    if (b) {
      const k = b.dataset.fk, v = b.dataset.fv;
      st.sel[k] = st.sel[k].includes(v) ? st.sel[k].filter(x => x !== v) : [...st.sel[k], v];
      st.limit = PAGE;
      return update({ focus: `[data-fk="${k}"][data-fv="${v}"]` });
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const [k, v] = rm.dataset.rm.split(':');
      if (k === 'y1' || k === 'y2') st.sel[k] = null; else st.sel[k] = st.sel[k].filter(x => x !== v);
      return update();
    }
    if (e.target.closest('[data-clear-facets]')) { for (const f of FACETS) st.sel[f.key] = []; st.sel.y1 = st.sel.y2 = null; return update(); }
    if (e.target.closest('[data-clear-q]')) { st.q = ''; input.value = ''; return update(); }
    if (e.target.closest('[data-more]')) { st.limit += PAGE; return update({ keep: true }); }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('#sr-y1, #sr-y2')) { st.sel[e.target.id === 'sr-y1' ? 'y1' : 'y2'] = Number(e.target.value) || null; update({ focus: '#' + e.target.id }); }
    if (e.target.matches('#sr-sort')) { st.sort = e.target.value; update({ focus: '#sr-sort' }); }
  });
  render(ctx, st);
}

function render(ctx, st, opts = {}) {
  const { db, app } = ctx;
  const parsed = parseQuery(db, st.q);
  const matched = searchGroups(db, parsed); // キーワードだけで見つかったもの（全期間・全文書）
  const results = sortResults(applyFacets(matched, st.sel), st.sort);
  const counts = facetCounts(db, matched, st.sel);
  const header = document.getElementById('global-q');
  if (header && document.activeElement !== header) header.value = st.q;

  // ---- いまの検索条件（キーワード・絞り込み・検索の対象） ----
  const chips = [];
  for (const t of parsed.tokens) chips.push(`<span class="chip chip-plain">キーワード：${esc(t.text)}${t.synonyms.length ? `<span class="small">（${esc(t.synonyms.slice(0, 4).join('・'))}${t.synonyms.length > 4 ? ' など' : ''}も含む）</span>` : ''}</span>`);
  for (const f of FACETS) for (const v of st.sel[f.key]) chips.push(`<span class="chip">${esc(f.ja.replace(/（.*）/, ''))}：${esc(f.label(db, v))}<button type="button" data-rm="${f.key}:${esc(v)}" aria-label="${esc(f.label(db, v))}の条件を外す">×</button></span>`);
  if (st.sel.y1) chips.push(`<span class="chip">締結年：${st.sel.y1}年から<button type="button" data-rm="y1:" aria-label="締結年（から）の条件を外す">×</button></span>`);
  if (st.sel.y2) chips.push(`<span class="chip">締結年：${st.sel.y2}年まで<button type="button" data-rm="y2:" aria-label="締結年（まで）の条件を外す">×</button></span>`);
  const vsSel = st.sel.vs;
  const target = vsSel.length
    ? `<b class="sr-narrow">有効性を「${esc(vsSel.map(v => VALIDITY[v]?.ja).join('・'))}」に絞り込んでいます。</b>そのほかの有効性の協定は表示していません。`
    : '登録したすべての協定（期間・有効性・文書の種類を問わず、終了した協定・締結予定・報道のみの情報を含む）から探しています。';
  app.querySelector('#sr-cond').innerHTML = `<div class="now">いまの検索条件</div>
    <p class="sr-target">${target}</p>
    <div class="chips">${chips.join('') || '<span class="small muted">キーワード・絞り込みの条件はありません（すべての登録協定）</span>'}
      ${selCount(st.sel) ? '<button type="button" class="btn btn-small btn-outline" data-clear-facets>絞り込みをすべて外す（キーワードは残す）</button>' : ''}
      ${st.q ? '<button type="button" class="btn btn-small btn-outline" data-clear-q>キーワードを消す</button>' : ''}</div>`;

  // ---- 組織名として一致したとき：締結主体として結んだ協定と、情報源として登場する協定を分けて案内する ----
  app.querySelector('#sr-org').innerHTML = orgNoticeHTML(db, parsed);

  // ---- 絞り込み（選択肢ごとに、選ぶと何件になるか） ----
  app.querySelector('#sr-facets').innerHTML = FACETS.map(f => facetHTML(db, f, counts[f.key], st.sel[f.key])).join('') + yearHTML(counts.years, st.sel);

  // ---- 件数 ----
  const vc = validityCounts(results.map(r => r.g));
  const t3 = countTriple(results.map(r => r.g));
  const showing = Math.min(results.length, st.limit);
  app.querySelector('#sr-sum').innerHTML = results.length ? `<p class="result-summary sr-count">該当 <b>${results.length}</b>件
      <span class="small">（${esc(levelBreakdown(results.map(r => r.g)))}。同じ協定の更新・再締結は1件。登録文書では ${t3.docs}文書）</span></p>
    <p class="small sr-vc">有効性の内訳：有効確認 ${vc.valid_confirmed}件・有効性未確認 ${vc.unconfirmed}件・終了確認 ${vc.ended_confirmed}件・開始前 ${vc.signed_not_started}件${vc.planned ? `・締結予定 ${vc.planned}件` : ''}</p>
    <p class="small muted sr-range">${showing === results.length ? `${results.length}件すべてを表示しています` : `1〜${showing}件目を表示しています（全${results.length}件。下の「さらに表示」で続きを表示）`}</p>
    <div class="sr-tools"><label class="small" for="sr-sort">並べ方</label>
      <select id="sr-sort"><option value="rel"${st.sort === 'rel' ? ' selected' : ''}>一致の度合いが高い順</option><option value="new"${st.sort === 'new' ? ' selected' : ''}>締結日が新しい順</option><option value="old"${st.sort === 'old' ? ' selected' : ''}>締結日が古い順</option></select>
      <button type="button" class="btn btn-small btn-outline" id="sr-csv">この結果をCSVで保存（${results.length}件）</button>
      ${mapLinkHTML(st)}</div>` : '';

  // ---- 結果の一覧（0件のときは理由を区別して表示） ----
  const res = app.querySelector('#sr-res');
  if (!results.length) res.innerHTML = zeroHTML(db, st, parsed, matched);
  else {
    res.innerHTML = `<div class="mou-list">${results.slice(0, st.limit).map(r => mouCard(db, r.g, { extra: hitHTML(r), showActor: true, showSources: true })).join('')}</div>
      ${results.length > st.limit ? `<p><button type="button" class="btn btn-outline" data-more>さらに表示（残り${results.length - st.limit}件）</button></p>` : ''}`;
  }
  app.querySelector('#sr-csv')?.addEventListener('click', () => {
    const cond = [st.q ? `キーワード「${st.q}」` : 'キーワードなし', ...FACETS.filter(f => st.sel[f.key].length).map(f => `${f.ja}：${st.sel[f.key].map(v => f.label(db, v)).join('・')}`), st.sel.y1 ? `${st.sel.y1}年から` : '', st.sel.y2 ? `${st.sel.y2}年まで` : ''].filter(Boolean).join('／');
    downloadMouCSV(db, groupsToMous(results.map(r => r.g)), 'mou_search.csv', `サイト内検索：${cond}（${vsSel.length ? '有効性で絞り込み' : '全期間・すべての有効性・すべての文書'}）`);
  });
  if (opts.focus) app.querySelector(opts.focus)?.focus();
}

// 言葉が組織の名前（略称・別名を含む）とぴったり一致したときの案内。
// 締結主体として結んだ協定と、出典の資料を出しただけ（情報源）の協定を分けて件数を示し、組織の一覧へ案内する
function orgNoticeHTML(db, parsed) {
  const lines = [];
  const seen = new Set();
  for (const t of parsed.tokens) for (const e of exactOrgs(db, t).slice(0, 3)) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    const t3 = countTriple(e.sign);
    const roles = [
      e.sign.length ? `<b>締結主体として ${t3.groups}件</b>（文書 ${t3.docs}件・現在有効と確認 ${t3.valid}件）` : '<b>締結主体としての登録はありません</b>',
      e.co.length ? `共同の締結者として ${e.co.length}件` : '',
      e.src.length ? `情報源${e.clair ? '・照合資料' : ''}として ${e.src.length}件（この組織が締結した協定ではありません）` : '',
    ].filter(Boolean).join('／');
    lines.push(`<li><span class="small muted">「${esc(t.text)}」→</span> <a href="#/actors?${new URLSearchParams({ o: e.key, q: t.text })}">${esc(e.name)}</a> <span class="badge b-actor">${esc(orgTypeLabel(e))}</span><br>${roles}
      ${e.clair ? '<br><span class="small">CLAIRは協定の当事者ではなく、2020年1月時点の「協定等締結状況」の作成元です（<a href="#/about?to=ab-clair">照合結果</a>）。</span>' : ''}</li>`);
  }
  if (!lines.length) return '';
  return `<div class="org-notice"><p class="org-notice-h">組織名として一致</p><ul>${lines.join('')}</ul>
    <p class="small muted">名前を押すと、その組織が締結した協定を有効性を問わず一覧にします。下の検索結果には、本文・出典などに名前が出てくる協定も含まれます（「一致した項目」で区別できます）。</p></div>`;
}

// 検索の絞り込みと同じ条件で、地図を開くリンク（相手国・都道府県・分野・有効性を引き継ぐ）
function mapLinkHTML(st) {
  const s = st.sel;
  const p = {};
  if (s.c.length && s.c.length <= 4) { p.mode = 'country'; p.c = s.c.join(','); }
  else if (s.f.length === 1 && FIELD[s.f[0]]) { p.mode = 'field'; p.f = s.f[0]; }
  else p.mode = 'count';
  if (s.p.length === 1) p.p = s.p[0];
  const v = [...s.vs].sort().join(',');
  const V = { valid_confirmed: 'valid', 'unconfirmed,valid_confirmed': 'valid_unk', 'ended_confirmed,signed_not_started,unconfirmed,valid_confirmed': 'all' };
  if (V[v]) p.v = V[v];
  if (p.mode === 'count' && !p.p && !p.v) return '';
  return `<a class="btn btn-small btn-outline" href="#/map?${new URLSearchParams(p)}" title="地図は「有効性」「数える文書」の設定で数えます">この条件で地図を見る</a>`;
}

function facetHTML(db, f, entries, chosen) {
  if (!entries.length) return '';
  const limit = FACET_SHOW[f.key];
  const btn = ([v, n]) => `<button type="button" data-fk="${f.key}" data-fv="${esc(v)}" aria-pressed="${chosen.includes(v)}"${n === 0 && !chosen.includes(v) ? ' disabled' : ''}${f.desc ? ` title="${esc(f.desc(v))}"` : ''}>${esc(f.label(db, v))}<span class="fc">${n}</span></button>`;
  const head = entries.slice(0, limit || entries.length), rest = limit ? entries.slice(limit) : [];
  const restOpen = rest.some(([v]) => chosen.includes(v));
  return `<fieldset class="facet"><legend>${esc(f.ja)}</legend>
    <div class="facet-opts">${head.map(btn).join('')}</div>
    ${rest.length ? `<details${restOpen ? ' open' : ''}><summary>ほか${rest.length}件</summary><div class="facet-opts">${rest.map(btn).join('')}</div></details>` : ''}
  </fieldset>`;
}
function yearHTML(range, sel) {
  const lo = Math.min(range?.[0] ?? 9999, sel.y1 ?? 9999), hi = Math.max(range?.[1] ?? 0, sel.y2 ?? 0);
  if (lo > hi) return '';
  const opts = cur => `<option value="">指定なし</option>${Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).map(y => `<option value="${y}"${cur === y ? ' selected' : ''}>${y}年</option>`).join('')}`;
  return `<fieldset class="facet"><legend>締結年</legend>
    <div class="facet-year"><select id="sr-y1" aria-label="締結年（から）">${opts(sel.y1)}</select><span>から</span>
      <select id="sr-y2" aria-label="締結年（まで）">${opts(sel.y2)}</select><span>まで</span></div>
    <p class="small muted" style="margin:4px 0 0">更新・再締結がある協定は、最初に締結した年</p></fieldset>`;
}

// どの項目に一致したか（言葉ごと）と、本文などの一致した箇所
function hitHTML(r) {
  if (!r.hits.length) return '';
  const TEXTY = ['content', 'title', 'project', 'number', 'budget', 'note', 'signatory', 'related_org', 'related_region', 'source', 'partner_org', 'japan_org'];
  const lines = r.hits.map(h => {
    const fields = h.fields.map(k => SEARCH_FIELD[k].ja);
    const k = TEXTY.find(x => h.fields.includes(x) && x !== 'title') ;
    const show = k && !h.fields.includes('title') && !['country', 'region'].some(x => h.fields.includes(x)) ? `<span class="sr-snip">${SEARCH_FIELD[k].ja}：${snippet(h.at[k], esc)}</span>` : '';
    return `<li><b>「${esc(h.token.text)}」</b>→ ${esc(fields.join('、'))}${show}</li>`;
  });
  return `<div class="sr-hit"><span class="sr-hit-k">一致した項目</span><ul>${lines.join('')}</ul></div>`;
}

// 0件のとき：「該当文書なし」（キーワードに一致する登録はあるが、絞り込みの条件に当てはまらない）と、
// 「現在の登録データでは確認できない」（キーワードに一致する登録がそもそもない）を分けて説明する
function zeroHTML(db, st, parsed, matched) {
  if (matched.length) {
    const removable = [...FACETS.flatMap(f => st.sel[f.key].map(v => ({ k: f.key, v, label: `${f.ja.replace(/（.*）/, '')}：${f.label(db, v)}` }))),
      ...(st.sel.y1 ? [{ k: 'y1', v: '', label: `${st.sel.y1}年から` }] : []), ...(st.sel.y2 ? [{ k: 'y2', v: '', label: `${st.sel.y2}年まで` }] : [])];
    const without = x => {
      const sel = { ...st.sel, [x.k]: x.k === 'y1' || x.k === 'y2' ? null : st.sel[x.k].filter(v => v !== x.v) };
      return applyFacets(matched, sel).length;
    };
    return `<div class="zero zero-none"><p class="zero-h">該当文書なし</p>
      <p>${parsed.tokens.length ? `キーワードに一致する登録文書は <b>${matched.length}件</b> ありますが、` : ''}選んだ絞り込みの条件にすべて当てはまる協定は、登録データの中にありません。</p>
      ${removable.length ? `<p class="small">条件を1つ外すと見つかる件数：</p><ul class="zero-list">${removable.map(x => `<li><button type="button" class="btn btn-small btn-outline" data-rm="${x.k}:${esc(x.v)}">「${esc(x.label)}」を外す（${without(x)}件）</button></li>`).join('')}</ul>` : ''}</div>`;
  }
  const tc = tokenCounts(db, parsed);
  const scopeNotes = [];
  for (const t of parsed.tokens) for (const k of t.kinds) {
    if (k.kind === 'pref') {
      const s = db.survey.prefectures?.[k.code] || {};
      scopeNotes.push(`${esc(prefName(db, k.code))}の調査状況：外国人材・労働の協定＝${esc(SURVEY_RESULT[s.stage1?.result || 'not_surveyed'])}、その他の分野＝${esc(SURVEY_RESULT[s.stage2?.result || 'not_surveyed'])}（<a href="#/pref/${k.code}">${esc(prefName(db, k.code))}のページ</a>）`);
    }
    if (k.kind === 'country') scopeNotes.push(`${esc(countryName(db, k.code))}との協定：<a href="#/country/${k.code}">相手国のページ</a>で、有効性を問わず一覧できます`);
  }
  return `<div class="zero zero-unknown"><p class="zero-h">現在の登録データでは確認できません</p>
    <p>このサイトに登録した文書の中に、${parsed.tokens.length > 1 ? 'すべての言葉を含む' : 'この言葉を含む'}ものはありません。<b>協定が存在しないという意味ではありません。</b>このサイトは、調査した範囲で公式資料により確認できた協定だけを登録しています。</p>
    ${parsed.tokens.length > 1 ? `<p class="small">言葉ごとの件数：${tc.map(x => `「${esc(x.token.text)}」${x.n}件`).join('／')}${tc.some(x => !x.n) ? '（0件の言葉を変えるか外すと見つかる場合があります）' : '（それぞれの言葉は登録データにありますが、同じ協定の中に全部はそろっていません）'}</p>` : ''}
    ${scopeNotes.length ? `<ul class="small">${[...new Set(scopeNotes)].map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    <p class="small">調べた範囲は<a href="#/about?to=ab-scope">調査状況</a>で確認できます。言葉を短くする、別の言い方（略称・正式名称・英語名）にすると見つかることがあります。</p></div>`;
}

