// サイト内検索の仕組み（画面は page-search.js）
// ・スペースで区切った言葉は、すべてを含む協定だけを探す（AND検索）
// ・表記ゆれ（CLAIR／クレア／自治体国際化協会、ベトナム／Viet Nam など）は同じ言葉として探す
// ・どの項目（協定名・本文・相手機関・署名者…）に一致したかを記録して、画面に表示する
// 検索の対象は、有効性・文書の種類・期間を問わず、登録したすべての文書（締結予定・報道のみを含む）です。
import {
  FIELD, DOC_CATEGORY, DOC_KIND, DOC_KINDS, JAPAN_ORG_TYPE, JAPAN_ORG_TYPES, PAIR_KIND, PAIR_KINDS, PARTNER_TYPES, ACCEPTANCE_TYPES,
  NUMBER_KIND, BUDGET_KIND, VALIDITY, VALIDITIES, LEVELS, FIELDS, countryName, prefName, sortGroups,
} from './data.js';

// 検索する項目（表示の順）。weight は並べ替え（関連度順）に使う重み
// 「締結主体」（協定の当事者）と「情報源」（出典の資料を出した機関）は別の項目として記録し、画面でも分けて表示します
export const SEARCH_FIELDS = [
  { key: 'title', ja: '協定名', weight: 10 },
  { key: 'content', ja: '本文・合意内容', weight: 3 },
  { key: 'japan_org', ja: '日本側の締結主体', weight: 7 },
  { key: 'partner_org', ja: '相手側の締結主体', weight: 7 },
  { key: 'signatory', ja: '署名者', weight: 5 },
  { key: 'agency', ja: '担当省庁', weight: 5 },
  { key: 'related_org', ja: '関連する団体・企業', weight: 4 },
  { key: 'region', ja: '都道府県・市区町村', weight: 6 },
  { key: 'related_region', ja: '関連事業の地域', weight: 1 },
  { key: 'country', ja: '相手国', weight: 6 },
  { key: 'doc_type', ja: '文書の種類', weight: 4 },
  { key: 'field', ja: '分野', weight: 3 },
  { key: 'system', ja: '在留資格・制度', weight: 3 },
  { key: 'project', ja: '関連する事業', weight: 2 },
  { key: 'number', ja: '受入れ人数（目標・実績）', weight: 2 },
  { key: 'budget', ja: '予算・決算', weight: 2 },
  { key: 'source', ja: '情報源（出典の資料名・発行元。締結主体ではない）', weight: 1 },
  { key: 'actor', ja: '締結主体の種類', weight: 3 },
  { key: 'note', ja: '備考・署名の場', weight: 1 },
];
export const SEARCH_FIELD = Object.fromEntries(SEARCH_FIELDS.map(f => [f.key, f]));

// 表記ゆれ（同じものを指す言葉）。どれか1つで検索すると、ほかの言葉でも探します。
// 国名・都道府県名の別名は countries.json・prefectures.json から自動で加えます。
export const SYNONYMS = [
  ['CLAIR', 'クレア', '自治体国際化協会', 'Council of Local Authorities for International Relations'],
  ['NAGOMi', 'なごみ', '外国人材共生支援全国協会'],
  ['VAMAS', 'ベトナム海外労働者派遣協会', 'Vietnam Association of Manpower Supply'],
  ['日本国政府', '日本政府', 'Government of Japan'],
  ['MOU', '覚書', '了解覚書', 'Memorandum of Understanding'],
  ['MOC', '協力覚書', 'Memorandum of Cooperation'],
  ['R/D', 'RD', 'RoD', '討議議事録', 'Record of Discussions', 'Record of Discussion'],
  ['EPA', '経済連携協定', 'Economic Partnership Agreement'],
  ['JICA', 'ジャイカ', '国際協力機構', 'Japan International Cooperation Agency'],
  ['JETRO', 'ジェトロ', '日本貿易振興機構', 'Japan External Trade Organization'],
  ['JITCO', 'ジツコ', '国際人材協力機構', '国際研修協力機構', 'Japan International Trainee & Skilled Worker Cooperation Organization'],
  ['OTIT', '外国人技能実習機構', 'Organization for Technical Intern Training'],
  ['アイム・ジャパン', 'IM Japan', 'IMジャパン', '国際人材育成機構'],
  ['ONODERA USER RUN', 'オノデラユーザーラン', 'オノデラ'],
  ['NBCC', '全国ビジネスサポート協同組合連合会', 'National Business Support Combined Cooperatives'],
  ['JBBRA', 'Japan Bangla Bridge Recruiting Agency', 'ジャパンバングラブリッジ'],
  ['BMET', '人材雇用・訓練局', 'Bureau of Manpower, Employment and Training'],
  ['MoEWOE', 'MEWOE', '海外居住者福利厚生・海外雇用省', '海外移住者福利厚生・海外雇用省', "Ministry of Expatriates' Welfare and Overseas Employment"],
  ['SLBFE', 'スリランカ海外雇用局', 'Sri Lanka Bureau of Foreign Employment'],
  ['JP-MIRAI', 'JPミライ', '責任ある外国人労働者受入れプラットフォーム'],
  ['JBIC', '国際協力銀行'],
  ['JAC', '建設技能人材機構'],
  ['HIDA', 'AOTS', '海外産業人材育成協会'],
  ['技能実習', 'Technical Intern Training', 'TITP'],
  ['特定技能', 'Specified Skilled Worker', 'SSW'],
  ['育成就労', 'Employment for Skill Development'],
  ['ワーキング・ホリデー', 'ワーホリ', 'Working Holiday'],
  ['介護', 'caregiver', 'care worker'],
  ['看護', 'nurse'],
  ['外務省', 'MOFA'],
  ['厚生労働省', '厚労省', 'MHLW'],
  ['法務省', 'MOJ'],
  ['出入国在留管理庁', '入管庁', '入管', '入国管理局', 'ISA'],
  ['経済産業省', '経産省', 'METI'],
  ['国土交通省', '国交省', 'MLIT'],
  ['農林水産省', '農水省', 'MAFF'],
  ['文部科学省', '文科省', 'MEXT'],
  ['労働・傷病兵・社会問題省', 'MOLISA'],
  ['海外労働管理局', 'DOLAB'],
  ['首相官邸', '官邸'],
  ['政令指定都市', '政令市'],
];

// 省庁名（国の協定の日本側の名前から「担当省庁」を取り出す）
export const MINISTRY_RE = /法務省|出入国在留管理庁|外務省|厚生労働省|警察庁|経済産業省|農林水産省|文部科学省|国土交通省|総務省|内閣府|内閣官房|環境省|防衛省|財務省|デジタル庁|こども家庭庁/g;

// ---------- 文字の正規化（表記ゆれをそろえる） ----------
// 全角・半角、大文字・小文字、カタカナ・ひらがなをそろえ、空白・記号を除く。
// 画面で一致した部分に印を付けられるよう、元の文字の位置（map）も残す。
const DROP = /[\s・･\-‐–—_.,、。（）()「」『』〔〕【】［］\[\]"'“”‘’／/:：;；!！?？~〜]/;
export function prep(raw) {
  const s = String(raw ?? '').normalize('NFKC');
  let n = '', w = '';
  const map = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i].toLowerCase();
    if (c >= 'ァ' && c <= 'ヶ') c = String.fromCharCode(c.charCodeAt(0) - 0x60);
    // 英数字の単語どうしの区切りを残した形（短い英字の略語を、単語として探すため）
    w += /[a-z0-9]/.test(c) ? c : ' ';
    if (DROP.test(c)) continue;
    n += c;
    map.push(i);
  }
  return { s, n, w, map };
}
const isAscii = n => /^[a-z0-9]+$/.test(n);

// 言葉1つを、探し方の候補（別名）に広げる
function makeAlt(text, exclude) {
  const p = prep(text);
  if (!p.n) return null;
  const ascii = isAscii(p.n);
  // 4文字以下の英字の略語（EPA・MOU・ISA など）は、単語として一致したときだけ（department の中の epa などを除く）
  const word = ascii && p.n.length <= 4 ? p.w.trim().replace(/\s+/g, ' ') : null;
  return { text, n: p.n, word, exclude: exclude || [] };
}

// 「覚書」で探すときに「協力覚書」（MOC）の一部には一致させない（MOU と MOC を混同しない）
const WORD_EXCLUDE = { 覚書: ['協力覚書'] };

function synonymTable(db) {
  if (db._syn) return db._syn;
  const groups = SYNONYMS.map(list => ({ list, kind: 'word' }));
  for (const c of db.countries || []) groups.push({ list: [c.ja, c.en, ...(c.aliases || [])].filter(Boolean), kind: 'country', code: c.code });
  for (const p of db.prefs || []) groups.push({ list: [p.name, p.short, p.en].filter(Boolean), kind: 'pref', code: p.code });
  // 都道府県の短い名前が別の都道府県名の一部になっている場合（「京都」と「東京都」）は、その部分を一致に数えない
  const prefNames = (db.prefs || []).map(p => prep(p.name).n);
  const excludeFor = n => prefNames.filter(x => x !== n && x.includes(n) && !x.startsWith(n));
  // 国名も同じ（「インド」と「インドネシア」）。同じ国の別名（インドネシア共和国など）は除外しない
  const countryNames = (db.countries || []).flatMap(c => [c.ja, c.en, ...(c.aliases || [])].filter(Boolean).map(t => ({ code: c.code, n: prep(t).n })));
  const excludeCountry = (n, code) => [...new Set(countryNames.filter(x => x.code !== code && x.n !== n && x.n.includes(n)).map(x => x.n))];
  const index = new Map();
  for (const g of groups) {
    g.alts = g.list.map(t => makeAlt(t, g.kind === 'pref' ? excludeFor(prep(t).n) : g.kind === 'country' ? excludeCountry(prep(t).n, g.code) : (WORD_EXCLUDE[t] || []).map(x => prep(x).n))).filter(Boolean);
    for (const a of g.alts) {
      if (!index.has(a.n)) index.set(a.n, []);
      index.get(a.n).push(g);
    }
  }
  // 複数の単語からなる名前（Viet Nam、Sri Lanka など）は、スペースで区切られても1つの言葉として扱う
  const phrases = [...new Set(groups.flatMap(g => g.list).filter(t => /\s/.test(t.trim())).map(t => t.normalize('NFKC').toLowerCase().trim()))].sort((a, b) => b.length - a.length);
  db._syn = { index, phrases };
  return db._syn;
}

// 検索語を言葉に分ける（スペース区切り。"…" で囲むとひとまとまり）
const JOIN = '\uE000'; // 複数の単語からなる別名の中のスペースを、区切りと見なさないための目印（私用の文字）
export function parseQuery(db, q) {
  const syn = synonymTable(db);
  let s = String(q || '').normalize('NFKC').replace(/　/g, ' ').trim();
  if (!s) return { raw: '', tokens: [] };
  const lower = s.toLowerCase();
  // 複数の単語からなる別名をひとまとまりにする（元の大文字・小文字は残す）
  for (const ph of syn.phrases) {
    let i = lower.indexOf(ph);
    while (i >= 0) {
      s = s.slice(0, i) + s.slice(i, i + ph.length).replace(/ /g, JOIN) + s.slice(i + ph.length);
      i = lower.indexOf(ph, i + ph.length);
    }
  }
  const parts = [];
  s.replace(/"([^"]+)"|(\S+)/g, (_, a, b) => { parts.push((a || b).split(JOIN).join(' ').trim()); return ''; });
  const seen = new Set();
  const tokens = [];
  for (const text of parts) {
    const base = makeAlt(text);
    if (!base || seen.has(base.n)) continue;
    seen.add(base.n);
    const groups = syn.index.get(base.n) || [];
    const alts = [base];
    const names = [];
    for (const g of groups) for (const a of g.alts) {
      if (!alts.some(x => x.n === a.n)) { alts.push(a); names.push(a.text); }
      // 地名・国名の除外（「京都」で東京都を拾わない）は入力した言葉にも当てはめる。
      // 言葉の別名の除外（MOUの別名「覚書」で協力覚書を拾わない）は、入力した言葉そのものには当てはめない
      else if (g.kind !== 'word' && a.exclude.length && alts.find(x => x.n === a.n)) alts.find(x => x.n === a.n).exclude = a.exclude;
    }
    tokens.push({ text, n: base.n, alts, synonyms: [...new Set(names)], kinds: groups.map(g => ({ kind: g.kind, code: g.code })) });
  }
  return { raw: String(q).trim(), tokens };
}

// 任意の文字（組織名など）が、言葉（別名を含む）に一致するか
export function textMatches(text, token) {
  const e = prep(text);
  return token.alts.some(a => findIn(e, a));
}

// 1つの項目の文字の中で、言葉（別名を含む）が現れる位置を探す
function findIn(e, a) {
  if (a.word) {
    const i = (' ' + e.w + ' ').indexOf(' ' + a.word + ' ');
    return i < 0 ? null : { start: i, end: i + a.word.length };
  }
  let from = 0;
  for (;;) {
    const i = e.n.indexOf(a.n, from);
    if (i < 0) return null;
    // 除外する言葉（東京都の中の「京都」など）の一部なら、次の位置を探す
    const bad = a.exclude.some(x => { const k = x.indexOf(a.n); return k >= 0 && e.n.substr(i - k, x.length) === x; });
    if (!bad) return { start: e.map[i], end: e.map[i + a.n.length - 1] + 1 };
    from = i + 1;
  }
}

// ---------- 協定ごとの検索用の索引 ----------
export function groupIndex(db, g) {
  if (g._idx) return g._idx;
  const list = [];
  const add = (field, text) => {
    if (text === null || text === undefined) return;
    const t = (Array.isArray(text) ? text.filter(x => x !== null && x !== undefined && x !== '').join(' ／ ') : String(text)).trim();
    if (t) list.push({ field, ...prep(t) });
  };
  for (const v of g.versions) {
    add('title', v.title_ja === '（名称未登録）' ? null : v.title_ja);
    add('title', v.title_original);
    add('content', v.purpose);
    v.summary.forEach(x => add('content', x));
    v.content.forEach(x => add('content', x));
    add('content', v.validity);
    add('japan_org', v.japan_org);
    add('japan_org', v.japan_org_en);
    add('japan_org', v.municipality_name);
    add('partner_org', v.partner_org);
    add('partner_org', v.partner_org_en);
    for (const a of v.additional_partners) { add('partner_org', a.partner_org); add('partner_org', a.partner_org_en); }
    add('signatory', v.japan_signatory);
    add('signatory', v.partner_signatory);
    add('agency', [...new Set([...(v.agencies || []), ...((v.japan_org || '').match(MINISTRY_RE) || [])])]);
    add('related_org', v.other_japan_parties);
    add('related_org', (v.projects || []).map(p => p.agency));
    if (v.japan_level !== 'organization') add('region', prefName(db, v.pref_code));
    add('region', v.municipality_name);
    for (const r of v.related_regions) add('related_region', `${prefName(db, r.pref_code)}${r.text ? '：' + r.text : ''}`);
    // 「MOU・MOC」の分類名は全部の覚書に付くので入れず、詳しい区分（MOU／MOC／協定書・合意書など／R/D…）を入れる
    // （MOU と MOC、覚書と R/D を区別して探せるように）
    add('doc_type', [v.doc_type, v.doc_category === 'mou_moc' ? null : DOC_CATEGORY[v.doc_category]?.ja, DOC_KIND[v._kind]?.ja, v.doc_type_note]);
    add('field', v.fields.map(f => FIELD[f]?.ja));
    add('system', [...(v.labor_detail || []), ...v.related_systems.map(k => db.systemByKey?.get(k)?.name || k), ...v.acceptance_types.map(t => ACCEPTANCE_TYPES[t] || t)]);
    for (const p of v.projects) add('project', [p.name, p.detail]);
    for (const i of v.impacts) if (i.stage !== 'agreed') add('project', i.text);
    add('project', v.status_note);
    for (const n of v.numbers) add('number', [NUMBER_KIND[n.kind]?.ja, n.label, n.value == null ? null : `${Number(n.value).toLocaleString('ja-JP')}${n.unit || '人'}`, n.period, n.definition]);
    for (const b of v.budgets) add('budget', [b.fiscal_year ? `${b.fiscal_year}年度` : null, BUDGET_KIND[b.kind], b.item, b.original_text, b.relation]);
    for (const s of v.sources) add('source', [s.title, s.publisher]);
    add('actor', [LEVELS[v.japan_level], JAPAN_ORG_TYPE[v._orgType]?.ja, PAIR_KIND[v._pairKind]?.ja, PARTNER_TYPES[v.partner_type]]);
    add('note', [v.ceremony_note, v.notes, v.date_note]);
  }
  for (const c of g.countries) {
    const x = db.countryByCode.get(c);
    if (x) add('country', [x.ja, x.en, ...(x.aliases || [])]);
  }
  g._idx = list;
  return list;
}

// 1つの協定が、すべての言葉に一致するか。一致したら、言葉ごとに一致した項目と、最初に一致した箇所を返す
export function matchGroup(db, g, tokens) {
  const idx = groupIndex(db, g);
  const hits = [];
  let score = 0;
  for (const t of tokens) {
    const fields = new Map();
    for (const e of idx) {
      if (fields.has(e.field)) continue;
      for (const a of t.alts) {
        const pos = findIn(e, a);
        if (pos) { fields.set(e.field, { e, ...pos }); break; }
      }
    }
    if (!fields.size) return null;
    const keys = SEARCH_FIELDS.map(f => f.key).filter(k => fields.has(k));
    score += Math.max(...keys.map(k => SEARCH_FIELD[k].weight));
    hits.push({ token: t, fields: keys, at: Object.fromEntries([...fields].map(([k, v]) => [k, v])) });
  }
  return { g, score, hits };
}

export function searchGroups(db, q, groups = db.groups) {
  const parsed = typeof q === 'string' ? parseQuery(db, q) : q;
  if (!parsed.tokens.length) return groups.map(g => ({ g, score: 0, hits: [] }));
  const out = [];
  for (const g of groups) { const r = matchGroup(db, g, parsed.tokens); if (r) out.push(r); }
  return out;
}

// 言葉ごとに、その言葉だけで何件見つかるか（0件のときの説明に使う）
export function tokenCounts(db, parsed, groups = db.groups) {
  return parsed.tokens.map(t => ({ token: t, n: groups.filter(g => matchGroup(db, g, [t])).length }));
}

// 一致した箇所の前後を短く切り出す（一致した部分は <mark>）
export function snippet(hit, esc, len = 46) {
  const { e, start, end } = hit;
  const a = Math.max(0, start - len), b = Math.min(e.s.length, end + len);
  return `${a > 0 ? '…' : ''}${esc(e.s.slice(a, start))}<mark>${esc(e.s.slice(start, end))}</mark>${esc(e.s.slice(end, b))}${b < e.s.length ? '…' : ''}`;
}

// ---------- 検索結果の再絞り込み ----------
// 1つの項目の中で複数を選ぶと「どれか」（OR）、項目どうしは「すべて」（AND）
// 文書の種類は詳しい区分（MOU／MOC／協定書・合意書など／R/D／EPA…）で選ぶ。協力関係ごとに、最新の文書の種類で数える
export const FACETS = [
  { key: 'vs', ja: '有効性', values: g => [g.validity], label: (db, v) => VALIDITY[v]?.ja || v, order: VALIDITIES.map(v => v.code), desc: v => VALIDITY[v]?.desc },
  { key: 'cat', ja: '文書の種類', values: g => [g.kind], label: (db, v) => DOC_KIND[v]?.ja || v, order: DOC_KINDS.map(c => c.code), desc: v => DOC_KIND[v]?.desc },
  { key: 'ot', ja: '締結主体（日本側）', values: g => [g.orgType], label: (db, v) => JAPAN_ORG_TYPE[v]?.ja || v, order: JAPAN_ORG_TYPES.map(t => t.code), desc: v => JAPAN_ORG_TYPE[v]?.desc },
  { key: 'c', ja: '相手国・地域', values: g => g.countries, label: (db, v) => countryName(db, v) },
  { key: 'p', ja: '都道府県（県・県内の市区町村が締結）', values: g => g.pref_code ? [g.pref_code] : [], label: (db, v) => prefName(db, v), byCode: true },
  { key: 'f', ja: '分野', values: g => g.fields, label: (db, v) => FIELD[v]?.ja || v, order: FIELDS.map(f => f.code) },
  { key: 'pk', ja: '当事者の組み合わせ', values: g => [g.pairKind], label: (db, v) => PAIR_KIND[v]?.ja || v, order: PAIR_KINDS.map(t => t.code), desc: v => PAIR_KIND[v]?.desc },
  // 地図などの件数は、初期設定で「報道のみ」の記録を含めない。検索から同じ条件で数えられるようにする
  { key: 'ev', ja: '確認の根拠', values: g => [g.official ? 'official' : 'news'], label: (db, v) => ({ official: '公式資料で確認', news: '報道のみ（公式資料は未確認）' }[v] || v), order: ['official', 'news'] },
];
// 以前のリンク（cat=mou_moc など、大きな分類の名前）を、詳しい区分に読み替える
export function expandKinds(list) {
  return [...new Set(list.flatMap(v => DOC_KIND[v] ? [v] : DOC_CATEGORY[v] ? DOC_KINDS.filter(k => k.cat === v).map(k => k.code) : []))];
}
export const FACET = Object.fromEntries(FACETS.map(f => [f.key, f]));

// sel = { ot:[], pk:[], c:[], p:[], cat:[], vs:[], f:[], y1, y2 }
export function passFacets(g, sel, except) {
  for (const f of FACETS) {
    if (f.key === except) continue;
    const want = sel[f.key];
    if (want && want.length && !f.values(g).some(v => want.includes(v))) return false;
  }
  if (except !== 'y') {
    const y = g.first_year;
    if (sel.y1 && (!y || y < sel.y1)) return false;
    if (sel.y2 && (!y || y > sel.y2)) return false;
  }
  return true;
}
export function applyFacets(results, sel) {
  return results.filter(r => passFacets(r.g, sel));
}
// それぞれの項目の選択肢ごとの件数（ほかの項目の条件はそのまま当てはめて数える）
export function facetCounts(db, results, sel) {
  const out = {};
  for (const f of FACETS) {
    const m = new Map();
    for (const r of results) {
      if (!passFacets(r.g, sel, f.key)) continue;
      for (const v of new Set(f.values(r.g))) m.set(v, (m.get(v) || 0) + 1);
    }
    // 選んでいる値は、件数が0になっても表示する（外せるように）
    for (const v of sel[f.key] || []) if (!m.has(v)) m.set(v, 0);
    let entries = [...m];
    if (f.order) entries.sort((a, b) => f.order.indexOf(a[0]) - f.order.indexOf(b[0]));
    else if (f.byCode) entries.sort((a, b) => a[0].localeCompare(b[0]));
    else entries.sort((a, b) => b[1] - a[1] || f.label(db, a[0]).localeCompare(f.label(db, b[0]), 'ja'));
    out[f.key] = entries;
  }
  const years = results.filter(r => passFacets(r.g, sel, 'y')).map(r => r.g.first_year).filter(Boolean);
  out.years = years.length ? [Math.min(...years), Math.max(...years)] : null;
  return out;
}

export function sortResults(results, how) {
  if (how === 'new' || how === 'old') {
    const s = sortGroups(results.map(r => r.g));
    if (how === 'old') s.reverse();
    const order = new Map(s.map((g, i) => [g, i]));
    return [...results].sort((a, b) => order.get(a.g) - order.get(b.g));
  }
  const byDate = new Map(sortGroups(results.map(r => r.g)).map((g, i) => [g, i]));
  return [...results].sort((a, b) => b.score - a.score || byDate.get(a.g) - byDate.get(b.g));
}
