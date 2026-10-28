// 「協定を探す」ページの検索条件（地図・件数・一覧がすべて同じ条件を使うための仕組み）
// 画面の部品を使わない部分だけをここに置き、node tools/test_site.mjs でも確かめられるようにしています。
//
// 条件はすべてアドレス（#/map?…）に入れるので、共有したリンク・「戻る」でも同じ結果になります。
// 以前のアドレスも読めます：地図（mode・c・f・s・p・names・v・doc）、サイト内検索（q・ot・pk・c・p・cat・vs・f・y1・y2・ev・sort）
import {
  VALIDITY, DOC_KIND, DOC_KINDS, DOC_CATEGORY, DOC_SCOPE, VALIDITY_SCOPE, FIELD, STATUS, JAPAN_ORG_TYPE, PAIR_KIND, LEVEL_ORDER, sortGroups,
} from './data.js';

// 有効性のまとめた選び方（「締結予定を含むすべて」はキーワード検索の初期設定）
export const V_PRESETS = [
  { code: 'valid', ja: '有効確認のみ', states: ['valid_confirmed'] },
  { code: 'valid_unk', ja: '有効確認＋有効性未確認', states: ['valid_confirmed', 'unconfirmed'] },
  { code: 'all', ja: '締結済みすべて', states: ['valid_confirmed', 'unconfirmed', 'ended_confirmed', 'signed_not_started'] },
  { code: 'any', ja: '締結予定も含むすべて', states: ['valid_confirmed', 'unconfirmed', 'ended_confirmed', 'signed_not_started', 'planned'] },
];
export const V_PRESET = Object.fromEntries(V_PRESETS.map(v => [v.code, v]));
const V_ORDER = V_PRESETS[3].states;
export const DOC_PRESETS = [
  { code: 'mou', ja: 'MOU・MOCのみ' },
  { code: 'foreign', ja: '外国人受入れに関する文書' },
  { code: 'all', ja: 'すべての国際文書' },
];
export const SORTS = { rel: '一致の度合いが高い順', new: '締結日が新しい順', old: '締結日が古い順' };
export const PAGE_FIRST = 10, PAGE_MORE = 20;

const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
export function presetOf(vs) { return V_PRESETS.find(p => same(p.states, vs))?.code || null; }
// 以前のリンク（cat=mou_moc など、大きな分類の名前）を、詳しい区分に読み替える
export function expandKinds(list) {
  return [...new Set(list.flatMap(v => DOC_KIND[v] ? [v] : DOC_CATEGORY[v] ? DOC_KINDS.filter(k => k.cat === v).map(k => k.code) : []))];
}

// アドレスの条件を読む。path が /search（以前のサイト内検索）のときは、書かれていない条件を「すべて」として読む
// settings：ほかのページと共有している数え方（有効性の範囲・数える文書・報道のみの情報を含めるか）
export function readState(db, params, path, settings) {
  const list = k => (params.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);
  const year = k => { const y = Number(params.get(k)); return y >= 1900 && y <= 2100 ? y : null; };
  const search = path === '/search';
  const mode = params.get('mode');
  const st = {
    q: (params.get('q') || '').trim(),
    p: list('p').filter(c => db.prefByCode.has(c)),
    c: list('c').filter(c => db.countryByCode.has(c)),
    f: list('f').filter(c => FIELD[c]),
    s: list('s').filter(c => STATUS[c]),
    cat: expandKinds(list('cat')),
    ot: list('ot').filter(c => JAPAN_ORG_TYPE[c]),
    pk: list('pk').filter(c => PAIR_KIND[c]),
    y1: year('y1'), y2: year('y2'),
    lv: LEVEL_ORDER.includes(params.get('lv')) ? params.get('lv') : 'all',
    names: params.get('names') === '1',
  };
  // 以前の地図の「分野別」「事業の実施状況」は、選んでいなければ地図と同じ初期値
  if (mode === 'field' && !st.f.length) st.f = ['labor'];
  if (mode === 'status' && !st.s.length) st.s = ['in_progress'];
  // 有効性
  const vs = list('vs').filter(c => VALIDITY[c]);
  if (params.get('vs') === 'none') st.vs = [];
  else if (vs.length) st.vs = V_ORDER.filter(c => vs.includes(c));
  else if (V_PRESET[params.get('v')]) st.vs = [...V_PRESET[params.get('v')].states];
  else if (search) st.vs = [...V_PRESET.any.states];
  else st.vs = [...(V_PRESET[settings.validity] || V_PRESET.valid).states];
  // 数える文書
  st.doc = DOC_SCOPE[params.get('doc')] ? params.get('doc') : search ? 'all' : (DOC_SCOPE[settings.docScope] ? settings.docScope : 'mou');
  // 報道のみの情報（ev：official＝公式資料で確認／news＝報道のみ。どちらも選ばないときは両方）
  const ev = list('ev');
  if (ev.includes('all')) st.ev = [];
  else if (ev.length) st.ev = ev.filter(x => x === 'official' || x === 'news');
  else st.ev = search || settings.includeNews ? [] : ['official'];
  if (same(st.ev, ['official', 'news'])) st.ev = [];
  st.sort = SORTS[params.get('sort')] ? params.get('sort') : (st.q ? 'rel' : 'new');
  if (st.sort === 'rel' && !st.q) st.sort = 'new';
  // 相手国ごとの色分け（2〜4か国を選んだとき）。以前の地図の「相手国別」で2か国以上なら色分け
  st.color = (params.get('color') === 'country' || (mode === 'country' && st.c.length > 1)) && st.c.length > 1 ? 'country' : 'count';
  return st;
}

// 条件をアドレスに書く。有効性・数える文書・報道のみの情報は、共有したリンクで同じ結果になるよう必ず書く
export function writeState(st) {
  const p = new URLSearchParams();
  if (st.q) p.set('q', st.q);
  for (const k of ['p', 'c', 'f', 's']) if (st[k].length) p.set(k, st[k].join(','));
  const pre = presetOf(st.vs);
  if (pre) p.set('v', pre); else p.set('vs', st.vs.join(',') || 'none');
  p.set('doc', st.doc);
  for (const k of ['cat', 'ot', 'pk']) if (st[k].length) p.set(k, st[k].join(','));
  p.set('ev', st.ev.length ? st.ev.join(',') : 'all');
  if (st.y1) p.set('y1', st.y1);
  if (st.y2) p.set('y2', st.y2);
  if (st.lv !== 'all') p.set('lv', st.lv);
  if (st.sort !== (st.q ? 'rel' : 'new')) p.set('sort', st.sort);
  if (st.color === 'country') p.set('color', 'country');
  if (st.names) p.set('names', '1');
  return p;
}

// 地域（都道府県）以外のすべての条件に当てはまるか。except を指定すると、その条件だけは見ない（選択肢ごとの件数を数えるため）
export function passBase(g, st, except) {
  for (const k of CHECKS) if (k !== except && !passOne(g, st, k)) return false;
  return true;
}

// 地域との関係。都道府県が締結したもの／県内の市区町村が締結したもの／団体などが締結し、その地域で関連事業が行われたもの。
// 国・省庁の協定は全国が対象なので、どの都道府県の協定としても数えない（null）
export function regionRole(g, prefs) {
  if (!prefs.length) return null;
  if (g.level === 'prefecture') return prefs.includes(g.pref_code) ? 'prefecture' : null;
  if (g.level === 'municipality') return prefs.includes(g.pref_code) ? 'municipality' : null;
  if (g.level === 'organization') return g.regions.some(r => prefs.includes(r)) ? 'organization' : null;
  return null;
}
export const ROLE_LABEL = {
  prefecture: n => `${n}が締結`,
  municipality: n => `${n}内の市区町村が締結`,
  organization: n => `${n}で関連事業（団体などが締結）`,
};

// 条件に合う協定を数える。keyword：キーワードに一致した協定（key → 一致の情報）。キーワードがなければ null
// 返すもの：
//   base   … 地域以外の条件に合う協定（地図の色はここから、都道府県が締結したものだけを県ごとに数える）
//   scoped … 地域の条件にも合う協定（件数と一覧はここから）。地域を選んでいなければ base と同じ
//   shown  … 一覧に出す協定（締結主体のタブで絞ったもの）。並べ替え済み
export function computeResults(db, st, keyword) {
  const okKw = g => !keyword || keyword.has(g.key);
  const base = db.groups.filter(g => okKw(g) && passBase(g, st));
  const role = new Map();
  let scoped = base;
  if (st.p.length) {
    scoped = [];
    for (const g of base) { const r = regionRole(g, st.p); if (r) { role.set(g, r); scoped.push(g); } }
  }
  const levelOf = g => st.p.length ? role.get(g) : g.level;
  const byLevel = Object.fromEntries(LEVEL_ORDER.map(l => [l, 0]));
  for (const g of scoped) byLevel[levelOf(g)]++;
  const nationalOut = st.p.length ? base.filter(g => g.level === 'national').length : 0;
  let shown = st.lv === 'all' ? scoped : scoped.filter(g => levelOf(g) === st.lv);
  shown = sortList(shown, st, keyword, role);
  // 地図：都道府県が締結した協定だけを、締結した都道府県で数える（市区町村・団体・国は色に含めない）
  const mapCounts = new Map();
  for (const g of base) if (g.level === 'prefecture' && g.pref_code) mapCounts.set(g.pref_code, (mapCounts.get(g.pref_code) || 0) + 1);
  return { base, scoped, shown, role, byLevel, nationalOut, mapCounts, levelOf };
}

function sortList(list, st, keyword, role) {
  let out;
  if (st.sort === 'rel' && keyword) {
    const byDate = new Map(sortGroups(list).map((g, i) => [g, i]));
    out = [...list].sort((a, b) => keyword.get(b.key).score - keyword.get(a.key).score || byDate.get(a) - byDate.get(b));
  } else {
    out = sortGroups(list);
    if (st.sort === 'old') out.reverse();
  }
  // 地域を選んでいるときは「県が締結」→「県内の市区町村」→「関連事業」の順に並べる（それぞれの中は上の順）
  if (role.size) {
    const R = { prefecture: 0, municipality: 1, organization: 2 };
    const idx = new Map(out.map((g, i) => [g, i]));
    out.sort((a, b) => R[role.get(a)] - R[role.get(b)] || idx.get(a) - idx.get(b));
  }
  return out;
}

// 選択肢ごとの件数（ほかの条件はそのまま当てはめ、その条件だけを外して数える）。選ぶと何件になるかを選択肢に表示する
export function facetCounts(db, st, keyword) {
  // 協定を1回ずつ見て、当てはまらない条件の数で振り分ける（条件ごとに全件を数え直さない）：
  //   すべての条件に当てはまる → どの選択肢の件数にも数える／1つだけ当てはまらない → その条件の選択肢の件数だけに数える
  const VALUES = {
    vs: g => [g.validity], cat: g => [g.kind], c: g => g.countries, f: g => g.fields, s: g => [g.status],
    ot: g => [g.orgType], pk: g => [g.pairKind], ev: g => [g.official ? 'official' : 'news'],
  };
  const out = Object.fromEntries(Object.keys(VALUES).map(k => [k, new Map()]));
  const add = (m, v) => m.set(v, (m.get(v) || 0) + 1);
  const prefs = new Map(), docs = new Map();
  const addDoc = g => { add(docs, 'all'); if (g.category === 'mou_moc') add(docs, 'mou'); if (g.relation === 'direct') add(docs, 'foreign'); };
  for (const g of db.groups) {
    if (keyword && !keyword.has(g.key)) continue;
    const miss = failing(g, st);
    if (miss.length > 1) continue;
    const inRegion = !st.p.length || !!regionRole(g, st.p);
    if (!miss.length) {
      // 都道府県の選択肢：その県を選んだときの件数（県が締結・県内の市区町村・関連事業の地域）
      const codes = g.level === 'organization' ? g.regions : (g.level === 'prefecture' || g.level === 'municipality') && g.pref_code ? [g.pref_code] : [];
      for (const c of new Set(codes)) add(prefs, c);
      if (!inRegion) continue;
      for (const [k, f] of Object.entries(VALUES)) for (const v of new Set(f(g))) add(out[k], v);
      addDoc(g);
    } else if (inRegion) {
      const k = miss[0];
      if (k === 'doc') addDoc(g);
      else if (VALUES[k]) for (const v of new Set(VALUES[k](g))) add(out[k], v);
    }
  }
  const vPreset = new Map(V_PRESETS.map(p => [p.code, p.states.reduce((a, x) => a + (out.vs.get(x) || 0), 0)]));
  return { p: prefs, ...out, vPreset, doc: docs };
}
// 当てはまらない条件（2つ見つかったら打ち切る）
const CHECKS = ['vs', 'doc', 'cat', 'c', 'f', 's', 'ot', 'pk', 'ev', 'y'];
function failing(g, st) {
  const miss = [];
  for (const k of CHECKS) if (!passOne(g, st, k)) { miss.push(k); if (miss.length > 1) break; }
  return miss;
}
// 条件を1つだけ確かめる
function passOne(g, st, k) {
  switch (k) {
    case 'vs': return st.vs.includes(g.validity);
    case 'doc': return st.doc === 'all' || (st.doc === 'mou' ? g.category === 'mou_moc' : g.relation === 'direct');
    case 'cat': return !st.cat.length || st.cat.includes(g.kind);
    case 'c': return !st.c.length || st.c.some(c => g.countries.includes(c));
    case 'f': return !st.f.length || st.f.some(f => g.fields.includes(f));
    case 's': return !st.s.length || st.s.includes(g.status);
    case 'ot': return !st.ot.length || st.ot.includes(g.orgType);
    case 'pk': return !st.pk.length || st.pk.includes(g.pairKind);
    case 'ev': return !st.ev.length || st.ev.includes(g.official ? 'official' : 'news');
    default: { const y = g.first_year; return !((st.y1 && (!y || y < st.y1)) || (st.y2 && (!y || y > st.y2))); }
  }
}

// 条件のうち「選んだもの」（いまの検索条件のタグに出すもの）。有効性・文書の範囲は、いちばん広い選び方でなければ出す
export function conditionTags(db, st, names) {
  const tags = [];
  if (st.q) tags.push({ key: 'q', label: `キーワード：${st.q}` });
  for (const c of st.p) tags.push({ key: 'p', value: c, label: `地域：${names.pref(c)}` });
  for (const c of st.c) tags.push({ key: 'c', value: c, label: `相手国：${names.country(c)}` });
  for (const c of st.f) tags.push({ key: 'f', value: c, label: `分野：${FIELD[c].ja}` });
  for (const c of st.s) tags.push({ key: 's', value: c, label: `事業の実施状況：${STATUS[c].ja}` });
  const pre = presetOf(st.vs);
  if (pre !== 'any' && pre !== 'all') tags.push({ key: 'vs', label: `有効性：${pre ? V_PRESET[pre].ja : st.vs.map(v => VALIDITY[v].ja).join('・') || '（なし）'}` });
  if (st.doc !== 'all') tags.push({ key: 'doc', label: `文書：${DOC_PRESETS.find(d => d.code === st.doc).ja}` });
  for (const c of st.cat) tags.push({ key: 'cat', value: c, label: `文書の種類：${DOC_KIND[c].ja}` });
  for (const c of st.ot) tags.push({ key: 'ot', value: c, label: `日本側：${JAPAN_ORG_TYPE[c].ja}` });
  for (const c of st.pk) tags.push({ key: 'pk', value: c, label: `組み合わせ：${PAIR_KIND[c].ja}` });
  // 報道のみの記録は、初期設定（公式資料で確認できたものだけ）から変えたときだけタグにする
  if (!st.ev.length) tags.push({ key: 'ev', label: '報道のみの情報も含む' });
  else if (st.ev.length === 1 && st.ev[0] === 'news') tags.push({ key: 'ev', label: '報道のみの情報だけ' });
  if (st.y1) tags.push({ key: 'y1', label: `締結年：${st.y1}年から` });
  if (st.y2) tags.push({ key: 'y2', label: `締結年：${st.y2}年まで` });
  return tags;
}

// タグの × を押したとき（その条件だけを外す）。有効性・文書の範囲は「締結済みすべて」「すべての国際文書」に広げる
export function removeTag(st, key, value) {
  const n = { ...st };
  if (key === 'q') n.q = '';
  else if (key === 'vs') n.vs = [...V_PRESET.all.states];
  else if (key === 'doc') n.doc = 'all';
  else if (key === 'ev') n.ev = ['official'];
  else if (key === 'y1' || key === 'y2') n[key] = null;
  else n[key] = st[key].filter(x => x !== value);
  if (key === 'p') n.lv = 'all';
  if (key === 'c' && n.c.length < 2) n.color = 'count';
  if (!n.q && n.sort === 'rel') n.sort = 'new';
  return n;
}
// すべて解除：登録した締結済みの協定すべて（公式資料で確認できたもの。トップの「登録済み」と同じ範囲）
export function clearAll(st) {
  return { ...st, q: '', p: [], c: [], f: [], s: [], cat: [], ot: [], pk: [], y1: null, y2: null, vs: [...V_PRESET.all.states], doc: 'all', ev: ['official'], lv: 'all', sort: 'new', color: 'count' };
}
// 初期設定（地図の件数の初期設定：有効確認のみ・MOUのみ・公式資料のみ）
export function defaults(st) {
  return { ...clearAll(st), vs: [...V_PRESET.valid.states], doc: 'mou' };
}
// 共有している数え方へ書き戻す値（ほかのページでも同じ数え方で表示するため）
export function scopeOf(st) {
  const pre = presetOf(st.vs);
  return { validity: VALIDITY_SCOPE[pre] ? pre : null, docScope: st.doc, includeNews: !st.ev.length || st.ev.includes('news') };
}
