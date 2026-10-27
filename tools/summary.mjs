// 登録データの件数の概要を表示します（有効性の5区分・都道府県と国を分けて）。
// 使い方： node tools/summary.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDB, filterGroups, validityCounts, surveySummary, researchStatus, RESEARCH_STATES, VALIDITY_REASONS } from '../assets/js/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const records = [];
for (const f of J('data/mous/index.json').files) { const d = J('data/mous/' + f); for (const m of d.mous || d) records.push({ ...m, _file: f }); }
const db = buildDB({ config: J('data/config.json'), prefs: J('data/prefectures.json').prefectures, countries: J('data/countries.json').countries, survey: J('data/survey.json'), records, stats: null, topo: null, warnings: [] });

const row = (label, f) => {
  const c = validityCounts(filterGroups(db, { ...f, validity: 'all', includePlanned: true }));
  console.log(`${label}：有効確認 ${c.valid_confirmed}／有効性未確認 ${c.unconfirmed}／終了確認 ${c.ended_confirmed}／開始前 ${c.signed_not_started}／締結予定 ${c.planned}（締結済み累計 ${c.signed_total}）`);
};
console.log(`文書数 ${db.mous.length}・協定（グループ）数 ${db.groups.length}`);
row('都道府県・MOUのみ', { level: 'prefecture', docScope: 'mou' });
row('都道府県・全文書', { level: 'prefecture', docScope: 'all' });
row('国・MOUのみ', { level: 'national', docScope: 'mou' });
row('国・全文書', { level: 'national', docScope: 'all' });
console.log('調査状況', surveySummary(db));
const reasons = {};
for (const m of db.mous) reasons[m._validityReason] = (reasons[m._validityReason] || 0) + 1;
console.log('判定理由（文書ごと）', Object.fromEntries(Object.entries(reasons).map(([k, v]) => [VALIDITY_REASONS[k], v])));
// 項目ごとの調査状況（文書単位）
const tally = {};
for (const m of db.mous) for (const r of researchStatus(m)) { tally[r.ja] ??= { confirmed: 0, not_found: 0, not_surveyed: 0 }; tally[r.ja][r.state]++; }
console.log('項目ごとの調査状況（文書数）');
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}：${Object.entries(v).map(([s, n]) => `${RESEARCH_STATES[s].ja} ${n}`).join('／')}`);
