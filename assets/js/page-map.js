// 「日本地図から探す」ページ。5つの表示モードを切り替えられます。
// 表示の条件はすべてURL（#/map?mode=…）に入るので、共有したリンクでも同じ表示になります。
import { esc, fmtDate } from './util.js';
import {
  FIELDS, FIELD, STATUSES, STATUS, IMPACTS, IMPACT, ZERO_STATES, IMPACT_LEVELS,
  filterGroups, sortGroups, countByPref, zeroState, fieldCoverageNote, impactLevel, findCountries, countryName,
} from './data.js';
import { JapanMap, PATTERNS, swatchStyle } from './map.js';
import { mouList, legendHTML } from './components.js';
import { downloadMouCSV, groupsToMous } from './csv.js';
import { exportMap } from './export.js';
import { settings, bindNewsToggle, metaFor, baseFilter, scopeBarHTML, scopeLabel, scopeNoteHTML } from './shared.js';

export const MODES = [
  { code: 'count', ja: '① 締結件数' },
  { code: 'country', ja: '② 相手国別' },
  { code: 'field', ja: '③ 分野別' },
  { code: 'status', ja: '④ 事業の実施状況' },
  { code: 'impact', ja: '⑤ 地域への影響' },
];
const SEQ = ['#d4eedd', '#9fd5b4', '#5fb488', '#2a8a58', '#0f5a36'];
export const COUNTRY_COLORS = ['#2b6cb0', '#d9822b', '#7b4fbf', '#c53b5c'];
const MULTI = '#2d3748';

// 件数の色分け（件数が多いほど濃い色）
export function seqScale(max) {
  let bins;
  if (max <= 5) bins = Array.from({ length: Math.max(1, max) }, (_, i) => ({ lo: i + 1, hi: i + 1, label: `${i + 1}件` }));
  else bins = [{ lo: 1, hi: 1, label: '1件' }, { lo: 2, hi: 2, label: '2件' }, { lo: 3, hi: 4, label: '3〜4件' }, { lo: 5, hi: 9, label: '5〜9件' }, { lo: 10, hi: Infinity, label: '10件以上' }];
  const pal = bins.length >= 5 ? SEQ : SEQ.slice(5 - bins.length);
  bins.forEach((b, i) => { b.fill = pal[i]; });
  return { color: v => (bins.find(b => v >= b.lo && v <= b.hi) || bins[bins.length - 1]).fill, bins };
}

let view = null; // 地図ページの部品（同じページ内の操作では作り直さない）

export function readState(db, params) {
  const mode = MODES.some(m => m.code === params.get('mode')) ? params.get('mode') : 'count';
  return {
    mode,
    countries: (params.get('c') || '').split(',').filter(c => db.countryByCode.has(c)).slice(0, 4),
    field: FIELD[params.get('f')] ? params.get('f') : 'labor',
    status: STATUS[params.get('s')] ? params.get('s') : 'in_progress',
    impact: IMPACT[params.get('i')] ? params.get('i') : 'population',
    pref: db.prefByCode.has(params.get('p')) ? params.get('p') : null,
    names: params.get('names') === '1',
  };
}
// 共有リンクで同じ表示になるよう、数え方（有効性の範囲・数える文書）もURLに入れる
function scopeParams() {
  const p = {};
  if (settings.validity !== 'valid') p.v = settings.validity;
  if (settings.docScope !== 'mou') p.doc = settings.docScope;
  return p;
}
function stateParams(st, patch = {}) {
  const s = { ...st, ...patch };
  const p = { mode: s.mode };
  if (s.mode === 'country' && s.countries.length) p.c = s.countries.join(',');
  if (s.mode === 'field') p.f = s.field;
  if (s.mode === 'status') p.s = s.status;
  if (s.mode === 'impact') p.i = s.impact;
  if (s.pref) p.p = s.pref;
  if (s.names) p.names = '1';
  return { ...p, ...scopeParams() };
}

// モードごとの「地図の塗り方・凡例・ツールチップ」を計算する（画像出力でも同じものを使う）
export function computeMapModel(db, st) {
  const base = baseFilter();
  if (st.mode === 'country') base.countries = st.countries;
  if (st.mode === 'field') base.field = st.field;
  if (st.mode === 'status') base.status = st.status;
  const prefGroups = (st.mode === 'country' && !st.countries.length) ? [] : filterGroups(db, { ...base, level: 'prefecture' });
  const natGroups = (st.mode === 'country' && !st.countries.length) ? [] : filterGroups(db, { ...base, level: 'national' });
  // 市区町村・団体などの協定は、都道府県の色・件数に入れず別に数える
  const cityGroups = (st.mode === 'country' && !st.countries.length) ? [] : filterGroups(db, { ...base, level: 'municipality' });
  const orgGroups = (st.mode === 'country' && !st.countries.length) ? [] : filterGroups(db, { ...base, level: 'organization' });
  const counts = countByPref(prefGroups);
  // いまの数え方では0件だが、範囲を広げると締結済みの協定がある県（「0件」や「該当なし」と区別する）
  const wider = (st.mode === 'country' && !st.countries.length) ? new Map() : countByPref(filterGroups(db, { ...base, validity: 'all', docScope: 'all', level: 'prefecture' }));
  const byPref = new Map();
  for (const g of prefGroups) { if (!byPref.has(g.pref_code)) byPref.set(g.pref_code, []); byPref.get(g.pref_code).push(g); }
  const zeroField = st.mode === 'field' ? st.field : null;
  const zero = code => wider.get(code) ? 'scope_zero' : zeroState(db, code, zeroField);
  // 凡例には、地図に実際に出てくる「0件の状態」だけを載せる
  const zeroLegend = (has = c => !counts.get(c)) => {
    const present = new Set(db.prefs.filter(p => has(p.code)).map(p => zero(p.code)));
    return Object.entries(ZERO_STATES).filter(([k]) => present.has(k)).map(([k, v]) => ({ label: v.ja, fill: PATTERNS[k] }));
  };
  let fill, legend, legendTitle, tipLine, title;
  const max = Math.max(0, ...counts.values());

  if (st.mode === 'country' && st.countries.length > 1) {
    const colorOf = new Map(st.countries.map((c, i) => [c, COUNTRY_COLORS[i]]));
    fill = code => {
      const cs = [...new Set((byPref.get(code) || []).flatMap(g => g.countries.filter(c => st.countries.includes(c))))];
      if (!cs.length) return PATTERNS[zero(code)];
      return cs.length > 1 ? MULTI : colorOf.get(cs[0]);
    };
    legendTitle = '色＝登録済み協定の相手国';
    legend = [...st.countries.map((c, i) => ({ label: countryName(db, c), fill: COUNTRY_COLORS[i] })), { label: '選んだ国のうち2か国以上', fill: MULTI }, ...zeroLegend()];
    tipLine = code => {
      const gs = byPref.get(code) || [];
      if (!gs.length) return ZERO_STATES[zero(code)].ja;
      return st.countries.map(c => { const n = gs.filter(g => g.countries.includes(c)).length; return n ? `${countryName(db, c)} ${n}件` : null; }).filter(Boolean).join('、');
    };
    title = `${st.countries.map(c => countryName(db, c)).join('・')}とMOUを締結した都道府県`;
  } else if (st.mode === 'impact') {
    const allPref = filterGroups(db, baseFilter({ level: 'prefecture' }));
    const gp = new Map();
    for (const g of allPref) { if (!gp.has(g.pref_code)) gp.set(g.pref_code, []); gp.get(g.pref_code).push(g); }
    const levelOf = code => impactLevel(gp.get(code) || [], st.impact);
    const color = Object.fromEntries(IMPACT_LEVELS.map(l => [l.code, l.color]));
    fill = code => { const l = levelOf(code); return l ? color[l] : PATTERNS[zero(code)]; };
    legendTitle = `「${IMPACT[st.impact].ja}」の情報がどこまで確認できたか`;
    const levelsPresent = new Set(db.prefs.map(p => levelOf(p.code)).filter(Boolean));
    legend = [...IMPACT_LEVELS.filter(l => levelsPresent.has(l.code)).map(l => ({ label: l.ja, fill: l.color })),
      ...zeroLegend(c => !levelOf(c)).map(l => ({ ...l, label: 'MOU：' + l.label }))];
    tipLine = code => {
      const l = levelOf(code);
      if (!l) return 'MOU：' + ZERO_STATES[zero(code)].ja;
      return `${IMPACT_LEVELS.find(x => x.code === l).ja}（MOU ${(gp.get(code) || []).length}件）`;
    };
    title = `地域への影響「${IMPACT[st.impact].ja}」の記録状況`;
    return finish({ fill, legend, legendTitle, tipLine, title, counts: new Map([...gp].map(([k, v]) => [k, v.length])), byPref, prefGroups: filterGroups(db, baseFilter({ level: 'prefecture', impact: st.impact })), natGroups: filterGroups(db, baseFilter({ level: 'national', impact: st.impact })), noLabels: true });
  } else {
    const sc = seqScale(max);
    fill = code => counts.get(code) ? sc.color(counts.get(code)) : PATTERNS[zero(code)];
    legend = [...(max ? sc.bins.map(b => ({ label: b.label, fill: b.fill })) : []), ...zeroLegend()];
    legendTitle = '登録済み協定の件数（色が濃いほど多い）';
    tipLine = code => counts.get(code) ? `${counts.get(code)}件` : zero(code) === 'scope_zero' ? `${ZERO_STATES.scope_zero.ja}（締結済み ${wider.get(code)}件）` : ZERO_STATES[zero(code)].ja;
    title = st.mode === 'count' ? '都道府県別 登録済み協定の件数'
      : st.mode === 'country' ? (st.countries.length ? `${countryName(db, st.countries[0])}とMOUを締結した都道府県` : '相手国別（国を選んでください）')
        : st.mode === 'field' ? `分野別：「${FIELD[st.field].ja}」の協定`
          : `事業の実施状況：「${STATUS[st.status].ja}」の協定`;
  }
  return finish({ fill, legend, legendTitle, tipLine, title, counts, byPref, prefGroups, natGroups });

  function finish(o) { return { cityGroups, orgGroups, ...o, zero, wider }; }
}

export function mapPage(ctx) {
  const { db, app } = ctx;
  if (!view || !ctx.samePath || !app.contains(view.root)) {
    app.innerHTML = `<div data-page="map">
      <div class="page-head">
        <div class="crumbs"><a href="#/">トップ</a> ＞ 日本地図から探す</div>
        <h1>日本地図から探す</h1>
        <p class="lead">地図は、このサイトに<b>登録済みの協定の分布</b>です（全国の実際の総数ではありません）。都道府県を押すと、その県の件数と協定が表示されます。</p>
      </div>
      <div class="map-layout3">
        <div class="map-main">
          <div id="map-note"></div>
          <div id="map"></div>
          <div id="sel-box" aria-live="polite"></div>
          <div id="legend"></div>
          <details class="note-d"><summary>地図の見方・注意</summary>
            <p class="small">国の省庁が締結した協定は全国が対象のため、都道府県の件数に含めず別に数えています。同じ協定の更新・再締結は1件と数えます。色のない県（模様）は、0件の理由（該当なし／調査したが確認できず／調査が一部のみ／未調査／いまの数え方では0件）で塗り分けています。
            地図：国土数値情報（行政区域データ）を加工。一部の離島は表示範囲外です。</p></details>
        </div>
        <div class="map-controls">
          <div class="control-group">
            <span class="label" id="mode-label">表示モード</span>
            <div class="seg" role="group" aria-labelledby="mode-label" id="modes">
              ${MODES.map(m => `<button type="button" data-mode="${m.code}">${esc(m.ja)}</button>`).join('')}
            </div>
          </div>
          <div class="control-group" id="mode-controls"></div>
          <div class="control-group" id="scope-box"></div>
          <div class="control-group">
            <label class="check"><input type="checkbox" id="names"> 地図に県名を表示する</label>
          </div>
        </div>
        <div class="map-extras">
          <div class="national-box" id="national-box"></div>
          <div class="btn-row">
            <button type="button" class="btn" id="png">この地図を画像で保存（X向け）</button>
          </div>
        </div>
      </div>
      <div class="result-bar" id="result-bar" aria-live="polite"></div>
      <div id="results"></div>
    </div>`;
    const root = app.querySelector('[data-page="map"]');
    const map = new JapanMap(root.querySelector('#map'), db, {
      ariaLabel: '都道府県別の協定の地図',
      onClick: code => {
        const st = readState(db, ctx.params);
        ctx.go('/map', stateParams(st, { pref: st.pref === code ? null : code }), { keepScroll: true });
      },
    });
    view = { root, map };
    root.querySelector('#modes').addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (!b) return;
      const st = readState(db, ctx.params);
      ctx.go('/map', stateParams({ ...st, mode: b.dataset.mode, pref: null }), { keepScroll: true });
    });
    root.querySelector('#names').addEventListener('change', e => {
      const st = readState(db, ctx.params);
      ctx.go('/map', stateParams(st, { names: e.target.checked }), { keepScroll: true });
    });
  }
  refresh(ctx);
}

function refresh(ctx) {
  const { db } = ctx;
  const { root, map } = view;
  const st = readState(db, ctx.params);
  const model = computeMapModel(db, st);
  const go = patch => ctx.go('/map', stateParams(st, patch), { keepScroll: true });

  root.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
  const sb = root.querySelector('#scope-box');
  sb.innerHTML = scopeBarHTML({ note: false });
  bindNewsToggle(sb, () => go({}));
  root.querySelector('#names').checked = st.names;

  // モード別の操作部品
  const mc = root.querySelector('#mode-controls');
  if (st.mode === 'count') {
    mc.innerHTML = '<p class="small muted">すべての分野の協定の件数を、都道府県ごとに色の濃さで表しています（下の「協定の有効性」「数える文書」の数え方で数えます）。</p>';
  } else if (st.mode === 'country') {
    mc.innerHTML = countryPicker(db, st);
    bindCountryPicker(mc, db, st, go);
  } else if (st.mode === 'field') {
    mc.innerHTML = `<span class="label">分野を選ぶ</span><div class="seg" role="group">${FIELDS.map(f => `<button type="button" data-f="${f.code}" aria-pressed="${f.code === st.field}" title="${esc(f.desc)}">${esc(f.ja)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">${esc(FIELD[st.field].desc)}</p>`;
    mc.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => go({ field: b.dataset.f, pref: null })));
  } else if (st.mode === 'status') {
    mc.innerHTML = `<span class="label">事業の実施状況を選ぶ</span><div class="seg" role="group">${STATUSES.map(s => `<button type="button" data-s="${s.code}" aria-pressed="${s.code === st.status}" title="${esc(s.desc)}">${esc(s.ja)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">${esc(STATUS[st.status].desc)}</p>`;
    mc.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => go({ status: b.dataset.s, pref: null })));
  } else if (st.mode === 'impact') {
    mc.innerHTML = `<span class="label">影響の分野を選ぶ</span><div class="seg" role="group">${IMPACTS.map(i => `<button type="button" data-i="${i.code}" aria-pressed="${i.code === st.impact}">${esc(i.letter)}. ${esc(i.ja)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">${esc(IMPACT[st.impact].items)}</p>
      <p class="small"><a href="#/impact">「地域への影響」の見方</a></p>`;
    mc.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => go({ impact: b.dataset.i, pref: null })));
  }

  // 地図
  const label = code => {
    const n = model.counts.get(code);
    const short = db.prefByCode.get(code).short;
    if (st.names) return n && !model.noLabels ? `${short} ${n}` : short;
    return n && !model.noLabels ? String(n) : null;
  };
  map.update({
    fill: model.fill,
    selected: st.pref,
    label,
    tip: code => `<b>${esc(db.prefByCode.get(code).name)}</b><br>${esc(model.tipLine(code))}`,
  });
  root.querySelector('#legend').innerHTML = legendHTML(model.legendTitle, model.legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })));
  root.querySelector('#map-note').innerHTML = `<p class="map-title">${esc(model.title)}<small>登録済み協定の分布（${esc(scopeLabel())}）</small></p>${scopeNoteHTML()}`;

  // 選んだ都道府県（マウスを重ねなくても、タップで件数が分かるように地図のすぐ下に表示）
  const sel = root.querySelector('#sel-box');
  if (st.pref) {
    const pn = db.prefByCode.get(st.pref).name;
    const nCity = model.cityGroups.filter(g => g.pref_code === st.pref).length;
    const nRel = model.orgGroups.filter(g => g.regions.includes(st.pref)).length;
    const extra = [nCity ? `県内の市区町村が締結 ${nCity}件` : '', nRel ? `この地域に関連する事業（団体などの協定）${nRel}件` : ''].filter(Boolean).join('／');
    sel.innerHTML = `<div class="sel-box"><span class="sel-k">選択中</span><b>${esc(pn)}</b><span>${esc(pn)}が締結：${esc(model.tipLine(st.pref))}${extra ? `<br><span class="small">別に数えるもの：${esc(extra)}</span>` : ''}</span>
      <a class="btn btn-small btn-outline" href="#/pref/${st.pref}">${esc(pn)}のページ</a>
      <button type="button" class="btn btn-small btn-outline" data-rm-p2>選択を解除</button></div>`;
    sel.querySelector('[data-rm-p2]').addEventListener('click', () => go({ pref: null }));
  } else {
    sel.innerHTML = '<p class="sel-hint">都道府県を押すと、ここに件数が表示されます。</p>';
  }

  // 全国枠（国・省庁）
  root.querySelector('#national-box').innerHTML = `<div class="small" style="font-weight:700">全国が対象：国・省庁が締結した協定</div>
    <div><span class="n">${model.natGroups.length}</span> 件 <span class="small muted">（同じ条件で数えた件数。都道府県の件数とは別）</span></div>
    <a href="#/national">国・省庁の協定の一覧を見る</a>
    ${model.cityGroups.length || model.orgGroups.length ? `<div class="small" style="margin-top:8px;font-weight:700">地図の色に含めないもの</div>
    <div class="small">${model.cityGroups.length ? `市区町村が締結：<b>${model.cityGroups.length}</b>件` : ''}${model.cityGroups.length && model.orgGroups.length ? '／' : ''}${model.orgGroups.length ? `団体・企業などが締結：<b>${model.orgGroups.length}</b>件` : ''}<br><span class="muted">都道府県が締結したものではないため別に数えます</span></div>
    <a href="#/actors">締結主体から探す</a>` : ''}`;

  // 操作結果（地図の下）
  const chips = [`<span class="chip chip-plain">表示：${esc(MODES.find(m => m.code === st.mode).ja)}</span>`];
  if (st.mode === 'country') st.countries.forEach(c => chips.push(`<span class="chip">相手国：${esc(countryName(db, c))}<button type="button" data-rm-c="${c}" aria-label="${esc(countryName(db, c))}の選択を解除">×</button></span>`));
  if (st.mode === 'field') chips.push(`<span class="chip chip-plain">分野：${esc(FIELD[st.field].ja)}</span>`);
  if (st.mode === 'status') chips.push(`<span class="chip chip-plain">事業の実施状況：${esc(STATUS[st.status].ja)}</span>`);
  chips.push(`<span class="chip chip-plain">数え方：${esc(scopeLabel())}</span>`);
  if (st.mode === 'impact') chips.push(`<span class="chip chip-plain">影響の分野：${esc(IMPACT[st.impact].ja)}</span>`);
  if (st.pref) chips.push(`<span class="chip">選択中の都道府県：${esc(db.prefByCode.get(st.pref).name)}<button type="button" data-rm-p aria-label="都道府県の選択を解除">×</button></span>`);
  const bar = root.querySelector('#result-bar');
  bar.innerHTML = `<div class="now">いま表示している条件</div><div class="chips">${chips.join('')}
    <button type="button" class="btn btn-small btn-outline" id="clear-all">条件をすべて解除</button></div>`;
  bar.querySelectorAll('[data-rm-c]').forEach(b => b.addEventListener('click', () => go({ countries: st.countries.filter(c => c !== b.dataset.rmC), pref: null })));
  bar.querySelector('[data-rm-p]')?.addEventListener('click', () => go({ pref: null }));
  bar.querySelector('#clear-all').addEventListener('click', () => ctx.go('/map', scopeParams(), { keepScroll: true }));

  // 結果一覧
  const res = root.querySelector('#results');
  const coverage = st.mode === 'field' ? fieldCoverageNote(db, st.field) : (st.mode === 'count' || st.mode === 'country' || st.mode === 'status') ? fieldCoverageNote(db, null) : null;
  const prefCount = new Set(model.prefGroups.map(g => g.pref_code)).size;
  let html = '';
  if (st.mode === 'country' && !st.countries.length) {
    html += '<p class="result-summary">右の「相手国を選ぶ」で国を選ぶと、その国とMOUを結んでいる都道府県が地図に表示されます。</p>';
  } else {
    html += `<p class="result-summary">条件に合う協定：<b>都道府県 ${model.prefGroups.length}件</b>（${prefCount}都道府県）／<b>国・省庁（全国が対象） ${model.natGroups.length}件</b></p>`;
    const hidden = [...model.wider].filter(([c]) => !model.counts.get(c)).length;
    if (hidden && st.mode !== 'impact') html += `<div class="info">いまの数え方（${esc(scopeLabel())}）では0件でも、範囲を広げると締結済みの協定がある都道府県が <b>${hidden}</b> あります（地図では「${esc(ZERO_STATES.scope_zero.ja)}」の色）。協定の有効性を「すべて（終了を含む・予定は除く）」にすると表示されます。</div>`;
  }
  if (coverage) html += `<div class="note">${esc(coverage)}</div>`;

  html += `<details><summary>都道府県別の一覧表（47都道府県）</summary>${prefTable(db, model, st)}</details>`;

  const shown = st.pref ? model.prefGroups.filter(g => g.pref_code === st.pref) : model.prefGroups;
  const sorted = sortGroups(shown).sort((a, b) => (a.pref_code || '').localeCompare(b.pref_code || ''));
  if (st.pref) {
    const pn = db.prefByCode.get(st.pref).name;
    html += `<h2>${esc(pn)}の該当する協定（${shown.length}件）</h2>
      <p><a class="btn btn-outline btn-small" href="#/pref/${st.pref}">${esc(pn)}の詳しいページへ</a></p>`;
    if (!shown.length) html += `<p>${esc(pn)}：${esc(ZERO_STATES[model.zero(st.pref)].ja)}。${esc(ZERO_STATES[model.zero(st.pref)].desc)}。${model.zero(st.pref) === 'scope_zero' ? `<a href="#/pref/${st.pref}">${esc(pn)}のページ</a>で、有効性未確認・終了したものを含めて見られます。` : ''}</p>`;
    else html += mouList(db, sorted);
    const cities = model.cityGroups.filter(g => g.pref_code === st.pref);
    const related = model.orgGroups.filter(g => g.regions.includes(st.pref));
    if (cities.length) html += `<h3>${esc(pn)}内の市区町村が締結した協定（${cities.length}件、県の件数とは別）</h3>${mouList(db, sortGroups(cities), { h: 'h4' })}`;
    if (related.length) html += `<h3>${esc(pn)}に関連する事業（団体・企業などの協定、${related.length}件）</h3>
      <p class="small">${esc(pn)}が締結した協定ではなく、関連する事業が${esc(pn)}で行われたと公式資料で確認できたものです。${esc(pn)}の件数には含めていません。</p>${mouList(db, sortGroups(related), { h: 'h4' })}`;
  } else if (!(st.mode === 'country' && !st.countries.length)) {
    html += `<h2>該当する都道府県の協定（${shown.length}件）</h2>${mouList(db, sorted)}`;
  }
  if (model.natGroups.length && !st.pref) {
    html += `<details><summary>国・省庁の協定（全国が対象）${model.natGroups.length}件を表示</summary>${mouList(db, sortGroups(model.natGroups), { h: 'h4' })}</details>`;
  }
  html += `<div class="btn-row"><button type="button" class="btn btn-outline" id="csv">この結果をCSVで保存</button></div>`;
  res.innerHTML = html;
  res.querySelectorAll('tr[data-pref]').forEach(tr => {
    const sel = () => go({ pref: st.pref === tr.dataset.pref ? null : tr.dataset.pref });
    tr.addEventListener('click', sel);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') sel(); });
  });
  res.querySelector('#csv').addEventListener('click', () => {
    const groups = [...shown, ...(st.pref ? [] : model.natGroups)];
    downloadMouCSV(db, groupsToMous(groups), `mou_${st.mode}${st.pref ? '_' + st.pref : ''}_${settings.validity}_${settings.docScope}.csv`);
  });
  root.querySelector('#png').onclick = () => {
    const top = [...model.counts].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([c, n]) => `${db.prefByCode.get(c).name}　${n}件`);
    exportMap(db, {
      title: model.title,
      sub: `都道府県 ${model.prefGroups.length}件（国・省庁 ${model.natGroups.length}件は別に数える）／${scopeLabel()}`,
      fill: model.fill, label: model.noLabels ? null : code => model.counts.get(code) ? String(model.counts.get(code)) : null,
      selected: st.pref, legend: model.legend, legendTitle: model.legendTitle,
      side: top.length && !model.noLabels ? [{ text: '件数の多い都道府県', bold: true, size: 30 }, { text: top.join('、'), size: 28 }] : [],
      meta: metaFor(db, model.prefGroups, '全国47都道府県（国・省庁の締結は含まない）'),
      filename: `mou-map_${st.mode}.png`,
    });
  };
}

function prefTable(db, model, st) {
  const rows = db.prefs.map(p => {
    const gs = model.byPref.get(p.code) || [];
    const n = model.counts.get(p.code) || 0;
    const state = n ? `${n}件` : ZERO_STATES[model.zero(p.code)].ja;
    const cs = [...new Set(gs.flatMap(g => g.countries.map(c => countryName(db, c))))].join('、');
    return `<tr class="clickable ${st.pref === p.code ? 'is-selected' : ''}" data-pref="${p.code}" tabindex="0">
      <td>${esc(p.name)}</td><td class="num">${n ? n : '—'}</td><td>${esc(n ? (model.tipLine(p.code)) : state)}</td><td>${esc(cs)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>都道府県</th><th class="num">件数</th><th>状況</th><th>相手国・地域</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted">行をクリックすると、その都道府県を選択します。「—」は、状況欄のとおり「いまの数え方では0件（締結済みの協定はある）」「該当なし」「調査したが確認できず」「未調査」のいずれかです。</p>`;
}

// 相手国を選ぶ部品（日本語名・英語名で検索、最大4か国まで比較）
function countryPicker(db, st) {
  const withData = countriesWithData(db);
  return `<span class="label">相手国を選ぶ（4か国まで比べられます）</span>
    <div class="suggest"><input type="search" id="cq" placeholder="例：インドネシア / Indonesia" autocomplete="off" aria-label="国名で検索（日本語・英語）"><ul id="cs" hidden></ul></div>
    <p class="small muted" style="margin:10px 0 4px">協定が登録されている国・地域（数字はいまの数え方の件数）：</p>
    <div class="seg">${withData.slice(0, 8).map(btn).join('')}</div>
    ${withData.length > 8 ? `<details${withData.slice(8).some(([c]) => st.countries.includes(c)) ? ' open' : ''}><summary>ほかの国・地域（${withData.length - 8}）</summary><div class="seg">${withData.slice(8).map(btn).join('')}</div></details>` : ''}`;
  function btn([c, n]) { return `<button type="button" data-c="${c}" aria-pressed="${st.countries.includes(c)}">${esc(countryName(db, c))} ${n}</button>`; }
}
export function countriesWithData(db) {
  const m = new Map();
  for (const g of filterGroups(db, baseFilter())) for (const c of g.countries) m.set(c, (m.get(c) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || countryName(db, a[0]).localeCompare(countryName(db, b[0]), 'ja'));
}
function bindCountryPicker(mc, db, st, go) {
  const toggle = c => {
    let cs = st.countries.includes(c) ? st.countries.filter(x => x !== c) : [...st.countries, c];
    if (cs.length > 4) cs = cs.slice(cs.length - 4);
    go({ countries: cs, pref: null });
  };
  mc.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => toggle(b.dataset.c)));
  bindSuggest(mc.querySelector('#cq'), mc.querySelector('#cs'), db, c => toggle(c.code));
}

export function bindSuggest(input, list, db, onPick) {
  let items = [], active = -1;
  const render = () => {
    if (!items.length) { list.hidden = true; return; }
    list.hidden = false;
    list.innerHTML = items.map((c, i) => `<li><button type="button" data-i="${i}" class="${i === active ? 'active' : ''}">${esc(c.ja)} <span class="small muted">${esc(c.en)}</span></button></li>`).join('');
  };
  input.addEventListener('input', () => { items = findCountries(db, input.value).slice(0, 8); active = -1; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); const c = items[active >= 0 ? active : 0]; if (c) onPick(c); }
    if (e.key === 'Escape') { items = []; render(); }
  });
  list.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) onPick(items[Number(b.dataset.i)]); });
  input.addEventListener('blur', () => setTimeout(() => { items = []; render(); }, 200));
}
