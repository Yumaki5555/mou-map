// サイトの集計・有効性の判定の自動テスト（ブラウザを使わずに確かめられる部分）
// 使い方（mou-map フォルダで実行）： node tools/test_site.mjs
// すべて合格なら「合格：○件」、失敗があれば内容を表示して終了コード1で終わります。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { periodEnd, periodStart, parseDate } from '../assets/js/util.js';
import {
  buildDB, filterGroups, validityInfo, validityCounts, countByPref, termEnd, validate, researchStatus,
  VALIDITY_SCOPES, VALIDITY_SCOPE, DOC_CATEGORIES, RELATIONS, FIELDS, surveySummary, zeroState,
  typesTables, isWorkingHoliday, levelCounts, pairKind, JAPAN_ORG_TYPE,
} from '../assets/js/data.js';
import { mouCSV, groupsToMous } from '../assets/js/csv.js';
import { searchGroups, applyFacets, facetCounts, tokenCounts, parseQuery, SEARCH_FIELD } from '../assets/js/search.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let pass = 0;
const fails = [];
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fails.push(`${name}\n    期待：${JSON.stringify(want)}\n    結果：${JSON.stringify(got)}`);
}
function ok(name, cond, detail = '') { eq(name + (detail ? `（${detail}）` : ''), !!cond, true); }

// ---------- 1. 日付・有効期限の境界値 ----------
eq('年月の期限は月末（2月・平年）', periodEnd('2026-02'), '2026-02-28');
eq('年月の期限は月末（2月・うるう年）', periodEnd('2028-02'), '2028-02-29');
eq('うるう年でない世紀年（2100年2月）', periodEnd('2100-02'), '2100-02-28');
eq('400で割り切れる年はうるう年（2000年2月）', periodEnd('2000-02'), '2000-02-29');
eq('30日の月', periodEnd('2026-04'), '2026-04-30');
eq('年だけの期限は12月31日', periodEnd('2026'), '2026-12-31');
eq('年月日はそのまま', periodEnd('2026-10-31'), '2026-10-31');
eq('存在しない日付（2026-02-31）は使わない', periodEnd('2026-02-31'), null);
eq('存在しない日付（2026-04-31）は使わない', periodEnd('2026-04-31'), null);
eq('うるう年でない2月29日は使わない', periodEnd('2026-02-29'), null);
eq('うるう年の2月29日は使える', periodEnd('2028-02-29'), '2028-02-29');
eq('13月は使わない', periodEnd('2026-13'), null);
eq('空欄', periodEnd(''), null);
eq('開始日（年月）は月の1日', periodStart('2027-01'), '2027-01-01');
eq('精度の判定', ['2026', '2026-02', '2026-02-03'].map(d => parseDate(d).precision), ['year', 'month', 'day']);

const base = { id: 'T', title_ja: 'テスト', doc_type: '覚書', japan_level: 'prefecture', pref_code: '01', country_code: 'VN', partner_org: '相手', signed_date: '2021-03-01', sources: [], fields: ['labor'], status: 'in_progress' };
const V = (patch, asOf) => validityInfo({ ...base, ...patch }, asOf);
const st = (patch, asOf) => V(patch, asOf).state;

// 年月日の期限：期限の当日までは有効、翌日から未確認（更新を確認できるまで）
eq('年月日の期限・当日', st({ validity_state: 'valid_confirmed', valid_until: '2026-10-31' }, '2026-10-31'), 'valid_confirmed');
eq('年月日の期限・翌日', st({ validity_state: 'valid_confirmed', valid_until: '2026-10-31' }, '2026-11-01'), 'unconfirmed');
// 年月だけの期限：その月の末日まで有効
eq('年月の期限・2月末日（平年）', st({ validity_state: 'valid_confirmed', valid_until: '2026-02' }, '2026-02-28'), 'valid_confirmed');
eq('年月の期限・3月1日（平年）', st({ validity_state: 'valid_confirmed', valid_until: '2026-02' }, '2026-03-01'), 'unconfirmed');
eq('うるう年の2月29日は有効', st({ validity_state: 'valid_confirmed', valid_until: '2028-02' }, '2028-02-29'), 'valid_confirmed');
eq('うるう年の3月1日は未確認', st({ validity_state: 'valid_confirmed', valid_until: '2028-02' }, '2028-03-01'), 'unconfirmed');
eq('年だけの期限・12月31日', st({ validity_state: 'valid_confirmed', valid_until: '2028' }, '2028-12-31'), 'valid_confirmed');
eq('年だけの期限・翌年1月1日', st({ validity_state: 'valid_confirmed', valid_until: '2028' }, '2029-01-01'), 'unconfirmed');
// 有効期限が未記載：期限切れにはしない（確認した結果のまま）
eq('期限の記載なし・有効確認', st({ validity_state: 'valid_confirmed' }, '2040-01-01'), 'valid_confirmed');
eq('期限の記載なし・未確認', st({ validity_state: 'unconfirmed' }, '2040-01-01'), 'unconfirmed');
eq('validity_state が空欄は未確認', st({}, '2026-10-28'), 'unconfirmed');
eq('存在しない日付の期限は、期限なしとして扱う', st({ validity_state: 'valid_confirmed', valid_until: '2026-02-31' }, '2026-03-15'), 'valid_confirmed');
// 自動更新の条項があっても、更新を確認できなければ期限後は未確認
eq('自動更新の条項あり・期限後', st({ validity_state: 'valid_confirmed', valid_until: '2025-03-31', auto_renewal: 'yes' }, '2026-10-28'), 'unconfirmed');
eq('自動更新の条項のみ（有効確認ではない）', st({ validity_state: 'unconfirmed', auto_renewal: 'yes' }, '2026-10-28'), 'unconfirmed');
// 更新・延長を確認：更新後の期限を優先
eq('更新後の期限を優先（期間内）', st({ validity_state: 'valid_confirmed', valid_until: '2024-03-31', renewed_until: '2029-03-31' }, '2026-10-28'), 'valid_confirmed');
eq('更新後の期限を優先（判定に使う期限）', termEnd({ valid_until: '2024-03-31', renewed_until: '2029-03' }), { date: '2029-03-31', raw: '2029-03', renewed: true, precision: 'month' });
eq('更新後の期限も過ぎた', st({ validity_state: 'valid_confirmed', valid_until: '2024-03-31', renewed_until: '2029-03-31' }, '2029-04-01'), 'unconfirmed');
// 期限満了後の更新が未確認
eq('期限満了・更新未確認', V({ validity_state: 'valid_confirmed', valid_until: '2025-07-31' }, '2026-10-28').reason, 'lapsed');
eq('期限満了は「終了」にしない', st({ validity_state: 'valid_confirmed', valid_until: '2025-07-31' }, '2026-10-28') !== 'ended_confirmed', true);
// 途中終了が確認された
eq('途中終了（期限前に終了を確認）', st({ validity_state: 'ended_confirmed', valid_until: '2030-12-31', ended_date: '2025-06-30' }, '2026-10-28'), 'ended_confirmed');
eq('公式資料の終了日を過ぎた', st({ validity_state: 'valid_confirmed', ended_date: '2026-12-31' }, '2027-01-01'), 'ended_confirmed');
eq('公式資料の終了日の当日までは有効', st({ validity_state: 'valid_confirmed', ended_date: '2026-12-31' }, '2026-12-31'), 'valid_confirmed');
// 事業だけ継続している：有効にはしない
eq('事業は実施中・有効性未確認', st({ validity_state: 'unconfirmed', status: 'in_progress' }, '2026-10-28'), 'unconfirmed');
eq('事業は完了・有効確認（事業と有効性は別）', st({ validity_state: 'valid_confirmed', status: 'completed' }, '2026-10-28'), 'valid_confirmed');
// 開始前
eq('開始日が先（年月日）', st({ validity_state: 'valid_confirmed', effective_date: '2027-01-04', valid_until: '2030-01-03' }, '2026-10-28'), 'signed_not_started');
eq('開始日の当日', st({ validity_state: 'signed_not_started', effective_date: '2027-01-04', valid_until: '2030-01-03' }, '2027-01-04'), 'valid_confirmed');
eq('開始日が来たが期間が不明', st({ validity_state: 'signed_not_started', effective_date: '2027-01-04' }, '2027-02-01'), 'unconfirmed');
eq('開始日（年月）の月の途中は開始前にしない', st({ validity_state: 'valid_confirmed', effective_date: '2026-10' }, '2026-10-15'), 'valid_confirmed');
// 締結予定
eq('締結予定', st({ status: 'planned', validity_state: 'planned' }, '2026-10-28'), 'planned');

// 後継協定に移行：同じ協定として1件、現在の有効性は後継の文書から
const mk = (id, patch) => ({ ...base, id, group_key: 'G1', ...patch });
const tdb = buildDB({
  config: { data_as_of: '2026-10-28', last_updated: '2026-10-28' },
  prefs: [{ code: '01', name: '北海道' }], countries: [{ code: 'VN', ja: 'ベトナム', en: 'Viet Nam' }],
  survey: { prefectures: {} }, stats: null, topo: null, warnings: [],
  records: [
    mk('OLD', { signed_date: '2016-01-01', validity_state: 'ended_confirmed', successor_id: 'NEW', end_reason: '後継の覚書に置き換え' }),
    mk('NEW', { signed_date: '2021-01-01', renewal_of: 'OLD', validity_state: 'valid_confirmed', valid_until: '2099-12-31' }),
    mk('P1', { group_key: 'G2', status: 'planned', validity_state: 'planned' }),
  ],
});
eq('後継協定：件数は1件', filterGroups(tdb, { validity: 'all' }).length, 1);
eq('後継協定：現在の有効性は後継の文書', tdb.groupByKey.get('G1').validity, 'valid_confirmed');
eq('締結済み累計に締結予定を含めない', validityCounts(filterGroups(tdb, { validity: 'all', includePlanned: true })).signed_total, 1);
eq('締結予定は別に数える', validityCounts(filterGroups(tdb, { validity: 'all', includePlanned: true })).planned, 1);

// ---------- 実データを読み込む ----------
const index = J('data/mous/index.json');
const records = [];
for (const f of index.files) { const d = J('data/mous/' + f); for (const m of d.mous || d) records.push({ ...m, _file: f }); }
const db = buildDB({
  config: J('data/config.json'), prefs: J('data/prefectures.json').prefectures, countries: J('data/countries.json').countries,
  survey: J('data/survey.json'), records, stats: null, topo: null, warnings: [], systems: J('data/systems.json').systems,
});
const B = { includeNews: false };

// ---------- 2. 各区分の件数集計 ----------
for (const lv of ['prefecture', 'national']) {
  const all = filterGroups(db, { ...B, level: lv, validity: 'all', docScope: 'all', includePlanned: true });
  const c = validityCounts(all);
  eq(`${lv}：5区分の合計＝全グループ数`, c.valid_confirmed + c.unconfirmed + c.ended_confirmed + c.signed_not_started + c.planned, all.length);
  eq(`${lv}：締結済み累計＝締結予定を除いた数`, c.signed_total, all.filter(g => !g.planned).length);
  for (const sc of VALIDITY_SCOPES) {
    const n = filterGroups(db, { ...B, level: lv, validity: sc.code, docScope: 'all' }).length;
    eq(`${lv}：「${sc.ja}」の件数＝区分の足し算`, n, sc.states.reduce((a, s) => a + c[s], 0));
  }
}
ok('有効確認のみ ⊂ 有効確認＋未確認 ⊂ すべて', (() => {
  const s = v => new Set(filterGroups(db, { ...B, validity: v }).map(g => g.key));
  const a = s('valid'), b = s('valid_unk'), c = s('all');
  return [...a].every(k => b.has(k)) && [...b].every(k => c.has(k));
})());
ok('「すべて」に締結予定が入らない', filterGroups(db, { ...B, validity: 'all' }).every(g => !g.planned));
ok('有効確認の協定に「期限切れ」が残っていない', filterGroups(db, { ...B, validity: 'valid', docScope: 'all' }).every(g => g.versions.filter(v => v._validity === 'valid_confirmed').every(v => { const e = termEnd(v); return !e || e.date >= '2026-10-28'; })));

// ---------- 3. 地図と一覧の件数一致 ----------
for (const sc of VALIDITY_SCOPES) for (const doc of ['mou', 'foreign', 'all']) {
  const pref = filterGroups(db, { ...B, validity: sc.code, docScope: doc, level: 'prefecture' });
  const sum = [...countByPref(pref).values()].reduce((a, b) => a + b, 0);
  eq(`地図の合計＝一覧の件数（${sc.code}・${doc}）`, sum, pref.length);
}

// ---------- 4. 相手国・分野フィルターの連動 ----------
const allSigned = filterGroups(db, { ...B, validity: 'all', docScope: 'all' });
const countries = [...new Set(allSigned.flatMap(g => g.countries))];
let cBad = 0, fBad = 0, xBad = 0;
for (const c of countries) {
  const a = filterGroups(db, { ...B, validity: 'all', docScope: 'all', countries: [c] });
  if (a.length !== allSigned.filter(g => g.countries.includes(c)).length) cBad++;
  for (const f of FIELDS) {
    const both = filterGroups(db, { ...B, validity: 'all', docScope: 'all', countries: [c], field: f.code });
    if (both.length !== a.filter(g => g.fields.includes(f.code)).length) xBad++;
  }
}
for (const f of FIELDS) if (filterGroups(db, { ...B, validity: 'all', docScope: 'all', field: f.code }).length !== allSigned.filter(g => g.fields.includes(f.code)).length) fBad++;
eq('相手国で絞った件数が一致', cBad, 0);
eq('分野で絞った件数が一致', fBad, 0);
eq('相手国×分野の組み合わせが一致', xBad, 0);

// ---------- 5. 協定の種類別の集計 ----------
for (const sc of VALIDITY_SCOPES) {
  const all = filterGroups(db, { ...B, validity: sc.code, docScope: 'all' });
  const sum = DOC_CATEGORIES.reduce((a, c) => a + filterGroups(db, { ...B, validity: sc.code, docScope: 'all', category: c.code }).length, 0);
  eq(`種類別の合計＝全体（${sc.code}）`, sum, all.length);
  eq(`「MOUのみ」＝種類「MOU・MOC」（${sc.code}）`, filterGroups(db, { ...B, validity: sc.code, docScope: 'mou' }).length, filterGroups(db, { ...B, validity: sc.code, docScope: 'all', category: 'mou_moc' }).length);
}

// ---------- 6. CSV と画面の一致 ----------
{
  const groups = filterGroups(db, { ...B, validity: 'valid', docScope: 'mou' });
  const mous = groupsToMous(groups);
  const csv = mouCSV(db, mous, '有効確認のみ／MOUのみ');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  ok('CSVの1行目に件数の条件', lines[0].includes('有効確認のみ／MOUのみ') && lines[0].includes(`${mous.length}文書`));
  // 改行を含む項目があるので、ID列（2行目以降の先頭）で数える
  const ids = new Set(mous.map(m => m.id));
  const rowIds = lines.slice(2).map(l => l.split(',')[0]).filter(x => ids.has(x));
  eq('CSVの行数＝画面の文書数', new Set(rowIds).size, mous.length);
  eq('CSVの有効性の列（グループ）がすべて「有効確認」', csv.split('\r\n').slice(2).filter(l => ids.has(l.split(',')[0])).every(l => l.includes(',有効確認,') || l.includes('有効確認')), true);
}

// ---------- 調査状況・0件の区別 ----------
{
  const s = surveySummary(db);
  eq('調査済みの都道府県（第1段階）', s.stage1Done, 47);
  eq('要再調査の都道府県', s.recheck, 0);
  eq('有効性確認済み＋未確認＝登録件数', s.determined + s.unconfirmed, s.registered);
  ok('一部だけ調べた県は「調査が一部のみ」', zeroState(db, '33', null) === 'partial', '岡山県');
  ok('公式一覧を確認した県は「調査したが確認できず」', zeroState(db, '41', null) === 'not_found', '佐賀県');
}

// ---------- 10. 欠損のあるデータでも壊れない ----------
{
  let err = null, issues = [];
  try {
    const bad = buildDB({
      config: { data_as_of: '2026-10-28', last_updated: '2026-10-28' },
      prefs: [{ code: '01', name: '北海道' }], countries: [{ code: 'VN', ja: 'ベトナム', en: 'Viet Nam' }],
      survey: {}, stats: null, topo: null, warnings: [],
      records: [
        { id: 'B1' },
        { id: 'B2', title_ja: '日付の誤り', japan_level: 'prefecture', pref_code: '01', country_code: 'VN', valid_until: '2026-02-31', validity_state: 'valid_confirmed', fields: null, content: null, sources: 'x', impacts: [null], numbers: {} },
        { id: 'B3', japan_level: 'national', country_code: 'ZZ', budgets: [{ amount_yen: '100' }], signed_date: '2026-13-01' },
      ],
    });
    issues = validate(bad);
    filterGroups(bad, { validity: 'all', docScope: 'all', includePlanned: true, includeNews: true });
    searchGroups(bad, 'テスト 覚書');
    bad.mous.forEach(m => researchStatus(m));
    mouCSV(bad, bad.mous, 'テスト');
  } catch (e) { err = e; }
  eq('欠損データで処理が止まらない', err ? String(err) : null, null);
  ok('欠損・日付の誤りを点検で検出', issues.some(i => i.msg.includes('存在しない日付')) && issues.some(i => i.msg.includes('title_ja')) && issues.some(i => i.msg.includes('countries.json')));
}

// ---------- 11. 締結主体の区分（団体・企業などを国・都道府県の件数に入れない） ----------
{
  const orgs = db.groups.filter(g => g.level === 'organization');
  ok('団体などの協定に都道府県コードがない', orgs.every(g => g.pref_code === null));
  ok('都道府県の件数（地図）に団体・市区町村の協定が入らない', (() => {
    const all = filterGroups(db, { ...B, validity: 'all', docScope: 'all' });
    const sum = [...countByPref(all).values()].reduce((a, b) => a + b, 0);
    return sum === all.filter(g => g.level === 'prefecture').length;
  })());
  eq('締結主体ごとの件数の合計＝全体', Object.values(levelCounts(db.groups)).reduce((a, b) => a + b, 0), db.groups.length);
  eq('政府間の判定', pairKind('national_gov', 'national_ministry'), 'gov');
  eq('自治体間の判定', pairKind('prefecture', 'subnational_gov'), 'local');
  eq('団体間の判定', pairKind('association', 'organization'), 'private');
  eq('官民間の判定（県×大学）', pairKind('prefecture', 'university'), 'public_private');
  eq('公的機関間の判定', pairKind('public_body', 'national_ministry'), 'public');
  ok('日本側の種別が区分と一致', db.mous.every(m => JAPAN_ORG_TYPE[m._orgType] && JAPAN_ORG_TYPE[m._orgType].level === m.japan_level));
  // 団体の本部所在地を pref_code に入れると点検で誤りになる
  const t = buildDB({
    config: { data_as_of: '2026-10-28' }, prefs: [{ code: '13', name: '東京都' }], countries: [{ code: 'VN', ja: 'ベトナム', en: 'Viet Nam' }],
    survey: {}, stats: null, topo: null, warnings: [],
    records: [{ id: 'O1', title_ja: '団体の覚書', doc_type: '覚書', japan_level: 'organization', japan_org_type: 'association', japan_org: '団体', pref_code: '13', country_code: 'VN', partner_org: '協会', partner_type: 'organization', signed_date: '2021-11-23', fields: ['labor'], status: 'signed', sources: [{ id: 's1', url: 'https://example.org', checked: '2026-10-28' }] }],
  });
  ok('団体の協定の pref_code を点検で検出', validate(t).some(i => i.level === 'error' && i.msg.includes('本部の所在地')));
  eq('団体の協定は都道府県に数えない', countByPref(filterGroups(t, { validity: 'all' })).size, 0);
}

// ---------- 12. サイト内検索（AND・表記ゆれ・一致した項目） ----------
{
  const S = q => searchGroups(db, q);
  const keys = rs => rs.map(r => r.g.key).sort();
  const r1 = S('宮城県 ベトナム');
  ok('「宮城県 ベトナム」が見つかる', r1.length > 0, `${r1.length}件`);
  ok('「宮城県 ベトナム」はすべて両方の言葉に一致（AND）', r1.every(r => r.hits.length === 2 && r.g.countries.includes('VN')));
  ok('「宮城県 ベトナム」に宮城県×ベトナムの協力覚書を含む', r1.some(r => r.g.versions.some(v => v.id === 'JP-04-001')));
  ok('AND検索は片方だけの検索より少ない', r1.length <= S('ベトナム').length && r1.length <= S('宮城県').length);
  ok('「インドネシア 介護」が見つかる', S('インドネシア 介護').length > 0);
  ok('「ベトナム 技能実習」が見つかる', S('ベトナム 技能実習').length > 0);
  const epa = S('外務省 EPA');
  ok('「外務省 EPA」が見つかる', epa.length > 0, `${epa.length}件`);
  ok('「EPA」は department などの単語の一部に一致しない', epa.every(r => r.hits[1].fields.some(f => f !== 'partner_org')));
  eq('ベトナム／Viet Nam／Vietnam は同じ結果', [keys(S('Viet Nam')), keys(S('Vietnam'))], [keys(S('ベトナム')), keys(S('ベトナム'))]);
  eq('全角・半角、大文字・小文字をそろえる', keys(S('ＭＯＵ')), keys(S('mou')));
  ok('MOU で覚書も探す', S('MOU').length >= S('了解覚書').length && S('MOU').length > 0);
  eq('CLAIR／クレア／自治体国際化協会は同じ結果', [keys(S('クレア')), keys(S('自治体国際化協会'))], [keys(S('CLAIR')), keys(S('CLAIR'))]);
  eq('NAGOMi／なごみ／外国人材共生支援全国協会は同じ結果', [keys(S('なごみ')), keys(S('外国人材共生支援全国協会'))], [keys(S('NAGOMi')), keys(S('NAGOMi'))]);
  ok('「インド」でインドネシアだけの協定を拾わない', S('インド').every(r => r.g.countries.includes('IN') || r.hits[0].fields.some(f => !['country'].includes(f))) && !S('インド').some(r => r.g.countries.join() === 'ID' && r.hits[0].fields.every(f => ['country', 'title', 'partner_org'].includes(f)) && !/インド(?!ネシア)/.test(r.g.versions.map(v => v.title_ja + v.partner_org).join())));
  ok('「インド」でインド工科大学の協定が見つかる', S('インド').some(r => r.g.countries.includes('IN')));
  ok('「京都」で東京都の協定を拾わない', S('京都').every(r => !(r.g.pref_code === '13' && r.hits[0].fields.length === 1 && r.hits[0].fields[0] === 'region')));
  ok('一致した項目を記録', r1.every(r => r.hits.every(h => h.fields.length && h.fields.every(f => SEARCH_FIELD[f]))));
  ok('相手国の項目で一致を記録', r1.some(r => r.hits[1].fields.includes('country')));
  eq('キーワードなしは全件', S('').length, db.groups.length);
  eq('見つからない言葉は0件', S('存在しない言葉ゼロゼロ').length, 0);
  // 「MOC」は Democratic の一部に一致しない
  const t = buildDB({
    config: { data_as_of: '2026-10-28' }, prefs: [{ code: '01', name: '北海道', short: '北海道', en: 'Hokkaido' }], countries: [{ code: 'LA', ja: 'ラオス', en: "Lao People's Democratic Republic" }],
    survey: {}, stats: null, topo: null, warnings: [],
    records: [{ id: 'X1', title_ja: '合意書', doc_type: '合意書', doc_category: 'other', japan_level: 'prefecture', pref_code: '01', country_code: 'LA', partner_org: '省', partner_org_en: "Ministry of the Lao People's Democratic Republic", partner_type: 'national_ministry', fields: ['labor'], sources: [] }],
  });
  eq('MOC は単語の一部（Democratic）に一致しない', searchGroups(t, 'MOC').length, 0);
  eq('英語の国名でも見つかる', searchGroups(t, 'lao').length, 1);
  // 絞り込み
  const base = S('ベトナム');
  const sel = { ot: [], pk: [], c: [], p: [], cat: [], vs: ['valid_confirmed'], f: [], y1: null, y2: null };
  ok('有効性で絞り込むと、その区分だけになる', applyFacets(base, sel).every(r => r.g.validity === 'valid_confirmed'));
  const fc = facetCounts(db, base, { ...sel, vs: [] });
  eq('有効性の選択肢の件数の合計＝検索結果の件数', fc.vs.reduce((a, [, n]) => a + n, 0), base.length);
  eq('締結主体の選択肢の件数の合計＝検索結果の件数', fc.ot.reduce((a, [, n]) => a + n, 0), base.length);
  ok('絞り込んでもキーワードの条件は残る（絞り込み後⊂キーワードの結果）', applyFacets(base, { ...sel, vs: [], p: ['04'] }).every(r => base.includes(r) && r.g.pref_code === '04'));
  ok('締結年の範囲', applyFacets(base, { ...sel, vs: [], y1: 2020, y2: 2023 }).every(r => r.g.first_year >= 2020 && r.g.first_year <= 2023));
  const tc = tokenCounts(db, parseQuery(db, '宮城県 存在しない言葉ゼロゼロ'));
  ok('言葉ごとの件数（0件の理由の説明）', tc[0].n > 0 && tc[1].n === 0);
}

// ---------- 13. 協定の種類のページ：すべての表に条件を当てはめ、見出しの件数＝表示する件数 ----------
{
  let bad = [];
  for (const sc of VALIDITY_SCOPES) for (const cat of ['', ...DOC_CATEGORIES.map(c => c.code)]) for (const rel of ['', ...RELATIONS.map(r => r.code)]) {
    const t = typesTables(db, { ...B, validity: sc.code, docScope: 'all' }, cat, rel);
    const shown = [...t.wh, ...Object.values(t.byLevel).flat()];
    if (shown.length !== t.groups.length) bad.push(`${sc.code}/${cat}/${rel}：表示 ${shown.length}・該当 ${t.groups.length}`);
    if (new Set(shown).size !== shown.length) bad.push(`${sc.code}/${cat}/${rel}：同じ協定が2つの表に出ている`);
    if (rel && t.wh.some(g => g.relation !== rel)) bad.push(`${sc.code}/${cat}/${rel}：ワーキング・ホリデーの表に受入れ関連度の条件が当たっていない`);
    if (t.wh.some(g => !VALIDITY_SCOPE[sc.code].states.includes(g.validity))) bad.push(`${sc.code}/${cat}/${rel}：ワーキング・ホリデーの表に有効性の条件が当たっていない`);
    if (cat && cat !== 'bilateral_arrangement' && t.wh.length) bad.push(`${sc.code}/${cat}/${rel}：ほかの種類なのにワーキング・ホリデーが出ている`);
    if (t.byLevel.national.some(isWorkingHoliday)) bad.push(`${sc.code}/${cat}/${rel}：国の表にワーキング・ホリデーが重複`);
  }
  eq('協定の種類のページの表と件数', bad, []);
}

// ---------- 実データの点検 ----------
{
  const issues = validate(db);
  const errors = issues.filter(i => i.level === 'error');
  eq('実データに誤りがない', errors.map(e => `${e.id}: ${e.msg}`), []);
}

console.log(`合格：${pass}件　不合格：${fails.length}件`);
if (fails.length) { console.log('\n' + fails.map(f => '× ' + f).join('\n')); process.exit(1); }
