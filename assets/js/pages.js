// トップ・相手国・分野・地域への影響・都道府県・個別MOU・国・比較・調査状況・データ・検索の各ページ
import { esc, fmtDate, fmtNum, fmtYen, fmtYenShort, yearOf, today, uniq } from './util.js';
import {
  FIELDS, FIELD, STATUSES, STATUS, IMPACTS, IMPACT, STAGES, ZERO_STATES, SURVEY_RESULT, LEGAL, EVIDENCE, ORIGINAL, PARTNER_TYPES,
  VALIDITIES, VALIDITY, VALIDITY_SCOPE, VALIDITY_SCOPES, DOC_CATEGORIES, DOC_CATEGORY, DOC_SCOPES, RELATIONS, RELATION, NUMBER_KINDS, ACCEPTANCE_TYPES,
  filterGroups, sortGroups, countByPref, zeroState, residentChange, sswCount, findCountries, validityCounts, termEnd,
  countryName, prefName, japanSideName, validate, surveySummary, researchStatus, RESEARCH_STATES, VALIDITY_REASONS,
} from './data.js';
import { JapanMap, swatchStyle, PATTERNS } from './map.js';
import { hbar, vbar } from './charts.js';
import {
  mouList, mouCard, sourceList, impactGrid, budgetSection, legendHTML, statTile, kvTable, statusBadge, fieldBadges,
  evidenceBadge, whoLine, term, GLOSSARY, autoStatsFor, fyLabel, validityBadge, categoryBadge, relationBadge,
  validityTiles, numbersSection, validityDetail, budgetLegend, researchTable,
} from './components.js';
import { computeMapModel, countriesWithData, bindSuggest, seqScale } from './page-map.js';
import { downloadMouCSV, groupsToMous, CSV_COLUMNS } from './csv.js';
import { exportMap, exportBars, exportMouSummary, exportImpactGrid } from './export.js';
import { settings, newsToggleHTML, bindNewsToggle, metaFor, baseFilter, scopeBarHTML, bindScopeBar, scopeLabel, scopeNoteHTML } from './shared.js';
import { homePage, issuesPage } from './home.js';
export { homePage, issuesPage };

const ICONS = {
  map: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></svg>',
  globe: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>',
  tag: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12V3h9l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  home: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
};

// 地域への影響の3段階の説明（合意・実施・変化を混ぜない）
const STAGE_DESC = {
  agreed: 'MOU・協定の原文に何が書かれているか（合意の内容・目標）',
  implemented: '予算、関連事業、受入れ実績など、実際に行われたこと',
  observed: '雇用・人口・住宅・教育・医療など、地域で確認された変化',
};
const BUDGET_KIND_SHORT = { planned: '予算', settled: '決算', subsidy: '補助金', other: 'その他' };
const swatchStyleFor = k => swatchStyle(PATTERNS[k]);

function head(crumbs, title, lead) {
  return `<div class="page-head">
    <div class="crumbs"><a href="#/">トップ</a>${crumbs.map(c => ` ＞ ${c[1] ? `<a href="${c[1]}">${esc(c[0])}</a>` : esc(c[0])}`).join('')}</div>
    <h1>${esc(title)}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
  </div>`;
}

function stageTable(db) {
  const st = db.survey.stages || [];
  return `<div class="table-wrap"><table><thead><tr><th>段階</th><th>内容</th><th>状況</th></tr></thead><tbody>
    ${st.map(s => `<tr><td class="nowrap">第${s.no}段階</td><td>${esc(s.title)}<br><span class="small muted">${esc(s.coverage || '')}</span></td><td><b>${esc(s.status_ja)}</b>${s.note ? `<br><span class="small muted">${esc(s.note)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

/// 数え方の範囲から外れている文書があるときに、その数と切り替えボタンを出す
function hiddenNote(db, f) {
  const shown = filterGroups(db, baseFilter(f)).length;
  const sameDoc = filterGroups(db, { ...baseFilter(f), validity: 'all' });
  const allDocs = filterGroups(db, { ...baseFilter(f), validity: 'all', docScope: 'all' });
  const byV = validityCounts(sameDoc);
  const outV = byV.signed_total - shown;
  const outD = allDocs.length - sameDoc.length;
  const parts = [];
  if (outV > 0) parts.push(`有効性の範囲の外に <b>${outV}件</b>（${settings.validity === 'valid' ? `有効性未確認 ${byV.unconfirmed}件・` : ''}終了確認 ${byV.ended_confirmed}件・開始前 ${byV.signed_not_started}件）`);
  if (outD > 0) parts.push(`MOU以外の国際文書（EPA・取決めなど）が <b>${outD}件</b>`);
  if (!parts.length) return '';
  return `<div class="info hidden-note">いまの数え方（${esc(scopeLabel())}）では表示していないものがあります：${parts.join('、')}。
    <span class="btn-row" style="margin:8px 0 0">${outV > 0 ? '<button type="button" class="btn btn-small btn-outline" data-scope-v="all">すべて（終了を含む・予定は除く）で表示</button>' : ''}${outD > 0 ? '<button type="button" class="btn btn-small btn-outline" data-scope-d="all">MOU以外の文書も含める</button>' : ''}</span></div>`;
}

// =============== 相手国から探す ===============
export function countryIndexPage(ctx) {
  const { db, app } = ctx;
  const list = countriesWithData(db);
  app.innerHTML = `${head([['相手国から探す']], '相手国から探す', '国名を日本語でも英語でも入力できます（例：「インドネシア」「Indonesia」「ベトナム」「Viet Nam」）。')}
    <div class="suggest"><input type="search" id="cq" placeholder="国名を入力" autocomplete="off" aria-label="国名で検索（日本語・英語）"><ul id="cs" hidden></ul></div>
    ${scopeBarHTML()}
    <h2>協定が登録されている国・地域（${list.length}）</h2>
    <p class="small muted">数字は、国・省庁と都道府県を合わせた件数（いまの数え方：${esc(scopeLabel())}）です。</p>
    <div class="country-list">${list.map(([c, n]) => `<a href="#/country/${c}"><span class="country-btn">${esc(countryName(db, c))}<span class="c">${esc(db.countryByCode.get(c)?.en || '')}</span> ${n}件</span></a>`).join('')}</div>
    <div class="info">ここにない国は、いまの数え方で登録がない国です（「結んでいない」と確認できたわけではありません）。数え方を「すべて（終了済みを含む）」や「その他の協定を含む登録文書」に変えると、表示される国が増えることがあります。</div>`;
  bindSuggest(app.querySelector('#cq'), app.querySelector('#cs'), db, c => ctx.go('/country/' + c.code));
  bindNewsToggle(app, () => countryIndexPage(ctx));
}

export function countryPage(ctx, code) {
  const { db, app } = ctx;
  const c = db.countryByCode.get(code);
  if (!c) return notFound(ctx, 'その国・地域は見つかりませんでした。');
  const p = db.prefByCode.has(ctx.params.get('p')) ? ctx.params.get('p') : null;
  const groups = filterGroups(db, baseFilter({ countries: [code] }));
  const prefG = groups.filter(g => g.level === 'prefecture');
  const natG = groups.filter(g => g.level === 'national');
  const vAll = lv => filterGroups(db, { ...baseFilter({ countries: [code], level: lv }), validity: 'all', includePlanned: true });
  const prefAll = vAll('prefecture'), natAll = vAll('national');
  const years = groups.flatMap(g => g.versions.map(v => yearOf(v.signed_date))).filter(Boolean);
  const nPref = new Set(prefG.map(g => g.pref_code)).size;
  const fieldCounts = FIELDS.map(f => ({ f, n: groups.filter(g => g.fields.includes(f.code)).length })).filter(x => x.n);
  const shownPref = p ? prefG.filter(g => g.pref_code === p) : prefG;
  app.innerHTML = `${head([['相手国から探す', '#/country'], [c.ja]], `${c.ja}（${c.en}）との協定`)}
    <div class="suggest" style="margin-bottom:12px"><input type="search" id="cq" placeholder="別の国を選ぶ（日本語・英語）" autocomplete="off" aria-label="別の国を検索"><ul id="cs" hidden></ul></div>
    ${scopeBarHTML()}
    <div class="grid-2 vsplit">
      <div><h2 class="h-sm">国・省庁の締結（全国が対象）</h2>${validityTiles(natAll.filter(g => !g.planned), { planned: natAll.filter(g => g.planned).length, note: false })}</div>
      <div><h2 class="h-sm">都道府県の締結</h2>${validityTiles(prefAll.filter(g => !g.planned), { planned: prefAll.filter(g => g.planned).length, note: false })}</div>
    </div>
    <p class="small muted">「有効性未確認」は、今も有効かどうかを公式資料で確かめられていないもので、終了したという意味ではありません。国が結んだ協定は、都道府県の件数に含めていません。</p>
    ${hiddenNote(db, { countries: [code] })}
    <div class="stats">
      ${statTile('都道府県の締結（いまの数え方）', prefG.length, `${nPref}都道府県`, '件')}
      ${statTile('国・省庁の締結（いまの数え方）', natG.length, '都道府県とは別に数えています', '件')}
      ${statTile('締結年', years.length ? `${Math.min(...years)}〜${Math.max(...years)}` : '不明', '確認できた締結日の範囲', '')}
    </div>
    ${fieldCounts.length ? `<p><b>分野ごとの内訳：</b>${fieldCounts.map(x => `${esc(x.f.ja)} ${x.n}件`).join('／')}</p>` : ''}
    <div class="map-layout">
      <div><div id="map"></div><div id="legend"></div></div>
      <aside>
        <h2 style="margin-top:0">締結年ごとの件数</h2>
        <div id="years"></div>
        <p class="chart-caption">${esc(c.ja)}を相手とする協定（国・都道府県の合計、更新・再締結は最初の締結年で1件。数え方：${esc(scopeLabel())}）。</p>
        <div class="btn-row">
          <button type="button" class="btn" id="png">この国の締結状況を画像で保存</button>
          <button type="button" class="btn btn-outline" id="csv">CSVで保存</button>
        </div>
      </aside>
    </div>
    <div class="result-bar"><div class="now">いま表示している条件</div><div class="chips">
      <span class="chip chip-plain">相手国：${esc(c.ja)}</span>
      <span class="chip chip-plain">数え方：${esc(scopeLabel())}</span>
      ${p ? `<span class="chip">都道府県：${esc(prefName(db, p))}<button type="button" id="rm-p" aria-label="都道府県の選択を解除">×</button></span>` : ''}
      <a class="btn btn-small btn-outline" href="#/country">別の国を選ぶ</a></div></div>
    <h2>国・省庁の締結（${natG.length}件）</h2>
    ${mouList(db, sortGroups(natG), { empty: `いまの数え方では、${c.ja}との国・省庁の協定は表示されていません（国の協定は外国人材関係のみ調査済み）。` })}
    <h2>都道府県の締結（${p ? `${prefName(db, p)}：` : ''}${shownPref.length}件）</h2>
    ${mouList(db, sortGroups(shownPref).sort((a, b) => a.pref_code.localeCompare(b.pref_code)), { empty: `いまの数え方では、${c.ja}と都道府県の協定は表示されていません。` })}`;
  bindSuggest(app.querySelector('#cq'), app.querySelector('#cs'), db, x => ctx.go('/country/' + x.code));
  bindNewsToggle(app, () => countryPage(ctx, code));
  app.querySelector('#rm-p')?.addEventListener('click', () => ctx.go('/country/' + code, {}, { keepScroll: true }));
  const st = { mode: 'country', countries: [code], pref: p };
  const model = computeMapModel(db, st);
  const map = new JapanMap(app.querySelector('#map'), db, { ariaLabel: `${c.ja}と協定を締結した都道府県の地図`, onClick: pc => ctx.go('/country/' + code, p === pc ? {} : { p: pc }, { keepScroll: true }) });
  map.update({ fill: model.fill, selected: p, label: x => model.counts.get(x) ? String(model.counts.get(x)) : null, tip: x => `<b>${esc(db.prefByCode.get(x).name)}</b><br>${esc(model.tipLine(x))}` });
  app.querySelector('#legend').innerHTML = legendHTML(model.legendTitle, model.legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })));
  vbar(app.querySelector('#years'), yearSeries(groups), { line: true, ariaLabel: '締結年ごとの件数' });
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(groups), `mou_country_${code}_${settings.validity}.csv`));
  app.querySelector('#png').addEventListener('click', () => {
    const vn = validityCounts(natAll.filter(g => !g.planned)), vp = validityCounts(prefAll.filter(g => !g.planned));
    const side = [{ text: `国・省庁：${natG.length}件`, bold: true }, { text: `都道府県：${prefG.length}件（${nPref}都道府県）`, bold: true },
      { text: `有効性の内訳（国／都道府県）：有効確認 ${vn.valid_confirmed}／${vp.valid_confirmed}、未確認 ${vn.unconfirmed}／${vp.unconfirmed}、終了確認 ${vn.ended_confirmed}／${vp.ended_confirmed}`, size: 26, color: '#56655c' }];
    const byPref = [...model.counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pc, n]) => `${prefName(db, pc)} ${n}件`);
    if (byPref.length) side.push({ text: byPref.slice(0, 8).join('、') + (byPref.length > 8 ? ' ほか' : ''), size: 30 });
    if (fieldCounts.length) side.push({ text: '分野：' + fieldCounts.map(x => `${x.f.ja} ${x.n}`).join('、'), size: 28, color: '#56655c' });
    exportMap(db, {
      title: `${c.ja}と日本の協定の締結状況`, sub: `国・省庁と都道府県が締結したもの（${scopeLabel()}）`,
      fill: model.fill, label: x => model.counts.get(x) ? String(model.counts.get(x)) : null, legend: model.legend, legendTitle: model.legendTitle,
      side, meta: metaFor(db, groups, `日本全国（国・47都道府県）× ${c.ja}`), filename: `mou-country_${code}.png`,
    });
  });
}

export function yearSeries(groups) {
  const ys = groups.map(g => g.first_year).filter(Boolean);
  if (!ys.length) return [];
  const lo = Math.min(...ys), hi = Math.max(Math.max(...ys), yearOf(today()));
  const out = [];
  for (let y = lo; y <= hi; y++) out.push({ label: String(y), value: ys.filter(x => x === y).length });
  return out;
}

/// =============== 分野・省庁から探す ===============
// 国の協定の日本側の名前から、担当の省庁を取り出す（複数の省庁が共同で作成した文書は、それぞれで数える）
const MINISTRY_RE = /法務省|出入国在留管理庁|外務省|厚生労働省|警察庁|経済産業省|農林水産省|文部科学省|国土交通省|総務省|内閣府/g;
function ministriesOf(m) {
  const found = [...new Set((m.japan_org || '').match(MINISTRY_RE) || [])];
  return found.length ? found : ['日本国政府（省庁の記載なし）'];
}
export function fieldIndexPage(ctx) {
  const { db, app } = ctx;
  const all = filterGroups(db, baseFilter());
  const rows = FIELDS.map(f => ({ f, pref: all.filter(g => g.level === 'prefecture' && g.fields.includes(f.code)).length, nat: all.filter(g => g.level === 'national' && g.fields.includes(f.code)).length }));
  const nat = filterGroups(db, baseFilter({ level: 'national' }));
  const mins = new Map();
  for (const g of nat) for (const k of ministriesOf(g.latest)) { if (!mins.has(k)) mins.set(k, []); mins.get(k).push(g); }
  const stage3 = (db.survey.stages || []).find(s => s.no === 3);
  app.innerHTML = `${head([['分野・省庁から探す']], '分野・省庁から探す', '分野を選ぶと、その分野の協定を結んでいる都道府県が地図に表示されます。国の協定は、担当の省庁ごとに見られます。')}
    <nav class="ds-toc" aria-label="このページの目次"><a href="#/field?to=fd-field" data-jump="fd-field">分野から探す</a><a href="#/field?to=fd-min" data-jump="fd-min">省庁から探す（国の協定）</a><a href="#/field?to=fd-chart" data-jump="fd-chart">分野別の件数グラフ</a></nav>
    ${scopeBarHTML()}
    <h2 id="fd-field">分野から探す</h2>
    <details class="note-d"><summary>調査の範囲について（件数を読む前に）</summary><p>「外国人材・労働」は47都道府県を調査済み（第1段階）です。ほかの分野は調査が一部だけ（第2段階）なので、件数は確認できた範囲のみで、実際より少ない可能性があります。1つの協定が複数の分野にまたがる場合は、それぞれの分野で数えています。</p></details>
    <div class="field-grid">
      ${rows.map(r => `<a class="pick-card" href="#/map?mode=field&f=${r.f.code}">
        <b class="pick-t">${esc(r.f.ja)}</b>
        <span class="pick-d">${esc(r.f.desc)}</span>
        <span class="pick-n">都道府県 <b>${r.pref}</b>件／国・省庁 <b>${r.nat}</b>件</span>
        <span class="pick-go">地図で見る →</span>
      </a>`).join('')}
    </div>
    <h2 id="fd-min">省庁から探す（国の協定・全国が対象）</h2>
    <p>国の協定は、担当の省庁が共同で作成していることが多いので、関わっている省庁ごとに数えています（1つの協定が複数の省庁に入ることがあります）。</p>
    ${mins.size ? `<div class="table-wrap"><table><thead><tr><th>省庁</th><th class="num">協定の数</th><th>主な協定</th></tr></thead><tbody>
      ${[...mins].sort((a, b) => b[1].length - a[1].length).map(([k, gs]) => `<tr><th scope="row">${esc(k)}</th><td class="num">${gs.length}件</td><td class="small">${esc([...new Set(gs.map(g => DOC_CATEGORY[g.category].ja + (g.category === 'mou_moc' ? '（' + (['特定技能', '技能実習', '育成就労'].find(x => g.latest.title_ja.includes(x)) || '労働分野') + '）' : '')))].join('、'))}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">いまの数え方で表示する国の協定はありません。</p>'}
    <p><a class="btn btn-outline" href="#/national">国・省庁の協定を制度ごとに一覧で見る</a></p>
    ${stage3 ? `<p class="small muted">調査の範囲：${esc(stage3.coverage || '')}（${esc(stage3.status_ja)}）。${esc(stage3.note || '')}</p>` : ''}
    <h2 id="fd-chart">分野別の件数</h2>
    <div id="chart"></div>
    <p class="chart-caption">母集団：このサイトに登録された、公式資料で確認できた協定（国・都道府県。数え方：${esc(scopeLabel())}）。時点：${esc(fmtDate(db.config.data_as_of))}。外国人材以外の分野は一部調査。</p>
    <div class="btn-row"><button type="button" class="btn" id="png">分野別件数グラフを画像で保存</button></div>`;
  bindNewsToggle(app, () => fieldIndexPage(ctx));
  const items = rows.map(r => ({ label: r.f.ja, value: r.pref + r.nat, valueLabel: `${r.pref + r.nat}件（県${r.pref}・国${r.nat}）`, tip: `<b>${esc(r.f.ja)}</b><br>都道府県 ${r.pref}件／国・省庁 ${r.nat}件`, onClick: () => ctx.go('/map', { mode: 'field', f: r.f.code }) }));
  hbar(app.querySelector('#chart'), items, { ariaLabel: '分野別の協定件数' });
  app.querySelector('#png').addEventListener('click', () => exportBars({
    title: '分野別の協定件数', sub: `国・省庁と都道府県の合計（${scopeLabel()}。外国人材以外の分野は一部調査）`,
    items: [...items].sort((a, b) => b.value - a.value), meta: metaFor(db, all, '日本全国（国・47都道府県）'), filename: 'mou-fields.png',
  }));
}

// =============== 地域への影響 ===============
// 要点（4つのカード）→ 合意内容／実施内容／確認された変化 → 詳細データ・統計・出典 の順に表示
export function impactPage(ctx) {
  const { db, app } = ctx;
  const all = filterGroups(db, baseFilter());
  const real = i => !i._auto;
  const popImp = all.filter(g => g.impacts.some(i => real(i) && i.category === 'population' && i.stage !== 'agreed'));
  const numbersActual = all.filter(g => g.versions.some(v => v.numbers.some(n => ['actual_entry', 'actual_employed', 'current_residents'].includes(n.kind))));
  const accept = [...new Set([...popImp, ...numbersActual])];
  const budgetG = all.filter(g => g.budgets.length);
  const projG = all.filter(g => g.projects.length || g.impacts.some(i => real(i) && i.stage === 'implemented'));
  // 住民説明・議会審議は、実際に行われた記録だけ（合意内容に書かれた『相談窓口を設ける』などは含めない）
  const isComm = i => real(i) && i.category === 'community' && i.stage !== 'agreed';
  const commG = all.filter(g => g.impacts.some(isComm));
  const cnt = (cat, stage) => all.filter(g => g.impacts.some(i => i.category === cat && i.stage === stage)).length;
  const stageN = stage => all.filter(g => g.impacts.some(i => i.stage === stage && (stage === 'agreed' || real(i)))).length;
  const withImpact = all.filter(g => g.impacts.some(real));
  // 要約カード：公式資料で確認できた内容を短く。記録がなければ「未確認」（0人・0円とは書かない）
  const short = g => `${g.level === 'national' ? '国' : prefName(db, g.pref_code)}×${countryName(db, g.country_code)}`;
  const ACTUAL = ['actual_entry', 'actual_employed', 'current_residents'];
  const acceptItems = sortGroups(accept).flatMap(g => [
    ...g.versions.flatMap(v => v.numbers.filter(n => ACTUAL.includes(n.kind) && n.value != null).map(n => `${short(g)}：${n.label} ${Number(n.value).toLocaleString('ja-JP')}${n.unit || '人'}${n.period ? `（${n.period}）` : ''}`)),
    ...g.impacts.filter(i => real(i) && i.category === 'population' && i.stage !== 'agreed').map(i => `${short(g)}：${i.text}`),
  ]);
  const amt = all.flatMap(g => g.budgets.filter(b => typeof b.amount_yen === 'number').map(b => ({ g, b })));
  const planned = amt.filter(x => x.b.kind === 'planned'), settled = amt.filter(x => x.b.kind === 'settled');
  const budgetItems = [
    planned.length ? `予算額（計画）の記録：${planned.length}件（${new Set(planned.map(x => x.g.pref_code || 'nat')).size}団体）` : '予算額（計画）：未確認',
    settled.length ? `決算額（実際の支出）の記録：${settled.length}件` : '決算額（実際の支出）：未確認',
    ...amt.sort((a, b) => b.b.amount_yen - a.b.amount_yen).slice(0, 2).map(x => `例：${short(x.g)} ${fyLabel(x.b.fiscal_year)}「${x.b.item || '関連事業'}」${fmtYenShort(x.b.amount_yen)}（${BUDGET_KIND_SHORT[x.b.kind] || '種類不明'}）`),
  ];
  const projItems = sortGroups(projG).flatMap(g => [...g.projects.map(p => `${short(g)}：${p.name}${p.fiscal_year ? `（${fyLabel(p.fiscal_year)}）` : ''}`), ...g.impacts.filter(i => real(i) && i.stage === 'implemented' && i.category !== 'population').map(i => `${short(g)}：${i.text}`)]);
  const commItems = sortGroups(commG).flatMap(g => g.impacts.filter(isComm).map(i => `${short(g)}：${i.text}`));
  const card = (k, n, items, emptyText, href, note) => `<a class="imp-card${n ? '' : ' is-empty'}" href="${href}">
      <span class="imp-k">${k}</span>
      ${n ? `<span class="imp-n">${n}<small>件の協定で確認</small></span>` : '<span class="imp-n imp-unk">未確認</span>'}
      ${n ? `<ul class="imp-items">${items.slice(0, 3).map(t => `<li>${esc(t.length > 70 ? t.slice(0, 70) + '…' : t)}</li>`).join('')}${items.length > 3 ? `<li class="muted">ほか${items.length - 3}件</li>` : ''}</ul>` : `<span class="imp-d">${esc(emptyText)}</span>`}
      ${note ? `<span class="imp-d">${esc(note)}</span>` : ''}
    </a>`;
  const causal = all.flatMap(g => g.impacts.filter(i => real(i) && i.stage === 'observed'));
  const stageBox = (s, n, extra) => `<li class="st-${s.code}"><span class="flow-k"><span class="flow-no">${'①②③'[STAGES.indexOf(s)]}</span>${esc(s.ja)}</span><p>${esc(STAGE_DESC[s.code])}</p><b class="flow-n">${n}<small>件の協定に記録</small></b>${extra || ''}</li>`;
  app.innerHTML = `${head([['地域への影響を調べる']], '地域への影響を調べる', '海外との約束のあと、地域で実際に何が行われ、何が確認されたのか。要約 → 3つの段階 → 詳しい表と出典の順に見られます。')}
    ${scopeBarHTML()}
    <h2 class="h-sm">要約：公式資料で確認できたこと</h2>
    <div class="imp-cards">
      ${card('外国人の受入れ人数', accept.length, acceptItems, '受入れ人数の実績を公式資料で確認できた協定はありません（0人という意味ではありません）', '#/impact?to=imp-accept', '目標・上限の人数は含めていません')}
      ${card('関連予算・実際の支出', budgetG.length, budgetItems, '予算・支出の記録はまだ見つかっていません（0円という意味ではありません）', '#/compare?to=c6-sec', '協定そのものではなく関連事業の予算。年度・範囲が違うため合計していません')}
      ${card('実施された事業', projG.length, projItems, '関連事業の記録はまだ見つかっていません', '#/impact?to=imp-proj')}
      ${card('住民説明・議会審議', commG.length, commItems, '住民への説明・議会審議の記録はまだ見つかっていません（説明がなかったという意味ではありません）', '#/map?mode=impact&i=community')}
    </div>
    <p class="small muted">いまの数え方（${esc(scopeLabel())}）に入る協定で数えています。記録がないことは「影響がない」「説明がなかった」という意味ではありません。</p>

    <h2>3つの段階に分けて見る</h2>
    <ol class="flow3 flow3-big">
      ${stageBox(STAGES[0], stageN('agreed'))}
      ${stageBox(STAGES[1], stageN('implemented'))}
      ${stageBox(STAGES[2], stageN('observed'), `<span class="small">うち行政資料が協定の成果と記載 ${causal.filter(i => i.causality === 'stated_by_gov').length}件・<span class="causal">関連性は未確認 ${causal.filter(i => i.causality !== 'stated_by_gov').length}件</span></span>`)}
    </ol>
    <div class="note"><b>大切な注意</b>：②の実施実績（事業・予算・受入れ人数）と、③の地域の変化は別のものです。
      外国人の人数などの統計の変化には、協定以外の理由（制度の変更、景気、企業の採用など）も含まれます。行政資料が協定の成果だと明記していない場合は、<b>「関連性は未確認」</b>と表示しています。</div>

    <h2 id="imp-accept">受入れ人数・実績の記録（${accept.length}件）</h2>
    ${accept.length ? `<div class="table-wrap"><table><thead><tr><th>協定</th><th>記録の内容</th><th>協定との関係</th></tr></thead><tbody>
      ${sortGroups(accept).map(g => {
        const items = [
          ...g.impacts.filter(i => real(i) && i.category === 'population' && i.stage !== 'agreed').map(i => ({ t: i.text + (i.fiscal_year ? `（${i.fiscal_year}年度）` : ''), c: i.causality })),
          ...g.versions.flatMap(v => v.numbers.filter(n => ['actual_entry', 'actual_employed', 'current_residents'].includes(n.kind)).map(n => ({ t: `${n.label}：${n.value == null ? '数値未確認' : Number(n.value).toLocaleString('ja-JP') + (n.unit || '人')}${n.period ? `（${n.period}）` : ''}`, c: 'doc' }))),
        ];
        return `<tr><td><a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(g.first.title_ja)}</a><br><span class="small muted">${esc(g.level === 'national' ? '国' : prefName(db, g.pref_code))} × ${esc(countryName(db, g.country_code))}</span></td>
          <td><ul class="tight">${items.map(x => `<li>${esc(x.t)}</li>`).join('')}</ul></td>
          <td>${[...new Set(items.map(x => x.c))].map(c => c === 'doc' ? '制度・協定の実績として公表' : c === 'stated_by_gov' ? '行政資料が協定の成果として記載' : '関連性は未確認').join('<br>')}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">いまの数え方では、記録がありません。</p>'}

    <h2 id="imp-proj">実施された事業（${projG.length}件）</h2>
    ${projG.length ? `<details><summary>事業の記録がある協定を表示</summary>${mouList(db, sortGroups(projG))}</details>` : '<p class="muted">いまの数え方では、記録がありません。</p>'}

    <h2>詳しいデータ：分野ごとの記録の数</h2>
    <p class="small muted">それぞれの段階について、記録がある協定の件数です（全${all.length}件中）。「合意した内容」には、協定の合意内容の文章から自動で分類したものを含みます。</p>
    <div class="table-wrap"><table>
      <thead><tr><th>分野</th>${STAGES.map(s => `<th class="num">${esc(s.ja)}</th>`).join('')}<th>地図で見る</th></tr></thead>
      <tbody>${IMPACTS.map(i => `<tr><td><b>${esc(i.letter)}. ${esc(i.ja)}</b><br><span class="small muted">${esc(i.items)}</span></td>
        ${STAGES.map(s => `<td class="num">${cnt(i.code, s.code)}件</td>`).join('')}
        <td><a class="btn btn-small" href="#/map?mode=impact&i=${i.code}">地図</a></td></tr>`).join('')}</tbody>
    </table></div>
    <h2>影響の記録があるすべての協定（${withImpact.length}件）</h2>
    <details><summary>一覧と、協定ごとの影響の整理（6分野×3段階）を表示</summary>
      ${withImpact.length ? sortGroups(withImpact).map(g => `${mouCard(db, g)}<details><summary>この協定の影響の整理（6分野×3段階）を表示</summary>${impactGrid(db, g)}</details>`).join('') : '<p class="muted">まだ記録がありません。</p>'}
    </details>
    <h2>参考統計と出典について</h2>
    <p>都道府県の協定には、相手国の国籍の人がその県に何人住んでいるか（出入国在留管理庁「在留外国人統計」）と、特定技能で働く人の数（同「特定技能在留外国人数」）を「参考統計」として自動で表示しています。これは協定と関係なく県全体の数なので、すべて「関連性は未確認」として扱っています。数値の出典がないものは補っていません。</p>
    <p><a href="#/about">出典・調査状況</a>　／　<a href="#/issues">制度の課題を考える</a></p>`;
  bindNewsToggle(app, () => impactPage(ctx));
}

// =============== 都道府県の詳細 ===============
export function prefPage(ctx, code) {
  const { db, app } = ctx;
  const p = db.prefByCode.get(code);
  if (!p) return notFound(ctx, 'その都道府県は見つかりませんでした。');
  const f0 = { pref: code, level: 'prefecture' };
  const groups = sortGroups(filterGroups(db, baseFilter(f0)));
  const everything = filterGroups(db, { ...baseFilter(f0), validity: 'all', docScope: 'all', includePlanned: true });
  const signedAll = filterGroups(db, { ...baseFilter(f0), validity: 'all' });
  const outside = sortGroups(everything.filter(g => !g.planned && !groups.includes(g)));
  const planned = db.groups.filter(g => g.planned && g.pref_code === code);
  const newsOnly = settings.includeNews ? [] : db.groups.filter(g => !g.planned && !g.official && g.pref_code === code);
  const sv = db.survey.prefectures?.[code] || {};
  const countries = uniq(groups.flatMap(g => g.countries));
  const projects = groups.reduce((a, g) => a + g.projects.length, 0);
  const fieldItems = FIELDS.map(f => ({ label: f.ja, value: groups.filter(g => g.fields.includes(f.code)).length })).filter(x => x.value);
  const s1 = sv.stage1?.result || 'not_surveyed', s2 = sv.stage2?.result || 'not_surveyed';
  const excl = (db.excluded || []).filter(x => x.pref === p.name);
  const cities = filterGroups(db, baseFilter({ pref: code, level: 'municipality' }));
  const zs = ZERO_STATES[zeroState(db, code, null)];
  app.innerHTML = `${head([['日本地図から探す', '#/map'], [p.name]], `${p.name}の協定`)}
    <div class="chips" style="margin-bottom:10px">
      <span class="chip chip-plain">第1段階（外国人材・労働）：${esc(SURVEY_RESULT[s1])}${sv.stage1?.recheck ? '（要再調査）' : ''}</span>
      <span class="chip chip-plain">第2段階（その他の分野）：${esc(SURVEY_RESULT[s2])}</span>
    </div>
    ${scopeBarHTML()}
    <h2 class="h-sm">${esc(p.name)}が結んだ協定の有効性（${esc(signedAll.length ? '締結済みの内訳' : '登録なし')}）</h2>
    ${signedAll.length ? validityTiles(signedAll, { planned: planned.length }) : `<div class="info">${esc(p.name)}の協定は、${esc(zs.ja)}。${esc(zs.desc)}。</div>`}
    ${hiddenNote(db, f0)}
    <div class="stats">
      ${groups.length ? `
      ${statTile('いまの数え方の件数', groups.length, scopeLabel(), '件')}
      ${statTile('相手国・地域の数', countries.length, '', 'か国・地域')}
      ${statTile('実施事業の数', projects, '公式資料で確認できた関連事業', '件')}` : `
      ${statTile('いまの数え方の件数', '0', signedAll.length ? `${scopeLabel()}。このほか締結済み${signedAll.length}件（有効性未確認・終了など）` : `${zs.ja}（0件という意味ではありません）`, '件')}`}
    </div>
    ${countries.length ? `<p><b>相手国・地域：</b>${countries.map(c => `<a href="#/country/${c}" class="chip chip-plain">${esc(countryName(db, c))}</a>`).join(' ')}</p>` : ''}
    ${groups.length ? `<div class="grid-2">
      <div><h2>分野別の件数</h2><div id="fields"></div><p class="chart-caption">1つの協定が複数の分野にまたがる場合はそれぞれで数えます。${s2 !== 'list_checked' ? '外国人材以外の分野は一部調査のため、実際より少ない可能性があります。' : ''}</p></div>
      <div><h2>締結年別の推移</h2><div id="years"></div><p class="chart-caption">棒：その年に新しく締結した件数／線：累計。更新・再締結は数えていません（数え方：${esc(scopeLabel())}）。</p></div>
    </div>` : ''}
    <h2>協定の一覧（いまの数え方：${groups.length}件）</h2>
    ${groups.map(g => prefMouBlock(db, g)).join('') || '<p class="muted">いまの数え方で表示する協定はありません。</p>'}
    ${outside.length ? `<details><summary>いまの数え方で表示していない締結済みの協定（${outside.length}件：有効性未確認・終了確認・開始前・MOU以外の文書など）</summary>
      ${outside.map(g => prefMouBlock(db, g)).join('')}</details>` : ''}
    ${planned.length ? `<h2>締結予定・締結未確認（${planned.length}件、件数に含めていません）</h2>${planned.map(g => mouCard(db, g)).join('')}` : ''}
    ${cities.length ? `<h2>県内の市区町村の協定（${cities.length}件、県の件数とは別）</h2>${mouList(db, sortGroups(cities))}` : ''}
    ${newsOnly.length ? `<div class="info">このほか、報道のみで公式資料を確認できていない情報が${newsOnly.length}件あります（上の「報道のみ…も含める」にチェックすると表示）。</div>` : ''}
    ${residentsTable(db, code, uniq(signedAll.flatMap(g => g.countries)))}
    <h2>調査の記録</h2>
    <details><summary>${esc(p.name)}をどう調べたか</summary>
      <p><b>第1段階（外国人材・労働）：</b>${esc(SURVEY_RESULT[s1])}（確認日：${esc(fmtDate(sv.stage1?.checked, '—'))}${sv.stage1?.resurveyed ? '・再調査済み' : ''}${sv.stage1?.recheck ? '・要再調査' : ''}）${sv.stage1?.note ? `<br>${esc(sv.stage1.note)}` : ''}</p>
      ${(sv.stage1?.searched || []).length ? `<p class="small">調べた資料・方法：</p><ul class="small">${sv.stage1.searched.map(s => `<li>${linkify(s)}</li>`).join('')}</ul>` : ''}
      <p><b>第2段階（その他の分野）：</b>${esc(SURVEY_RESULT[s2])}${sv.stage2?.list_url ? `（<a href="${esc(sv.stage2.list_url)}" target="_blank" rel="noopener">確認した一覧</a>）` : ''}${sv.stage2?.note ? `<br>${esc(sv.stage2.note)}` : ''}</p>
      <p><b>有効性の確認：</b>${esc(fmtDate(maxDate(signedAll.flatMap(g => g.versions.map(v => v.validity_checked))), '未確認'))}時点（協定ごとの判定の根拠は、それぞれの協定のページにあります）</p>
    </details>
    ${excl.length ? `<details><summary>登録しなかったもの（${excl.length}件）</summary>
      <p class="small muted">調査の中で見つかったが、姉妹・友好提携、国内機関どうしの協定など、このサイトの登録の範囲に入らないため登録しなかったものです。</p>
      <ul>${excl.map(x => `<li>${esc(x.title)}<br><span class="small muted">理由：${esc(x.reason)}</span>${x.url ? `　<a class="small" href="${esc(x.url)}" target="_blank" rel="noopener">資料</a>` : ''}</li>`).join('')}</ul>
    </details>` : ''}
    <div class="btn-row"><button type="button" class="btn btn-outline" id="csv">${esc(p.name)}の協定をCSVで保存（いまの数え方）</button></div>`;
  bindNewsToggle(app, () => prefPage(ctx, code));
  if (groups.length) {
    hbar(app.querySelector('#fields'), fieldItems, { ariaLabel: '分野別の件数' });
    vbar(app.querySelector('#years'), yearSeries(groups), { line: true, ariaLabel: '締結年別の推移' });
  }
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(groups), `mou_pref_${code}_${settings.validity}.csv`));
}
function maxDate(ds) { return ds.filter(Boolean).sort().pop() || null; }

function linkify(s) {
  // URLに使える半角文字だけをリンクにする（直後の「、」「（」などの日本語を含めない）
  return esc(s).replace(/https?:\/\/[\w\-.~:/?#[\]@!$&*+,;=%]+/g, u => {
    const url = u.replace(/[.,;:]+$/, '');
    return `<a href="${url}" target="_blank" rel="noopener">${url}</a>${u.slice(url.length)}`;
  });
}

function prefMouBlock(db, g) {
  const m = g.latest;
  return `${mouCard(db, g)}
  <details><summary>この協定の要点を開く</summary>
    ${kvTable([
      ['正式名称', esc(m.title_ja) + (m.title_original ? `<br><span class="small muted">${esc(m.title_original)}</span>` : '')],
      ['締結日', esc(fmtDate(m.signed_date)) + (m.announced_date ? `<span class="small muted">（発表日：${esc(fmtDate(m.announced_date))}）</span>` : '')],
      ['日本側の締結機関', esc(japanSideName(db, m)) + (m.japan_signatory ? `（${esc(m.japan_signatory)}）` : '')],
      ['相手国・相手機関', `${esc(countryName(db, m.country_code))}・${esc(m.partner_org)}<br><span class="small muted">種別：${esc(PARTNER_TYPES[m.partner_type] || '不明')}</span>`],
      ['協定の目的', esc(m.purpose || '記載なし')],
      ['具体的な合意内容', m.content.length ? `<ul>${m.content.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '未確認'],
      ['現在の有効性', `${validityBadge(g.validity, { prefix: false })}<br><span class="small">${esc(m.validity_basis || '現在も有効であることを示す公式資料を確認できていません。')}</span>`],
      ['有効期間・更新条件', `${esc(m.term_text || m.validity || '未確認')}${m.renewal_text || (m.renewal_terms && m.renewal_terms !== '未確認') ? `<br>${esc(m.renewal_text || m.renewal_terms)}` : ''}`],
      ['法的拘束力', `${esc(LEGAL[m.legal_binding])}${m.legal_binding_note ? `<br><span class="small">${esc(m.legal_binding_note)}</span>` : ''}`],
      ['関連事業の進み具合', `${statusBadge(g.status)} ${esc(m.status_note || '')}`],
      ['予算・支出', g.budgets.length ? g.budgets.map(b => `${esc(fyLabel(b.fiscal_year))} ${esc(b.item || '')}：${esc(fmtYen(b.amount_yen))}`).join('<br>') : '未確認（0円ではありません）'],
      ['公式資料・原文', m.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>${s.archived_from ? '<span class="small muted">（元のページが開けないため保存版）</span>' : ''}`).join('<br>')],
    ])}
    <p><a href="#/mou/${encodeURIComponent(m.id)}">地域への影響・予算などをすべて見る →</a></p>
  </details>`;
}

function residentsTable(db, code, countries) {
  const r = db.stats?.residents;
  if (!r || !countries.length) return '';
  const rows = countries.map(c => ({ c, rc: residentChange(db, code, c), ss: sswCount(db, code, c) })).filter(x => x.rc || x.ss);
  if (!rows.length) return '';
  return `<h2>参考統計：相手国の国籍の人の数（${esc(prefName(db, code))}）</h2>
    <div class="table-wrap"><table><thead><tr><th>国籍</th><th class="num">在留外国人<br>${esc(fmtDate(r.periods[0]))}末</th><th class="num">在留外国人<br>最新</th><th class="num">特定技能<br>${esc(fmtDate(db.stats.ssw?.period))}末</th></tr></thead>
    <tbody>${rows.map(x => `<tr><td>${esc(countryName(db, x.c))}</td><td class="num">${esc(fmtNum(x.rc?.a))}人</td><td class="num">${esc(fmtNum(x.rc?.b))}人<br><span class="small muted">${esc(fmtDate(x.rc?.to))}末</span></td><td class="num">${x.ss ? esc(fmtNum(x.ss.value)) + '人' : '未確認'}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">出典：${esc(r.publisher)}「${esc(r.title)}」${r.sources?.[r.periods[0]]?.url ? `（<a href="${esc(r.sources[r.periods[0]].url)}" target="_blank" rel="noopener">${esc(r.periods[0])}</a>、` : '（'}${r.sources?.[x0(r)]?.url ? `<a href="${esc(r.sources[x0(r)].url)}" target="_blank" rel="noopener">最新</a>` : ''}）、${esc(db.stats.ssw?.publisher || '')}「${esc(db.stats.ssw?.title || '')}」。
    <b>協定との関連性は未確認</b>です（協定以外の理由による増減を含む県全体の数）。</p>`;
}
function x0(r) { return r.periods[r.periods.length - 1]; }

// =============== 個別の協定 ===============
// ① どんな約束？ ② 外国人の受入れと関係する？ ③ 実際に何が行われた？ ④ 地域への影響 ⑤ 税金 ⑥ 原文・出典
// 冒頭は短くし、詳しい表は「詳しく見る」を押したときだけ開く
export function mouPage(ctx, id) {
  const { db, app } = ctx;
  const m = db.mouById.get(id);
  if (!m) return notFound(ctx, '指定された協定は見つかりませんでした（IDが変わった可能性があります）。');
  const g = m._group;
  const isLatest = g.latest.id === m.id;
  const back = m.japan_level === 'national' ? [['国・省庁の協定', '#/national']] : [[prefName(db, m.pref_code), `#/pref/${m.pref_code}`]];
  const summary = (m.summary && m.summary.length ? m.summary : [m.purpose, ...m.content]).filter(Boolean).slice(0, 3);
  const systems = m.related_systems.map(k => db.systemByKey?.get(k) || { name: k });
  const accTypes = m.acceptance_types.map(t => ACCEPTANCE_TYPES[t] || t);
  const real = g.impacts.filter(i => !i._auto);
  const implemented = real.filter(i => i.stage === 'implemented');
  const resultNums = g.versions.flatMap(v => v.numbers.filter(n => ['actual_entry', 'actual_employed', 'current_residents'].includes(n.kind)));
  const S = (n, t, idx) => `<section class="ds" id="ds-${idx}" aria-labelledby="ds-${idx}-h"><h2 id="ds-${idx}-h"><span class="ds-n">${n}</span>${t}</h2>`;
  const impactSummary = IMPACTS.map(cat => {
    const items = real.filter(i => i.category === cat.code && i.stage !== 'agreed');
    const agreed = g.impacts.filter(i => i.category === cat.code && i.stage === 'agreed');
    const state = items.length ? `${items.length}件の記録` : agreed.length ? '合意内容のみ' : '記録なし（未確認）';
    return `<li class="${items.length ? 'has' : agreed.length ? 'agreed' : 'none'}"><b>${esc(cat.ja)}</b><span>${esc(state)}</span></li>`;
  }).join('');
  app.innerHTML = `${head(back.concat([['協定の詳細']]), m.title_ja)}
    ${m.title_original ? `<p class="muted" style="margin-top:-8px">${esc(m.title_original)}</p>` : ''}
    <p class="who" style="font-weight:700;font-size:1.05rem">${whoLine(db, m)}</p>
    <div class="meta" style="display:flex;flex-wrap:wrap;gap:6px">${validityBadge(g.validity)} ${categoryBadge(m.doc_category)} ${relationBadge(m._relation)} ${statusBadge(m.status)} ${fieldBadges(m.fields)} <span class="badge b-doc">${esc(m.doc_type)}</span> ${evidenceBadge(m)}</div>
    ${!isLatest ? `<div class="info">この協定には、あとから結ばれた更新・修正の文書があります。最新：<a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(g.latest.title_ja)}（${esc(fmtDate(g.latest.signed_date))}）</a>。有効性・実施状況・予算・影響は、更新・修正の文書とあわせて表示しています。</div>` : ''}
    ${m._validity === 'planned' ? `<div class="note">${esc(STATUS.planned.desc)}</div>` : ''}
    ${m.sources.length && m.sources.every(s => s.link_status) ? '<div class="note">この協定の公式資料のリンクは、現在すべて開けない状態です（ページの移動・削除やサイト側のエラー）。記録は確認日時点の資料にもとづいています。</div>' : ''}
    ${m.evidence_level === 'news_only' ? '<div class="note">この記録は報道のみにもとづいており、公式資料ではまだ確認できていません。初期設定では件数に含めていません。</div>' : ''}
    <nav class="ds-toc" aria-label="このページの目次">${['どんな約束？', '受入れとの関係', '実際に行われたこと', '地域への影響', '税金', '原文・出典'].map((t, i) => `<a href="#/mou/${encodeURIComponent(m.id)}?to=ds-${i + 1}" data-jump="ds-${i + 1}">${'①②③④⑤⑥'[i]} ${t}</a>`).join('')}</nav>

    ${S('①', 'どんな約束？', 1)}
      ${kvTable([
        ['文書名', `${esc(m.title_ja)}<br><span class="small muted">文書の種類：${esc(DOC_CATEGORY[m.doc_category]?.ja || '')}（${esc(m.doc_type)}）</span>`],
        ['相手国・機関', `<a href="#/country/${esc(m.country_code)}">${esc(countryName(db, m.country_code))}</a>・${esc(m.partner_org)}<br><span class="small muted">種別：${esc(PARTNER_TYPES[m.partner_type] || '不明')}</span>`],
        ['日本側の締結機関', `${esc(japanSideName(db, m))}${m.japan_level === 'national' ? '<br><span class="small muted">全国が対象（都道府県の件数には含めません）</span>' : ''}`],
        ['締結日', `${esc(fmtDate(m.signed_date))}${m.effective_date ? `<span class="small muted">（発効・開始：${esc(fmtDate(m.effective_date))}）</span>` : ''}${m.date_note && !m.signed_date ? `<br><span class="small muted">${esc(m.date_note)}</span>` : ''}`],
        ['合意内容（要約）', summary.length ? `<ul class="tight">${summary.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '未確認'],
        ['現在の有効性', `${validityBadge(g.validity, { prefix: false })} <span class="small">${esc(m.validity_basis || '')}</span>`],
        (m.related_ids || []).length ? ['関連する文書', m.related_ids.map(r => db.mouById.get(r)).filter(Boolean).map(r => `<a href="#/mou/${encodeURIComponent(r.id)}">${esc(r.title_ja)}</a>（${esc(DOC_CATEGORY[r.doc_category]?.ja || '')}）`).join('<br>')] : null,
      ])}
      <details><summary>有効性の詳細（有効期限・更新・終了・判定の根拠）</summary>${validityDetail(db, m, g)}</details>
      <details><summary>合意内容の全文の要点・基本情報をすべて見る</summary>
        <p><b>目的：</b>${esc(m.purpose || '公式資料に記載なし')}</p>
        ${m.content.length ? `<ul>${m.content.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p>具体的な合意内容：未確認</p>'}
        ${kvTable([
          m.title_original ? ['原語の正式名称', esc(m.title_original)] : null,
          ['文書の種類（補足）', esc(m.doc_type_note || '—')],
          ['署名者', `${esc(m.japan_signatory || '未確認')}${(m.other_japan_parties || []).length ? `<br>ほかの署名者：${esc(m.other_japan_parties.join('、'))}` : ''}`],
          ['発表日', esc(fmtDate(m.announced_date, '—'))],
          ['日付の補足', esc(m.date_note || '—')],
          ['分野', fieldBadges(m.fields) + ((m.labor_detail || []).length ? `<br><span class="small">関連する在留資格・分野：${esc(m.labor_detail.join('、'))}</span>` : '')],
          ['原文', esc(ORIGINAL[m.original_text] || ORIGINAL.unconfirmed)],
          ['確認の根拠', esc(EVIDENCE[m.evidence_level])],
          ['データID', `<code>${esc(m.id)}</code>`],
        ])}
      </details>
      ${g.versions.length > 1 ? `<details><summary>更新・再締結・後継の履歴（${g.versions.length}文書。件数は1件）</summary><ol>${g.versions.map(v => `<li>${v.id === m.id ? '<b>' : ''}<a href="#/mou/${encodeURIComponent(v.id)}">${esc(fmtDate(v.signed_date))}　${esc(v.title_ja)}</a>${v.id === m.id ? '</b>（このページ）' : ''} ${validityBadge(v._validity)}</li>`).join('')}</ol></details>` : ''}
    </section>

    ${S('②', '外国人の受入れと関係する？', 2)}
      ${kvTable([
        ['受入れとの関係', `<b>${esc(RELATION[m._relation].ja)}</b><br><span class="small muted">${esc(RELATION[m._relation].desc)}${m.foreign_relation ? '' : '（合意内容の記載からこのサイトが分類）'}</span>`],
        ['対象となる制度', systems.length ? systems.map(s => `${esc(s.name)}${s.state ? `<span class="small muted">（${s.state === 'in_force' ? '実施中' : '開始予定'}${s.start ? '：' + esc(fmtDate(s.start)) : ''}）</span>` : ''}`).join('<br>') : esc((m.labor_detail || []).join('、') || '未確認')],
        ['就労・留学・研修・定住などの区別', esc(accTypes.join('、') || (m._relation === 'general' ? '該当なし' : '未確認'))],
        ['人数の目標・上限など', m.numbers.length ? `記載あり（${m.numbers.length}項目。下の「この数字は何を意味する？」）` : '記載は確認できず'],
        ['法的拘束力', `${esc(LEGAL[m.legal_binding])}${m.legal_nature ? `<br><span class="small">${esc(m.legal_nature)}</span>` : ''}${m.legal_binding_note ? `<br><span class="small">${esc(m.legal_binding_note)}</span>` : ''}`],
      ])}
      ${numbersSection(m, { empty: false })}
    </section>

    ${S('③', '実際に何が行われた？', 3)}
      <p>${statusBadge(m.status)} ${esc(m.status_note || '')}</p>
      ${g.projects.length || implemented.length || resultNums.length ? `<div class="table-wrap"><table><thead><tr><th>内容</th><th>時期</th><th>担当</th></tr></thead><tbody>
        ${g.projects.map(p => `<tr><td><b>${esc(p.name)}</b>${p.detail ? `<br>${esc(p.detail)}` : ''}</td><td class="nowrap">${p.fiscal_year ? esc(fyLabel(p.fiscal_year)) : '未確認'}</td><td>${esc(p.agency || '未確認')}</td></tr>`).join('')}
        ${implemented.map(i => `<tr><td>${esc(i.text)}${i.causality === 'unconfirmed' ? '<br><span class="causal">協定との関連性は未確認</span>' : ''}</td><td class="nowrap">${i.fiscal_year ? esc(fyLabel(i.fiscal_year)) : '未確認'}</td><td>—</td></tr>`).join('')}
        ${resultNums.map(n => `<tr><td>受入れ実績：${esc(n.label)} <b>${n.value == null ? '数値未確認' : esc(Number(n.value).toLocaleString('ja-JP') + (n.unit || '人'))}</b></td><td>${esc(n.period || '未確認')}</td><td>${esc((m.agencies || []).join('、') || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p>この協定に基づく具体的な事業や受入れ実績は、公式資料ではまだ確認できていません（未確認）。</p>'}
      ${(m.agencies || []).length ? `<p class="small">担当機関：${esc(m.agencies.join('、'))}</p>` : ''}
    </section>

    ${S('④', '地域への影響', 4)}
      <ul class="imp-sum">${impactSummary}</ul>
      <p class="small">「合意した内容」「実際に行われたこと」「地域で確認された変化」を分けています。統計の変化は、協定との関連性が確認できない限り「関連性は未確認」と表示します。</p>
      <details><summary>6分野×3段階の整理表を開く（仕事・産業／人口／住宅／教育・医療／行政サービス／住民への説明）</summary>${impactGrid(db, g)}</details>
    </section>

    ${S('⑤', '税金はいくら使われた？', 5)}
      ${budgetSection(db, g)}
    </section>

    ${S('⑥', '原文・出典', 6)}
      ${systems.some(s => s.sources?.length) ? `<p><b>関連する国内制度の資料：</b>${systems.filter(s => s.sources?.length).map(s => s.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || s.name)}</a>`).join('、')).join('、')}</p>` : ''}
      ${g.versions.map(v => `${g.versions.length > 1 ? `<h3>${esc(fmtDate(v.signed_date))}の版</h3>` : ''}${sourceList(v.sources)}`).join('')}
      <p class="small muted">最終確認日：${esc(fmtDate(m.last_checked))}／有効性の確認日：${esc(fmtDate(m.validity_checked, '未確認'))}</p>
      <details><summary>項目ごとの調査状況（確認済み・調査したが確認できず・未調査）</summary>${researchTable(m)}</details>
      ${m.notes ? `<h3>備考（分析・注意）</h3><p>${esc(m.notes)}</p>` : ''}
      ${(m.unconfirmed || []).length ? `<h3>調べたが確認できなかったこと</h3><ul>${m.unconfirmed.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    </section>

    <div class="btn-row">
      <button type="button" class="btn" id="png-sum">要約を画像で保存</button>
      <button type="button" class="btn" id="png-imp">影響の整理図を画像で保存</button>
      <button type="button" class="btn btn-outline" id="csv">CSVで保存</button>
    </div>`;

  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, g.versions, `mou_${m.id}.csv`, `協定1件「${m.title_ja}」の全文書（更新・後継の版を含む）`));
  const region = m.japan_level === 'national' ? '日本（国）' : prefName(db, m.pref_code);
  const meta = {
    region: `${region} × ${countryName(db, m.country_code)}`,
    period: `締結 ${fmtDate(m.signed_date)}〜${fmtDate(db.config.data_as_of)}時点`,
    source: m.sources.slice(0, 2).map(s => s.publisher + '「' + (s.title || '') + '」').join('、') + (m.sources.length > 2 ? ' ほか' : ''),
    checked: fmtDate(m.last_checked || db.config.data_as_of),
  };
  app.querySelector('#png-sum').addEventListener('click', () => exportMouSummary({
    who: `${japanSideName(db, m)} ⇄ ${countryName(db, m.country_code)}・${m.partner_org}`,
    title: m.title_ja,
    facts: [
      ['締結日・文書の種類', `${fmtDate(m.signed_date)}／${DOC_CATEGORY[m.doc_category]?.ja || m.doc_type}`],
      ['現在の有効性', `${VALIDITY[g.validity].ja}（${fmtDate(m.validity_checked, '確認日不明')}確認）`],
      ['外国人の受入れとの関係', RELATION[m._relation].ja],
      ['法的拘束力', LEGAL[m.legal_binding]],
      ['関連予算', g.budgets.some(b => typeof b.amount_yen === 'number') ? g.budgets.filter(b => typeof b.amount_yen === 'number').map(b => `${fyLabel(b.fiscal_year)} ${fmtYenShort(b.amount_yen)}`).slice(0, 2).join('、') : '未確認'],
    ],
    purpose: m.purpose || summary[0], points: (m.numbers.length ? m.numbers.slice(0, 2).map(n => `${NUMBER_KINDS.find(k => k.code === n.kind)?.ja || n.kind}：${n.label} ${n.value == null ? '未確認' : Number(n.value).toLocaleString('ja-JP') + (n.unit || '人')}`) : []).concat(m.content).slice(0, 4), meta, filename: `mou_${m.id}_summary.png`,
  }));
  app.querySelector('#png-imp').addEventListener('click', () => {
    const stats = autoStatsFor(db, g).map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    exportImpactGrid({
      title: `地域への影響の整理：${japanSideName(db, m)}×${countryName(db, m.country_code)}`,
      sub: m.title_ja,
      stages: STAGES.map(s => s.ja),
      rows: IMPACTS.map(cat => ({
        label: `${cat.letter}. ${cat.ja}`,
        cells: STAGES.map(st => {
          const items = g.impacts.filter(i => i.category === cat.code && i.stage === st.code);
          const extra = cat.code === 'population' && st.code === 'observed' ? stats : [];
          const texts = [...items.map(i => i.text + (i.stage !== 'agreed' && i.causality === 'unconfirmed' ? '（関連性は未確認）' : '')), ...extra];
          return { n: texts.length, text: texts.join(' ／ ') };
        }),
      })),
      meta, filename: `mou_${m.id}_impact.png`,
    });
  });
}

// =============== 国・省庁のMOU ===============
export function nationalPage(ctx) {
  const { db, app } = ctx;
  const groups = sortGroups(filterGroups(db, baseFilter({ level: 'national' })));
  const vAll = filterGroups(db, { ...baseFilter({ level: 'national' }), validity: 'all', includePlanned: true });
  // 制度ごとに分けて表示（特定技能・技能実習・育成就労・その他のMOU、MOU以外の文書は種類ごと）
  const KINDS = ['特定技能', '技能実習', '育成就労'];
  const kindOf = g => {
    if (g.category !== 'mou_moc') return DOC_CATEGORY[g.category].ja;
    return KINDS.find(k => [...g.latest.labor_detail || [], g.latest.title_ja].some(x => String(x).includes(k))) || 'その他のMOU（労働行政の協力など）';
  };
  const order = [...KINDS, 'その他のMOU（労働行政の協力など）', ...DOC_CATEGORIES.filter(c => c.code !== 'mou_moc').map(c => c.ja)];
  const kinds = order.filter(k => groups.some(g => kindOf(g) === k));
  const stage3 = (db.survey.stages || []).find(s => s.no === 3);
  app.innerHTML = `${head([['国・省庁の協定']], '国・省庁が締結した協定（全国が対象）', '日本政府・省庁が外国政府などと結んだ協定です。全国が対象なので、都道府県の件数には含めず別に数えています。')}
    ${stage3 ? `<div class="note"><b>調査範囲：</b>${esc(stage3.coverage || '')}（${esc(stage3.status_ja)}）。${esc(stage3.note || '')}</div>` : ''}
    ${scopeBarHTML()}
    ${validityTiles(vAll.filter(g => !g.planned), { planned: vAll.filter(g => g.planned).length })}
    ${hiddenNote(db, { level: 'national' })}
    <div class="stats">${statTile('いまの数え方の件数', groups.length, '更新・改正は1件と数える', '件')}${statTile('相手国・地域', uniq(groups.flatMap(g => g.countries)).length, '', 'か国・地域')}</div>
    ${kinds.length ? '' : '<p class="muted">いまの数え方で表示する協定はありません。上の切り替えで数え方を変えてください。</p>'}
    ${kinds.map(k => {
      const gs = groups.filter(g => kindOf(g) === k);
      return `<h2>${esc(k)}（${gs.length}件）</h2>
      <div class="table-wrap"><table><thead><tr><th>相手国</th><th>締結日</th><th>相手機関・文書</th><th>有効性</th><th>事業</th></tr></thead><tbody>
        ${gs.sort((a, b) => (a.first.signed_date || '').localeCompare(b.first.signed_date || '')).map(g => `<tr><td><a href="#/country/${g.country_code}">${esc(countryName(db, g.country_code))}</a></td>
          <td class="nowrap"><a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(fmtDate(g.first.signed_date))}</a>${g.versions.length > 1 ? `<br><span class="small muted">更新・改正 ${g.versions.length - 1}回</span>` : ''}</td>
          <td>${esc(g.latest.partner_org)}<br><span class="small muted">${esc(g.latest.doc_type)}</span></td><td>${validityBadge(g.validity, { prefix: false })}${termEnd(g.latest) ? `<br><span class="small muted">期限：${esc(fmtDate(termEnd(g.latest).raw))}${termEnd(g.latest).renewed ? '（更新後）' : ''}</span>` : ''}</td><td>${statusBadge(g.status)}</td></tr>`).join('')}
      </tbody></table></div>`;
    }).join('')}
    <div class="btn-row"><button type="button" class="btn btn-outline" id="csv">国・省庁の協定をCSVで保存（いまの数え方）</button></div>`;
  bindNewsToggle(app, () => nationalPage(ctx));
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(groups), `mou_national_${settings.validity}.csv`));
}

// =============== 協定・取決めの種類から探す ===============
export function typesPage(ctx) {
  const { db, app } = ctx;
  const cat = DOC_CATEGORY[ctx.params.get('c')] ? ctx.params.get('c') : '';
  const rel = RELATION[ctx.params.get('r')] ? ctx.params.get('r') : '';
  const base = { ...baseFilter(), docScope: 'all' };
  const inCat = filterGroups(db, { ...base, category: cat || null });
  const groups = sortGroups(rel ? inCat.filter(g => g.relation === rel) : inCat);
  const catN = c => filterGroups(db, { ...base, category: c, relation: rel || null }).length;
  const relN = r => inCat.filter(g => g.relation === r).length;
  const nat = groups.filter(g => g.level === 'national'), pref = groups.filter(g => g.level !== 'national');
  const wh = cat === 'bilateral_arrangement' || !cat ? sortGroups(filterGroups(db, { ...base, category: 'bilateral_arrangement' })).filter(g => /ワーキング・ホリデー/.test(g.latest.title_ja)) : [];
  const go = patch => ctx.go('/types', Object.fromEntries(Object.entries({ c: cat, r: rel, ...patch }).filter(([, v]) => v)), { keepScroll: true });
  app.innerHTML = `${head([['協定・取決めの種類から探す']], '協定・取決めの種類から探す', 'MOUのほかにも、外国人の来日・就労・留学に関係する国際的な合意文書があります。文書の種類と、外国人の受入れとの関係で絞り込めます。')}
    ${scopeBarHTML({ docs: false })}
    <div class="control-group"><span class="label" id="cat-l">文書の種類</span>
      <div class="seg" role="group" aria-labelledby="cat-l">
        <button type="button" data-c="" aria-pressed="${!cat}">すべて</button>
        ${DOC_CATEGORIES.map(c => `<button type="button" data-c="${c.code}" aria-pressed="${cat === c.code}" title="${esc(c.desc)}">${esc(c.ja)} ${catN(c.code)}</button>`).join('')}
      </div></div>
    <div class="control-group"><span class="label" id="rel-l">外国人の受入れとの関係</span>
      <div class="seg" role="group" aria-labelledby="rel-l">
        <button type="button" data-r="" aria-pressed="${!rel}">すべて</button>
        ${RELATIONS.map(r => `<button type="button" data-r="${r.code}" aria-pressed="${rel === r.code}" title="${esc(r.desc)}">${esc(r.ja)} ${relN(r.code)}</button>`).join('')}
      </div></div>
    <div class="result-bar"><div class="now">いま表示している条件</div><div class="chips">
      <span class="chip chip-plain">文書の種類：${esc(cat ? DOC_CATEGORY[cat].ja : 'すべて')}</span>
      <span class="chip chip-plain">受入れとの関係：${esc(rel ? RELATION[rel].ja : 'すべて')}</span>
      <span class="chip chip-plain">有効性：${esc(VALIDITY_SCOPE[settings.validity].ja)}</span>
      ${cat || rel ? '<button type="button" class="btn btn-small btn-outline" id="clear">条件を解除</button>' : ''}</div></div>
    ${cat ? `<div class="info"><b>${esc(DOC_CATEGORY[cat].ja)}とは：</b>${esc(DOC_CATEGORY[cat].desc)}</div>` : `<details><summary>文書の種類ごとの性質（法的拘束力など）を見る</summary>
      <div class="table-wrap"><table><thead><tr><th>種類</th><th>どんな文書か</th></tr></thead><tbody>${DOC_CATEGORIES.map(c => `<tr><th scope="row">${esc(c.ja)}</th><td>${esc(c.desc)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">国内の法律や政府の方針（一方的に決めるもの）は、海外との協定として登録していません。下の「関連する国内制度」に分けて載せています。「受入れとの関係」は、合意内容の記載にもとづいてこのサイトが分類したものです。</p></details>`}
    <p class="result-summary">該当：<b>国・省庁 ${nat.length}件</b>／<b>都道府県 ${pref.length}件</b>（いずれも件数は別々に数えています）</p>
    ${wh.length ? `<h2>ワーキング・ホリデーの取決め（${wh.length}か国・地域）</h2>
      <div class="table-wrap"><table><thead><tr><th>国・地域</th><th>開始</th><th>年間の発給枠（上限）</th><th>有効性</th></tr></thead><tbody>
      ${wh.sort((a, b) => (a.first.effective_date || a.first.signed_date || '').localeCompare(b.first.effective_date || b.first.signed_date || '')).map(g => {
        const capN = g.latest.numbers.find(n => n.kind === 'legal_cap');
        return `<tr><td><a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(countryName(db, g.country_code))}</a></td><td class="nowrap">${esc(fmtDate(g.latest.effective_date || g.latest.signed_date))}</td>
        <td>${esc(g.latest.wh_cap_text || (capN ? `${Number(capN.value).toLocaleString('ja-JP')}${capN.unit || '人'}` : '未確認'))}</td><td>${validityBadge(g.validity, { prefix: false })}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="small muted">発給枠は「その数まで受け入れられる上限」で、実際に来日した人数ではありません。日本から相手国へ行く日本の若者にも同じ制度が使われます。</p>` : ''}
    <h2>国・省庁の文書（${nat.length}件）</h2>
    ${mouList(db, nat.filter(g => !wh.includes(g)), { empty: 'いまの条件で表示する国の文書はありません。' })}
    <h2>都道府県の文書（${pref.length}件）</h2>
    ${pref.length > 30 ? `<details><summary>${pref.length}件を表示</summary>${mouList(db, pref)}</details>` : mouList(db, pref, { empty: 'いまの条件で表示する都道府県の文書はありません。' })}
    ${systemsSection(db)}
    <div class="btn-row"><button type="button" class="btn btn-outline" id="csv">この結果をCSVで保存</button></div>`;
  app.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => go({ c: b.dataset.c })));
  app.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => go({ r: b.dataset.r })));
  app.querySelector('#clear')?.addEventListener('click', () => ctx.go('/types', {}, { keepScroll: true }));
  bindNewsToggle(app, () => typesPage(ctx));
  // このページは文書の種類を問わず数えるので、「数える文書」ではなく種類・関係の条件を書く
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(groups), `mou_types_${cat || 'all'}_${rel || 'all'}_${settings.validity}.csv`,
    `件数の条件：${VALIDITY_SCOPE[settings.validity].ja}／文書の種類：${cat ? DOC_CATEGORY[cat].ja : 'すべて'}／受入れとの関係：${rel ? RELATION[rel].ja : 'すべて'}${settings.includeNews ? '／報道のみの情報を含む' : ''}`));
}

// 関連する国内制度（海外との協定ではない。日本が自ら決める制度）
function systemsSection(db) {
  if (!db.systems?.length) return '';
  return `<h2 id="systems">関連する国内制度（海外との協定ではありません）</h2>
    <p class="small">在留資格や受入れの制度は、日本の法律などで決まります。海外との合意文書は、これらの制度を相手国と協力して運用するためのものです。</p>
    <div class="table-wrap"><table><thead><tr><th>制度</th><th>根拠</th><th>状態</th><th>相手国との協定との関係</th></tr></thead><tbody>
    ${db.systems.map(s => `<tr><th scope="row">${esc(s.name)}<br><span class="small muted">${esc(s.kind || '')}</span></th><td>${esc(s.law || '')}</td>
      <td class="nowrap">${s.state === 'in_force' ? '実施中' : '開始予定'}${s.start ? `<br>${esc(fmtDate(s.start))}${s.state === 'in_force' ? 'から' : '予定'}` : ''}</td>
      <td>${esc(s.needs_bilateral || '')}${(s.sources || []).length ? `<br>${s.sources.map(x => `<a class="small" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || '資料')}</a>`).join('、')}` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
}

// =============== 比較グラフ ===============
export function comparePage(ctx) {
  const { db, app } = ctx;
  const f = FIELD[ctx.params.get('f')] ? ctx.params.get('f') : '';
  const all = filterGroups(db, baseFilter({ field: f || null }));
  const pref = all.filter(g => g.level === 'prefecture');
  const asOf = fmtDate(db.config.data_as_of);
  const scope = `母集団：このサイトに登録された、公式資料で確認できた協定（数え方：${scopeLabel()}）${f ? `のうち「${FIELD[f].ja}」` : ''}。時点：${asOf}。`;
  app.innerHTML = `${head([['比較グラフ']], '比較グラフ', 'グラフの棒や点にマウスを重ねる（スマートフォンではタップする）と数値が表示されます。数え方を切り替えると、すべてのグラフと画像の数字が変わります。')}
    ${scopeBarHTML()}
    <div class="control-group"><label class="label" for="fsel">分野で絞り込む</label>
      <select id="fsel"><option value="">すべての分野</option>${FIELDS.map(x => `<option value="${x.code}" ${x.code === f ? 'selected' : ''}>${esc(x.ja)}</option>`).join('')}</select></div>
    <div class="note">件数は確認できた範囲のものです。外国人材・労働の分野は47都道府県を調査済みですが、ほかの分野は一部の調査です。グラフにない都道府県は「0件」ではなく、いまの数え方で表示されないもの、または「該当なし」「調査したが確認できず」「未調査」のいずれかです。</div>
    ${chartBlock('c7', '協定の有効性の内訳（都道府県・国）', `母集団：このサイトに登録された協定（${DOC_SCOPE_LABEL()}${f ? `・「${FIELD[f].ja}」` : ''}）。有効性の範囲の切り替えに関係なく、5つの区分すべてを表示します。時点：${asOf}。`)}
    ${chartBlock('c1', '都道府県ごとの締結件数', scope + '国・省庁の締結は含みません。')}
    ${chartBlock('c2', '相手国・地域別の締結件数', scope + '国・省庁と都道府県の合計。')}
    ${chartBlock('c3', '外国人材・労働関係の件数（都道府県別）', `母集団：外国人材・労働の分野の協定（第1段階：47都道府県を調査済み。数え方：${scopeLabel()}）。時点：${asOf}。`)}
    ${chartBlock('c4', '年ごとの締結件数の推移', scope + '国・都道府県の合計。更新・再締結は最初の締結年で1件。棒：その年の件数、線：累計。')}
    ${chartBlock('c5', '具体的な事業の実施が確認できた協定の割合（都道府県別）', scope + '「具体的な事業が実施中」または「事業は完了」の割合。分母はその都道府県の件数で、件数が少ない県は割合が大きく振れます（かっこ内の件数も見てください）。')}
    ${chartBlock('c6', '確認できた関連予算の比較（都道府県別）', `母集団：金額が公式資料で確認できた関連予算（計画予算。数え方：${scopeLabel()}）。未確認のものは含めていません（0円ではありません）。年度・事業の範囲は資料ごとに異なります。時点：${asOf}。`)}`;
  app.querySelector('#fsel').addEventListener('change', e => ctx.go('/compare', e.target.value ? { f: e.target.value } : {}));
  bindNewsToggle(app, () => comparePage(ctx));

  // 有効性の内訳（5区分）
  const vs = lv => validityCounts(filterGroups(db, { ...baseFilter({ field: f || null, level: lv }), validity: 'all', includePlanned: true }));
  const vp = vs('prefecture'), vn = vs('national');
  const vItems = VALIDITIES.map(v => ({ label: v.ja, value: vp[v.code] + vn[v.code], color: v.color, tip: `<b>${esc(v.ja)}</b><br>都道府県 ${vp[v.code]}件／国・省庁 ${vn[v.code]}件` }));
  drawChart(app, 'c7', vItems, 'hbar', { meta: { ...metaFor(db, all, '日本全国（国・47都道府県）', { docs: true }), region: `日本全国（国・47都道府県。数える文書：${DOC_SCOPE_LABEL()}、有効性はすべての区分）` } });

  const pc = countByPref(pref);
  const prefItems = [...pc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => ({ label: prefName(db, c), value: n, onClick: () => ctx.go('/pref/' + c) }));
  drawChart(app, 'c1', prefItems, 'hbar', { meta: metaFor(db, pref, '全国47都道府県（国・省庁の締結は含まない）') });

  const cc = new Map();
  for (const g of all) for (const c0 of g.countries) { const x = cc.get(c0) || { p: 0, n: 0 }; g.level === 'national' ? x.n++ : x.p++; cc.set(c0, x); }
  const cItems = [...cc].sort((a, b) => (b[1].p + b[1].n) - (a[1].p + a[1].n)).map(([c, x]) => ({ label: countryName(db, c), value: x.p + x.n, tip: `<b>${esc(countryName(db, c))}</b><br>都道府県 ${x.p}件／国・省庁 ${x.n}件`, onClick: () => ctx.go('/country/' + c) }));
  drawChart(app, 'c2', cItems, 'hbar', { meta: metaFor(db, all, '日本全国（国・47都道府県）') });

  const labor = filterGroups(db, baseFilter({ field: 'labor', level: 'prefecture' }));
  const lc = countByPref(labor);
  drawChart(app, 'c3', [...lc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => ({ label: prefName(db, c), value: n, onClick: () => ctx.go('/pref/' + c) })), 'hbar', { meta: metaFor(db, labor, '全国47都道府県') });

  drawChart(app, 'c4', yearSeries(all), 'vbar', { meta: metaFor(db, all, '日本全国（国・47都道府県）') });

  const rate = [...pc].map(([c, n]) => {
    const done = pref.filter(g => g.pref_code === c && (g.status === 'in_progress' || g.status === 'completed')).length;
    return { label: prefName(db, c), value: Math.round(done / n * 100), valueLabel: `${Math.round(done / n * 100)}%（${done}/${n}件）`, tip: `<b>${esc(prefName(db, c))}</b><br>${n}件中${done}件（${Math.round(done / n * 100)}%）` };
  }).sort((a, b) => b.value - a.value || b.valueLabel.localeCompare(a.valueLabel));
  drawChart(app, 'c5', rate, 'hbar', { unit: '%', meta: metaFor(db, pref, '全国47都道府県') });

  const bud = new Map();
  for (const g of pref) for (const b of g.budgets) {
    if (b.kind !== 'planned' || typeof b.amount_yen !== 'number') continue;
    bud.set(g.pref_code, (bud.get(g.pref_code) || 0) + b.amount_yen);
  }
  const bItems = [...bud].sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: prefName(db, c), value: v, tip: `<b>${esc(prefName(db, c))}</b><br>${esc(fmtYen(v))}` }));
  drawChart(app, 'c6', bItems, 'hbar', { format: v => fmtYenShort(v), valueWidth: 100, meta: metaFor(db, pref, '金額が確認できた都道府県') });
}
function DOC_SCOPE_LABEL() { return DOC_SCOPES.find(d => d.code === settings.docScope).ja; }
function chartBlock(id, title, caption) {
  return `<section class="section" id="${id}-sec"><h2>${esc(title)}</h2><div id="${id}"></div><p class="chart-caption">${esc(caption)}</p>
    <button type="button" class="btn btn-small btn-outline" id="${id}-png">このグラフを画像で保存</button></section>`;
}
function drawChart(app, id, items, kind, opts) {
  const el = app.querySelector('#' + id);
  const sec = app.querySelector(`#${id}-sec`);
  if (!items.length) { el.innerHTML = '<p class="muted">いまの数え方では、表示できるデータがありません（0件と確認できたという意味ではありません。上の切り替えで数え方を変えると表示される場合があります）。</p>'; sec.querySelector('button').remove(); return; }
  if (kind === 'hbar') hbar(el, items, opts); else vbar(el, items, { line: true, ...opts });
  sec.querySelector(`#${id}-png`).addEventListener('click', () => exportBars({
    title: sec.querySelector('h2').textContent, sub: `日本と世界のMOU・協定マップ（${scopeLabel()}）`, unit: opts.unit,
    items: kind === 'vbar' ? items.filter(x => x.value).slice(-10) : items.slice(0, 10), meta: opts.meta, filename: `mou-${id}.png`,
  }));
}

/// =============== 出典・調査状況・使い方 ===============
export function aboutPage(ctx) {
  const { db, app } = ctx;
  const sv = db.survey.prefectures || {};
  const tiles = (key) => `<div class="pref-tiles">${db.prefs.map(p => {
    const r = sv[p.code]?.[key]?.result || 'not_surveyed';
    const re = sv[p.code]?.[key]?.recheck;
    return `<a class="pref-tile ps-${r}" href="#/pref/${p.code}">${esc(p.name)}<small>${esc(SURVEY_RESULT[r])}${re ? '<br><b>要再調査</b>' : ''}</small></a>`;
  }).join('')}</div>`;
  const vt = lv => validityCounts(filterGroups(db, { level: lv, validity: 'all', docScope: 'all', includePlanned: true }));
  const vp = vt('prefecture'), vn = vt('national');
  const checked = db.mous.filter(m => m.validity_checked).length;
  const cov = db.survey.coverage || [];
  const s = surveySummary(db);
  // 項目ごとの調査状況（文書単位）
  const tally = new Map();
  for (const m of db.mous) for (const r of researchStatus(m)) { if (!tally.has(r.ja)) tally.set(r.ja, { confirmed: 0, not_found: 0, not_surveyed: 0 }); tally.get(r.ja)[r.state]++; }
  app.innerHTML = `${head([['調査状況・出典・使い方']], '調査状況・出典・使い方', `最終データ更新日：${esc(fmtDate(db.config.last_updated))}　掲載内容：${esc(fmtDate(db.config.data_as_of))}時点`)}
    <nav class="ds-toc" aria-label="このページの目次">
      <a href="#/about?to=ab-now" data-jump="ab-now">調査状況の要約</a><a href="#/about?to=ab-scope" data-jump="ab-scope">調べた範囲・まだ調べていない範囲</a><a href="#/about?to=ab-valid" data-jump="ab-valid">有効性の判定のしかた</a><a href="#/about?to=ab-items" data-jump="ab-items">項目ごとの調査状況</a><a href="#/about?to=ab-docs" data-jump="ab-docs">登録する文書の種類</a><a href="#/about?to=ab-method" data-jump="ab-method">調べ方</a><a href="#/about?to=ab-read" data-jump="ab-read">数字の読み方</a><a href="#/about?to=ab-terms" data-jump="ab-terms">用語</a>
    </nav>
    <h2 id="ab-now">調査状況の要約</h2>
    <div class="note"><b>このサイトの件数は「登録した協定」の数です。</b>すべての都道府県・分野のMOUを網羅できてはいないため、全国の実際の総数ではありません。地図は登録済み協定の分布を示しています。</div>
    <dl class="facts">
      <div><dt>調査済みの都道府県</dt><dd><b>${s.stage1Done}</b> / ${s.prefs}<small>外国人材・労働の協定（第1段階）</small></dd></div>
      <div><dt>その他の分野</dt><dd><b>${s.stage2Listed}</b>都道府県<small>公式一覧を確認済み。一部のみ調査 ${s.stage2Partial}・未調査 ${s.stage2None}</small></dd></div>
      <div><dt>要再調査の都道府県</dt><dd><b>${s.recheck}</b><small>${s.recheck ? esc(s.recheckNames.join('、')) : 'なし'}</small></dd></div>
      <div><dt>調査済みの協定分野</dt><dd><b>外国人材・労働</b><small>国は特定技能・技能実習・育成就労の協力覚書、EPA・交換公文、ワーキング・ホリデーなど外国人の受入れに関係するもの</small></dd></div>
      <div><dt>登録済みの協定</dt><dd><b>${s.registered}</b>件<small>都道府県 ${s.registeredPref}・国 ${s.registeredNat}（全文書。更新・再締結は1件。締結予定 ${s.planned}件は除く）</small></dd></div>
      <div><dt>有効性を確認済み</dt><dd><b>${s.determined}</b>件<small>有効確認 ${s.valid}・終了確認 ${s.ended}・開始前 ${s.notStarted}</small></dd></div>
      <div><dt>有効性が未確認</dt><dd><b>${s.unconfirmed}</b>件<small>今も有効か、公式資料で確かめられていない</small></dd></div>
      <div><dt>最終データ更新日</dt><dd><b class="fd-date">${esc(fmtDate(s.lastUpdated))}</b></dd></div>
    </dl>
    <h3>地図の色の区別（0件の都道府県）</h3>
    <div class="table-wrap"><table><thead><tr><th>表示</th><th>意味</th></tr></thead><tbody>
      ${['scope_zero', 'none', 'not_found', 'partial', 'not_surveyed'].map(k => `<tr><th scope="row"><span class="sw-inline" style="${swatchStyleFor(k)}"></span>${esc(ZERO_STATES[k].ja)}</th><td>${esc(ZERO_STATES[k].desc)}</td></tr>`).join('')}
    </tbody></table></div>
    <h2 id="ab-scope">調べた範囲・まだ調べていない範囲</h2>
    ${stageTable(db)}
    ${cov.length ? `<div class="table-wrap"><table><thead><tr><th>対象</th><th>調べた範囲</th><th>まだ調べていない範囲</th></tr></thead><tbody>
      ${cov.map(c => `<tr><th scope="row">${esc(c.target)}</th><td>${esc(c.done)}</td><td>${esc(c.not_done)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <h3>第1段階：47都道府県の外国人材・労働関係MOU</h3>
    ${tiles('stage1')}
    <p class="small muted">「該当なし（確認済み）」は公式資料で該当がないことを確認したもの。「調査したが確認できず」は調べたが公式資料で確認できなかったもの（存在しないとは限りません）。</p>
    <h3>第2段階：都道府県のその他の分野のMOU</h3>
    ${tiles('stage2')}
    <p class="small muted">「公式一覧を確認済み」は、その都道府県が公開している海外との協定・覚書の一覧を確認したもの。「一部のみ調査」は調査の途中で見つかったものだけを登録しています。</p>

    <h2 id="ab-valid">協定の有効性の判定のしかた</h2>
    <p>協定が「今も効力を持っているか」を、事業が続いているかどうか（実施状況）とは<b>別に</b>判定しています。すべての件数・地図・グラフ・CSV・画像は、同じ判定を使って数えています。初期設定は「有効確認のみ」です。</p>
    <div class="table-wrap"><table><thead><tr><th>区分</th><th>意味</th><th class="num">都道府県</th><th class="num">国・省庁</th></tr></thead><tbody>
      ${VALIDITIES.map(v => `<tr><th scope="row">${validityBadge(v.code, { prefix: false })}</th><td>${esc(v.desc)}</td><td class="num">${vp[v.code]}件</td><td class="num">${vn[v.code]}件</td></tr>`).join('')}
      <tr><th scope="row">締結済み累計</th><td>有効確認＋有効性未確認＋終了確認＋開始前（締結予定は含めない）</td><td class="num">${vp.signed_total}件</td><td class="num">${vn.signed_total}件</td></tr>
    </tbody></table></div>
    <p class="small muted">件数は同じ協定の更新・再締結・後継をまとめて1件とした数（MOU以外の文書を含む全登録文書）。有効性を確認した記録：${checked}件／${db.mous.length}件（確認日はそれぞれの協定のページに記載）。</p>
    <ul>
      <li><b>有効確認にするもの</b>：(A) 原文や公式発表に有効期間が書かれていて、今日がその期間内にあり、終了の情報が見つからない。(B) 更新・延長したことと、その新しい期間が公式資料に書かれている。(C) 政府・自治体の最近の公式資料が、その協定を現在も運用中のものとして明示している。</li>
      <li><b>有効確認にしないもの</b>：事業が続いているだけ／「自動更新」「期間の定めなし」と書いてあるだけ／古い一覧に載っているだけ／報道だけ。これらは「有効性未確認」です。</li>
      <li><b>終了確認にするもの</b>：公式資料に終了・失効・満了・後継協定への置き換えが書かれているもの。古いというだけ、期限が過ぎたというだけでは終了にしません（更新されている可能性があるため「有効性未確認」）。</li>
      <li><b>更新・再締結・後継</b>：同じ協定の版として履歴に残し、件数は1件です。現在の有効性は、最新の有効な文書から判定します。終了した協定も削除しません。</li>
      <li><b>事業だけが続いている場合</b>：関連事業が実施中でも、協定そのものが今も有効だとは判定しません（事業の実施状況は別の欄に表示）。</li>
    </ul>
    <h3>有効期限の日付の扱い</h3>
    <ul>
      <li>期限が年月日で書かれているときは、<b>その日まで有効</b>（翌日から「期限切れ」）として比べます。</li>
      <li>期限が年月だけ（例：2026年2月）のときは、<b>その月の末日まで</b>（2026年2月28日、うるう年の2028年2月なら29日）として比べます。年だけのときは12月31日までです。</li>
      <li>更新・延長後の期限が公式資料で分かるときは、<b>当初の期限より更新後の期限を優先</b>します。</li>
      <li>確認した時点で「有効確認」でも、書かれた期限を過ぎると、更新・延長を確認できるまで自動的に「有効性未確認」として数えます。自動更新の条項があるだけでは「有効確認」にしません。期限を過ぎただけで「終了確認」にもしません。</li>
      <li>文書に書かれた開始日がまだ来ていない協定は「締結済み・開始前」です。期限が書かれていない協定は、期限切れとして扱いません。</li>
      <li>協定ごとに、判定の根拠（文章と資料のURL）と、有効性の最終確認日を記録しています（各協定のページの「有効性の詳細」）。</li>
    </ul>

    <h2 id="ab-items">項目ごとの調査状況</h2>
    <p>協定ごとの主な項目について、「確認済み」「調査したが確認できず」「未調査」を区別しています（登録した${db.mous.length}文書の内訳。協定ごとの状況は各協定のページにあります）。</p>
    <div class="table-wrap"><table><thead><tr><th>項目</th><th class="num">確認済み</th><th class="num">調査したが確認できず</th><th class="num">未調査</th></tr></thead><tbody>
      ${[...tally].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="num">${v.confirmed}</td><td class="num">${v.not_found}</td><td class="num">${v.not_surveyed}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted">名称・日付・期間・自動更新・終了と更新・相手・文書の種類・出典は、全件で有効性を確認するときに調べています。人数と事業の実施状況は、外国人材・労働の協定について調べています（それ以外は未調査）。関連予算は、予算書・決算書の網羅的な確認がまだのため、記録がないものは「未調査」です。</p>

    <h2 id="ab-docs">このサイトに登録する文書</h2>
    <div class="table-wrap"><table><thead><tr><th>文書の種類</th><th>どんな文書か</th></tr></thead><tbody>${DOC_CATEGORIES.map(c => `<tr><th scope="row">${esc(c.ja)}</th><td>${esc(c.desc)}</td></tr>`).join('')}</tbody></table></div>
    <ul>
      <li>${term('MOU')}・${term('MOC')}・${term('覚書')}のほか、外国人の来日・就労・留学・研修などに関係する ${term('EPA')}、${term('交換公文')}、${term('ワーキング・ホリデー')}の取決め、${term('共同声明')}・アクションプランも登録しています。</li>
      <li><b>登録しないもの</b>：日本の法律・政府の方針など一方的に決めるもの（「関連する国内制度」として別に表示）、姉妹都市・友好提携の協定書、国内の機関どうしの協定、締結予定のもの（予定は件数に含めず別に表示）。</li>
      <li><b>国と自治体を混ぜない</b>：国が全国を対象に結んだ文書は、47都道府県それぞれの件数には数えません。</li>
      <li><b>外国人の受入れとの関係</b>（このサイトの分類）：${RELATIONS.map(r => `「${esc(r.ja)}」＝${esc(r.desc)}`).join('／')}。データに書かれていない場合は、分野と合意内容の記載から自動で分類しています。</li>
    </ul>
    <h2 id="ab-method">調べ方と守っていること</h2>
    <ul>
      <li>優先した資料：外務省、出入国在留管理庁、厚生労働省などの省庁、47都道府県の公式サイト（報道発表・知事会見・担当課のページ）、都道府県議会の資料、予算書・決算書、政府統計、相手国政府の公式発表。</li>
      <li>できる限り協定の原文を確認し、原文がない場合は自治体の公式発表などを根拠に、確認できた範囲を明記しています。</li>
      <li>存在しない協定を作らない／数字を推測で埋めない／出典の分からない情報を確定情報にしない／締結予定と締結済みを分ける／発表日と締結日を分ける／不明を0にしない／調査範囲が限られた数字を全国の総数として示さない／公式資料で確認できたことと分析を分ける。</li>
      <li>検索して見つからなかった情報は「存在しない」と書かず「確認できず」としています。</li>
      <li>報道だけで公式資料が見つからないものは「報道のみ」と表示し、初期設定では件数に含めません。</li>
      <li>すべての記録に、情報源の名前・URL・確認日を付けています。</li>
    </ul>
    <h2 id="ab-read">数字の読み方</h2>
    <ul>
      <li>件数は、同じ協定の更新・再締結を1件と数えます（二重計上をしません）。</li>
      <li>予算は、協定そのものの予算ではなく「関連事業の予算」であることが多いので、その関係を表に明記しています。${budgetLegend()}</li>
      <li>人数は、${NUMBER_KINDS.map(n => esc(n.ja)).join('・')}を区別しています。同じ数字として扱ったり、足し合わせたりしないでください。</li>
      <li>「参考統計」（相手国の国籍の人の数など）は、協定と関係のない理由による増減も含む県全体の数です。協定との関連性は未確認として扱います。</li>
    </ul>
    <h2 id="ab-terms">用語の説明</h2>
    <dl>${Object.entries(GLOSSARY).map(([k, v]) => `<dt><b>${esc(k)}</b></dt><dd style="margin:0 0 10px 1em">${esc(v)}</dd>`).join('')}</dl>
    <h2>地図データ</h2>
    <p>「国土数値情報（行政区域データ）」（国土交通省）<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html" target="_blank" rel="noopener">https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html</a> をもとに、スマートニュース メディア研究所が簡略化したデータ（<a href="https://github.com/smartnews-smri/japan-topography" target="_blank" rel="noopener">smartnews-smri/japan-topography</a>、商用・非商用を問わず無償で利用可）を加工して作成しました。国土数値情報の行政区域データはオープンデータとして提供されています（出典の記載が必要）。</p>
    <h2>誤りを見つけたら</h2>
    <p>内容の誤りや、掲載されていない協定の情報（公式資料のURL付き）があれば、サイトの管理者までお知らせください。確認のうえ修正します。</p>`;
}

// =============== データ ===============
export function dataPage(ctx) {
  const { db, app } = ctx;
  const issues = validate(db);
  const errors = issues.filter(i => i.level === 'error'), warns = issues.filter(i => i.level === 'warn');
  const scoped = groupsToMous(filterGroups(db, baseFilter()));
  app.innerHTML = `${head([['データ']], 'データのダウンロードと点検')}
    <h2>ダウンロード</h2>
    ${scopeBarHTML()}
    <div class="btn-row">
      <button type="button" class="btn" id="csv-scope">いまの数え方の協定をCSVで保存（${scoped.length}文書）</button>
      <button type="button" class="btn btn-outline" id="csv-all">登録したすべての文書（${db.mous.length}文書。終了・予定・報道のみを含む）</button>
    </div>
    <p class="small muted">CSVはExcelでそのまま開けます。更新・再締結は別の行になっており、「同一協定のグループ」列で同じ協定かどうかが分かります。「有効性」「有効性の根拠」「文書の種類」「外国人の受入れとの関係」「人数（種類別）」の列もあります。</p>
    <p>元データ（JSON）：<a href="data/mous/index.json">data/mous/</a>（都道府県ごとのファイル、国のMOC：national.json、MOU以外の国際文書：agreements.json）、<a href="data/systems.json">systems.json</a>（関連する国内制度）、<a href="data/countries.json">countries.json</a>、<a href="data/survey.json">survey.json</a>、<a href="data/prefectures.json">prefectures.json</a></p>
    <h2>CSVの列</h2>
    <p class="small">${CSV_COLUMNS.map(esc).join('、')}</p>
    <h2>データ点検</h2>
    <p>データファイルの書き方に誤りがないかを、ここで自動チェックしています。データを追加したら、このページで確認してください。</p>
    ${errors.length ? `<div class="error"><b>直す必要がある誤り：${errors.length}件</b></div>` : '<div class="info"><b>誤りは見つかりませんでした。</b></div>'}
    ${issues.length ? `<details${errors.length ? ' open' : ''}><summary>点検の結果（誤り ${errors.length}件・注意 ${warns.length}件）</summary><div class="table-wrap"><table><thead><tr><th>種類</th><th>ファイル</th><th>ID</th><th>内容</th></tr></thead><tbody>
      ${[...errors, ...warns].map(i => `<tr><td>${i.level === 'error' ? '<b style="color:#b42318">誤り</b>' : '注意'}</td><td>${esc(i.file)}</td><td>${i.id !== '-' && db.mouById.has(i.id) ? `<a href="#/mou/${encodeURIComponent(i.id)}">${esc(i.id)}</a>` : esc(i.id)}</td><td>${esc(i.msg)}</td></tr>`).join('')}
    </tbody></table></div></details>` : ''}
    <p class="small muted">データの追加方法は <a href="docs/データの追加方法.md" target="_blank" rel="noopener">docs/データの追加方法.md</a> を見てください。</p>`;
  bindNewsToggle(app, () => dataPage(ctx));
  app.querySelector('#csv-scope').addEventListener('click', () => downloadMouCSV(db, scoped, `mou_${settings.validity}_${settings.docScope}.csv`));
  app.querySelector('#csv-all').addEventListener('click', () => downloadMouCSV(db, db.mous, 'mou_all.csv', '登録したすべての文書（有効性・文書の種類を問わず、終了・締結予定・報道のみを含む）'));
}

// =============== 有効性の区分で探す ===============
// 「現在有効と確認できる協定」「過去に終了した協定」「有効性がまだ分からない協定」を区分ごとに一覧にする
const LIST_INTRO = {
  valid_confirmed: '今も効力があることを、公式資料（原文の有効期間、更新の記録、自治体・省庁の現在の一覧）で確認できた協定です。',
  ended_confirmed: '終了・失効・期間満了・後継の協定への置き換えを、公式資料で確認できた協定です（過去の協定）。',
  unconfirmed: '今も有効かどうかを公式資料で確かめられていない協定です。終了したという意味ではありません。期限を過ぎて更新が確認できないものも含みます。',
  signed_not_started: '締結は確認できたが、文書に書かれた開始日がまだ来ていない協定です。',
  planned: '締結の予定が発表されただけで、締結を確認できていないものです。締結済みの件数には含めません。',
};
export function listPage(ctx) {
  const { db, app } = ctx;
  const s = VALIDITY[ctx.params.get('s')] ? ctx.params.get('s') : 'valid_confirmed';
  const lv = ['prefecture', 'national'].includes(ctx.params.get('lv')) ? ctx.params.get('lv') : '';
  const all = filterGroups(db, { ...baseFilter(), validity: 'all', includePlanned: true });
  const inState = all.filter(g => g.validity === s);
  const shown = sortGroups(lv ? inState.filter(g => g.level === lv) : inState);
  const nat = shown.filter(g => g.level === 'national'), pref = shown.filter(g => g.level !== 'national').sort((a, b) => (a.pref_code || '').localeCompare(b.pref_code || ''));
  const go = patch => ctx.go('/list', Object.fromEntries(Object.entries({ s, lv, ...patch }).filter(([, v]) => v)), { keepScroll: true });
  const row = g => {
    const m = g.latest, end = termEnd(m);
    const why = s === 'ended_confirmed' ? (m.end_reason || g.versions.find(v => v.end_reason)?.end_reason || m.validity_basis) : m.validity_basis;
    return `<li class="lrow">
      <a class="lrow-t" href="#/mou/${encodeURIComponent(g.first.id)}">${esc(g.first.title_ja)}</a>
      <span class="lrow-who">${whoLine(db, m)}</span>
      <span class="lrow-meta">締結：${esc(fmtDate(g.first.signed_date))}${g.versions.length > 1 ? `（更新・後継を含む${g.versions.length}文書）` : ''}${end ? `／期限：${esc(fmtDate(end.raw))}${end.renewed ? '（更新後）' : ''}` : ''}${m.ended_date ? `／終了：${esc(fmtDate(m.ended_date))}` : ''}${m._validityReason && m._validityReason !== 'recorded' ? `／<span class="causal">${esc(VALIDITY_REASONS[m._validityReason])}</span>` : ''}</span>
      ${why ? `<span class="lrow-why">判定の根拠：${esc(why.length > 110 ? why.slice(0, 110) + '…' : why)}</span>` : ''}
    </li>`;
  };
  app.innerHTML = `${head([['有効性の区分で探す']], '有効性の区分で探す', '今も有効と確認できる協定、終了した協定、有効性がまだ分からない協定を、区分ごとに一覧にしました。')}
    <div class="control-group"><span class="label" id="ls-l">有効性の区分</span>
      <div class="seg" role="group" aria-labelledby="ls-l">${VALIDITIES.map(v => {
        // 国と都道府県の件数は足さずに並べる
        const inV = all.filter(g => g.validity === v.code);
        const np = inV.filter(g => g.level !== 'national').length, nn = inV.filter(g => g.level === 'national').length;
        const n = lv === 'prefecture' ? `${np}` : lv === 'national' ? `${nn}` : `県${np}・国${nn}`;
        return `<button type="button" data-s="${v.code}" aria-pressed="${s === v.code}">${esc(v.ja)}（${n}）</button>`;
      }).join('')}</div></div>
    <div class="control-group"><span class="label" id="lv-l">締結した側</span>
      <div class="seg" role="group" aria-labelledby="lv-l">
        <button type="button" data-lv="" aria-pressed="${!lv}">国と都道府県</button>
        <button type="button" data-lv="prefecture" aria-pressed="${lv === 'prefecture'}">都道府県 ${inState.filter(g => g.level !== 'national').length}</button>
        <button type="button" data-lv="national" aria-pressed="${lv === 'national'}">国・省庁 ${inState.filter(g => g.level === 'national').length}</button>
      </div></div>
    ${scopeBarHTML({ validity: false })}
    <div class="result-bar"><div class="now">いま表示している条件</div><div class="chips">
      <span class="chip chip-plain">有効性：${esc(VALIDITY[s].ja)}</span>
      <span class="chip chip-plain">締結した側：${esc(lv === 'prefecture' ? '都道府県' : lv === 'national' ? '国・省庁' : '国と都道府県')}</span>
      <span class="chip chip-plain">数える文書：${esc(scopeLabel().split('／').slice(1).join('／'))}</span>
      ${lv ? '<button type="button" class="btn btn-small btn-outline" id="clear">締結した側の絞り込みを解除</button>' : ''}</div></div>
    <div class="info"><b>${esc(VALIDITY[s].ja)}とは：</b>${esc(LIST_INTRO[s])}</div>
    <p class="result-summary">該当：<b>都道府県 ${pref.length}件</b>／<b>国・省庁 ${nat.length}件</b>（別々に数えています。同じ協定の更新・再締結は1件）</p>
    ${nat.length ? `<h2>国・省庁（${nat.length}件）</h2><ol class="lrows">${nat.map(row).join('')}</ol>` : ''}
    ${pref.length ? `<h2>都道府県（${pref.length}件）</h2><ol class="lrows">${pref.map(row).join('')}</ol>` : ''}
    ${shown.length ? '' : '<p class="muted">いまの条件に当てはまる協定はありません。</p>'}
    <div class="btn-row"><button type="button" class="btn btn-outline" id="csv">この一覧をCSVで保存</button></div>`;
  app.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => go({ s: b.dataset.s })));
  app.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => go({ lv: b.dataset.lv })));
  app.querySelector('#clear')?.addEventListener('click', () => go({ lv: '' }));
  bindNewsToggle(app, () => listPage(ctx));
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(shown), `mou_list_${s}${lv ? '_' + lv : ''}_${settings.docScope}.csv`,
    `件数の条件：有効性「${VALIDITY[s].ja}」／${lv === 'prefecture' ? '都道府県' : lv === 'national' ? '国・省庁' : '国と都道府県'}／${scopeLabel().split('／').slice(1).join('／')}`));
}

// =============== 検索 ===============
// 探すためのページなので、有効性・文書の種類を問わずすべての登録文書から探す（結果には有効性を表示）
export function searchPage(ctx) {
  const { db, app } = ctx;
  const q = ctx.params.get('q') || '';
  const groups = q ? sortGroups(filterGroups(db, { q, includeNews: true, includePlanned: true })) : [];
  const cs = q ? findCountries(db, q).slice(0, 10) : [];
  const ps = q ? db.prefs.filter(p => p.name.includes(q) || p.short === q || p.en.toLowerCase().includes(q.toLowerCase())) : [];
  const vc = validityCounts(groups);
  app.innerHTML = `${head([['検索']], `「${q}」の検索結果`)}
    ${cs.length ? `<h2>国・地域</h2><div class="country-list">${cs.map(c => `<a href="#/country/${c.code}"><span class="country-btn">${esc(c.ja)}<span class="c">${esc(c.en)}</span></span></a>`).join('')}</div>` : ''}
    ${ps.length ? `<h2>都道府県</h2><div class="country-list">${ps.map(p => `<a href="#/pref/${p.code}"><span class="country-btn">${esc(p.name)}</span></a>`).join('')}</div>` : ''}
    <h2>協定・文書（${groups.length}件）</h2>
    ${groups.length ? `<p class="small muted">検索では、有効性や文書の種類を問わず、登録したすべての文書から探しています（有効確認 ${vc.valid_confirmed}件・有効性未確認 ${vc.unconfirmed}件・終了確認 ${vc.ended_confirmed}件・開始前 ${vc.signed_not_started}件・締結予定 ${vc.planned}件）。</p>` : ''}
    ${mouList(db, groups, { empty: '見つかりませんでした。言葉を短くしたり、国名・県名で探してみてください。' })}`;
  const input = document.getElementById('global-q');
  if (input) input.value = q;
}

export function notFound(ctx, msg) {
  ctx.app.innerHTML = `${head([['見つかりません']], 'ページが見つかりません')}<p>${esc(msg || '')}</p><p><a class="btn" href="#/">トップへ戻る</a></p>`;
}

export { seqScale };
