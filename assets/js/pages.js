// トップ・相手国・分野・地域への影響・都道府県・個別MOU・国・比較・調査状況・データ・検索の各ページ
import { esc, fmtDate, fmtNum, fmtYen, fmtYenShort, yearOf, today, uniq } from './util.js';
import {
  FIELDS, FIELD, STATUSES, STATUS, IMPACTS, IMPACT, STAGES, ZERO_STATES, SURVEY_RESULT, LEGAL, EVIDENCE, ORIGINAL, PARTNER_TYPES,
  filterGroups, sortGroups, countByPref, zeroState, validityState, residentChange, sswCount, findCountries,
  countryName, prefName, japanSideName, validate,
} from './data.js';
import { JapanMap, swatchStyle } from './map.js';
import { hbar, vbar } from './charts.js';
import {
  mouList, mouCard, sourceList, impactGrid, budgetSection, legendHTML, statTile, kvTable, statusBadge, fieldBadges,
  evidenceBadge, whoLine, term, GLOSSARY, autoStatsFor, fyLabel,
} from './components.js';
import { computeMapModel, countriesWithData, bindSuggest, seqScale } from './page-map.js';
import { downloadMouCSV, groupsToMous, CSV_COLUMNS } from './csv.js';
import { exportMap, exportBars, exportMouSummary, exportImpactGrid } from './export.js';
import { settings, newsToggleHTML, bindNewsToggle, metaFor } from './shared.js';

const ICONS = {
  map: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></svg>',
  globe: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>',
  tag: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12V3h9l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  home: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
};

function head(crumbs, title, lead) {
  return `<div class="page-head">
    <div class="crumbs"><a href="#/">トップ</a>${crumbs.map(c => ` ＞ ${c[1] ? `<a href="${c[1]}">${esc(c[0])}</a>` : esc(c[0])}`).join('')}</div>
    <h1>${esc(title)}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
  </div>`;
}

// =============== トップページ ===============
export function homePage(ctx) {
  const { db, app } = ctx;
  const all = filterGroups(db, {});
  const pref = all.filter(g => g.level === 'prefecture');
  const nat = all.filter(g => g.level === 'national');
  const prefsWith = new Set(pref.map(g => g.pref_code)).size;
  const countries = new Set(all.flatMap(g => g.countries)).size;
  const sv = db.survey.prefectures || {};
  const surveyed1 = db.prefs.filter(p => (sv[p.code]?.stage1?.result || 'not_surveyed') !== 'not_surveyed').length;
  app.innerHTML = `
    <section class="hero">
      <h1>日本と世界のMOUマップ</h1>
      <p class="subtitle">どの国と、何を約束した？ 私たちの地域に何が起こる？</p>
      <p class="lead">日本の国（省庁）や都道府県が、海外の国・機関と結んだ ${term('MOU', 'MOU（覚書）')} を、地図と一覧で調べられるサイトです。
        「どの国と・いつ・何を約束し・税金をいくら使い・地域に何が起きたのか」を、公開された公式資料で確認できる範囲だけ載せています。</p>
    </section>
    <nav class="entrances" aria-label="4つの入口">
      <a class="entrance" href="#/map">${ICONS.map}<span><span class="t">日本地図から探す</span><br><span class="d">都道府県ごとの件数を色で表示。県をタップすると一覧が出ます。</span></span></a>
      <a class="entrance" href="#/country">${ICONS.globe}<span><span class="t">相手国から探す</span><br><span class="d">国名（日本語・英語）で、日本のどこと結んでいるかを逆引き。</span></span></a>
      <a class="entrance" href="#/field">${ICONS.tag}<span><span class="t">分野から探す</span><br><span class="d">外国人材・経済・教育・医療・観光など分野ごとに見る。</span></span></a>
      <a class="entrance" href="#/impact">${ICONS.home}<span><span class="t">地域への影響を見る</span><br><span class="d">合意した内容・実際に行われたこと・確認された変化を分けて整理。</span></span></a>
    </nav>
    <div class="stats" aria-label="登録状況">
      ${statTile('都道府県のMOU', pref.length, `${prefsWith}都道府県（公式資料で確認できたもの）`, '件')}
      ${statTile('国・省庁のMOU（全国枠）', nat.length, '外国人材関係のみ調査済み', '件')}
      ${statTile('相手国・地域', countries, '登録済みのMOUの相手', 'か国・地域')}
      ${statTile('第1段階の調査', `${surveyed1}/47`, '都道府県の外国人材・労働関係MOU', '')}
    </div>
    <div class="grid-2 section">
      <div>
        <h2 style="margin-top:0">都道府県別のMOU件数</h2>
        <div id="mini-map"></div>
        <div id="mini-legend"></div>
        <p><a class="btn" href="#/map">大きな地図で詳しく見る</a></p>
      </div>
      <div>
        <h2 style="margin-top:0">調査の進み具合</h2>
        ${stageTable(db)}
        <p class="small muted">全国のすべてのMOUを把握できたわけではありません。段階ごとに調べた範囲を示しています。<a href="#/about">調査範囲と方法</a></p>
        <h2>3ステップの使い方</h2>
        <ol class="steps">
          <li><b>入口を選ぶ</b>：地図・相手国・分野・地域への影響の4つから。</li>
          <li><b>条件を選ぶ</b>：県をタップ、国名を入力、分野を選ぶ。選んだ条件は地図の下に表示され、「×」でいつでも解除できます。</li>
          <li><b>詳しく見る</b>：協定の名前を押すと、正式名称・締結日・合意内容・予算・地域への影響・公式資料へのリンクが見られます。</li>
        </ol>
        <div class="note"><b>数字の読み方</b>：件数は「公式資料で確認できたもの」だけです。分からないものを0件・0円とはしていません。地図の模様は「該当なし（確認済み）」「調査したが確認できず」「未調査」を区別しています。</div>
      </div>
    </div>
    <h2>最近締結されたMOU</h2>
    ${mouList(db, sortGroups(all).slice(0, 6))}
    <p><a href="#/map">すべてのMOUを見る</a></p>`;
  const st = { mode: 'count', countries: [], field: 'labor', status: 'in_progress', impact: 'population', pref: null };
  const model = computeMapModel(db, st);
  const map = new JapanMap(app.querySelector('#mini-map'), db, { ariaLabel: '都道府県別MOU件数の地図', onClick: code => ctx.go('/map', { mode: 'count', p: code }) });
  map.update({ fill: model.fill, label: c => model.counts.get(c) ? String(model.counts.get(c)) : null, tip: c => `<b>${esc(db.prefByCode.get(c).name)}</b><br>${esc(model.tipLine(c))}`, selected: null });
  app.querySelector('#mini-legend').innerHTML = legendHTML(model.legendTitle, model.legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })));
}

function stageTable(db) {
  const st = db.survey.stages || [];
  return `<div class="table-wrap"><table><thead><tr><th>段階</th><th>内容</th><th>状況</th></tr></thead><tbody>
    ${st.map(s => `<tr><td class="nowrap">第${s.no}段階</td><td>${esc(s.title)}<br><span class="small muted">${esc(s.coverage || '')}</span></td><td><b>${esc(s.status_ja)}</b>${s.note ? `<br><span class="small muted">${esc(s.note)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// =============== 相手国から探す ===============
export function countryIndexPage(ctx) {
  const { db, app } = ctx;
  const list = countriesWithData(db);
  app.innerHTML = `${head([['相手国から探す']], '相手国から探す', '国名を日本語でも英語でも入力できます（例：「インドネシア」「Indonesia」「ベトナム」「Viet Nam」）。')}
    <div class="suggest"><input type="search" id="cq" placeholder="国名を入力" autocomplete="off" aria-label="国名で検索（日本語・英語）"><ul id="cs" hidden></ul></div>
    <h2>MOUが登録されている国・地域（${list.length}）</h2>
    <p class="small muted">数字は、国・省庁と都道府県を合わせた件数（公式資料で確認できたもの）です。</p>
    <div class="country-list">${list.map(([c, n]) => `<a href="#/country/${c}"><span class="country-btn">${esc(countryName(db, c))}<span class="c">${esc(db.countryByCode.get(c)?.en || '')}</span> ${n}件</span></a>`).join('')}</div>
    <div class="info">ここにない国は、まだMOUが登録されていない国です（「結んでいない」と確認できたわけではありません）。</div>`;
  bindSuggest(app.querySelector('#cq'), app.querySelector('#cs'), db, c => ctx.go('/country/' + c.code));
}

export function countryPage(ctx, code) {
  const { db, app } = ctx;
  const c = db.countryByCode.get(code);
  if (!c) return notFound(ctx, 'その国・地域は見つかりませんでした。');
  const p = db.prefByCode.has(ctx.params.get('p')) ? ctx.params.get('p') : null;
  const groups = filterGroups(db, { countries: [code], includeNews: settings.includeNews });
  const prefG = groups.filter(g => g.level === 'prefecture');
  const natG = groups.filter(g => g.level === 'national');
  const years = groups.flatMap(g => g.versions.map(v => yearOf(v.signed_date))).filter(Boolean);
  const nPref = new Set(prefG.map(g => g.pref_code)).size;
  const fieldCounts = FIELDS.map(f => ({ f, n: groups.filter(g => g.fields.includes(f.code)).length })).filter(x => x.n);
  const shownPref = p ? prefG.filter(g => g.pref_code === p) : prefG;
  app.innerHTML = `${head([['相手国から探す', '#/country'], [c.ja]], `${c.ja}（${c.en}）とのMOU`)}
    <div class="suggest" style="margin-bottom:12px"><input type="search" id="cq" placeholder="別の国を選ぶ（日本語・英語）" autocomplete="off" aria-label="別の国を検索"><ul id="cs" hidden></ul></div>
    ${newsToggleHTML()}
    <div class="stats">
      ${statTile('都道府県の締結', prefG.length, `${nPref}都道府県`, '件')}
      ${statTile('国・省庁の締結（全国枠）', natG.length, '都道府県とは別に数えています', '件')}
      ${statTile('締結年', years.length ? `${Math.min(...years)}〜${Math.max(...years)}` : '不明', '確認できた締結日の範囲', '')}
    </div>
    ${fieldCounts.length ? `<p><b>分野ごとの内訳：</b>${fieldCounts.map(x => `${esc(x.f.ja)} ${x.n}件`).join('／')}</p>` : ''}
    <div class="map-layout">
      <div><div id="map"></div><div id="legend"></div></div>
      <aside>
        <h2 style="margin-top:0">締結年ごとの件数</h2>
        <div id="years"></div>
        <p class="chart-caption">${esc(c.ja)}を相手とするMOU（国・都道府県の合計、更新・再締結は最初の締結年で1件）。</p>
        <div class="btn-row">
          <button type="button" class="btn" id="png">この国の締結状況を画像で保存</button>
          <button type="button" class="btn btn-outline" id="csv">CSVで保存</button>
        </div>
      </aside>
    </div>
    <div class="result-bar"><div class="now">いま表示している条件</div><div class="chips">
      <span class="chip chip-plain">相手国：${esc(c.ja)}</span>
      ${p ? `<span class="chip">都道府県：${esc(prefName(db, p))}<button type="button" id="rm-p" aria-label="都道府県の選択を解除">×</button></span>` : ''}
      <a class="btn btn-small btn-outline" href="#/country">別の国を選ぶ</a></div></div>
    <h2>国・省庁の締結（${natG.length}件）</h2>
    ${mouList(db, sortGroups(natG), { empty: `${c.ja}との国・省庁のMOUは登録されていません（第3段階は外国人材関係のみ調査済み）。` })}
    <h2>都道府県の締結（${p ? `${prefName(db, p)}：` : ''}${shownPref.length}件）</h2>
    ${mouList(db, sortGroups(shownPref).sort((a, b) => a.pref_code.localeCompare(b.pref_code)), { empty: `${c.ja}と都道府県のMOUは、確認できていません。` })}`;
  bindSuggest(app.querySelector('#cq'), app.querySelector('#cs'), db, x => ctx.go('/country/' + x.code));
  bindNewsToggle(app, () => countryPage(ctx, code));
  app.querySelector('#rm-p')?.addEventListener('click', () => ctx.go('/country/' + code, {}, { keepScroll: true }));
  const st = { mode: 'country', countries: [code], pref: p };
  const model = computeMapModel(db, st);
  const map = new JapanMap(app.querySelector('#map'), db, { ariaLabel: `${c.ja}とMOUを締結した都道府県の地図`, onClick: pc => ctx.go('/country/' + code, p === pc ? {} : { p: pc }, { keepScroll: true }) });
  map.update({ fill: model.fill, selected: p, label: x => model.counts.get(x) ? String(model.counts.get(x)) : null, tip: x => `<b>${esc(db.prefByCode.get(x).name)}</b><br>${esc(model.tipLine(x))}` });
  app.querySelector('#legend').innerHTML = legendHTML(model.legendTitle, model.legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })));
  vbar(app.querySelector('#years'), yearSeries(groups), { line: true, ariaLabel: '締結年ごとの件数' });
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(groups), `mou_country_${code}.csv`));
  app.querySelector('#png').addEventListener('click', () => {
    const side = [{ text: `国・省庁：${natG.length}件`, bold: true }, { text: `都道府県：${prefG.length}件（${nPref}都道府県）`, bold: true }];
    const byPref = [...model.counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pc, n]) => `${prefName(db, pc)} ${n}件`);
    if (byPref.length) side.push({ text: byPref.slice(0, 8).join('、') + (byPref.length > 8 ? ' ほか' : ''), size: 30 });
    if (fieldCounts.length) side.push({ text: '分野：' + fieldCounts.map(x => `${x.f.ja} ${x.n}`).join('、'), size: 28, color: '#56655c' });
    exportMap(db, {
      title: `${c.ja}と日本のMOU締結状況`, sub: '国・省庁と都道府県が締結したもの（公式資料で確認できた範囲）',
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

// =============== 分野から探す ===============
export function fieldIndexPage(ctx) {
  const { db, app } = ctx;
  const all = filterGroups(db, { includeNews: settings.includeNews });
  const rows = FIELDS.map(f => ({ f, pref: all.filter(g => g.level === 'prefecture' && g.fields.includes(f.code)).length, nat: all.filter(g => g.level === 'national' && g.fields.includes(f.code)).length }));
  app.innerHTML = `${head([['分野から探す']], '分野から探す', '分野を選ぶと、その分野のMOUを結んでいる都道府県が地図に表示されます。1つのMOUが複数の分野にまたがる場合は、それぞれの分野で数えています。')}
    ${newsToggleHTML()}
    <div class="note">${esc('「外国人材・労働」は47都道府県を調査済み（第1段階）です。ほかの分野は調査が一部だけ（第2段階）なので、件数は確認できた範囲のみで、実際より少ない可能性があります。')}</div>
    <div class="grid-2">
      ${rows.map(r => `<a class="card" href="#/map?mode=field&f=${r.f.code}" style="text-decoration:none;color:inherit;display:block">
        <h3 style="margin:0 0 4px">${esc(r.f.ja)}</h3>
        <p class="small muted" style="margin:0 0 6px">${esc(r.f.desc)}</p>
        <b>都道府県 ${r.pref}件</b>／国・省庁 ${r.nat}件　<span class="btn btn-small" style="margin-left:6px">地図で見る</span>
      </a>`).join('')}
    </div>
    <h2>分野別の件数</h2>
    <div id="chart"></div>
    <p class="chart-caption">母集団：このサイトに登録された、公式資料で確認できたMOU（国・都道府県）。時点：${esc(fmtDate(db.config.data_as_of))}。外国人材以外の分野は一部調査。</p>
    <div class="btn-row"><button type="button" class="btn" id="png">分野別件数グラフを画像で保存</button></div>`;
  bindNewsToggle(app, () => fieldIndexPage(ctx));
  const items = rows.map(r => ({ label: r.f.ja, value: r.pref + r.nat, tip: `<b>${esc(r.f.ja)}</b><br>都道府県 ${r.pref}件／国・省庁 ${r.nat}件`, onClick: () => ctx.go('/map', { mode: 'field', f: r.f.code }) }));
  hbar(app.querySelector('#chart'), items, { ariaLabel: '分野別のMOU件数' });
  app.querySelector('#png').addEventListener('click', () => exportBars({
    title: '分野別のMOU件数', sub: '国・省庁と都道府県の合計（外国人材以外の分野は一部調査）',
    items: [...items].sort((a, b) => b.value - a.value), meta: metaFor(db, all, '日本全国（国・47都道府県）'), filename: 'mou-fields.png',
  }));
}

// =============== 地域への影響 ===============
export function impactPage(ctx) {
  const { db, app } = ctx;
  const all = filterGroups(db, { includeNews: settings.includeNews });
  const withImpact = all.filter(g => g.impacts.length);
  const cnt = (cat, stage) => all.filter(g => g.impacts.some(i => i.category === cat && i.stage === stage)).length;
  app.innerHTML = `${head([['地域への影響を見る']], '地域への影響を見る', 'MOUによって地域に何が起きたのかを、6つの分野と3つの段階に分けて整理しています。')}
    <div class="grid-3">
      ${STAGES.map((s, i) => `<div class="card"><h3 style="margin:0 0 4px"><span class="stage-tag st-${s.code}">${i + 1}</span>${esc(s.ja)}</h3><p style="margin:0">${esc(s.desc)}</p></div>`).join('')}
    </div>
    <div class="note"><b>大切な注意</b>：「合意した内容（予定・目標）」と「実際に確認された変化」は別のものとして扱っています。
      また、外国人の人数などの統計の変化には、MOU以外の理由（制度の変更、景気、企業の採用など）も含まれます。行政資料がMOUの成果だと明記していない場合は、<b>「関連性は未確認」</b>と表示しています。</div>
    <h2>分野ごとの記録の数</h2>
    <p class="small muted">それぞれの段階について、記録があるMOUの件数です（全${all.length}件中）。記録がないことは「影響がない」という意味ではなく、「まだ資料で確認できていない」という意味です。</p>
    <div class="table-wrap"><table>
      <thead><tr><th>分野</th>${STAGES.map(s => `<th class="num">${esc(s.ja)}</th>`).join('')}<th>地図で見る</th></tr></thead>
      <tbody>${IMPACTS.map(i => `<tr><td><b>${esc(i.letter)}. ${esc(i.ja)}</b><br><span class="small muted">${esc(i.items)}</span></td>
        ${STAGES.map(s => `<td class="num">${cnt(i.code, s.code)}件</td>`).join('')}
        <td><a class="btn btn-small" href="#/map?mode=impact&i=${i.code}">地図</a></td></tr>`).join('')}</tbody>
    </table></div>
    <h2>影響の記録があるMOU（${withImpact.length}件）</h2>
    ${withImpact.length ? sortGroups(withImpact).map(g => `${mouCard(db, g)}<details><summary>この協定の影響の整理（6分野×3段階）を表示</summary>${impactGrid(db, g)}</details>`).join('') : '<p class="muted">まだ記録がありません。</p>'}
    <h3>参考統計について</h3>
    <p>都道府県のMOUには、相手国の国籍の人がその県に何人住んでいるか（在留外国人統計）と、特定技能で働く人の数を「参考統計」として自動で表示しています。これはMOUと関係なく県全体の数なので、すべて「関連性は未確認」として扱っています。</p>`;
}

// =============== 都道府県の詳細 ===============
export function prefPage(ctx, code) {
  const { db, app } = ctx;
  const p = db.prefByCode.get(code);
  if (!p) return notFound(ctx, 'その都道府県は見つかりませんでした。');
  const groups = sortGroups(filterGroups(db, { pref: code, level: 'prefecture', includeNews: settings.includeNews }));
  const planned = db.groups.filter(g => g.planned && g.pref_code === code);
  const newsOnly = settings.includeNews ? [] : db.groups.filter(g => !g.planned && !g.official && g.pref_code === code);
  const sv = db.survey.prefectures?.[code] || {};
  const countries = uniq(groups.flatMap(g => g.countries));
  const valid = groups.filter(g => validityState(g.latest) === 'valid').length;
  const projects = groups.reduce((a, g) => a + g.projects.length, 0);
  const fieldItems = FIELDS.map(f => ({ label: f.ja, value: groups.filter(g => g.fields.includes(f.code)).length })).filter(x => x.value);
  const s1 = sv.stage1?.result || 'not_surveyed', s2 = sv.stage2?.result || 'not_surveyed';
  const excl = (db.excluded || []).filter(x => x.pref === p.name);
  const cities = filterGroups(db, { pref: code, level: 'municipality', includeNews: settings.includeNews });
  app.innerHTML = `${head([['日本地図から探す', '#/map'], [p.name]], `${p.name}のMOU`)}
    <div class="chips" style="margin-bottom:10px">
      <span class="chip chip-plain">第1段階（外国人材・労働）：${esc(SURVEY_RESULT[s1])}${sv.stage1?.recheck ? '（要再調査）' : ''}</span>
      <span class="chip chip-plain">第2段階（その他の分野）：${esc(SURVEY_RESULT[s2])}</span>
    </div>
    ${newsToggleHTML()}
    <div class="stats">
      ${groups.length ? `
      ${statTile('MOU締結件数', groups.length, '公式資料で確認できたもの（更新は1件と数える）', '件')}
      ${statTile('相手国・地域の数', countries.length, '', 'か国・地域')}
      ${statTile('現在有効な協定', valid, '有効と確認できたもの（それ以外は有効期間が未確認）', '件')}
      ${statTile('実施事業の数', projects, '公式資料で確認できた関連事業', '件')}` : `
      ${statTile('MOU締結件数', '—', `${ZERO_STATES[zeroState(db, code, null)].ja}（0件という意味ではありません）`, '')}`}
    </div>
    ${countries.length ? `<p><b>相手国・地域：</b>${countries.map(c => `<a href="#/country/${c}" class="chip chip-plain">${esc(countryName(db, c))}</a>`).join(' ')}</p>` : ''}
    ${groups.length ? `<div class="grid-2">
      <div><h2>分野別の件数</h2><div id="fields"></div><p class="chart-caption">1つのMOUが複数の分野にまたがる場合はそれぞれで数えます。${s2 !== 'list_checked' ? '外国人材以外の分野は一部調査のため、実際より少ない可能性があります。' : ''}</p></div>
      <div><h2>締結年別の推移</h2><div id="years"></div><p class="chart-caption">棒：その年に新しく締結した件数／線：累計。更新・再締結は数えていません。</p></div>
    </div>` : `<div class="info">${esc(p.name)}のMOUは、${esc(ZERO_STATES[zeroState(db, code, null)].ja)}。${esc(ZERO_STATES[zeroState(db, code, null)].desc)}。</div>`}
    <h2>MOUの一覧（${groups.length}件）</h2>
    ${groups.map(g => prefMouBlock(db, g)).join('') || '<p class="muted">登録されたMOUはありません。</p>'}
    ${planned.length ? `<h2>締結予定・締結未確認（${planned.length}件、件数に含めていません）</h2>${planned.map(g => mouCard(db, g)).join('')}` : ''}
    ${cities.length ? `<h2>県内の市区町村のMOU（${cities.length}件、県の件数とは別）</h2>${mouList(db, sortGroups(cities))}` : ''}
    ${newsOnly.length ? `<div class="info">このほか、報道のみで公式資料を確認できていない情報が${newsOnly.length}件あります（上の「報道のみ…も含める」にチェックすると表示）。</div>` : ''}
    ${residentsTable(db, code, countries)}
    <h2>調査の記録</h2>
    <details><summary>${esc(p.name)}をどう調べたか</summary>
      <p><b>第1段階（外国人材・労働）：</b>${esc(SURVEY_RESULT[s1])}（確認日：${esc(fmtDate(sv.stage1?.checked, '—'))}${sv.stage1?.resurveyed ? '・再調査済み' : ''}${sv.stage1?.recheck ? '・要再調査' : ''}）${sv.stage1?.note ? `<br>${esc(sv.stage1.note)}` : ''}</p>
      ${(sv.stage1?.searched || []).length ? `<p class="small">調べた資料・方法：</p><ul class="small">${sv.stage1.searched.map(s => `<li>${linkify(s)}</li>`).join('')}</ul>` : ''}
      <p><b>第2段階（その他の分野）：</b>${esc(SURVEY_RESULT[s2])}${sv.stage2?.list_url ? `（<a href="${esc(sv.stage2.list_url)}" target="_blank" rel="noopener">確認した一覧</a>）` : ''}${sv.stage2?.note ? `<br>${esc(sv.stage2.note)}` : ''}</p>
    </details>
    ${excl.length ? `<details><summary>MOUとして登録しなかったもの（${excl.length}件）</summary>
      <p class="small muted">調査の中で見つかったが、姉妹・友好提携、国内機関どうしの協定、共同声明など、このサイトの「MOU」の範囲に入らないため登録しなかったものです。</p>
      <ul>${excl.map(x => `<li>${esc(x.title)}<br><span class="small muted">理由：${esc(x.reason)}</span>${x.url ? `　<a class="small" href="${esc(x.url)}" target="_blank" rel="noopener">資料</a>` : ''}</li>`).join('')}</ul>
    </details>` : ''}
    <div class="btn-row"><button type="button" class="btn btn-outline" id="csv">${esc(p.name)}のMOUをCSVで保存</button></div>`;
  bindNewsToggle(app, () => prefPage(ctx, code));
  if (groups.length) {
    hbar(app.querySelector('#fields'), fieldItems, { ariaLabel: '分野別の件数' });
    vbar(app.querySelector('#years'), yearSeries(groups), { line: true, ariaLabel: '締結年別の推移' });
  }
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous([...groups, ...planned]), `mou_pref_${code}.csv`));
}

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
      ['有効期間・更新条件', `${esc(m.validity || '未確認')}${m.renewal_terms ? `<br>${esc(m.renewal_terms)}` : ''}`],
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
    <b>MOUとの関連性は未確認</b>です（MOU以外の理由による増減を含む県全体の数）。</p>`;
}
function x0(r) { return r.periods[r.periods.length - 1]; }

// =============== 個別MOU ===============
export function mouPage(ctx, id) {
  const { db, app } = ctx;
  const m = db.mouById.get(id);
  if (!m) return notFound(ctx, '指定されたMOUは見つかりませんでした（IDが変わった可能性があります）。');
  const g = m._group;
  const isLatest = g.latest.id === m.id;
  const back = m.japan_level === 'national' ? [['国・省庁のMOU', '#/national']] : [[prefName(db, m.pref_code), `#/pref/${m.pref_code}`]];
  app.innerHTML = `${head(back.concat([['協定の詳細']]), m.title_ja)}
    ${m.title_original ? `<p class="muted" style="margin-top:-8px">${esc(m.title_original)}</p>` : ''}
    <p class="who" style="font-weight:700;font-size:1.05rem">${whoLine(db, m)}</p>
    <div class="meta" style="display:flex;flex-wrap:wrap;gap:6px">${statusBadge(m.status)} ${fieldBadges(m.fields)} <span class="badge b-doc">${esc(m.doc_type)}</span> ${evidenceBadge(m)}</div>
    ${!isLatest ? `<div class="info">この協定には、あとから結ばれた更新・修正の文書があります。最新：<a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(g.latest.title_ja)}（${esc(fmtDate(g.latest.signed_date))}）</a>。実施状況・予算・影響は、更新・修正の文書とあわせて表示しています。</div>` : ''}
    ${m.status === 'planned' ? `<div class="note">${esc(STATUS.planned.desc)}</div>` : ''}
    ${m.sources.length && m.sources.every(s => s.link_status) ? '<div class="note">この協定の公式資料のリンクは、現在すべて開けない状態です（ページの移動・削除やサイト側のエラー）。記録は確認日時点の資料にもとづいています。</div>' : ''}
    ${m.evidence_level === 'news_only' ? '<div class="note">この記録は報道のみにもとづいており、公式資料ではまだ確認できていません。初期設定では件数に含めていません。</div>' : ''}
    <div class="btn-row">
      <button type="button" class="btn" id="png-sum">要約を画像で保存</button>
      <button type="button" class="btn" id="png-imp">影響の整理図を画像で保存</button>
      <button type="button" class="btn btn-outline" id="csv">CSVで保存</button>
    </div>
    <h2>基本情報</h2>
    ${kvTable([
      ['正式名称', esc(m.title_ja)],
      m.title_original ? ['原語の正式名称', esc(m.title_original)] : null,
      ['文書の種類', `${esc(m.doc_type)}${m.doc_type_note ? `<br><span class="small muted">${esc(m.doc_type_note)}</span>` : ''}`],
      ['日本側の締結機関', `${esc(japanSideName(db, m))}${m.japan_signatory ? `<br>署名者：${esc(m.japan_signatory)}` : ''}${(m.other_japan_parties || []).length ? `<br>ほかの署名者：${esc(m.other_japan_parties.join('、'))}` : ''}`],
      ['相手国・地域', `<a href="#/country/${esc(m.country_code)}">${esc(countryName(db, m.country_code))}</a>`],
      ['相手機関', `${esc(m.partner_org)}${m.partner_org_en ? `<br><span class="small muted">${esc(m.partner_org_en)}</span>` : ''}<br>種別：<b>${esc(PARTNER_TYPES[m.partner_type] || '不明')}</b>`],
      ['締結日', `${esc(fmtDate(m.signed_date))}${m.date_note ? `<br><span class="small muted">${esc(m.date_note)}</span>` : ''}`],
      ['発表日', esc(fmtDate(m.announced_date, '—'))],
      ['分野', fieldBadges(m.fields) + ((m.labor_detail || []).length ? `<br><span class="small">関連する在留資格・分野：${esc(m.labor_detail.join('、'))}</span>` : '')],
      ['有効期間', esc(m.validity || '未確認')
        + (m.valid_until ? `<br>満了日の目安：<b>${esc(fmtDate(m.valid_until))}</b>${m.valid_until_note ? `<br><span class="small muted">${esc(m.valid_until_note)}</span>` : ''}` : '')
        + (m.valid_until && m.valid_until < today() && m.status !== 'expired' ? '<br><span class="causal">記載された有効期間は過ぎています（更新・延長の有無は公式資料で未確認）</span>' : '')],
      ['更新条件', esc(m.renewal_terms || '未確認')],
      [term('法的拘束力'), `${esc(LEGAL[m.legal_binding])}${m.legal_binding_note ? `<br><span class="small">${esc(m.legal_binding_note)}</span>` : ''}`],
      ['実施状況', `${statusBadge(m.status)} ${esc(m.status_note || '')}`],
      ['原文', esc(ORIGINAL[m.original_text] || ORIGINAL.unconfirmed)],
      ['確認の根拠', esc(EVIDENCE[m.evidence_level])],
      ['最終確認日', esc(fmtDate(m.last_checked))],
      ['データID', `<code>${esc(m.id)}</code>`],
    ])}
    <h2>協定の目的と合意内容</h2>
    <p><b>目的：</b>${esc(m.purpose || '公式資料に記載なし')}</p>
    ${m.content.length ? `<p><b>具体的な合意内容：</b></p><ul>${m.content.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p>具体的な合意内容：未確認</p>'}
    ${g.versions.length > 1 ? `<h2>更新・再締結の履歴</h2><p class="small muted">同じ協定の更新・再締結は、件数では1件として数えています。</p><ol>${g.versions.map(v => `<li>${v.id === m.id ? '<b>' : ''}<a href="#/mou/${encodeURIComponent(v.id)}">${esc(fmtDate(v.signed_date))}　${esc(v.title_ja)}</a>${v.id === m.id ? '</b>（このページ）' : ''}</li>`).join('')}</ol>` : ''}
    <h2>関連事業</h2>
    ${g.projects.length ? `<ul>${g.projects.map(p => `<li><b>${esc(p.name)}</b>${p.fiscal_year ? `（${esc(p.fiscal_year)}年度）` : ''}${p.detail ? `：${esc(p.detail)}` : ''}</li>`).join('')}</ul>` : '<p>このMOUに基づく具体的な事業は、公式資料ではまだ確認できていません（未確認）。</p>'}
    <h2>予算・税金</h2>
    ${budgetSection(db, g)}
    <h2>地域への影響</h2>
    <p class="small">「合意した内容」「実際に行われたこと」「地域で確認された変化」を分けています。統計の変化は、MOUとの関連性が確認できない限り「関連性は未確認」と表示します。</p>
    ${impactGrid(db, g)}
    <h2>情報源（公式資料・原文）</h2>
    ${g.versions.map(v => `${g.versions.length > 1 ? `<h3>${esc(fmtDate(v.signed_date))}の版</h3>` : ''}${sourceList(v.sources)}`).join('')}
    ${m.notes ? `<h2>備考</h2><p>${esc(m.notes)}</p>` : ''}`;

  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, g.versions, `mou_${m.id}.csv`));
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
      ['締結日', fmtDate(m.signed_date)],
      ['分野・文書の種類', `${m.fields.map(f => FIELD[f].ja).join('・')}／${m.doc_type}`],
      ['実施状況', STATUS[m.status].ja],
      ['法的拘束力', LEGAL[m.legal_binding]],
      ['関連予算', g.budgets.some(b => typeof b.amount_yen === 'number') ? g.budgets.filter(b => typeof b.amount_yen === 'number').map(b => `${fyLabel(b.fiscal_year)} ${fmtYenShort(b.amount_yen)}`).slice(0, 2).join('、') : '未確認'],
    ],
    purpose: m.purpose, points: m.content.slice(0, 4), meta, filename: `mou_${m.id}_summary.png`,
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
  const groups = sortGroups(filterGroups(db, { level: 'national', includeNews: settings.includeNews }));
  // 制度ごとに分けて表示（特定技能・技能実習・育成就労・その他）
  const KINDS = ['特定技能', '技能実習', '育成就労'];
  const kindOf = g => KINDS.find(k => [...g.latest.labor_detail || [], g.latest.title_ja].some(x => String(x).includes(k))) || 'その他（労働行政の協力など）';
  const kinds = [...KINDS, 'その他（労働行政の協力など）'].filter(k => groups.some(g => kindOf(g) === k));
  const stage3 = (db.survey.stages || []).find(s => s.no === 3);
  app.innerHTML = `${head([['国・省庁のMOU']], '国・省庁が締結したMOU（全国枠）', '日本政府・省庁が外国政府と結んだMOUです。都道府県の件数とは別に数えています。')}
    ${stage3 ? `<div class="note"><b>調査範囲：</b>${esc(stage3.coverage || '')}（${esc(stage3.status_ja)}）。${esc(stage3.note || '')}</div>` : ''}
    ${newsToggleHTML()}
    <div class="stats">${statTile('登録件数', groups.length, '更新・改正は1件と数える', '件')}${statTile('相手国・地域', uniq(groups.map(g => g.country_code)).length, '', 'か国・地域')}</div>
    ${kinds.map(k => {
      const gs = groups.filter(g => kindOf(g) === k);
      return `<h2>${esc(k)}（${gs.length}件）</h2>
      <div class="table-wrap"><table><thead><tr><th>相手国</th><th>締結日</th><th>相手機関</th><th>文書</th><th>状況</th></tr></thead><tbody>
        ${gs.sort((a, b) => (a.first.signed_date || '').localeCompare(b.first.signed_date || '')).map(g => `<tr><td><a href="#/country/${g.country_code}">${esc(countryName(db, g.country_code))}</a></td>
          <td class="nowrap"><a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(fmtDate(g.first.signed_date))}</a>${g.versions.length > 1 ? `<br><span class="small muted">更新・改正 ${g.versions.length - 1}回</span>` : ''}</td>
          <td>${esc(g.latest.partner_org)}</td><td>${esc(g.latest.doc_type)}</td><td>${statusBadge(g.status)}</td></tr>`).join('')}
      </tbody></table></div>`;
    }).join('')}
    <div class="btn-row"><button type="button" class="btn btn-outline" id="csv">国・省庁のMOUをCSVで保存</button></div>`;
  bindNewsToggle(app, () => nationalPage(ctx));
  app.querySelector('#csv').addEventListener('click', () => downloadMouCSV(db, groupsToMous(groups), 'mou_national.csv'));
}

// =============== 比較グラフ ===============
export function comparePage(ctx) {
  const { db, app } = ctx;
  const f = FIELD[ctx.params.get('f')] ? ctx.params.get('f') : '';
  const all = filterGroups(db, { includeNews: settings.includeNews, field: f || null });
  const pref = all.filter(g => g.level === 'prefecture');
  const nat = all.filter(g => g.level === 'national');
  const asOf = fmtDate(db.config.data_as_of);
  const scope = `母集団：このサイトに登録された、公式資料で確認できたMOU${settings.includeNews ? '（報道のみの情報を含む）' : ''}${f ? `のうち「${FIELD[f].ja}」` : ''}。時点：${asOf}。`;
  app.innerHTML = `${head([['比較グラフ']], '比較グラフ', 'グラフの棒や点にマウスを重ねる（スマートフォンではタップする）と数値が表示されます。')}
    <div class="control-group"><label class="label" for="fsel">分野で絞り込む</label>
      <select id="fsel"><option value="">すべての分野</option>${FIELDS.map(x => `<option value="${x.code}" ${x.code === f ? 'selected' : ''}>${esc(x.ja)}</option>`).join('')}</select>
      ${newsToggleHTML()}</div>
    <div class="note">件数は確認できた範囲のものです。外国人材・労働の分野は47都道府県を調査済みですが、ほかの分野は一部の調査です。グラフにない都道府県は「0件」ではなく「該当なし」「調査したが確認できず」「未調査」のいずれかです。</div>
    ${chartBlock('c1', '都道府県ごとのMOU締結件数', scope + '国・省庁の締結は含みません。')}
    ${chartBlock('c2', '相手国・地域別の締結件数', scope + '国・省庁と都道府県の合計。')}
    ${chartBlock('c3', '外国人材・労働関係のMOU件数（都道府県別）', `母集団：外国人材・労働の分野のMOU（第1段階：47都道府県を調査済み）。時点：${asOf}。`)}
    ${chartBlock('c4', '年ごとの締結件数の推移', scope + '国・都道府県の合計。更新・再締結は最初の締結年で1件。棒：その年の件数、線：累計。')}
    ${chartBlock('c5', '具体的な事業の実施が確認できたMOUの割合（都道府県別）', scope + '「具体的な事業が実施中」または「完了」のMOUの割合。分母はその都道府県の登録件数で、件数が少ない県は割合が大きく振れます（かっこ内の件数も見てください）。')}
    ${chartBlock('c6', '確認できた関連予算の比較（都道府県別）', '母集団：金額が公式資料で確認できた関連予算（計画予算）。未確認のものは含めていません（0円ではありません）。年度・事業の範囲は資料ごとに異なります。時点：' + asOf + '。')}`;
  app.querySelector('#fsel').addEventListener('change', e => ctx.go('/compare', e.target.value ? { f: e.target.value } : {}));
  bindNewsToggle(app, () => comparePage(ctx));

  const pc = countByPref(pref);
  const prefItems = [...pc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => ({ label: prefName(db, c), value: n, onClick: () => ctx.go('/pref/' + c) }));
  drawChart(app, 'c1', prefItems, 'hbar', { meta: metaFor(db, pref, '全国47都道府県（国・省庁の締結は含まない）') });

  const cc = new Map();
  for (const g of all) for (const c0 of g.countries) { const x = cc.get(c0) || { p: 0, n: 0 }; g.level === 'national' ? x.n++ : x.p++; cc.set(c0, x); }
  const cItems = [...cc].sort((a, b) => (b[1].p + b[1].n) - (a[1].p + a[1].n)).map(([c, x]) => ({ label: countryName(db, c), value: x.p + x.n, tip: `<b>${esc(countryName(db, c))}</b><br>都道府県 ${x.p}件／国・省庁 ${x.n}件`, onClick: () => ctx.go('/country/' + c) }));
  drawChart(app, 'c2', cItems, 'hbar', { meta: metaFor(db, all, '日本全国（国・47都道府県）') });

  const labor = filterGroups(db, { includeNews: settings.includeNews, field: 'labor', level: 'prefecture' });
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
function chartBlock(id, title, caption) {
  return `<section class="section" id="${id}-sec"><h2>${esc(title)}</h2><div id="${id}"></div><p class="chart-caption">${esc(caption)}</p>
    <button type="button" class="btn btn-small btn-outline" id="${id}-png">このグラフを画像で保存</button></section>`;
}
function drawChart(app, id, items, kind, opts) {
  const el = app.querySelector('#' + id);
  const sec = app.querySelector(`#${id}-sec`);
  if (!items.length) { el.innerHTML = '<p class="muted">表示できるデータがありません（未確認）。</p>'; sec.querySelector('button').remove(); return; }
  if (kind === 'hbar') hbar(el, items, opts); else vbar(el, items, { line: true, ...opts });
  sec.querySelector(`#${id}-png`).addEventListener('click', () => exportBars({
    title: sec.querySelector('h2').textContent, sub: '日本と世界のMOUマップ', unit: opts.unit,
    items: kind === 'vbar' ? items.filter(x => x.value).slice(-10) : items.slice(0, 10), meta: opts.meta, filename: `mou-${id}.png`,
  }));
}

// =============== 調査状況・使い方 ===============
export function aboutPage(ctx) {
  const { db, app } = ctx;
  const sv = db.survey.prefectures || {};
  const tiles = (key) => `<div class="pref-tiles">${db.prefs.map(p => {
    const r = sv[p.code]?.[key]?.result || 'not_surveyed';
    const re = sv[p.code]?.[key]?.recheck;
    return `<a class="pref-tile ps-${r}" href="#/pref/${p.code}">${esc(p.name)}<small>${esc(SURVEY_RESULT[r])}${re ? '<br><b>要再調査</b>' : ''}</small></a>`;
  }).join('')}</div>`;
  app.innerHTML = `${head([['調査状況・使い方']], '調査状況・使い方', `最終更新日：${esc(fmtDate(db.config.last_updated))}　データ確認日：${esc(fmtDate(db.config.data_as_of))}`)}
    <h2>調査の進み具合</h2>
    ${stageTable(db)}
    <h3>第1段階：47都道府県の外国人材・労働関係MOU</h3>
    ${tiles('stage1')}
    <p class="small muted">「該当なし（確認済み）」は公式資料で該当がないことを確認したもの。「調査したが確認できず」は調べたが公式資料で確認できなかったもの（存在しないとは限りません）。「要再調査」は、Web検索の回数上限などで確認が十分でなかったため、もう一度調べる必要がある都道府県です。</p>
    <h3>第2段階：都道府県のその他の分野のMOU</h3>
    ${tiles('stage2')}
    <p class="small muted">「公式一覧を確認済み」は、その都道府県が公開している海外との協定・覚書の一覧を確認したもの。「一部のみ調査」は調査の途中で見つかったものだけを登録しています。</p>

    <h2>このサイトで「MOU」として扱うもの</h2>
    <ul>
      <li>${term('MOU')}（了解覚書）、${term('MOC')}（協力覚書）、${term('覚書')}、Memorandum など、外国の政府・機関との協力の文書。</li>
      <li>名前が「協定」「合意書」でも、内容が同じ種類の協力文書の場合は「その他の協力文書」として種類を明記して登録します。</li>
      <li><b>含めないもの：</b>条約・経済連携協定（EPA）本体、姉妹都市・友好提携の協定書、一般的な交流宣言、締結予定のもの（予定は件数に含めず別に表示）。</li>
      <li>相手が「国そのもの（政府）」なのか、「省庁」「州・省などの地方政府」「公的機関・大学・団体・企業」なのかを区別して表示します。</li>
    </ul>
    <h2>調べ方と守っていること</h2>
    <ul>
      <li>優先した資料：外務省、出入国在留管理庁、厚生労働省などの省庁、47都道府県の公式サイト（報道発表・知事会見・担当課のページ）、都道府県議会の資料、予算書・決算書、政府統計、相手国政府の公式発表。</li>
      <li>できる限り協定の原文を確認し、原文がない場合は自治体の公式発表などを根拠に、確認できた範囲を明記しています。</li>
      <li>存在しないMOUを作らない／数字を推測で埋めない／出典の分からない情報を確定情報にしない／締結予定と締結済みを分ける／発表日と締結日を分ける／不明を0にしない／調査範囲が限られた数字を全国の総数として示さない。</li>
      <li>報道だけで公式資料が見つからないものは「報道のみ」と表示し、初期設定では件数に含めません。</li>
      <li>すべての記録に、情報源の名前・URL・確認日を付けています。</li>
    </ul>
    <h2>数字の読み方</h2>
    <ul>
      <li>件数は、同じ協定の更新・再締結を1件と数えます（二重計上をしません）。</li>
      <li>国の省庁が締結したMOUは、都道府県の件数に入れず「全国枠」として別に数えます。</li>
      <li>予算は、MOUそのものの予算ではなく「関連事業の予算」であることが多いので、その関係を表に明記しています。公表されていない金額は「未確認」と表示し、0円とはしません。</li>
      <li>「参考統計」（相手国の国籍の人の数など）は、MOUと関係のない理由による増減も含む県全体の数です。MOUとの関連性は未確認として扱います。</li>
    </ul>
    <h2>用語の説明</h2>
    <dl>${Object.entries(GLOSSARY).map(([k, v]) => `<dt><b>${esc(k)}</b></dt><dd style="margin:0 0 10px 1em">${esc(v)}</dd>`).join('')}</dl>
    <h2>地図データ</h2>
    <p>「国土数値情報（行政区域データ）」（国土交通省）<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html" target="_blank" rel="noopener">https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html</a> をもとに、スマートニュース メディア研究所が簡略化したデータ（<a href="https://github.com/smartnews-smri/japan-topography" target="_blank" rel="noopener">smartnews-smri/japan-topography</a>、商用・非商用を問わず無償で利用可）を加工して作成しました。国土数値情報の行政区域データはオープンデータとして提供されています（出典の記載が必要）。</p>
    <h2>誤りを見つけたら</h2>
    <p>内容の誤りや、掲載されていないMOUの情報（公式資料のURL付き）があれば、サイトの管理者までお知らせください。確認のうえ修正します。</p>`;
}

// =============== データ ===============
export function dataPage(ctx) {
  const { db, app } = ctx;
  const issues = validate(db);
  const errors = issues.filter(i => i.level === 'error'), warns = issues.filter(i => i.level === 'warn');
  app.innerHTML = `${head([['データ']], 'データのダウンロードと点検')}
    <h2>ダウンロード</h2>
    <div class="btn-row">
      <button type="button" class="btn" id="csv-all">すべてのMOUをCSVで保存（${db.mous.length}件）</button>
      <button type="button" class="btn btn-outline" id="csv-official">公式資料で確認できたものだけ</button>
    </div>
    <p class="small muted">CSVはExcelでそのまま開けます。更新・再締結は別の行になっており、「同一協定のグループ」列で同じ協定かどうかが分かります。締結予定・報道のみのものは「実施状況」「確認の根拠」列で区別できます。</p>
    <p>元データ（JSON）：<a href="data/mous/index.json">data/mous/</a>（都道府県ごとのファイル）、<a href="data/countries.json">countries.json</a>、<a href="data/survey.json">survey.json</a>、<a href="data/prefectures.json">prefectures.json</a></p>
    <h2>CSVの列</h2>
    <p class="small">${CSV_COLUMNS.map(esc).join('、')}</p>
    <h2>データ点検</h2>
    <p>データファイルの書き方に誤りがないかを、ここで自動チェックしています。データを追加したら、このページで確認してください。</p>
    ${errors.length ? `<div class="error"><b>直す必要がある誤り：${errors.length}件</b></div>` : '<div class="info"><b>誤りは見つかりませんでした。</b></div>'}
    ${issues.length ? `<div class="table-wrap"><table><thead><tr><th>種類</th><th>ファイル</th><th>ID</th><th>内容</th></tr></thead><tbody>
      ${[...errors, ...warns].map(i => `<tr><td>${i.level === 'error' ? '<b style="color:#b42318">誤り</b>' : '注意'}</td><td>${esc(i.file)}</td><td>${i.id !== '-' && db.mouById.has(i.id) ? `<a href="#/mou/${encodeURIComponent(i.id)}">${esc(i.id)}</a>` : esc(i.id)}</td><td>${esc(i.msg)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <p class="small muted">データの追加方法は <a href="docs/データの追加方法.md" target="_blank" rel="noopener">docs/データの追加方法.md</a> を見てください。</p>`;
  app.querySelector('#csv-all').addEventListener('click', () => downloadMouCSV(db, db.mous, 'mou_all.csv'));
  app.querySelector('#csv-official').addEventListener('click', () => downloadMouCSV(db, db.mous.filter(m => m._official && m.status !== 'planned'), 'mou_official.csv'));
}

// =============== 検索 ===============
export function searchPage(ctx) {
  const { db, app } = ctx;
  const q = ctx.params.get('q') || '';
  const groups = q ? sortGroups(filterGroups(db, { q, includeNews: true })) : [];
  const cs = q ? findCountries(db, q).slice(0, 10) : [];
  const ps = q ? db.prefs.filter(p => p.name.includes(q) || p.short === q || p.en.toLowerCase().includes(q.toLowerCase())) : [];
  app.innerHTML = `${head([['検索']], `「${q}」の検索結果`)}
    ${cs.length ? `<h2>国・地域</h2><div class="country-list">${cs.map(c => `<a href="#/country/${c.code}"><span class="country-btn">${esc(c.ja)}<span class="c">${esc(c.en)}</span></span></a>`).join('')}</div>` : ''}
    ${ps.length ? `<h2>都道府県</h2><div class="country-list">${ps.map(p => `<a href="#/pref/${p.code}"><span class="country-btn">${esc(p.name)}</span></a>`).join('')}</div>` : ''}
    <h2>MOU（${groups.length}件）</h2>
    ${mouList(db, groups, { empty: '見つかりませんでした。言葉を短くしたり、国名・県名で探してみてください。' })}`;
  const input = document.getElementById('global-q');
  if (input) input.value = q;
}

export function notFound(ctx, msg) {
  ctx.app.innerHTML = `${head([['見つかりません']], 'ページが見つかりません')}<p>${esc(msg || '')}</p><p><a class="btn" href="#/">トップへ戻る</a></p>`;
}

export { seqScale };
