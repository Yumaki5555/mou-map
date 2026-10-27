// データの読み込みと集計。表示用の言葉（ラベル）もここで一元管理します。
import { yearOf, dateKey, norm, today } from './util.js';

// ---------- 表示用ラベル ----------
export const FIELDS = [
  { code: 'labor', ja: '外国人材・労働', desc: '特定技能・技能実習・介護人材など、海外から働き手を受け入れる・育てるための協力' },
  { code: 'economy', ja: '経済・投資・企業誘致', desc: '貿易・投資・企業の進出や誘致に関する協力' },
  { code: 'education', ja: '教育・留学・研究', desc: '留学生の受入れ、学校・大学どうしの交流、共同研究など' },
  { code: 'medical', ja: '医療・福祉', desc: '医療・介護・福祉の分野での協力（人材受入れは「外国人材・労働」にも分類）' },
  { code: 'tourism', ja: '観光・文化', desc: '観光客の誘致、文化・スポーツ・青少年の交流など' },
  { code: 'agri', ja: '農業・水産業', desc: '農林水産業の技術協力、農産物の輸出入など' },
  { code: 'disaster_env', ja: '防災・環境・技術', desc: '防災、環境保全、エネルギー、科学技術での協力' },
  { code: 'other', ja: 'その他', desc: '上のどれにも当てはまらないもの' },
];
export const FIELD = Object.fromEntries(FIELDS.map(f => [f.code, f]));

// 「事業の実施状況」（協定の有効性とは別に管理します）
export const STATUSES = [
  { code: 'signed', ja: '事業は未確認', desc: '締結は確認できたが、協定に基づく具体的な事業はまだ確認できていない' },
  { code: 'in_progress', ja: '具体的な事業が実施中', desc: '協定に関連する具体的な事業（人材の受入れ、研修など）が行われていることを確認' },
  { code: 'completed', ja: '事業は完了', desc: '予定された事業が終わったことを確認' },
  { code: 'expired', ja: '事業は終了', desc: '関連する事業・期間が終わったことを確認（協定の有効性は「有効性」欄を参照）' },
  { code: 'unknown', ja: '実施状況未確認', desc: '締結後の事業の状況を公式資料で確認できていない' },
];
export const STATUS = Object.fromEntries(STATUSES.map(s => [s.code, s]));
STATUS.planned = { code: 'planned', ja: '締結予定・締結未確認', desc: '予定は発表されたが、締結したことを確認できていない（件数に含めません）' };

// 協定の有効性（5区分）。事業の実施状況とは別。公式資料で確認できないものは自動で有効・終了にしません。
export const VALIDITIES = [
  { code: 'valid_confirmed', ja: '有効確認', short: '有効', color: '#1d7347', desc: '公式資料で、現在も効力があることを確認できた（有効期間内・更新済み・現在運用中と明記など）' },
  { code: 'unconfirmed', ja: '有効性未確認', short: '未確認', color: '#b7791f', desc: '現在も有効かどうかを公式資料で確認できていない（期限・更新・終了の情報が見つからない、または調査未完了）' },
  { code: 'ended_confirmed', ja: '終了確認', short: '終了', color: '#6b7280', desc: '公式資料で、終了・失効・期間満了・後継協定への置き換えを確認できた' },
  { code: 'signed_not_started', ja: '締結済み・開始前', short: '開始前', color: '#2b6cb0', desc: '締結は確認できたが、文書に書かれた開始日などがまだ来ていない' },
  { code: 'planned', ja: '締結予定', short: '予定', color: '#9aa5a0', desc: '締結の予定が発表されただけで、締結を確認できていない（締結済みの件数に含めません）' },
];
export const VALIDITY = Object.fromEntries(VALIDITIES.map(v => [v.code, v]));
// 件数に含める範囲の切り替え（地図・一覧・グラフ・CSV・画像のすべてで同じ基準を使う）
export const VALIDITY_SCOPES = [
  { code: 'valid', ja: '有効確認のみ', states: ['valid_confirmed'], desc: '現在も有効だと公式資料で確認できたものだけ' },
  { code: 'valid_unk', ja: '有効確認＋有効性未確認', states: ['valid_confirmed', 'unconfirmed'], desc: '終了確認・開始前を除いたもの' },
  { code: 'all', ja: 'すべて（終了済みを含む）', states: ['valid_confirmed', 'unconfirmed', 'ended_confirmed', 'signed_not_started'], desc: '締結済みのものすべて（締結予定は含まない）' },
];
export const VALIDITY_SCOPE = Object.fromEntries(VALIDITY_SCOPES.map(v => [v.code, v]));

// 文書の種類（MOU以外の国際的な合意文書も登録します）
export const DOC_CATEGORIES = [
  { code: 'mou_moc', ja: 'MOU・MOC', desc: '覚書・協力覚書（MOC）・了解覚書など、協力の内容や方針を確認する文書。多くは法的拘束力がないと明記' },
  { code: 'epa_treaty', ja: 'EPA等の条約・協定', desc: '経済連携協定（EPA）など、国会の承認を経て結ぶ条約。法的拘束力がある' },
  { code: 'exchange_of_notes', ja: '交換公文', desc: '政府どうしが書簡（公文）を交換して合意する国際約束' },
  { code: 'bilateral_arrangement', ja: 'その他の二国間取決め', desc: 'ワーキング・ホリデー制度など、政府間の取決め（口上書の交換など）' },
  { code: 'joint_statement', ja: '共同声明・アクションプラン', desc: '首脳会談などで目標や協力事業を示す政治的な文書。人数の目標は受入れの義務ではない' },
  { code: 'other', ja: 'その他', desc: '上のどれにも当てはまらない、受入れに関係する国際的な枠組み' },
];
export const DOC_CATEGORY = Object.fromEntries(DOC_CATEGORIES.map(d => [d.code, d]));
// 地図・件数に含める文書の範囲
export const DOC_SCOPES = [
  { code: 'mou', ja: 'MOUのみ', desc: 'MOU・MOC（覚書・協力覚書など）だけを数える' },
  { code: 'foreign', ja: '外国人受入れに関する国際文書', desc: '文書の種類を問わず、外国人の受入れに直接関係するものだけを数える' },
  { code: 'all', ja: 'その他の協定を含む登録文書', desc: 'このサイトに登録したすべての国際文書を数える' },
];
export const DOC_SCOPE = Object.fromEntries(DOC_SCOPES.map(d => [d.code, d]));

// 外国人の受入れとの関係（このサイトによる分類。分類の考え方は「調査状況・使い方」に掲載）
export const RELATIONS = [
  { code: 'direct', ja: '直接関係する', desc: '外国人の受入れ・送出し・就労・研修・留学の仕組みそのものを扱う' },
  { code: 'indirect', ja: '間接的に関係する', desc: '人材育成・学生交流・招へいなど、来日につながりうる協力を含む' },
  { code: 'general', ja: '一般的な国際協力', desc: '経済・観光・防災など、外国人の受入れを扱っていない' },
  { code: 'unconfirmed', ja: '関連性未確認', desc: '合意内容を確認できず、判断できない' },
];
export const RELATION = Object.fromEntries(RELATIONS.map(r => [r.code, r]));

// 就労・留学・研修・定住などの区別
export const ACCEPTANCE_TYPES = {
  work: '就労', training: '研修・技能実習', study: '留学', residence: '定住・長期滞在', short_term: '短期の交流・訪問', two_way: '双方向の人的交流（日本から相手国へも含む）',
};

// 人数の種類（同じ数として扱わない）
export const NUMBER_KINDS = [
  { code: 'target', ja: '受入れ・交流の目標', desc: '政治的な目標。法的な受入れ義務ではありません' },
  { code: 'legal_cap', ja: '法令・取決め等に基づく上限（枠）', desc: '受け入れることができる人数の上限。上限まで受け入れるという意味ではありません' },
  { code: 'planned_hiring', ja: '採用・受入れの予定人数', desc: '計画・見込みの人数' },
  { code: 'actual_entry', ja: '実際に入国した人数', desc: '実績（期間を確認してください）' },
  { code: 'actual_employed', ja: '実際に働いている人数', desc: '実績' },
  { code: 'current_residents', ja: '現在の在留人数', desc: 'ある時点で日本に住んでいる人数' },
  { code: 'incl_students_trainees_short', ja: '留学・研修・短期交流を含む人数', desc: '働く人だけの数ではありません' },
  { code: 'two_way_exchange', ja: '双方向の人的交流の人数', desc: '日本から相手国へ行く人も含みます。日本に来る人数ではありません' },
  { code: 'exam_passed', ja: '国家試験の合格者数', desc: '実績。入国した人数・現在働いている人数とは別の数字です' },
];
export const NUMBER_KIND = Object.fromEntries(NUMBER_KINDS.map(n => [n.code, n]));

export const IMPACTS = [
  { code: 'population', letter: 'A', ja: '人口・外国人受入れ', items: '受入れ人数の目標と実績、関連する在留資格、就労・留学・定住、人口の変化' },
  { code: 'employment', letter: 'B', ja: '雇用・地域経済', items: '人手不足への対応、企業の採用・投資、地域産業への効果、新しい雇用' },
  { code: 'housing', letter: 'C', ja: '住宅・生活環境', items: '住まいの確保や支援、生活相談、多言語での対応、自治体が把握している課題' },
  { code: 'welfare', letter: 'D', ja: '教育・医療・福祉', items: '日本語教育、学校での支援、医療通訳、公共サービスの需要、行政の支援事業' },
  { code: 'fiscal', letter: 'E', ja: '税金・財政', items: '関連予算、実際の支出、国・県・市町村の負担、補助金・委託費、民間の負担' },
  { code: 'community', letter: 'F', ja: '住民生活・地域社会', items: '住民への説明、議会での審議、住民からの意見、生活上の課題と対応' },
];
export const IMPACT = Object.fromEntries(IMPACTS.map(i => [i.code, i]));

export const STAGES = [
  { code: 'agreed', ja: '合意した内容', desc: '協定の原文や公式発表に何が書かれているか' },
  { code: 'implemented', ja: '実際に行われたこと', desc: '事業・予算・受入れ実績など' },
  { code: 'observed', ja: '地域で確認された変化', desc: '統計・行政資料などから確認できる結果' },
];
export const STAGE = Object.fromEntries(STAGES.map(s => [s.code, s]));

export const CAUSALITY = {
  stated_by_gov: '行政資料がMOUの成果として記載',
  unconfirmed: '関連性は未確認',
  'n/a': '',
};

export const PARTNER_TYPES = {
  national_gov: '国（政府全体）',
  national_ministry: '中央省庁・その部局',
  subnational_gov: '地方政府（州・省など）',
  public_agency: '公的機関',
  university: '大学・学校',
  organization: '団体',
  company: '企業',
  international_org: '国際機関',
};

export const LEGAL = {
  not_binding: '法的拘束力はない（文書に明記）',
  binding: '法的拘束力がある（文書に明記）',
  not_stated: '原文に記載なし',
  unconfirmed: '未確認（原文を確認できていない）',
};

export const EVIDENCE = {
  original_text: '協定の原文で確認',
  official_announcement: '公式発表で確認',
  official_list: '公式の一覧で確認',
  assembly: '議会資料で確認',
  partner_official: '相手国側の公式発表で確認',
  news_only: '報道のみ（公式資料は未確認）',
};

export const ORIGINAL = {
  public: '原文が公開されている',
  not_public: '原文は公開されていない',
  unconfirmed: '原文の公開状況は未確認',
};

export const PAYERS = {
  national: '国', prefecture: '都道府県', municipal: '市町村', private: '民間', mixed: '複数の負担者', unknown: '負担者は未確認',
};
export const BUDGET_KIND = {
  planned: '計画予算', settled: '決算額（実際の支出）', subsidy: '補助金', other: 'その他', unknown: '種類不明（計画か決算か資料から判断できない）',
};
export const SOURCE_TYPES = {
  original_text: '協定原文', press_release: '報道発表', official_page: '公式ページ', assembly_minutes: '議会資料',
  budget: '予算・決算資料', statistics: '統計', partner_official: '相手国側の公式資料', news: '報道',
};
export const LEVELS = { national: '国・省庁', prefecture: '都道府県', municipality: '市区町村' };

export const SURVEY_RESULT = {
  found: '該当あり', none_confirmed: '該当なし（確認済み）', not_found: '調査したが確認できず',
  not_surveyed: '未調査', list_checked: '公式一覧を確認済み', partial: '一部のみ調査',
};
export const ZERO_STATES = {
  none: { ja: '該当なし（公式資料で確認）', desc: '公式の一覧などで、該当するMOUがないことを確認' },
  not_found: { ja: '調査したが確認できず', desc: '調べたが、公式資料で確認できなかった（存在しないとは限らない）' },
  not_surveyed: { ja: '未調査', desc: 'まだ調べていない' },
  scope_zero: { ja: 'いまの数え方では0件', desc: '締結済みの協定はあるが、いまの数え方（有効性の範囲・数える文書）には入らない（有効性未確認・終了確認など）' },
};

// ---------- 読み込み ----------
async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${path} の書き方に誤りがあります（${e.message}）`);
  }
}

export async function loadAll() {
  const warnings = [];
  const [config, prefs, countries, survey, index, topo] = await Promise.all([
    getJSON('data/config.json'),
    getJSON('data/prefectures.json'),
    getJSON('data/countries.json'),
    getJSON('data/survey.json'),
    getJSON('data/mous/index.json'),
    getJSON('data/geo/japan_prefectures.topojson'),
  ]);
  // MOUのファイルは1つずつ読み、壊れたファイルがあっても他は表示する
  const results = await Promise.allSettled(index.files.map(f => getJSON('data/mous/' + f)));
  const records = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const list = Array.isArray(r.value) ? r.value : (r.value.mous || []);
      for (const m of list) { m._file = index.files[i]; records.push(m); }
    } else {
      warnings.push(r.reason.message);
    }
  });
  let stats = null, excluded = [], systems = [];
  if (index.stats) {
    try { stats = await getJSON(index.stats); } catch (e) { warnings.push(e.message); }
  }
  if (index.excluded) {
    try { excluded = (await getJSON(index.excluded)).items || []; } catch (e) { warnings.push(e.message); }
  }
  if (index.systems) {
    try { systems = (await getJSON(index.systems)).systems || []; } catch (e) { warnings.push(e.message); }
  }
  const db = buildDB({ config, prefs: prefs.prefectures, countries: countries.countries, survey, records, stats, topo, warnings });
  db.excluded = excluded;
  db.systems = systems;
  db.systemByKey = new Map(systems.map(s => [s.key, s]));
  return db;
}

// ---------- 集計の土台 ----------
export function buildDB({ config, prefs, countries, survey, records, stats, topo, warnings }) {
  const db = { config, prefs, countries, survey, stats, topo, warnings };
  db.prefByCode = new Map(prefs.map(p => [p.code, p]));
  db.countryByCode = new Map(countries.map(c => [c.code, c]));
  db.mous = records.map(normalize);
  db.mouById = new Map(db.mous.map(m => [m.id, m]));

  // 同じ協定の更新・再締結は group_key でまとめ、件数は1件と数える
  const gmap = new Map();
  for (const m of db.mous) {
    const key = m.group_key || m.id;
    if (!gmap.has(key)) gmap.set(key, []);
    gmap.get(key).push(m);
  }
  db.groups = [];
  for (const [key, versions] of gmap) {
    versions.sort((a, b) => dateKey(a.signed_date).localeCompare(dateKey(b.signed_date)));
    const confirmed = versions.filter(v => v._validity !== 'planned');
    const latest = (confirmed.length ? confirmed : versions)[(confirmed.length ? confirmed : versions).length - 1];
    const first = (confirmed.length ? confirmed : versions)[0];
    const g = {
      key, versions, latest, first,
      id: latest.id,
      level: latest.japan_level,
      pref_code: latest.pref_code || null,
      country_code: latest.country_code,
      // 三者間のMOUなど、相手が複数の国にまたがる場合はすべての国で検索・集計できるようにする
      countries: [...new Set(versions.flatMap(v => [v.country_code, ...(v.additional_partners || []).map(a => a.country_code)]))],
      fields: [...new Set(versions.flatMap(v => v.fields))],
      status: latest.status,
      validity: groupValidity(versions),
      category: latest.doc_category,
      relation: latest._relation,
      planned: confirmed.length === 0,
      official: versions.some(v => v._official),
      first_year: yearOf(first.signed_date) ?? yearOf(first.announced_date) ?? yearOf(first.effective_date),
      impacts: versions.flatMap(v => [...(v.impacts || []), ...(v === latest ? v._autoImpacts : [])].map(x => ({ ...x, _mou: v }))),
      budgets: versions.flatMap(v => (v.budgets || []).map(x => ({ ...x, _mou: v }))),
      projects: versions.flatMap(v => (v.projects || []).map(x => ({ ...x, _mou: v }))),
    };
    g.search = norm([
      ...versions.flatMap(v => [v.title_ja, v.title_original, v.partner_org, v.partner_org_en, v.japan_org, v.purpose, v.doc_type, (v.labor_detail || []).join(' '), v.related_systems.join(' ')]),
      DOC_CATEGORY[g.category]?.ja,
      ...g.countries.flatMap(c => [db.countryByCode.get(c)?.ja, db.countryByCode.get(c)?.en]),
      ...versions.flatMap(v => (v.additional_partners || []).map(a => a.partner_org)),
      db.prefByCode.get(g.pref_code)?.name,
    ].join(' '));
    for (const v of versions) v._group = g;
    db.groups.push(g);
  }
  db.groupByKey = new Map(db.groups.map(g => [g.key, g]));
  return db;
}

// 同じ協定の版（更新・再締結・後継）をまとめたときの、現在の有効性。
// 最新の有効な文書があれば「有効確認」。なければ最新の版の状態（古い版が未確認のまま新しい版が開始前なら「未確認」）。
function groupValidity(versions) {
  const signed = versions.filter(v => v._validity !== 'planned');
  if (!signed.length) return 'planned';
  if (signed.some(v => v._validity === 'valid_confirmed')) return 'valid_confirmed';
  const last = signed[signed.length - 1]._validity;
  if (last === 'signed_not_started' && signed.slice(0, -1).some(v => v._validity === 'unconfirmed')) return 'unconfirmed';
  return last;
}

// 外国人の受入れとの関係（データに書かれていなければ、分野と合意内容の記載から分類）
const INDIRECT_RE = /留学|学生|研修生|研修員|技能実習|特定技能|人材|インターン|就職|就労|招へい|招聘/;
function deriveRelation(m) {
  if (RELATION[m.foreign_relation]) return m.foreign_relation;
  if (m.fields.includes('labor')) return 'direct';
  if (!m.content.length && !m.purpose) return 'unconfirmed';
  if (INDIRECT_RE.test([m.title_ja, m.purpose, ...m.content].join(' '))) return 'indirect';
  return 'general';
}

// 合意内容の各項目を、書かれている言葉から影響の6分野に振り分ける（「合意した内容」の欄に表示）
// 振り分けは機械的なもので、項目の文章は原文・公式発表の記載そのものです。
const AGREED_KEYWORDS = {
  population: ['送出', '送り出', '受入', '受け入れ', '技能実習生', '特定技能', '来日', '候補者', '人材の確保', '人材確保', '就労'],
  employment: ['雇用', '就職', '採用', 'マッチング', 'ジョブフェア', '求人', '企業'],
  housing: ['住居', '住宅', '生活支援', '生活相談', '相談窓口', '苦情', '多言語'],
  welfare: ['日本語', '教育', '研修', '訓練', '介護', '看護', '医療', 'オリエンテーション'],
  fiscal: ['費用', '負担', '予算', '経費', '手数料'],
  community: ['住民', '地域社会', '共生'],
};
function autoAgreed(m) {
  const src = (m.sources.find(s => s.type === 'original_text') || m.sources[0])?.id;
  if (!src) return [];
  const explicit = new Set(m.impacts.filter(i => i.stage === 'agreed').map(i => i.category));
  const out = [];
  for (const [cat, words] of Object.entries(AGREED_KEYWORDS)) {
    if (explicit.has(cat)) continue;
    for (const item of m.content) {
      if (words.some(w => item.includes(w))) out.push({ category: cat, stage: 'agreed', text: item, sources: [src], causality: 'n/a', _auto: true });
    }
  }
  return out;
}

function normalize(m) {
  const r = { ...m };
  r.fields = Array.isArray(r.fields) && r.fields.length ? r.fields : ['other'];
  r.content = r.content || [];
  r.sources = r.sources || [];
  r.impacts = r.impacts || [];
  r.budgets = r.budgets || [];
  r.projects = r.projects || [];
  r.status = r.status || 'unknown';
  r.legal_binding = r.legal_binding || 'unconfirmed';
  r.evidence_level = r.evidence_level || 'official_announcement';
  r.doc_category = DOC_CATEGORY[r.doc_category] ? r.doc_category : 'mou_moc';
  r.numbers = r.numbers || [];
  r.related_systems = r.related_systems || [];
  r.acceptance_types = r.acceptance_types || [];
  r._official = r.evidence_level !== 'news_only';
  r._relation = deriveRelation(r);
  r._validity = validityState(r);
  r._autoImpacts = autoAgreed(r);
  r._year = yearOf(r.signed_date);
  return r;
}

// ---------- 絞り込み ----------
// f = { level, pref, countries:[], field, status, impact, includeNews, includePlanned, q,
//       validity（有効性の範囲：valid / valid_unk / all）, docScope（mou / foreign / all）, category（文書の種類）, relation（受入れとの関係） }
// validity・docScope を省略したときは、締結済みのすべての文書が対象です。
export function filterGroups(db, f = {}) {
  const q = f.q ? norm(f.q) : '';
  const states = f.validity ? VALIDITY_SCOPE[f.validity]?.states : null;
  return db.groups.filter(g => {
    if (!f.includePlanned && g.planned) return false;
    if (!f.includeNews && !g.official) return false;
    if (states && !g.planned && !states.includes(g.validity)) return false;
    if (f.docScope === 'mou' && g.category !== 'mou_moc') return false;
    if (f.docScope === 'foreign' && g.relation !== 'direct') return false;
    if (f.category && g.category !== f.category) return false;
    if (f.relation && g.relation !== f.relation) return false;
    if (f.level && g.level !== f.level) return false;
    if (f.pref && g.pref_code !== f.pref) return false;
    if (f.countries && f.countries.length && !f.countries.some(c => g.countries.includes(c))) return false;
    if (f.field && !g.fields.includes(f.field)) return false;
    if (f.status && g.status !== f.status) return false;
    if (f.impact && !g.impacts.some(i => i.category === f.impact)) return false;
    if (q && !g.search.includes(q)) return false;
    return true;
  });
}

const sortDate = m => m.signed_date || m.announced_date || m.effective_date;
export function sortGroups(groups) {
  return [...groups].sort((a, b) => dateKey(sortDate(b.latest)).localeCompare(dateKey(sortDate(a.latest))));
}

export function countByPref(groups) {
  const m = new Map();
  for (const g of groups) if (g.level === 'prefecture' && g.pref_code) m.set(g.pref_code, (m.get(g.pref_code) || 0) + 1);
  return m;
}

// 0件のときに「該当なし」「調査したが確認できず」「未調査」のどれかを判定
export function zeroState(db, prefCode, field) {
  const s = db.survey.prefectures?.[prefCode] || {};
  const s1 = s.stage1?.result || 'not_surveyed';
  const s2 = s.stage2?.result || 'not_surveyed';
  if (field === 'labor') {
    if (s1 === 'not_surveyed') return 'not_surveyed';
    return s1 === 'none_confirmed' ? 'none' : 'not_found';
  }
  if (field) {
    if (s2 === 'not_surveyed') return 'not_surveyed';
    return s2 === 'list_checked' ? 'none' : 'not_found';
  }
  if (s1 === 'not_surveyed' && s2 === 'not_surveyed') return 'not_surveyed';
  if (s1 === 'none_confirmed' && s2 === 'list_checked') return 'none';
  return 'not_found';
}

// その分野の調査がまだ一部だけかどうか（画面に注意を出すため）
export function fieldCoverageNote(db, field) {
  if (field === 'labor') return null;
  const stage = (db.survey.stages || []).find(s => s.no === 2);
  return `「${field ? FIELD[field].ja : 'すべての分野'}」には、調査が一部しか済んでいない分野（第2段階：${stage ? stage.status_ja : '一部調査'}）が含まれます。件数は確認できた範囲だけで、実際より少ない可能性があります。`;
}

// 影響の記録の深さ（地図の「地域への影響」表示用）
export const IMPACT_LEVELS = [
  { code: 'observed', ja: '地域での変化まで記録あり', color: '#0f5a36' },
  { code: 'implemented', ja: '実施内容（事業・実績）まで記録あり', color: '#3f9a68' },
  { code: 'agreed', ja: '合意内容のみ記録', color: '#a7d7b9' },
  { code: 'no_info', ja: 'MOUはあるが、この分野の影響情報は未確認', color: '#fff3c4' },
];
export function impactLevel(groups, category) {
  let best = null;
  const rank = { agreed: 1, implemented: 2, observed: 3 };
  for (const g of groups) for (const i of g.impacts) {
    if (i.category !== category) continue;
    if (!best || rank[i.stage] > rank[best]) best = i.stage;
  }
  return best || (groups.length ? 'no_info' : null);
}

// 協定の有効性（5区分）。データの validity_state に公式資料で確認した結果を書きます。
// 書かれていないもの・判定できないものは「有効性未確認」。事業が実施中・自動更新・期限が過ぎた
// というだけで、自動的に「有効」や「終了」にはしません。
export function validityState(m) {
  if (m.status === 'planned' && m.validity_state !== 'signed_not_started' && m.validity_state !== 'valid_confirmed') return 'planned';
  const s = VALIDITY[m.validity_state] ? m.validity_state : 'unconfirmed';
  // 確認した時点では有効でも、書かれた有効期限を過ぎたら、更新を確認できるまで「有効性未確認」として数える
  if (s === 'valid_confirmed' && pastTerm(m)) return 'unconfirmed';
  return s;
}
// 確認時点では有効確認だったが、その後に期限を過ぎたもの（画面で理由を表示するため）
export function lapsedSinceCheck(m) {
  return m.validity_state === 'valid_confirmed' && pastTerm(m);
}

// 有効性の5区分の件数（締結済み累計＝有効確認＋未確認＋終了確認＋開始前。締結予定は含めない）
export function validityCounts(groups) {
  const c = { valid_confirmed: 0, unconfirmed: 0, ended_confirmed: 0, signed_not_started: 0, planned: 0 };
  for (const g of groups) c[g.validity] = (c[g.validity] || 0) + 1;
  c.signed_total = c.valid_confirmed + c.unconfirmed + c.ended_confirmed + c.signed_not_started;
  return c;
}

// 有効期限が書かれていて、それが過ぎているか（表示の注意書き用。判定には使わない）
export function pastTerm(m) {
  if (!m.valid_until) return false;
  // "2028-10" は2028年10月末まで、"2028" は2028年末までとして比べる
  const v = String(m.valid_until);
  const end = v.length === 4 ? `${v}-12-31` : v.length === 7 ? `${v}-31` : v;
  return end < today();
}

// ---------- 統計（参考） ----------
export function residentChange(db, prefCode, countryCode) {
  const r = db.stats?.residents;
  if (!r || !prefCode || !countryCode) return null;
  const row = r.data?.[prefCode]?.[countryCode];
  if (!row) return null;
  const periods = r.periods || [];
  const from = periods[0];
  // 最新の時点で数字が公表されていない国籍は、その前の時点を使う
  const to = [...periods].reverse().find(p => row[p] != null) || periods[periods.length - 1];
  if (row[from] == null && row[to] == null) return null;
  return { from, to, a: row[from] ?? null, b: row[to] ?? null, source: r.sources?.[to], sourceFrom: r.sources?.[from], title: r.title, publisher: r.publisher };
}
export function sswCount(db, prefCode, countryCode) {
  const s = db.stats?.ssw;
  if (!s) return null;
  const v = s.by_pref_country?.[prefCode]?.[countryCode];
  if (v == null) return null;
  return { value: v, period: s.period, source: s.source, title: s.title };
}

// ---------- 名前の取得 ----------
export function countryName(db, code) { return db.countryByCode.get(code)?.ja || code || '不明'; }
export function prefName(db, code) { return db.prefByCode.get(code)?.name || ''; }
export function japanSideName(db, m) {
  if (m.japan_level === 'national') return m.japan_org || '日本国政府';
  return m.japan_org || prefName(db, m.pref_code);
}

// 国名検索（日本語・英語・別名）
export function findCountries(db, q) {
  const n = norm(q);
  if (!n) return [];
  const scored = [];
  for (const c of db.countries) {
    const names = [c.ja, c.en, ...(c.aliases || [])].map(norm);
    let score = 0;
    for (const x of names) {
      if (x === n) score = Math.max(score, 3);
      else if (x.startsWith(n)) score = Math.max(score, 2);
      else if (x.includes(n)) score = Math.max(score, 1);
    }
    if (score) scored.push({ c, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.c.ja.localeCompare(b.c.ja, 'ja')).map(x => x.c);
}

// ---------- データ点検（入力ミスを見つける） ----------
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
export function validate(db) {
  const issues = [];
  const ids = new Map();
  const add = (m, level, msg) => issues.push({ id: m.id || '(IDなし)', file: m._file, level, msg });
  for (const m of db.mous) {
    if (!m.id) add(m, 'error', 'id がありません');
    else if (ids.has(m.id)) add(m, 'error', `id が重複しています（${ids.get(m.id)} と同じ）`);
    else ids.set(m.id, m._file);
    if (!m.title_ja) add(m, 'error', 'title_ja（正式名称）がありません');
    if (!m.doc_type) add(m, 'error', 'doc_type（文書の種類）がありません');
    if (!LEVELS[m.japan_level]) add(m, 'error', 'japan_level は national / prefecture / municipality のいずれか');
    if ((m.japan_level === 'prefecture' || m.japan_level === 'municipality') && !db.prefByCode.has(m.pref_code)) add(m, 'error', 'pref_code が正しくありません（"01"〜"47"）');
    if (m.japan_level === 'municipality' && !/^\d{6}$/.test(m.municipality_code || '')) add(m, 'error', '市区町村のMOUには municipality_code（全国地方公共団体コード6桁）が必要です');
    if (!db.countryByCode.has(m.country_code)) add(m, 'error', `country_code「${m.country_code}」が countries.json にありません`);
    for (const a of m.additional_partners || []) if (!db.countryByCode.has(a.country_code)) add(m, 'error', `additional_partners の country_code「${a.country_code}」が countries.json にありません`);
    if (m.signed_date && !DATE_RE.test(m.signed_date)) add(m, 'error', 'signed_date は YYYY-MM-DD / YYYY-MM / YYYY の形で');
    if (!m.signed_date && !m.effective_date && m.status !== 'planned') add(m, 'warn', '締結日が不明です（分かれば追加してください）');
    if (m.announced_date && !DATE_RE.test(m.announced_date)) add(m, 'error', 'announced_date の形が正しくありません');
    for (const f of m.fields) if (!FIELD[f]) add(m, 'error', `分野コード「${f}」が正しくありません`);
    if (!STATUS[m.status]) add(m, 'error', `status「${m.status}」が正しくありません`);
    if (!PARTNER_TYPES[m.partner_type]) add(m, 'warn', `partner_type「${m.partner_type}」が正しくありません`);
    if (!LEGAL[m.legal_binding]) add(m, 'error', `legal_binding「${m.legal_binding}」が正しくありません`);
    if (!EVIDENCE[m.evidence_level]) add(m, 'error', `evidence_level「${m.evidence_level}」が正しくありません`);
    if (!m.sources.length) add(m, 'error', '情報源（sources）がありません');
    const sids = new Set(m.sources.map(s => s.id));
    for (const s of m.sources) {
      if (!/^https?:\/\//.test(s.url || '')) add(m, 'error', `情報源 ${s.id} の URL がありません`);
      if (!s.checked || !DATE_RE.test(s.checked)) add(m, 'error', `情報源 ${s.id} の確認日（checked）がありません`);
    }
    for (const b of m.budgets) {
      if (b.amount_yen !== null && b.amount_yen !== undefined && typeof b.amount_yen !== 'number') add(m, 'error', '予算の amount_yen は数字か null（不明）で');
      if (!b.fiscal_year) add(m, 'error', '予算に対象年度（fiscal_year）がありません');
      if (!(b.sources || []).length) add(m, 'error', '予算に根拠資料（sources）がありません');
      for (const s of b.sources || []) if (!sids.has(s)) add(m, 'error', `予算の根拠 ${s} が sources にありません`);
    }
    for (const i of m.impacts) {
      if (!IMPACT[i.category]) add(m, 'error', `影響の分野「${i.category}」が正しくありません`);
      if (!STAGE[i.stage]) add(m, 'error', `影響の段階「${i.stage}」が正しくありません`);
      if (!(i.sources || []).length) add(m, 'error', '影響の記録に根拠資料（sources）がありません');
      for (const s of i.sources || []) if (!sids.has(s)) add(m, 'error', `影響の根拠 ${s} が sources にありません`);
      if (i.stage !== 'agreed' && !i.fiscal_year) add(m, 'warn', '実施・変化の記録には対象年度（fiscal_year）を入れてください');
    }
    if (m.renewal_of && !db.mouById.has(m.renewal_of)) add(m, 'error', `renewal_of「${m.renewal_of}」のIDが見つかりません`);
    if (m.validity_state && !VALIDITY[m.validity_state]) add(m, 'error', `validity_state「${m.validity_state}」が正しくありません`);
    if (!m.validity_state) add(m, 'warn', '有効性（validity_state）が未判定です（「有効性未確認」として数えます）');
    if (m.validity_state === 'valid_confirmed' && !(m.validity_basis || '').trim()) add(m, 'error', '「有効確認」には判定の根拠（validity_basis）が必要です');
    if (m.validity_state === 'ended_confirmed' && !(m.validity_basis || m.end_reason || '').trim()) add(m, 'error', '「終了確認」には根拠（validity_basis または end_reason）が必要です');
    for (const s of m.validity_sources || []) if (!sids.has(s)) add(m, 'error', `有効性の根拠 ${s} が sources にありません`);
    if (m.foreign_relation && !RELATION[m.foreign_relation]) add(m, 'error', `foreign_relation「${m.foreign_relation}」が正しくありません`);
    for (const n of m.numbers) {
      if (!NUMBER_KIND[n.kind]) add(m, 'error', `人数の種類「${n.kind}」が正しくありません`);
      if (n.value !== null && n.value !== undefined && typeof n.value !== 'number') add(m, 'error', '人数の value は数字か null（不明）で');
      for (const s of n.sources || []) if (!sids.has(s)) add(m, 'error', `人数の根拠 ${s} が sources にありません`);
    }
    if (m.successor_id && !db.mouById.has(m.successor_id)) add(m, 'error', `successor_id「${m.successor_id}」のIDが見つかりません`);
  }
  // 同じ協定の版がちがう group_key で二重に登録されていないか（同じ相手・同じ名称・同じ締結日）
  const seen = new Map();
  for (const m of db.mous) {
    const k = [m.japan_level, m.pref_code, m.country_code, m.title_ja, m.signed_date].join('|');
    if (seen.has(k) && seen.get(k) !== m.group_key) add(m, 'warn', `同じ名称・締結日の文書が別のグループにあります（重複の可能性：${seen.get(k)}）`);
    else seen.set(k, m.group_key);
  }
  for (const w of db.warnings) issues.push({ id: '-', file: '-', level: 'error', msg: w });
  return issues;
}
