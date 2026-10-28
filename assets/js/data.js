// データの読み込みと集計。表示用の言葉（ラベル）もここで一元管理します。
import { yearOf, dateKey, norm, today, parseDate, periodEnd, periodStart } from './util.js';

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
// note は件数・地図のそばに出す説明。「すべて」でも締結予定は含めない（締結済み累計にも入れない）
export const VALIDITY_SCOPES = [
  { code: 'valid', ja: '有効確認のみ', states: ['valid_confirmed'], desc: '現在も有効だと公式資料で確認できたものだけ',
    note: '現在有効と公式資料で確認できた協定だけを表示しています。有効性未確認の協定は含みません。' },
  { code: 'valid_unk', ja: '有効確認＋有効性未確認', states: ['valid_confirmed', 'unconfirmed'], desc: '終了確認・開始前を除いたもの',
    note: '現在有効と確認できた協定に、今も有効かどうか公式資料で確かめられていない協定（有効性未確認）を加えて表示しています。終了確認・開始前・締結予定の協定は含みません。' },
  { code: 'all', ja: '締結済みすべて', states: ['valid_confirmed', 'unconfirmed', 'ended_confirmed', 'signed_not_started'], desc: '有効確認・有効性未確認・終了確認・締結済み（開始前）のすべて。締結予定は含まない',
    note: '締結済みのすべての協定（有効確認・有効性未確認・終了確認・締結済み開始前）を表示しています。締結予定の協定は含みません。' },
];
export const VALIDITY_SCOPE = Object.fromEntries(VALIDITY_SCOPES.map(v => [v.code, v]));

// 文書の種類（MOU以外の国際的な合意文書も登録します）
// R/D（討議議事録）は覚書とは別の種類として数え、「MOUのみ」の件数には入れません。
export const DOC_CATEGORIES = [
  { code: 'mou_moc', ja: 'MOU・MOC', desc: 'MOU（了解覚書）・MOC（協力覚書）や、協定書・合意書など、協力の内容や方針を確認する覚書類。多くは法的拘束力がないと明記' },
  { code: 'record_of_discussions', ja: 'R/D（討議議事録）', desc: '討議議事録（Record of Discussions）。協議した内容と双方の役割を記録して署名した文書。覚書（MOU・MOC）とは別の種類として数える（技能実習の送出し国の政府機関と公益財団法人国際人材協力機構（JITCO）の間などで結ばれている）' },
  { code: 'epa_treaty', ja: 'EPA（経済連携協定）', desc: '経済連携協定（EPA）とその改正議定書など、国会の承認を経て結ぶ条約。法的拘束力がある' },
  { code: 'exchange_of_notes', ja: '交換公文', desc: '政府どうしが書簡（公文）を交換して合意する国際約束' },
  { code: 'bilateral_arrangement', ja: 'その他の国際取決め', desc: 'ワーキング・ホリデー制度など、政府間の取決め（口上書の交換など）' },
  { code: 'joint_statement', ja: '共同声明・行動計画', desc: '首脳会談などで目標や協力事業を示す政治的な文書（アクションプランなど）。人数の目標は受入れの義務ではない' },
  { code: 'other', ja: 'その他', desc: '上のどれにも当てはまらない、受入れに関係する国際的な枠組み' },
];
export const DOC_CATEGORY = Object.fromEntries(DOC_CATEGORIES.map(d => [d.code, d]));

// 文書の種類の詳しい区分。MOU・MOCは、文書の名前から「MOU（了解覚書・覚書）」「MOC（協力覚書）」
// 「協定書・合意書など」に分けて表示します（件数の範囲「MOUのみ」はこの3つを合わせたもの）。
export const DOC_KINDS = [
  { code: 'mou', cat: 'mou_moc', ja: 'MOU（了解覚書・覚書）', desc: '名前が「覚書」「了解覚書」「MOU」の文書' },
  { code: 'moc', cat: 'mou_moc', ja: 'MOC（協力覚書）', desc: '名前が「協力覚書」「MOC」の文書' },
  { code: 'mou_other', cat: 'mou_moc', ja: '協定書・合意書など', desc: '覚書と同じく協力の方針を確認する文書のうち、名前が「協定書」「合意書」「同意書」などのもの' },
  ...DOC_CATEGORIES.filter(c => c.code !== 'mou_moc').map(c => ({ code: c.code, cat: c.code, ja: c.ja, desc: c.desc })),
];
export const DOC_KIND = Object.fromEntries(DOC_KINDS.map(d => [d.code, d]));
const MOC_RE = /協力覚書|\bMOC\b|Memorandum of Cooperation/i;
const MOU_RE = /覚書|\bMOU\b|Memorandum of Understanding/i;
// 正式名称（日本語・原語）の呼び方を優先し、名称で決まらないときは文書の種類の欄で決める
export function docKind(m) {
  if (m.doc_category !== 'mou_moc') return DOC_KIND[m.doc_category] ? m.doc_category : 'other';
  const title = `${m.title_ja || ''} ${m.title_original || ''}`;
  const type = m.doc_type === 'その他の協力文書' ? '' : `${m.doc_type || ''}`;
  if (MOC_RE.test(title)) return 'moc';
  if (MOU_RE.test(title)) return 'mou';
  if (MOC_RE.test(type)) return 'moc';
  if (MOU_RE.test(type)) return 'mou';
  return 'mou_other';
}

// 地図・件数に含める文書の範囲
export const DOC_SCOPES = [
  { code: 'mou', ja: 'MOUのみ', desc: 'MOU（了解覚書）・MOC（協力覚書）など覚書類だけを数える。R/D（討議議事録）・EPA・交換公文・取決め・共同声明は含まない' },
  { code: 'foreign', ja: '外国人受入れに関する国際文書', desc: '文書の種類を問わず、外国人の受入れに直接関係するものだけを数える（R/Dを含む）' },
  { code: 'all', ja: 'すべての国際文書', desc: 'このサイトに登録したすべての国際文書（MOU・MOC・R/D・EPA・交換公文・取決め・共同声明など）を数える' },
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
export const LEVELS = { national: '国・省庁', prefecture: '都道府県', municipality: '市区町村', organization: '団体・企業・公的機関など' };
// 件数を別々に数える締結主体の区分（表示の順）。団体・企業などの協定は、国・都道府県の件数に含めない
export const LEVEL_ORDER = ['national', 'prefecture', 'municipality', 'organization'];
export const LEVEL_SHORT = { national: '国・省庁', prefecture: '都道府県', municipality: '市区町村', organization: '団体・企業など' };

// 日本側の締結主体の種別（相手側の種別 partner_type とは別に記録）
export const JAPAN_ORG_TYPES = [
  { code: 'national_gov', ja: '日本政府・省庁', level: 'national', desc: '日本国政府、または省庁・その部局が締結したもの' },
  { code: 'prefecture', ja: '都道府県', level: 'prefecture', desc: '都道府県（知事部局・教育委員会・県立の学校など、県の機関を含む）' },
  { code: 'municipality', ja: '政令指定都市・市区町村', level: 'municipality', desc: '政令指定都市・市区町村が締結したもの（都道府県の件数とは別に数える）' },
  { code: 'public_body', ja: '公的機関・独立行政法人等', level: 'organization', desc: 'JICA・JETRO・外国人技能実習機構などの独立行政法人、政府系金融機関など（国の件数には含めない）' },
  { code: 'company', ja: '民間企業', level: 'organization', desc: '株式会社などの民間企業' },
  { code: 'association', ja: '財団法人・社団法人・業界団体', level: 'organization', desc: '一般財団法人・公益社団法人・協会・業界団体など' },
  { code: 'university', ja: '大学・教育機関', level: 'organization', desc: '大学・専門学校など（都道府県立の学校が県として締結したものは「都道府県」）' },
];
export const JAPAN_ORG_TYPE = Object.fromEntries(JAPAN_ORG_TYPES.map(t => [t.code, t]));
const DEFAULT_ORG_TYPE = { national: 'national_gov', prefecture: 'prefecture', municipality: 'municipality' };

// 協定の当事者の組み合わせ（日本側の種別 × 相手側の種別から自動で決める）
export const PAIR_KINDS = [
  { code: 'gov', ja: '政府間', desc: '日本政府・省庁と、外国の政府・省庁・国際機関' },
  { code: 'local', ja: '自治体間', desc: '日本の都道府県・市区町村と、外国の政府・省庁・州・省などの公的機関' },
  { code: 'public', ja: '公的機関間', desc: '日本の公的機関（独立行政法人など）と、外国の政府・公的機関' },
  { code: 'public_private', ja: '官民間', desc: '一方が政府・自治体・公的機関で、もう一方が企業・団体・大学など（国公立の大学を含む）' },
  { code: 'private', ja: '団体間', desc: '双方が企業・団体・大学などで、政府・自治体は当事者でない' },
];
export const PAIR_KIND = Object.fromEntries(PAIR_KINDS.map(p => [p.code, p]));
const FOREIGN_PUBLIC = new Set(['national_gov', 'national_ministry', 'subnational_gov', 'public_agency', 'international_org']);
export function pairKind(orgType, partnerType) {
  const pub = FOREIGN_PUBLIC.has(partnerType);
  if (orgType === 'national_gov') return pub ? 'gov' : 'public_private';
  if (orgType === 'prefecture' || orgType === 'municipality') return pub ? 'local' : 'public_private';
  if (orgType === 'public_body') return pub ? 'public' : 'public_private';
  return pub ? 'public_private' : 'private';
}

export const SURVEY_RESULT = {
  found: '該当あり', none_confirmed: '該当なし（確認済み）', not_found: '調査したが確認できず',
  not_surveyed: '未調査', list_checked: '公式一覧を確認済み', partial: '一部のみ調査',
};
export const ZERO_STATES = {
  none: { ja: '該当なし（公式資料で確認）', desc: '公式の一覧などで、該当するMOUがないことを確認' },
  not_found: { ja: '調査したが確認できず', desc: '調べたが、公式資料で確認できなかった（存在しないとは限らない）' },
  partial: { ja: '調査が一部のみ（登録なし）', desc: '外国人材以外の分野の調査が一部しか済んでおらず、登録できた協定はない（調査が進めば見つかる可能性がある）' },
  not_surveyed: { ja: '未調査', desc: 'まだ調べていない' },
  scope_zero: { ja: 'いまの数え方では0件', desc: '締結済みの協定はあるが、いまの数え方（有効性の範囲・数える文書）には入らない（有効性未確認・終了確認など）' },
};

// ---------- 読み込み ----------
// データは3段階で読み込みます（最初の画面を早く出すため）。
//   1. 索引（data/build/core.json）：全協定の一覧・地図・件数に必要な項目だけ。最初に1回だけ読む
//   2. 協定ごとの詳しい内容：協定のページを開いたときに、その協定が入っている data/mous/*.json だけを読む
//   3. 全データ（data/mous/*.json すべてと統計など）：キーワード検索・分析・比較・データ点検のページを開いたときだけ読む
// 同じファイルは2回読みません。読み込みに失敗したものは覚えずに、もう一度試せるようにします。
const loaded = new Map();
function getJSON(path, opts = {}) {
  if (loaded.has(path)) return loaded.get(path);
  const p = (async () => {
    // 元のデータ（data/mous など）は、公開直後の更新がすぐ届くよう毎回サーバーに確かめる。版番号付きの索引は通常どおり
    const res = await fetch(path, opts.versioned ? {} : { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`${path} の書き方に誤りがあります（${e.message}）`);
    }
  })();
  loaded.set(path, p);
  p.catch(() => loaded.delete(path));
  return p;
}
const dataVersion = () => (typeof document !== 'undefined' && document.querySelector('meta[name="data-version"]')?.content) || '';

// 1. 索引
let coreDB = null;
export async function loadCore() {
  if (coreDB) return coreDB;
  const core = await getJSON(`data/build/core.json?v=${dataVersion()}`, { versioned: true });
  const records = core.mous.map(m => ({ ...m, _file: core.files[m.file] }));
  const db = buildDB({ config: core.config, prefs: core.prefs, countries: core.countries, survey: core.survey, records, stats: null, warnings: [], systems: core.systems });
  db.lite = true;
  db.files = core.files;
  coreDB = db;
  return db;
}

// 地図の形（data/build/geo.json）
export function loadGeo() {
  return getJSON(`data/build/geo.json?v=${dataVersion()}`, { versioned: true });
}

// 2. 協定ごとの詳しい内容。files のファイルだけを元のデータから読み、索引と同じ方法で集計の土台を作る。
// ほかのファイルの協定へのリンク（後継の文書・関連する文書など）は、索引の記録で名前を表示する
export async function loadParts(files, opts = {}) {
  if (fullDB) return fullDB;
  const core = await loadCore();
  const [lists, systems, stats] = await Promise.all([
    Promise.all(files.map(f => getJSON('data/mous/' + f))),
    getJSON('data/systems.json').then(x => x.systems || []),
    opts.stats ? loadStats() : null,
  ]);
  const records = [];
  lists.forEach((d, i) => { for (const m of (Array.isArray(d) ? d : d.mous || [])) records.push({ ...m, _file: files[i] }); });
  const db = buildDB({ config: core.config, prefs: core.prefs, countries: core.countries, survey: core.survey, records, stats, warnings: [], systems });
  db.partial = true;
  for (const [k, v] of core.mouById) if (!db.mouById.has(k)) db.mouById.set(k, v);
  return db;
}
export function loadStats() {
  return getJSON('data/stats/foreign_residents.json');
}

// 3. 全データ。MOUのファイルは1つずつ読み、壊れたファイルがあっても他は表示する
let fullDB = null, fullPromise = null;
export function hasFull() { return !!fullDB; }
export function loadFull() {
  if (fullDB) return Promise.resolve(fullDB);
  if (fullPromise) return fullPromise;
  fullPromise = (async () => {
    const warnings = [];
    const [config, prefs, countries, survey, index] = await Promise.all([
      getJSON('data/config.json'),
      getJSON('data/prefectures.json'),
      getJSON('data/countries.json'),
      getJSON('data/survey.json'),
      getJSON('data/mous/index.json'),
    ]);
    const opt = (path, f) => path ? getJSON(path).then(f, e => { warnings.push(e.message); return null; }) : Promise.resolve(null);
    // 統計・登録しなかったもの・国内制度・CLAIRの照合も同時に読む（順番に待たない）
    const [results, stats, excluded, systems, clair] = await Promise.all([
      Promise.allSettled(index.files.map(f => getJSON('data/mous/' + f))),
      opt(index.stats, x => x),
      opt(index.excluded, x => x.items || []),
      opt(index.systems, x => x.systems || []),
      opt(index.clair, x => x),
    ]);
    const records = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const list = Array.isArray(r.value) ? r.value : (r.value.mous || []);
        for (const m of list) records.push({ ...m, _file: index.files[i] });
      } else {
        warnings.push(r.reason.message);
      }
    });
    const db = buildDB({ config, prefs: prefs.prefectures, countries: countries.countries, survey, records, stats, warnings, systems: systems || [] });
    db.excluded = excluded || [];
    db.clair = clair;
    db.full = true;
    fullDB = db;
    return db;
  })();
  fullPromise.catch(() => { fullPromise = null; });
  return fullPromise;
}
// 以前の名前（ツールなどから使う場合のため）
export const loadAll = loadFull;

// ---------- 集計の土台 ----------
export function buildDB({ config, prefs, countries, survey, records, stats, warnings, systems = [] }) {
  const db = { config, prefs, countries, survey, stats, warnings };
  db.prefByCode = new Map(prefs.map(p => [p.code, p]));
  db.countryByCode = new Map(countries.map(c => [c.code, c]));
  db.systems = systems;
  db.systemByKey = new Map(systems.map(s => [s.key, s]));
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
      orgType: latest._orgType,
      pairKind: latest._pairKind,
      pref_code: latest.japan_level === 'organization' ? null : (latest.pref_code || null),
      municipality_code: latest.municipality_code || null,
      // 団体・企業などの協定に関連する事業が行われた地域（公式資料で確認できたもの）。締結した地域ではないので件数には使わない
      regions: [...new Set(versions.flatMap(v => v.related_regions.map(r => r.pref_code)).filter(Boolean))],
      country_code: latest.country_code,
      // 三者間のMOUなど、相手が複数の国にまたがる場合はすべての国で検索・集計できるようにする
      countries: [...new Set(versions.flatMap(v => [v.country_code, ...(v.additional_partners || []).map(a => a.country_code)]))],
      fields: [...new Set(versions.flatMap(v => v.fields))],
      status: latest.status,
      validity: groupValidity(versions),
      category: latest.doc_category,
      kind: latest._kind,
      relation: latest._relation,
      planned: confirmed.length === 0,
      official: versions.some(v => v._official),
      first_year: yearOf(first.signed_date) ?? yearOf(first.announced_date) ?? yearOf(first.effective_date),
      impacts: versions.flatMap(v => [...(v.impacts || []), ...(v === latest ? v._autoImpacts : [])].map(x => ({ ...x, _mou: v }))),
      budgets: versions.flatMap(v => (v.budgets || []).map(x => ({ ...x, _mou: v }))),
      projects: versions.flatMap(v => (v.projects || []).map(x => ({ ...x, _mou: v }))),
    };
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
  // 項目が欠けていたり形が違っていたりしても画面が壊れないよう、配列・文字の形をそろえる
  const arr = v => Array.isArray(v) ? v.filter(x => x !== null && x !== undefined) : [];
  r._raw = m; // データ点検では、補う前の元の値を見る
  r.id = r.id ? String(r.id) : '';
  r.title_ja = r.title_ja ? String(r.title_ja) : '（名称未登録）';
  r.doc_type = r.doc_type || '種類未確認';
  r.partner_org = r.partner_org || '相手機関不明';
  r.fields = arr(r.fields).length ? arr(r.fields) : ['other'];
  r.content = arr(r.content).map(String);
  r.summary = arr(r.summary).map(String);
  r.sources = arr(r.sources).filter(s => typeof s === 'object');
  r.impacts = arr(r.impacts).filter(i => typeof i === 'object');
  r.budgets = arr(r.budgets).filter(b => typeof b === 'object');
  r.projects = arr(r.projects).filter(p => typeof p === 'object');
  r.validity_sources = arr(r.validity_sources);
  r.additional_partners = arr(r.additional_partners);
  r.labor_detail = arr(r.labor_detail);
  r.status = r.status || 'unknown';
  r.legal_binding = r.legal_binding || 'unconfirmed';
  r.evidence_level = r.evidence_level || 'official_announcement';
  r.doc_category = DOC_CATEGORY[r.doc_category] ? r.doc_category : 'mou_moc';
  r._kind = docKind(r);
  r._numbersResearched = Array.isArray(m.numbers);
  r.numbers = Array.isArray(r.numbers) ? r.numbers : [];
  r.related_systems = arr(r.related_systems);
  r.acceptance_types = arr(r.acceptance_types);
  r.related_regions = arr(r.related_regions).filter(x => typeof x === 'object');
  r.other_japan_parties = arr(r.other_japan_parties);
  r.agencies = arr(r.agencies);
  // 日本側の種別：書かれていなければ区分（国・都道府県・市区町村）から決める。団体などは必ずデータに書く
  r._orgType = JAPAN_ORG_TYPE[r.japan_org_type] ? r.japan_org_type : (DEFAULT_ORG_TYPE[r.japan_level] || 'association');
  r._pairKind = pairKind(r._orgType, r.partner_type);
  r._official = r.evidence_level !== 'news_only';
  const d = m._d;
  if (d) {
    // 索引（core.json）の記録：合意内容などの本文を持たないので、作成時に元のデータから決めた分類を使う
    r._lite = true;
    r._kind = d.kind || r._kind;
    r._orgType = d.orgType || r._orgType;
    r._pairKind = d.pairKind || r._pairKind;
    r._relation = d.relation || 'unconfirmed';
    r.impacts = (d.imp || []).map(([category, stage]) => ({ category, stage, sources: [] }));
    r._autoImpacts = (d.aimp || []).map(category => ({ category, stage: 'agreed', sources: [], causality: 'n/a', _auto: true }));
    r.blurb = m.blurb || '';
  } else {
    r._relation = deriveRelation(r);
    r._autoImpacts = autoAgreed(r);
    r.blurb = blurbOf(r);
  }
  const vi = validityInfo(r);
  r._validity = vi.state;
  r._validityReason = vi.reason;
  r._year = yearOf(r.signed_date);
  return r;
}

// 一覧のカードに出す「何についての協定か」の短い説明。目的の記載を優先し、なければ合意内容の最初の項目を短くして使う
function blurbOf(r) {
  if (r.purpose) return String(r.purpose).trim();
  const t = String(r.summary[0] || r.content[0] || '').trim();
  return t.length > 100 ? t.slice(0, 98) + '…' : t;
}

// ---------- 絞り込み ----------
// f = { level, levels:[], orgType, pairKind, pref, countries:[], field, status, impact, includeNews, includePlanned,
//       validity（有効性の範囲：valid / valid_unk / all）, docScope（mou / foreign / all）, category（文書の種類）, kind（詳しい区分）, relation（受入れとの関係） }
// validity・docScope を省略したときは、締結済みのすべての文書が対象です。言葉での検索は search.js で行います。
export function filterGroups(db, f = {}) {
  const states = f.validity ? VALIDITY_SCOPE[f.validity]?.states : null;
  return db.groups.filter(g => {
    if (!f.includePlanned && g.planned) return false;
    if (!f.includeNews && !g.official) return false;
    if (states && !g.planned && !states.includes(g.validity)) return false;
    if (f.docScope === 'mou' && g.category !== 'mou_moc') return false;
    if (f.docScope === 'foreign' && g.relation !== 'direct') return false;
    if (f.category && g.category !== f.category) return false;
    if (f.kind && g.kind !== f.kind) return false;
    if (f.relation && g.relation !== f.relation) return false;
    if (f.level && g.level !== f.level) return false;
    if (f.levels && !f.levels.includes(g.level)) return false;
    if (f.orgType && g.orgType !== f.orgType) return false;
    if (f.pairKind && g.pairKind !== f.pairKind) return false;
    if (f.pref && g.pref_code !== f.pref) return false;
    if (f.countries && f.countries.length && !f.countries.some(c => g.countries.includes(c))) return false;
    if (f.field && !g.fields.includes(f.field)) return false;
    if (f.status && g.status !== f.status) return false;
    if (f.impact && !g.impacts.some(i => i.category === f.impact)) return false;
    return true;
  });
}

// 「協定・取決めの種類から探す」の表の分け方。1つの協定はどれか1つの表にだけ入る
// （ワーキング・ホリデーは専用の表、それ以外は締結主体ごと）。見出しの件数＝表示する件数
export const isWorkingHoliday = g => g.level === 'national' && g.category === 'bilateral_arrangement' && /ワーキング・ホリデー/.test(g.latest.title_ja);
export function typesTables(db, base, cat, rel, kind) {
  const inCat = filterGroups(db, { ...base, category: cat || null, kind: kind || null });
  const groups = sortGroups(rel ? inCat.filter(g => g.relation === rel) : inCat);
  const wh = groups.filter(isWorkingHoliday);
  const rest = groups.filter(g => !isWorkingHoliday(g));
  const byLevel = Object.fromEntries(LEVEL_ORDER.map(lv => [lv, rest.filter(g => g.level === lv)]));
  return { inCat, groups, wh, byLevel };
}

// 3つの数を分けて数える：登録した文書の数（更新・後継の版を1文書ずつ）／協定・協力関係の数（同じ協定の版をまとめて1件）／
// 現在有効と確認できる協定の数（協力関係ごとに1件。更新前と更新後を同時に有効として二重に数えない）
export function countTriple(groups) {
  const signed = groups.filter(g => !g.planned);
  return {
    docs: signed.reduce((a, g) => a + g.versions.filter(v => v._validity !== 'planned').length, 0),
    groups: signed.length,
    valid: signed.filter(g => g.validity === 'valid_confirmed').length,
    planned: groups.filter(g => g.planned).length,
  };
}

// 締結主体ごとの件数（国・都道府県・市区町村・団体などを足さずに並べる）
export function levelCounts(groups) {
  const c = Object.fromEntries(LEVEL_ORDER.map(lv => [lv, 0]));
  for (const g of groups) c[g.level] = (c[g.level] || 0) + 1;
  return c;
}
export function levelBreakdown(groups, opts = {}) {
  const c = levelCounts(groups);
  return LEVEL_ORDER.filter(lv => c[lv] || (opts.always || ['national', 'prefecture']).includes(lv)).map(lv => `${LEVEL_SHORT[lv]} ${c[lv]}件`).join('／');
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
  // 外国人材以外の分野：公式の一覧を確認した県は「該当なし」、一部だけ調べた県は「調査が一部のみ」
  if (field) {
    if (s2 === 'not_surveyed') return 'not_surveyed';
    return s2 === 'list_checked' ? 'none' : 'partial';
  }
  // すべての分野：両方の段階を調べ終えた県だけ「該当なし」「調査したが確認できず」とし、
  // 外国人材以外の分野が一部しか調べられていない県は「調査が一部のみ」と分ける
  if (s1 === 'not_surveyed' && s2 === 'not_surveyed') return 'not_surveyed';
  if (s2 === 'partial' || s2 === 'not_surveyed') return 'partial';
  if (s1 === 'none_confirmed' && s2 === 'list_checked') return 'none';
  return 'not_found';
}

// 調査状況の概要（トップ・調査状況のページで使う）。
// groupsIn を渡すと、登録件数・有効性の件数をその範囲（いまの数え方）で数える。省略時は公式資料で確認できた全登録文書
export function surveySummary(db, groupsIn) {
  const P = db.survey.prefectures || {};
  const codes = db.prefs.map(p => p.code);
  const s1 = c => P[c]?.stage1?.result || 'not_surveyed';
  const s2 = c => P[c]?.stage2?.result || 'not_surveyed';
  const recheck = codes.filter(c => P[c]?.stage1?.recheck || P[c]?.stage2?.recheck);
  const groups = groupsIn || db.groups.filter(g => g.official);
  const signed = groups.filter(g => !g.planned);
  const vc = validityCounts(signed);
  return {
    prefs: codes.length,
    stage1Done: codes.filter(c => s1(c) !== 'not_surveyed').length,
    stage2Listed: codes.filter(c => s2(c) === 'list_checked').length,
    stage2Partial: codes.filter(c => s2(c) === 'partial').length,
    stage2None: codes.filter(c => s2(c) === 'not_surveyed').length,
    recheck: recheck.length,
    recheckNames: recheck.map(c => db.prefByCode.get(c)?.name),
    registered: signed.length,
    registeredPref: signed.filter(g => g.level === 'prefecture').length,
    registeredNat: signed.filter(g => g.level === 'national').length,
    registeredCity: signed.filter(g => g.level === 'municipality').length,
    registeredOrg: signed.filter(g => g.level === 'organization').length,
    planned: groups.filter(g => g.planned).length,
    docs: db.mous.length,
    determined: vc.valid_confirmed + vc.ended_confirmed + vc.signed_not_started,
    valid: vc.valid_confirmed,
    ended: vc.ended_confirmed,
    notStarted: vc.signed_not_started,
    unconfirmed: vc.unconfirmed,
    lastUpdated: db.config.last_updated,
    asOf: db.config.data_as_of,
  };
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

// 有効期限。更新・延長後の期限（renewed_until）が公式資料で分かっていれば、当初の期限（valid_until）より優先します。
// 年月だけ（"2026-02"）の期限はその月の末日（2026-02-28。うるう年は29日）、年だけ（"2028"）は12月31日まで有効として比べます。
// 存在しない日付（"2026-02-31" など）は期限として使いません（データ点検で誤りとして表示）。
export function termEnd(m) {
  for (const [raw, renewed] of [[m.renewed_until, true], [m.valid_until, false]]) {
    const date = periodEnd(raw);
    if (date) return { date, raw: String(raw), renewed, precision: parseDate(raw).precision };
  }
  return null;
}

// 協定の有効性（5区分）の判定。データの validity_state には、公式資料で確認した時点の結果を書きます。
// 書かれていないもの・判定できないものは「有効性未確認」。次のことだけでは「有効」にも「終了」にもしません：
//   事業が続いている／自動更新の条項がある／古い一覧に載っている／期限が過ぎた（更新の有無が分からない）
// asOf（基準日）を省略すると今日の日付で判定します。reason は画面で理由を説明するためのものです。
export function validityInfo(m, asOf = today()) {
  const rec = VALIDITY[m.validity_state] ? m.validity_state : 'unconfirmed';
  // 1. 締結を確認できていない（予定の発表だけ）
  if (rec === 'planned' || (m.status === 'planned' && !['signed_not_started', 'valid_confirmed', 'ended_confirmed'].includes(rec))) return { state: 'planned', reason: 'planned' };
  // 2. 公式資料で終了・失効・後継協定への置き換えを確認したもの（途中終了を含む）
  if (rec === 'ended_confirmed') return { state: 'ended_confirmed', reason: 'recorded' };
  // 有効・開始前と確認していても、公式資料に書かれた終了日を過ぎたら終了確認
  const ended = periodEnd(m.ended_date);
  if (ended && ended < asOf && (rec === 'valid_confirmed' || rec === 'signed_not_started')) return { state: 'ended_confirmed', reason: 'ended_date' };
  // 3. 締結済みだが、文書に書かれた開始日がまだ来ていない（年月だけの開始日は、その月が始まるまで）
  const start = periodStart(m.effective_date);
  if (start && start > asOf) return { state: 'signed_not_started', reason: rec === 'signed_not_started' ? 'recorded' : 'not_started' };
  const end = termEnd(m);
  // 4. 確認時点では開始前だったが、開始日が来たもの：書かれた期限の内側なら有効確認、期限が分からなければ未確認
  if (rec === 'signed_not_started') {
    if (!start) return { state: 'signed_not_started', reason: 'recorded' };
    if (end && end.date >= asOf) return { state: 'valid_confirmed', reason: 'started', end };
    return { state: 'unconfirmed', reason: end ? 'lapsed' : 'started_no_term', end };
  }
  // 5. 有効確認でも、期限（更新後の期限を優先）を過ぎたら、更新・延長を確認できるまで「有効性未確認」。
  //    自動更新の条項があっても、更新されたことを公式資料で確認できなければ同じ扱い。期限の当日までは有効
  if (rec === 'valid_confirmed' && end && end.date < asOf) return { state: 'unconfirmed', reason: 'lapsed', end };
  return { state: rec, reason: 'recorded', end };
}
// 判定の理由（画面・CSVで説明に使う）
export const VALIDITY_REASONS = {
  recorded: '公式資料で確認した結果のとおり',
  planned: '締結を確認できていない（予定の発表のみ）',
  ended_date: '公式資料に書かれた終了日を過ぎたため終了',
  not_started: '文書に書かれた開始日がまだ来ていないため開始前',
  started: '開始日が来て、書かれた有効期間の内側にあるため有効',
  started_no_term: '開始日は来たが、有効期間が分からないため未確認',
  lapsed: '書かれた有効期限（更新後の期限を優先）を過ぎ、更新・延長を公式資料で確認できていないため未確認',
};
export function validityState(m, asOf) {
  return validityInfo(m, asOf).state;
}
// 確認時点では有効確認だったが、その後に期限を過ぎたもの（画面で理由を表示するため）
export function lapsedSinceCheck(m, asOf) {
  const i = validityInfo(m, asOf);
  return i.reason === 'lapsed' && m.validity_state === 'valid_confirmed';
}

// 有効性の5区分の件数（締結済み累計＝有効確認＋未確認＋終了確認＋開始前。締結予定は含めない）
export function validityCounts(groups) {
  const c = { valid_confirmed: 0, unconfirmed: 0, ended_confirmed: 0, signed_not_started: 0, planned: 0 };
  for (const g of groups) c[g.validity] = (c[g.validity] || 0) + 1;
  c.signed_total = c.valid_confirmed + c.unconfirmed + c.ended_confirmed + c.signed_not_started;
  return c;
}

// 有効期限（更新後の期限を優先）が書かれていて、それが過ぎているか（表示の注意書き用）
export function pastTerm(m, asOf = today()) {
  const end = termEnd(m);
  return !!end && end.date < asOf;
}

// ---------- 項目ごとの調査状況 ----------
// 「確認済み」「調査したが確認できず」「未調査」を区別します（不明なものを0や「なし」として扱わない）。
// データに research（項目ごとの調査状況）が書かれていればそれを使い、なければ調査の範囲から次のように決めます。
//   ・名称・日付・期間・自動更新・終了／更新・相手・文書の種類・出典：全件で有効性の確認時に調べている → 空欄は「調査したが確認できず」
//   ・人数・事業の実施状況：外国人材・労働の協定（第1段階）は調べている → 空欄は「調査したが確認できず」、それ以外は「未調査」
//   ・関連予算：予算書・決算書の網羅的な確認はまだ → 記録がなければ「未調査」
export const RESEARCH_STATES = {
  confirmed: { ja: '確認済み', desc: '公式資料で確認できた' },
  not_found: { ja: '調査したが確認できず', desc: '調べたが公式資料で確認できなかった（存在しないとは限らない）' },
  not_surveyed: { ja: '未調査', desc: 'まだ調べていない' },
};
const NUM_RE = /\d[\d,，]*\s*(人|名)/;
export const AUTO_RENEWAL = { yes: '自動更新の条項あり', no: '自動更新の条項なし', not_stated: '原文に記載なし' };
export function researchStatus(m) {
  const r = m.research || {};
  const researched = !!m.validity_checked;
  const labor = (m.fields || []).includes('labor') || m._relation === 'direct';
  const ok = (v) => ({ state: 'confirmed', value: v });
  const nf = (why) => ({ state: 'not_found', value: why || '' });
  const ns = (why) => ({ state: 'not_surveyed', value: why || '' });
  const term = m.term_text || (m.valid_until ? `期限：${m.valid_until}` : '') || ({ indefinite: '期間の定めなし', not_stated: '原文に期間の記載なし' }[m.validity_type] || '');
  const items = [
    ['title', '協定の正式名称', () => m.title_ja ? ok(m.title_ja) : nf()],
    ['signed', '締結日', () => m.signed_date ? ok(m.signed_date) : nf(m.date_note)],
    ['effective', '発効日・開始日', () => m.effective_date ? ok(m.effective_date) : researched ? nf() : ns()],
    ['term', '有効期間', () => term ? ok(term) : researched ? nf() : ns()],
    ['auto', '自動更新の有無', () => AUTO_RENEWAL[m.auto_renewal] ? ok(AUTO_RENEWAL[m.auto_renewal]) : researched ? nf() : ns()],
    ['end', '終了・更新の情報', () => (m.ended_date || m.end_reason) ? ok(`終了：${m.ended_date || '日付不明'}${m.end_reason ? '（' + m.end_reason + '）' : ''}`)
      : (m.renewed_until || m.last_renewed) ? ok(`更新・延長：${m.last_renewed || ''}${m.renewed_until ? '（更新後の期限 ' + m.renewed_until + '）' : ''}`)
        : m.validity_state === 'valid_confirmed' ? ok('終了の情報なし（現在の効力を確認）') : researched ? nf('更新・終了の情報は見つからず') : ns()],
    ['partner', '相手国・相手機関', () => m.partner_org && m.country_code ? ok(m.partner_org) : nf()],
    ['doctype', '文書の種類', () => m.doc_type ? ok(m.doc_type) : nf()],
    ['relation', '外国人受入れとの関連', () => m._relation === 'unconfirmed' ? nf('合意内容を確認できず') : ok(RELATION[m._relation]?.ja + (m.foreign_relation ? '' : '（合意内容の記載からこのサイトが分類）'))],
    ['numbers', '人数の目標・実績', () => (m.numbers || []).length ? ok(`${m.numbers.length}項目`)
      : (m.impacts || []).some(i => i.category === 'population' && NUM_RE.test(i.text || '')) ? ok('地域への影響の記録に記載')
        : (m._numbersResearched || labor) ? nf() : ns('外国人材以外の協定は未調査')],
    ['status', '事業の実施状況', () => ['in_progress', 'completed', 'expired'].includes(m.status) ? ok(STATUS[m.status].ja)
      : (m.status === 'signed' || labor) ? nf('具体的な事業は確認できず') : ns('外国人材以外の協定は未調査')],
    ['budget', '関連予算', () => (m.budgets || []).length ? ok(`${m.budgets.length}件の記録`) : m.budget_status === 'none_confirmed' ? ok('該当なし（公式資料で確認）') : ns('予算書・決算書の網羅的な確認は未実施')],
    ['source', '公式出典', () => m.evidence_level === 'news_only' ? nf('報道のみ') : (m.sources || []).length ? ok(`${m.sources.length}件`) : nf()],
  ];
  return items.map(([key, ja, f]) => {
    const given = r[key];
    const v = RESEARCH_STATES[given] ? { state: given, value: '' } : f();
    return { key, ja, ...v };
  });
}

// ---------- CLAIR（自治体国際化協会）の一覧との照合 ----------
// 未解決の行の理由の分類（data/clair_check.json の rows[].unresolved_reason）
export const CLAIR_UNRESOLVED = {
  partner_unknown: { ja: '情報の不足（締結の事実は確認できるが、相手機関名などを公式資料で確認できない）', short: '情報の不足' },
  no_evidence: { ja: '協定の存在を公式資料で確認できない', short: '存在を確認できない' },
  source_deleted: { ja: '元の公式資料が削除され、開ける資料で確認できない', short: '資料が削除済み' },
  out_of_scope: { ja: '自治体の協定・覚書に当たらない可能性（業務上の契約、当事者が自治体でない など）', short: '協定に当たらない可能性' },
  duplicate: { ja: '重複の疑い（登録済みの協定、またはCLAIRの別の行と同じものの可能性）', short: '重複の疑い' },
  planned: { ja: 'CLAIRの時点で締結予定のままで、その後の締結を確認できない', short: '締結予定のまま' },
};
// CLAIRの照合の件数を、行のデータから数え直す（保存してある集計の数字は使わない）
export function clairCounts(db) {
  const rows = db.clair?.rows || [];
  const ok = r => (r.site_ids || []).some(id => db.mouById.has(id));
  const un = rows.filter(r => r.result === 'unregistered');
  const unresolved = un.filter(r => !ok(r));
  const reasons = {};
  for (const r of unresolved) { const k = CLAIR_UNRESOLVED[r.unresolved_reason] ? r.unresolved_reason : 'unclassified'; reasons[k] = (reasons[k] || 0) + 1; }
  return {
    rows: rows.length,
    match: rows.filter(r => r.result === 'match').length,
    differs: rows.filter(r => r.result === 'differs').length,
    unregistered: un.length,
    added: un.filter(ok).length,
    unresolved: unresolved.length,
    site_only: (db.clair?.site_only || []).length,
    reasons,
  };
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
  if (m.japan_level === 'municipality') return m.japan_org || m.municipality_name || '市区町村名不明';
  if (m.japan_level === 'organization') return m.japan_org || '団体名不明';
  return m.japan_org || prefName(db, m.pref_code);
}
// 一覧・グラフで使う短い名前（国／都道府県名／市区町村名／団体名）
export function sideShort(db, g) {
  const m = g.latest;
  if (g.level === 'national') return '国';
  if (g.level === 'prefecture') return prefName(db, g.pref_code);
  if (g.level === 'municipality') return m.municipality_name || m.japan_org || '市区町村';
  const abbr = (m.japan_org || '').match(/[（(]([^）)]{2,16})[）)]\s*$/);
  return abbr ? abbr[1] : (m.japan_org || '団体').slice(0, 18);
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
export function validate(db) {
  const issues = [];
  const ids = new Map();
  const add = (m, level, msg) => issues.push({ id: m.id || '(IDなし)', file: m._file, level, msg });
  for (const m of db.mous) {
    const raw = m._raw || m;
    if (!m.id) add(m, 'error', 'id がありません');
    else if (ids.has(m.id)) add(m, 'error', `id が重複しています（${ids.get(m.id)} と同じ）`);
    else ids.set(m.id, m._file);
    if (!raw.title_ja) add(m, 'error', 'title_ja（正式名称）がありません');
    if (!raw.doc_type) add(m, 'error', 'doc_type（文書の種類）がありません');
    // 討議議事録（R/D）を覚書（MOU・MOC）として数えない
    if (/討議議事録|\bR\/D\b|Record of Discussion/i.test(`${raw.doc_type || ''} ${raw.title_original || ''}`) && m.doc_category !== 'record_of_discussions') add(m, 'error', '討議議事録（R/D）は doc_category を record_of_discussions にしてください（MOU・MOCとして数えないため）');
    if (raw.doc_category && !DOC_CATEGORY[raw.doc_category]) add(m, 'error', `doc_category「${raw.doc_category}」が正しくありません`);
    // 日付は形だけでなく、実在する日付か（2026-02-31 などでないか）も確かめる
    for (const k of ['effective_date', 'valid_until', 'renewed_until', 'ended_date', 'last_renewed', 'validity_checked', 'last_checked']) {
      if (raw[k] && !parseDate(raw[k])) add(m, 'error', `${k}「${raw[k]}」は存在しない日付か、形が正しくありません（YYYY-MM-DD / YYYY-MM / YYYY）`);
    }
    if (raw.renewed_until && raw.valid_until && periodEnd(raw.renewed_until) && periodEnd(raw.renewed_until) < periodEnd(raw.valid_until)) add(m, 'warn', '更新後の期限（renewed_until）が当初の期限（valid_until）より前です');
    if (raw.effective_date && raw.valid_until && periodStart(raw.effective_date) && periodEnd(raw.valid_until) && periodEnd(raw.valid_until) < periodStart(raw.effective_date)) add(m, 'error', '有効期限が開始日より前です');
    if (raw.signed_date && raw.effective_date && parseDate(raw.signed_date)?.precision === 'day' && parseDate(raw.effective_date)?.precision === 'day' && raw.effective_date < raw.signed_date && !raw.date_note) add(m, 'warn', '開始日が締結日より前です（遡って適用する場合は date_note に説明を）');
    if (m.validity_state === 'valid_confirmed' && !m.validity_sources.length) add(m, 'warn', '「有効確認」の根拠資料（validity_sources）がありません');
    if (!LEVELS[m.japan_level]) add(m, 'error', 'japan_level は national / prefecture / municipality / organization のいずれか');
    if ((m.japan_level === 'prefecture' || m.japan_level === 'municipality') && !db.prefByCode.has(m.pref_code)) add(m, 'error', 'pref_code が正しくありません（"01"〜"47"）');
    if (m.japan_level === 'municipality' && !/^\d{6}$/.test(m.municipality_code || '')) add(m, 'error', '市区町村のMOUには municipality_code（全国地方公共団体コード6桁）が必要です');
    if (m.japan_level === 'municipality' && !raw.municipality_name) add(m, 'warn', '市区町村のMOUには municipality_name（市区町村名）を入れてください');
    // 日本側の種別：団体・企業などは必ず書く。国・都道府県・市区町村は区分と食い違わないか確かめる
    if (raw.japan_org_type && !JAPAN_ORG_TYPE[raw.japan_org_type]) add(m, 'error', `japan_org_type「${raw.japan_org_type}」が正しくありません`);
    if (m.japan_level === 'organization' && !['public_body', 'company', 'association', 'university'].includes(raw.japan_org_type)) add(m, 'error', '団体・企業などの協定（japan_level: organization）には japan_org_type（public_body / company / association / university）が必要です');
    if (raw.japan_org_type && JAPAN_ORG_TYPE[raw.japan_org_type] && LEVELS[m.japan_level] && JAPAN_ORG_TYPE[raw.japan_org_type].level !== m.japan_level) add(m, 'error', `japan_org_type「${raw.japan_org_type}」と japan_level「${m.japan_level}」が食い違っています`);
    // 団体・企業の本部所在地を理由に、都道府県の件数へ入れない
    if (m.japan_level === 'organization' && raw.pref_code) add(m, 'error', '団体・企業などの協定に pref_code を入れないでください（本部の所在地で都道府県の件数に加えないため）。事業が行われた地域は related_regions に書きます');
    for (const r of m.related_regions) {
      if (!db.prefByCode.has(r.pref_code)) add(m, 'error', `related_regions の pref_code「${r.pref_code}」が正しくありません`);
      if (!(r.sources || []).length) add(m, 'error', 'related_regions（関連事業の地域）には根拠資料（sources）が必要です');
      for (const s of r.sources || []) if (!m.sources.some(x => x.id === s)) add(m, 'error', `関連事業の地域の根拠 ${s} が sources にありません`);
    }
    if (!db.countryByCode.has(m.country_code)) add(m, 'error', `country_code「${m.country_code}」が countries.json にありません`);
    for (const a of m.additional_partners || []) if (!db.countryByCode.has(a.country_code)) add(m, 'error', `additional_partners の country_code「${a.country_code}」が countries.json にありません`);
    if (m.signed_date && !parseDate(m.signed_date)) add(m, 'error', 'signed_date は実在する日付を YYYY-MM-DD / YYYY-MM / YYYY の形で');
    if (!m.signed_date && !m.effective_date && m.status !== 'planned') add(m, 'warn', '締結日が不明です（分かれば追加してください）');
    if (m.announced_date && !parseDate(m.announced_date)) add(m, 'error', 'announced_date の形が正しくないか、存在しない日付です');
    for (const f of m.fields) if (!FIELD[f]) add(m, 'error', `分野コード「${f}」が正しくありません`);
    if (!STATUS[m.status]) add(m, 'error', `status「${m.status}」が正しくありません`);
    if (!PARTNER_TYPES[m.partner_type]) add(m, 'warn', `partner_type「${m.partner_type}」が正しくありません`);
    if (!LEGAL[m.legal_binding]) add(m, 'error', `legal_binding「${m.legal_binding}」が正しくありません`);
    if (!EVIDENCE[m.evidence_level]) add(m, 'error', `evidence_level「${m.evidence_level}」が正しくありません`);
    if (!m.sources.length) add(m, 'error', '情報源（sources）がありません');
    const sids = new Set(m.sources.map(s => s.id));
    for (const s of m.sources) {
      if (!/^https?:\/\//.test(s.url || '')) add(m, 'error', `情報源 ${s.id} の URL がありません`);
      if (!s.checked || !parseDate(s.checked)) add(m, 'error', `情報源 ${s.id} の確認日（checked）がないか、日付が正しくありません`);
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
    // 後継協定は同じ group_key にして、件数を二重に数えない
    else if (m.successor_id && db.mouById.get(m.successor_id).group_key !== m.group_key) add(m, 'warn', `後継の文書 ${m.successor_id} が別のグループです（同じ協定なら group_key をそろえてください）`);
    if (m.renewal_of && db.mouById.has(m.renewal_of) && db.mouById.get(m.renewal_of).group_key !== m.group_key) add(m, 'warn', `更新元 ${m.renewal_of} が別のグループです（二重計上の可能性）`);
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
