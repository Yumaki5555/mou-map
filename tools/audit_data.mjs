// 登録データの「取り違えやすい点」を機械的に洗い出します（データ点検の補助）。
// 使い方： node tools/audit_data.mjs
// ここに出たものは「誤り」と決まったわけではなく、公式資料で確かめ直す候補です。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDB, termEnd, validate } from '../assets/js/data.js';
import { periodEnd, periodStart, dateKey } from '../assets/js/util.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const records = [];
for (const f of J('data/mous/index.json').files) { const d = J('data/mous/' + f); for (const m of d.mous || d) records.push({ ...m, _file: f }); }
const db = buildDB({ config: J('data/config.json'), prefs: J('data/prefectures.json').prefectures, countries: J('data/countries.json').countries, survey: J('data/survey.json'), records, stats: null, topo: null, warnings: [] });

const out = {};
const flag = (k, m, msg) => (out[k] ??= []).push(`${m.id}　${msg}`);

for (const m of db.mous) {
  const t = `${m.title_ja} ${m.doc_type} ${m.doc_type_note || ''}`;
  const basis = m.validity_basis || '';
  // 締結累計と有効件数／事業の進捗と有効性の取り違え
  if (m.validity_state === 'valid_confirmed' && !/根拠[ABC]/.test(basis)) flag('有効確認だが根拠の種類（A/B/C）の記載がない', m, basis.slice(0, 60));
  if (m.validity_state === 'valid_confirmed' && /事業|実施/.test(basis) && !/期間|一覧|更新|延長|現在/.test(basis)) flag('有効確認の根拠が事業の記載だけの可能性', m, basis.slice(0, 80));
  if (m.validity_state === 'valid_confirmed' && m.auto_renewal === 'yes' && !/一覧|更新|延長|現在|期間内/.test(basis)) flag('有効確認の根拠が自動更新の条項だけの可能性', m, basis.slice(0, 80));
  // 期限満了と終了確認
  if (m.validity_state === 'ended_confirmed' && !(m.ended_date || m.end_reason)) flag('終了確認だが終了日・終了理由がない', m, basis.slice(0, 60));
  if (m.validity_state === 'ended_confirmed' && /期限|満了/.test(basis) && !/終了|失効|置き換|後継|廃止|解除|更新しない|延長しない/.test(basis + (m.end_reason || ''))) flag('期限満了だけで終了確認にしている可能性', m, basis.slice(0, 80));
  if (m.validity_state === 'ended_confirmed' && !m.validity_sources.length) flag('終了確認の根拠資料（validity_sources）がない', m, '');
  // 有効性未確認と終了
  if (m.validity_state === 'unconfirmed' && /終了した|失効した|廃止された/.test(basis)) flag('未確認だが根拠に終了の記載がある', m, basis.slice(0, 80));
  // MOUと条約・共同声明
  if (m.doc_category === 'mou_moc' && /共同声明|アクションプラン|交換公文|経済連携協定|議定書|口上書/.test(m.title_ja)) flag('文書の分類がMOUだが名称は条約・声明などの可能性', m, m.title_ja);
  if (m.doc_category !== 'mou_moc' && /覚書|MOU|MOC|Memorandum/i.test(m.title_ja) && !/交換公文/.test(m.title_ja)) flag('文書の分類がMOU以外だが名称は覚書', m, `${m.doc_category}：${m.title_ja}`);
  // 県が締結した協定と国が締結した協定
  if (m.japan_level === 'national' && m.pref_code) flag('国の協定に都道府県コードが入っている', m, m.pref_code);
  if (m.japan_level === 'prefecture' && m.japan_org && !/[都道府県]/.test(m.japan_org) && !(m.other_japan_parties || []).length) flag('都道府県の協定だが日本側の機関名に都道府県名がない', m, m.japan_org);
  if (m.japan_level === 'prefecture' && /(省|庁|政府)$/.test(m.japan_org || '')) flag('都道府県の協定だが日本側が国の機関の可能性', m, m.japan_org);
  // 人数：目標と実績・人的交流と移住
  for (const n of m.numbers) {
    const l = `${n.label || ''} ${n.definition || ''}`;
    if (n.kind === 'target' && /実績|入国者|在留者数|合格者/.test(l)) flag('人数の種類が「目標」だが実績の可能性', m, l);
    if (/actual|current/.test(n.kind) && /目標|予定|見込/.test(l)) flag('人数の種類が「実績」だが目標の可能性', m, l);
    if (n.kind !== 'two_way_exchange' && /双方向|相互|交流/.test(l) && !/受入/.test(l)) flag('双方向の交流人数を受入れ人数として扱っている可能性', m, l);
    if (/actual|current|exam/.test(n.kind) && !n.period) flag('実績の人数に対象期間がない', m, l);
    if (n.value === 0) flag('人数が0（未確認を0にしていないか）', m, l);
  }
  for (const i of m.impacts) {
    if (i.stage === 'agreed' && /実績|入国した|受け入れた|採用した/.test(i.text || '')) flag('「合意した内容」に実績が入っている可能性', m, (i.text || '').slice(0, 60));
    if (i.stage !== 'agreed' && !i.causality) flag('実施・変化の記録に因果関係の区分がない', m, (i.text || '').slice(0, 60));
    if (i.stage === 'observed' && i.causality === 'stated_by_gov' && /統計|在留外国人/.test(i.text || '')) flag('統計の変化を協定の成果としている可能性', m, (i.text || '').slice(0, 60));
  }
  // 予算額と決算額
  for (const b of m.budgets) {
    const l = `${b.item || ''} ${b.original_text || ''}`;
    if (b.kind === 'planned' && /決算|支出済|実績/.test(l)) flag('予算の種類が「計画」だが決算の可能性', m, l);
    if (b.kind === 'settled' && /予算額|当初予算|計上/.test(l)) flag('予算の種類が「決算」だが予算の可能性', m, l);
    if (b.amount_yen === 0) flag('金額が0円（未確認を0にしていないか）', m, l);
  }
  // 日付の順序
  if (m.valid_until && m.signed_date && periodEnd(m.valid_until) && periodStart(m.signed_date) && periodEnd(m.valid_until) < periodStart(m.signed_date)) flag('有効期限が締結日より前', m, `${m.signed_date} → ${m.valid_until}`);
  if (m.announced_date && m.signed_date && dateKey(m.announced_date) < dateKey(m.signed_date) && m.status !== 'planned') flag('発表日が締結日より前（締結予定の発表を締結日としていないか）', m, `発表 ${m.announced_date}／締結 ${m.signed_date}`);
  if (m.status === 'planned' && m.validity_state !== 'planned') flag('事業の状態が「予定」だが有効性が予定以外', m, m.validity_state);
  if (m.evidence_level === 'news_only') flag('報道のみ（公式資料未確認）', m, m.title_ja);
  if (!m.sources.some(s => s.type !== 'news')) flag('公式の出典がない', m, '');
}
// 更新・再締結：同じ協定の二重計上
const byTitle = new Map();
for (const m of db.mous) {
  const k = `${m.japan_level}|${m.pref_code}|${m.country_code}|${m.partner_org}`;
  if (!byTitle.has(k)) byTitle.set(k, new Set());
  byTitle.get(k).add(m.group_key);
}
for (const [k, gs] of byTitle) if (gs.size > 1) (out['同じ相手と別グループの協定が複数（更新・再締結の二重計上でないか）'] ??= []).push(`${k}　グループ：${[...gs].join(' / ')}`);
for (const g of db.groups) {
  const signed = g.versions.filter(v => v._validity !== 'planned');
  const last = signed[signed.length - 1];
  if (last && last._validity === 'ended_confirmed' && signed.some(v => v._validity === 'valid_confirmed')) (out['最新の版が終了なのに古い版が有効確認（グループの判定に注意）'] ??= []).push(g.key);
  const vs = g.versions.map(v => v.id);
  for (const v of g.versions) if (v.successor_id && !vs.includes(v.successor_id)) (out['後継の文書が別グループ'] ??= []).push(`${v.id} → ${v.successor_id}`);
}
const issues = validate(db);
console.log(`点検（validate）：誤り ${issues.filter(i => i.level === 'error').length}件・注意 ${issues.filter(i => i.level === 'warn').length}件`);
for (const i of issues.filter(i => i.level === 'warn')) (out['点検の注意'] ??= []).push(`${i.id}　${i.msg}`);
for (const [k, v] of Object.entries(out)) {
  console.log(`\n■ ${k}（${v.length}件）`);
  for (const x of v.slice(0, 40)) console.log('  ' + x);
  if (v.length > 40) console.log(`  ……ほか${v.length - 40}件`);
}
