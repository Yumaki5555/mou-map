// サイト内検索と同じ仕組みで、登録データを検索します（どの項目に一致したかも表示）。
// 使い方（mou-map フォルダで実行）： node tools/search.mjs "宮城県 ベトナム" "NAGOMi VAMAS"
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDB } from '../assets/js/data.js';
import { searchGroups, sortResults, SEARCH_FIELD } from '../assets/js/search.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const records = [];
for (const f of J('data/mous/index.json').files) { const d = J('data/mous/' + f); for (const m of d.mous || d) records.push({ ...m, _file: f }); }
const db = buildDB({ config: J('data/config.json'), prefs: J('data/prefectures.json').prefectures, countries: J('data/countries.json').countries, survey: J('data/survey.json'), records, stats: null, topo: null, warnings: [], systems: J('data/systems.json').systems });

for (const q of process.argv.slice(2)) {
  const r = sortResults(searchGroups(db, q), 'rel');
  console.log(`「${q}」 ${r.length}件`);
  for (const x of r.slice(0, 15)) console.log(`  ${x.g.latest.id}　${x.g.first.title_ja.slice(0, 44)}\n      ${x.hits.map(h => `「${h.token.text}」→ ${h.fields.map(f => SEARCH_FIELD[f].ja).join('、')}`).join('　')}`);
  if (r.length > 15) console.log(`  ほか ${r.length - 15}件`);
}
