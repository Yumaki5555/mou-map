// サイトの集計・有効性の判定の自動テスト（ブラウザを使わずに確かめられる部分）
// 使い方（mou-map フォルダで実行）： node tools/test_site.mjs
// すべて合格なら「合格：○件」、失敗があれば内容を表示して終了コード1で終わります。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { periodEnd, periodStart, parseDate } from '../assets/js/util.js';
import {
  buildDB, filterGroups, validityInfo, validityCounts, countByPref, termEnd, validate, researchStatus,
  VALIDITY_SCOPES, DOC_CATEGORIES, FIELDS, surveySummary, zeroState,
} from '../assets/js/data.js';
import { mouCSV, groupsToMous } from '../assets/js/csv.js';

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
  survey: J('data/survey.json'), records, stats: null, topo: null, warnings: [],
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
    filterGroups(bad, { validity: 'all', docScope: 'all', includePlanned: true, includeNews: true, q: 'テスト' });
    bad.mous.forEach(m => researchStatus(m));
    mouCSV(bad, bad.mous, 'テスト');
  } catch (e) { err = e; }
  eq('欠損データで処理が止まらない', err ? String(err) : null, null);
  ok('欠損・日付の誤りを点検で検出', issues.some(i => i.msg.includes('存在しない日付')) && issues.some(i => i.msg.includes('title_ja')) && issues.some(i => i.msg.includes('countries.json')));
}

// ---------- 実データの点検 ----------
{
  const issues = validate(db);
  const errors = issues.filter(i => i.level === 'error');
  eq('実データに誤りがない', errors.map(e => `${e.id}: ${e.msg}`), []);
}

console.log(`合格：${pass}件　不合格：${fails.length}件`);
if (fails.length) { console.log('\n' + fails.map(f => '× ' + f).join('\n')); process.exit(1); }
