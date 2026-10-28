// 地図の塗り分けの計算（相手国のページ・地域への影響のページの地図と、その画像出力で使います）
// 「協定を探す」ページ（explore.js）の地図は、検索条件（explore-state.js）から同じ考え方で塗り分けます。
import { esc, fmtDate } from './util.js';
import {
  FIELDS, FIELD, STATUSES, STATUS, IMPACTS, IMPACT, ZERO_STATES, IMPACT_LEVELS, VALIDITY, VALIDITY_SCOPE,
  filterGroups, sortGroups, countByPref, zeroState, fieldCoverageNote, impactLevel, findCountries, countryName, validityCounts,
} from './data.js';
import { JapanMap, PATTERNS, swatchStyle } from './map.js';
import { settings, baseFilter } from './shared.js';

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
  // 同じ条件・同じ文書の範囲で、有効性を問わず数えた県ごとの内訳（地図の吹き出しに「非表示：未確認○件」と出す）
  const vByPref = new Map();
  if (!(st.mode === 'country' && !st.countries.length)) {
    const gp = new Map();
    for (const g of filterGroups(db, { ...base, validity: 'all', level: 'prefecture' })) { if (!gp.has(g.pref_code)) gp.set(g.pref_code, []); gp.get(g.pref_code).push(g); }
    for (const [k, gs] of gp) vByPref.set(k, validityCounts(gs));
  }
  const on = VALIDITY_SCOPE[settings.validity].states;
  const hiddenTip = code => {
    const c = vByPref.get(code);
    const off = c ? ['unconfirmed', 'ended_confirmed', 'signed_not_started'].filter(k => !on.includes(k) && c[k]).map(k => `${VALIDITY[k].ja} ${c[k]}件`) : [];
    return off.length ? `（このほか非表示：${off.join('・')}）` : '';
  };
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
    tipLine = code => counts.get(code) ? `${counts.get(code)}件${hiddenTip(code)}` : zero(code) === 'scope_zero' ? `${ZERO_STATES.scope_zero.ja}${hiddenTip(code) || `（締結済み ${wider.get(code)}件。数える文書の範囲の外）`}` : ZERO_STATES[zero(code)].ja;
    title = st.mode === 'count' ? '都道府県別 登録済み協定の件数'
      : st.mode === 'country' ? (st.countries.length ? `${countryName(db, st.countries[0])}とMOUを締結した都道府県` : '相手国別（国を選んでください）')
        : st.mode === 'field' ? `分野別：「${FIELD[st.field].ja}」の協定`
          : `事業の実施状況：「${STATUS[st.status].ja}」の協定`;
  }
  return finish({ fill, legend, legendTitle, tipLine, title, counts, byPref, prefGroups, natGroups });

  function finish(o) { return { cityGroups, orgGroups, ...o, zero, wider, scopeF: { ...pick(base), level: 'prefecture' } }; }
  // 有効性の内訳の表示に使う条件（相手国・分野・事業の実施状況）
  function pick(b) { return { countries: b.countries, field: b.field, status: b.status }; }
}

export function countriesWithData(db) {
  const m = new Map();
  for (const g of filterGroups(db, baseFilter())) for (const c of g.countries) m.set(c, (m.get(c) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || countryName(db, a[0]).localeCompare(countryName(db, b[0]), 'ja'));
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
