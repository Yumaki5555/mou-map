// 登録データの件数の概要を表示します（有効性の5区分・都道府県と国を分けて）。
// 使い方： node tools/summary.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDB, filterGroups, validityCounts, surveySummary, researchStatus, RESEARCH_STATES, VALIDITY_REASONS, countTriple, DOC_KIND, JAPAN_ORG_TYPE } from '../assets/js/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const records = [];
for (const f of J('data/mous/index.json').files) { const d = J('data/mous/' + f); for (const m of d.mous || d) records.push({ ...m, _file: f }); }
const db = buildDB({ config: J('data/config.json'), prefs: J('data/prefectures.json').prefectures, countries: J('data/countries.json').countries, survey: J('data/survey.json'), records, stats: null, topo: null, warnings: [], systems: J('data/systems.json').systems });

const row = (label, f) => {
  const c = validityCounts(filterGroups(db, { ...f, validity: 'all', includePlanned: true }));
  console.log(`${label}：有効確認 ${c.valid_confirmed}／有効性未確認 ${c.unconfirmed}／終了確認 ${c.ended_confirmed}／開始前 ${c.signed_not_started}／締結予定 ${c.planned}（締結済み累計 ${c.signed_total}）`);
};
console.log(`文書数 ${db.mous.length}・協定（グループ）数 ${db.groups.length}`);
// 文書の種類・締結主体・相手国・年ごとの件数（サイトの地図・一覧・グラフ・CSVと同じ数え方。報道のみは含めない）
const signed = filterGroups(db, { validity: 'all', docScope: 'all' });
const t3 = countTriple(signed);
console.log(`締結済み（報道のみを除く）：文書 ${t3.docs}／協定・協力関係 ${t3.groups}／現在有効と確認 ${t3.valid}`);
const countBy2 = (gs, key) => { const m = new Map(); for (const g of gs) for (const k of [].concat(key(g))) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
console.log('文書の種類（協力関係ごとに最新の文書で数える）：' + countBy2(signed, g => DOC_KIND[g.kind].ja).map(([k, n]) => `${k} ${n}`).join('／'));
console.log('文書の種類（文書の数）：' + countBy2(signed.flatMap(g => g.versions.filter(v => v._validity !== 'planned').map(v => ({ kind: v._kind }))), x => DOC_KIND[x.kind].ja).map(([k, n]) => `${k} ${n}`).join('／'));
console.log('日本側の締結主体の種類：' + countBy2(signed, g => JAPAN_ORG_TYPE[g.orgType].ja).map(([k, n]) => `${k} ${n}`).join('／'));
console.log('市区町村ごと：' + countBy2(signed.filter(g => g.level === 'municipality'), g => g.latest.municipality_name).map(([k, n]) => `${k} ${n}`).join('／'));
console.log('団体・企業ごと：' + countBy2(signed.filter(g => g.level === 'organization'), g => g.latest.japan_org).map(([k, n]) => `${k} ${n}`).join('／'));
console.log('相手国（上位15、複数国の協定はそれぞれで数える）：' + countBy2(signed, g => g.countries).slice(0, 15).map(([k, n]) => `${db.countryByCode.get(k)?.ja || k} ${n}`).join('／'));
console.log('最初の締結年（1〜12月）：' + countBy2(signed, g => g.first_year ?? '不明').sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, n]) => `${k} ${n}`).join('／'));
row('都道府県・MOUのみ', { level: 'prefecture', docScope: 'mou' });
row('都道府県・全文書', { level: 'prefecture', docScope: 'all' });
row('国・MOUのみ', { level: 'national', docScope: 'mou' });
row('国・全文書', { level: 'national', docScope: 'all' });
row('市区町村・全文書', { level: 'municipality', docScope: 'all' });
row('団体・企業など・全文書', { level: 'organization', docScope: 'all' });
console.log('調査状況', surveySummary(db));
const reasons = {};
for (const m of db.mous) reasons[m._validityReason] = (reasons[m._validityReason] || 0) + 1;
console.log('判定理由（文書ごと）', Object.fromEntries(Object.entries(reasons).map(([k, v]) => [VALIDITY_REASONS[k], v])));
// 項目ごとの調査状況（文書単位）
const tally = {};
for (const m of db.mous) for (const r of researchStatus(m)) { tally[r.ja] ??= { confirmed: 0, not_found: 0, not_surveyed: 0 }; tally[r.ja][r.state]++; }
console.log('項目ごとの調査状況（文書数）');
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}：${Object.entries(v).map(([s, n]) => `${RESEARCH_STATES[s].ja} ${n}`).join('／')}`);
