// 組織名から探すための索引（「締結主体から探す」のページとサイト内検索で使う）
// ・締結主体：協定に日本側の当事者として署名した組織（国の協定は担当・署名した省庁ごとにも数える）
// ・共同の締結者：都道府県などの協定に、日本側として一緒に名前を連ねた組織（その組織の件数には足さない）
// ・情報源：出典の資料を出した組織（協定の当事者ではない）。CLAIRの一覧に載った協定を、CLAIRが結んだ協定として数えない
// 名前は日本語・英語・略称・表記ゆれ（search.js の SYNONYMS）のどれでも探せます。
import { prep, parseQuery, textMatches, SYNONYMS, MINISTRY_RE } from './search.js';
import { JAPAN_ORG_TYPE, prefName, sortGroups } from './data.js';

// 法人の種類の前置き（公益財団法人など）は、名前を比べるときだけ外す
const LEGAL_PREFIX = /^(?:公益|一般)?(?:財団|社団)法人|^独立行政法人|^国立大学法人|^公立大学法人|^学校法人|^株式会社|^（(?:公財|一財|一社|公社|株)）/;
const ABBR = /[（(]([^（）()]{2,20})[）)]\s*$/;
// 略称として扱うのは、英字の略称（JITCO・CLAIR・JP-MIRAI など）とカタカナの通称（アイム・ジャパン）だけ
// （「宮城県（長寿社会政策課）」の担当課の名前などは略称にしない）
const ABBR_OK = /^[A-Za-z][A-Za-z0-9&.\- ]{1,15}$|^[ァ-ヶー・]{2,16}$/;

// 組織名を「比べるための形」と「略称」に分ける
export function orgParts(raw) {
  const s = String(raw || '').trim();
  const abbrM = s.match(ABBR);
  // 「高知県 総務部法務文書課」「宮城県（長寿社会政策課）」「山梨県・山梨県議会」は先頭の組織名で比べる
  let head = s.split(/[（(・]| (?=[^\x00-\x7F])|　/)[0].trim();
  let prev;
  do { prev = head; head = head.replace(LEGAL_PREFIX, '').trim(); } while (head !== prev);
  const abbr = abbrM && ABBR_OK.test(abbrM[1].trim()) && abbrM[1].trim() !== 'e-Stat' ? abbrM[1].trim() : '';
  return { name: s, core: head || s, abbr, key: prep(head || s).n };
}

function aliasesFor(names) {
  const set = new Set(names.filter(Boolean));
  const ns = new Set([...set].map(x => prep(x).n));
  for (const list of SYNONYMS) if (list.some(x => ns.has(prep(x).n))) list.forEach(x => set.add(x));
  return [...set];
}

export function orgIndex(db) {
  if (db._orgs) return db._orgs;
  const map = new Map();
  const ent = (key, init) => {
    if (!key) return null;
    if (!map.has(key)) map.set(key, { key, names: new Map(), abbr: '', en: '', type: null, sign: new Set(), co: new Set(), src: new Set(), surveyed: [] });
    const e = map.get(key);
    // 先に「共同の締結者」「情報源」として作った組織にも、あとから分かった種別を書き足す
    for (const [k, v] of Object.entries(init || {})) if (e[k] === null || e[k] === undefined || e[k] === '') e[k] = v;
    return e;
  };
  const addName = (e, n) => e.names.set(n, (e.names.get(n) || 0) + 1);

  // 1. 締結主体
  const nat = ent('日本国政府', { type: 'national_gov', all_national: true });
  addName(nat, '日本国政府（国・省庁の協定すべて）');
  for (const g of db.groups) {
    for (const v of g.versions) {
      if (v.japan_level === 'national') {
        nat.sign.add(g);
        for (const min of new Set((v.japan_org || '').match(MINISTRY_RE) || [])) {
          const e = ent(prep(min).n, { type: 'national_gov' });
          addName(e, min); e.sign.add(g);
        }
      } else if (v.japan_level === 'prefecture') {
        const pn = prefName(db, v.pref_code);
        const e = ent(prep(pn).n, { type: 'prefecture', pref: v.pref_code });
        addName(e, pn); e.sign.add(g);
      } else if (v.japan_level === 'municipality') {
        const p = orgParts(v.municipality_name || v.japan_org);
        const e = ent(p.key, { type: 'municipality' });
        addName(e, p.name); e.sign.add(g);
      } else {
        const p = orgParts(v.japan_org);
        const e = ent(p.key, { type: v._orgType });
        addName(e, p.name); e.sign.add(g);
        if (p.abbr && !e.abbr) e.abbr = p.abbr;
        if (v.japan_org_en && !e.en) e.en = v.japan_org_en;
      }
      // 共同の締結者（相手方側として記録された名前は除く）
      for (const party of v.other_japan_parties || []) {
        if (/相手方側/.test(party)) continue;
        const p = orgParts(party.replace(/\s+(学長|教授|会長).*$/, ''));
        const e = ent(p.key, {});
        addName(e, p.name); e.co.add(g);
        if (p.abbr && !e.abbr) e.abbr = p.abbr;
      }
    }
  }
  // 2. 情報源（出典の発行元）
  for (const g of db.groups) for (const v of g.versions) for (const s of v.sources) {
    if (!s.publisher) continue;
    const p = orgParts(s.publisher);
    if (!p.key || /^(?:\d|https?)/.test(p.key)) continue;
    const e = ent(p.key, {});
    if (!e.names.size) addName(e, p.abbr ? `${p.core}（${p.abbr}）` : p.core);
    if (p.abbr && !e.abbr) e.abbr = p.abbr;
    e.src.add(g);
  }
  // CLAIRの照合（data/clair_check.json）で照らし合わせた協定も、CLAIRが「情報源・照合資料」として関わった協定に数える
  if (db.clair) {
    const p = orgParts(db.clair.source?.publisher || '一般財団法人自治体国際化協会（CLAIR）');
    const e = ent(p.key, {});
    if (!e.names.size) addName(e, p.abbr ? `${p.core}（${p.abbr}）` : p.core);
    e.abbr = e.abbr || p.abbr;
    e.clair = true;
    for (const r of db.clair.rows || []) for (const id of r.site_ids || []) { const m = db.mouById.get(id); if (m) e.src.add(m._group); }
  }
  // 3. 調査した団体（協定が見つからなかったものも、調べた結果を表示できるように）
  for (const o of db.survey.organizations || []) {
    const p = orgParts(o.name);
    const e = ent(p.key, {});
    if (!e.names.size) addName(e, o.name);
    if (p.abbr && !e.abbr) e.abbr = p.abbr;
    e.surveyed.push(o);
  }

  const list = [...map.values()].map(e => {
    // 表示する名前：締結主体として最も多く使われた名前（なければ最初の名前）
    const name = [...e.names].sort((a, b) => b[1] - a[1])[0]?.[0] || e.key;
    const p = orgParts(name);
    const abbr = e.abbr || p.abbr;
    const extra = e.type === 'prefecture' ? [db.prefByCode.get(e.pref)?.short, db.prefByCode.get(e.pref)?.en] : [];
    const aliases = aliasesFor([name, p.core, abbr, e.en, ...e.names.keys(), ...extra]);
    const sign = sortGroups([...e.sign]);
    const co = sortGroups([...e.co].filter(g => !e.sign.has(g)));
    const src = sortGroups([...e.src].filter(g => !e.sign.has(g) && !e.co.has(g)));
    return { key: e.key, name, abbr, en: e.en, type: e.type, pref: e.pref, allNational: !!e.all_national, clair: !!e.clair, aliases, aliasN: aliases.map(a => prep(a).n), sign, co, src, surveyed: e.surveyed };
  });
  db._orgs = { list, byKey: new Map(list.map(e => [e.key, e])) };
  return db._orgs;
}

// 組織名で探す。すべての言葉が、どれかの名前（日本語・英語・略称・別名）に一致する組織を返す
// 並び順：名前がぴったり一致 → 前方一致 → 締結した協定の多い順
export function findOrgs(db, q, opts = {}) {
  const parsed = typeof q === 'string' ? parseQuery(db, q) : q;
  if (!parsed.tokens.length) return [];
  const { list } = orgIndex(db);
  const out = [];
  for (const e of list) {
    if (opts.signedOnly && !e.sign.length && !e.co.length) continue;
    let score = 0, all = true;
    for (const t of parsed.tokens) {
      const alts = t.alts.map(a => a.n);
      if (e.aliasN.some(n => alts.includes(n))) { score += 100; continue; }
      if (e.aliasN.some(n => alts.some(a => a.length >= 2 && n.startsWith(a)))) { score += 30; continue; }
      if (e.aliases.some(a => textMatches(a, t))) { score += 5; continue; }
      all = false; break;
    }
    if (all) out.push({ e, score });
  }
  // 名前がぴったり一致する組織があるときは、名前の一部に言葉を含むだけの「調査した組織」の記録は出さない
  const best = Math.max(0, ...out.map(x => x.score));
  const shown = best >= 100 ? out.filter(x => x.score >= 30 || x.e.sign.length || x.e.co.length || x.e.src.length) : out;
  return shown.sort((a, b) => b.score - a.score || (b.e.sign.length + b.e.co.length) - (a.e.sign.length + a.e.co.length) || b.e.src.length - a.e.src.length || a.e.name.localeCompare(b.e.name, 'ja')).map(x => x.e);
}

// 言葉そのものが組織の名前（略称・別名を含む）とぴったり一致する組織（サイト内検索の「組織名として一致」の案内に使う）
export function exactOrgs(db, token) {
  const { list } = orgIndex(db);
  const alts = token.alts.map(a => a.n);
  return list.filter(e => e.aliasN.some(n => alts.includes(n)));
}

export function orgTypeLabel(e) {
  if (e.allNational) return '日本政府（国・省庁）';
  if (e.type && JAPAN_ORG_TYPE[e.type]) return e.type === 'national_gov' ? '日本政府・省庁（担当・署名した省庁）' : JAPAN_ORG_TYPE[e.type].ja;
  if (e.co.length) return '共同の締結者';
  if (e.src.length) return '情報源のみ（締結主体としての登録なし）';
  return '調査した組織（締結主体としての登録なし）';
}
