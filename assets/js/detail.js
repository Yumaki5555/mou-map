// 協定1件の詳しいページ（一覧で「詳しく見る」を押したときだけ、その協定が入っている元のデータを読んで表示します）
// 並び：要点 → ①締結主体 → ②締結日 → ③協定の正式名称と内容 → ④有効性 → ⑤原文・公式資料 → ⑥事業の実施状況 → ⑦具体的な人数・予算 → ⑧地域への影響 → ⑨出典・調査状況
// データがない項目は推測で埋めず、「未確認」「調査したが確認できず」などと書きます。
import { esc, fmtDate, fmtYenShort } from './util.js';
import {
  STATUS, IMPACTS, STAGES, PARTNER_TYPES, LEGAL, EVIDENCE, ORIGINAL, VALIDITY, DOC_CATEGORY, DOC_KIND, RELATION, NUMBER_KINDS, ACCEPTANCE_TYPES,
  JAPAN_ORG_TYPE, PAIR_KIND, countryName, prefName, japanSideName,
} from './data.js';
import {
  validityBadge, statusBadge, fieldBadges, kvTable, validityDetail, numbersSection, impactGrid, budgetSection, sourceList, researchTable,
  autoStatsFor, fyLabel, sideLabel,
} from './components.js';
import { orgParts } from './orgs.js';

const SECTIONS = ['締結主体', '締結日', '正式名称・内容', '有効性', '原文・公式資料', '事業の実施状況', '人数・予算', '地域への影響', '出典・調査状況'];
const PRIMARY = ['original_text', 'official_page', 'press_release', 'partner_official', 'assembly_minutes'];

export function detailPage(ctx, id) {
  const { db, app } = ctx;
  const m = db.mouById.get(id);
  if (!m || m._lite) {
    app.innerHTML = `<div class="page-head"><div class="crumbs"><a href="#/">トップ</a> ＞ <a href="#/map">協定を探す</a></div><h1>協定が見つかりません</h1></div>
      <p>指定された協定は見つかりませんでした（データのIDが変わった可能性があります）。</p><p><a class="btn" href="#/map">協定を探す</a></p>`;
    return;
  }
  const g = m._group;
  const isLatest = g.latest.id === m.id;
  const fromList = ['/map', '/search'].includes(ctx.prevPath);
  const orgKey = m.japan_level === 'organization' ? orgParts(m.japan_org).key : null;
  const publishers = [...new Set(m.sources.map(s => s.publisher).filter(Boolean))];
  const summary = (m.summary && m.summary.length ? m.summary : [m.purpose, ...m.content]).filter(Boolean).slice(0, 3);
  const systems = m.related_systems.map(k => db.systemByKey?.get(k) || { name: k });
  const accTypes = m.acceptance_types.map(t => ACCEPTANCE_TYPES[t] || t);
  const real = g.impacts.filter(i => !i._auto);
  const implemented = real.filter(i => i.stage === 'implemented');
  const resultNums = g.versions.flatMap(v => v.numbers.filter(n => ['actual_entry', 'actual_employed', 'current_residents'].includes(n.kind)));
  const S = (i, extra = '') => `<section class="ds" id="ds-${i}" aria-labelledby="ds-${i}-h"><h2 id="ds-${i}-h"><span class="ds-n">${'①②③④⑤⑥⑦⑧⑨'[i - 1]}</span>${SECTIONS[i - 1]}${extra}</h2>`;
  const v = VALIDITY[g.validity] || VALIDITY.unconfirmed;
  const s = STATUS[g.status] || STATUS.unknown;
  const jpName = japanSideName(db, m);
  const jpLink = m.japan_level === 'organization' ? `<a href="#/actors?o=${encodeURIComponent(orgKey)}">${esc(jpName)}</a>`
    : m.japan_level === 'prefecture' ? `<a href="#/pref/${esc(m.pref_code)}">${esc(jpName)}</a>`
      : m.japan_level === 'municipality' && m.municipality_code ? `<a href="#/city/${esc(m.municipality_code)}">${esc(jpName)}</a>` : esc(jpName);
  const partners = [{ country_code: m.country_code, partner_org: m.partner_org, partner_org_en: m.partner_org_en }, ...m.additional_partners];
  const primary = m.sources.filter(x => PRIMARY.includes(x.type)).sort((a, b) => PRIMARY.indexOf(a.type) - PRIMARY.indexOf(b.type));
  const impactSummary = IMPACTS.map(cat => {
    const items = real.filter(i => i.category === cat.code && i.stage !== 'agreed');
    const agreed = g.impacts.filter(i => i.category === cat.code && i.stage === 'agreed');
    const state = items.length ? `${items.length}件の記録` : agreed.length ? '合意内容のみ' : '記録なし（未確認）';
    return `<li class="${items.length ? 'has' : agreed.length ? 'agreed' : 'none'}"><b>${esc(cat.ja)}</b><span>${esc(state)}</span></li>`;
  }).join('');
  const back = fromList
    ? '<button type="button" class="btn btn-small btn-outline back-btn" id="back">← 一覧に戻る（条件はそのまま）</button>'
    : '<a class="btn btn-small btn-outline back-btn" href="#/map">← 協定を探す</a>';

  app.innerHTML = `<div class="page-head">
      <div class="crumbs"><a href="#/">トップ</a> ＞ <a href="#/map">協定を探す</a> ＞ 協定の詳細</div>
      <p class="back-row">${back}</p>
      <p class="d-who">${esc(sideLabel(db, g))} <span aria-label="と">⇄</span> ${esc(partners.map(p => `${countryName(db, p.country_code)}・${p.partner_org || '相手機関不明'}`).join(' ／ '))}</p>
      <h1 class="d-title">${esc(m.title_ja)}</h1>
      ${m.title_original ? `<p class="muted d-orig">${esc(m.title_original)}</p>` : ''}
    </div>
    <div class="d-key">
      <dl class="d-facts">
        <div><dt>締結主体</dt><dd>${jpLink}<br><span class="small muted">${esc(JAPAN_ORG_TYPE[m._orgType]?.ja || '')}</span></dd></div>
        <div><dt>締結日</dt><dd>${esc(fmtDate(m.signed_date))}${!m.signed_date && m.announced_date ? `<br><span class="small muted">発表：${esc(fmtDate(m.announced_date))}</span>` : ''}</dd></div>
        <div><dt>有効性</dt><dd><span class="vb vb-${esc(v.code)}">${esc(v.ja)}</span></dd></div>
        <div><dt>事業の実施状況</dt><dd><span class="st st-${esc(s.code)}">${esc(s.ja)}</span></dd></div>
      </dl>
      ${m.blurb ? `<p class="d-blurb">${esc(m.blurb)}</p>` : ''}
      <p class="small muted d-keynote">有効性（協定が今も効力を持っているか）と、事業の実施状況（協定に基づく具体的な事業が行われているか）は、別々に確認しています。</p>
    </div>
    ${m.japan_level === 'organization' ? `<div class="info">この協定は<b>${esc(JAPAN_ORG_TYPE[m._orgType]?.ja || '団体・企業など')}</b>が締結したものです。日本政府や都道府県が当事者として締結した協定ではないため、国・都道府県の件数には含めていません（本部の所在地を理由に都道府県の件数へ加えることもしていません）。${m.ceremony_note ? '政府が署名・交換の場に立ち会っていても、当事者として締結したことにはなりません。' : ''}</div>` : ''}
    ${m.japan_level === 'national' ? '<div class="info">国・省庁の協定は全国が対象です。どの都道府県の件数にも含めていません。</div>' : ''}
    ${!isLatest ? `<div class="info">この協定には、あとから結ばれた更新・修正の文書があります。最新：<a href="#/mou/${encodeURIComponent(g.latest.id)}">${esc(g.latest.title_ja)}（${esc(fmtDate(g.latest.signed_date))}）</a>。有効性・実施状況・予算・影響は、更新・修正の文書とあわせて表示しています。</div>` : ''}
    ${m._validity === 'planned' ? `<div class="note">${esc(STATUS.planned.desc)}</div>` : ''}
    ${m.sources.length && m.sources.every(x => x.link_status) ? '<div class="note">この協定の公式資料のリンクは、現在すべて開けない状態です（ページの移動・削除やサイト側のエラー）。記録は確認日時点の資料にもとづいています。</div>' : ''}
    ${m.evidence_level === 'news_only' ? '<div class="note">この記録は報道のみにもとづいており、公式資料ではまだ確認できていません。初期設定では件数に含めていません。</div>' : ''}
    <nav class="ds-toc" aria-label="このページの目次">${SECTIONS.map((t, i) => `<a href="#/mou/${encodeURIComponent(m.id)}?to=ds-${i + 1}" data-jump="ds-${i + 1}">${'①②③④⑤⑥⑦⑧⑨'[i]} ${t}</a>`).join('')}</nav>

    ${S(1)}
      ${kvTable([
        ['日本側の締結主体', `${jpLink}${m.japan_level === 'national' ? '<br><span class="small muted">全国が対象（都道府県の件数には含めません）</span>' : ''}
          <br><span class="small muted">種別：${esc(JAPAN_ORG_TYPE[m._orgType]?.ja || '不明')}／当事者の組み合わせ：${esc(PAIR_KIND[m._pairKind]?.ja || '不明')}（${esc(PAIR_KIND[m._pairKind]?.desc || '')}）</span>`],
        ['相手国・相手側の締結主体', partners.map(p => `<a href="#/map?c=${esc(p.country_code)}">${esc(countryName(db, p.country_code))}</a>・${esc(p.partner_org || '相手機関不明')}${p.partner_org_en ? `<br><span class="small muted">${esc(p.partner_org_en)}</span>` : ''}`).join('<br>') + `<br><span class="small muted">相手の種別：${esc(PARTNER_TYPES[m.partner_type] || '不明')}</span>`],
        ['署名者', `${esc(m.japan_signatory || '未確認')}${m.partner_signatory ? `<br>相手側：${esc(m.partner_signatory)}` : ''}`],
        (m.other_japan_parties || []).length ? ['ほかに名前を連ねた機関', esc(m.other_japan_parties.join('、'))] : null,
        m.ceremony_note ? ['署名・交換の場', esc(m.ceremony_note)] : null,
        m.related_regions.length ? ['関連事業の地域', `${m.related_regions.map(r => `<a href="#/map?p=${esc(r.pref_code)}">${esc(prefName(db, r.pref_code))}</a>：${esc(r.text || '内容未確認')}`).join('<br>')}<br><span class="small muted">事業が行われた地域です。締結した地域ではないため、その都道府県の件数には含めていません。</span>`] : null,
        ['情報源（出典の資料を出した機関）', `${esc(publishers.join('、') || '記録なし')}<br><span class="small muted">資料を公表した機関で、協定の当事者（締結主体）とは限りません。</span>`],
      ])}
    </section>

    ${S(2)}
      ${kvTable([
        ['締結日', esc(fmtDate(m.signed_date, '未確認'))],
        ['発表日', esc(fmtDate(m.announced_date, '—'))],
        ['発効日・開始日', esc(fmtDate(m.effective_date, '未確認'))],
        m.date_note ? ['日付の補足', esc(m.date_note)] : null,
      ])}
      ${g.versions.length > 1 ? `<h3 class="h-sm">更新・再締結・後継の履歴（${g.versions.length}文書。件数は1件と数えます）</h3><ol class="d-hist">${g.versions.map(x => `<li>${x.id === m.id ? '<b>' : ''}<a href="#/mou/${encodeURIComponent(x.id)}">${esc(fmtDate(x.signed_date))}　${esc(x.title_ja)}</a>${x.id === m.id ? '</b>（このページ）' : ''} ${validityBadge(x._validity)}</li>`).join('')}</ol>` : ''}
    </section>

    ${S(3)}
      ${kvTable([
        ['正式名称', `${esc(m.title_ja)}${m.title_original ? `<br><span class="small muted">原語：${esc(m.title_original)}</span>` : ''}`],
        ['文書の種類', `${esc(DOC_KIND[m._kind]?.ja || DOC_CATEGORY[m.doc_category]?.ja || '')}<br><span class="small muted">文書の表記：${esc(m.doc_type)}${m.doc_type_note ? `／${esc(m.doc_type_note)}` : ''}</span>`],
        ['協定の目的', esc(m.purpose || '公式資料に記載なし')],
        ['合意内容', m.content.length ? `<ul class="tight">${m.content.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : (summary.length ? `<ul class="tight">${summary.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '未確認')],
        ['分野', fieldBadges(m.fields) + ((m.labor_detail || []).length ? `<br><span class="small">関連する在留資格・分野：${esc(m.labor_detail.join('、'))}</span>` : '')],
        ['外国人の受入れとの関係', `<b>${esc(RELATION[m._relation].ja)}</b><br><span class="small muted">${esc(RELATION[m._relation].desc)}${m.foreign_relation ? '' : '（合意内容の記載からこのサイトが分類）'}</span>`],
        ['対象となる制度', systems.length ? systems.map(x => `${esc(x.name)}${x.state ? `<span class="small muted">（${x.state === 'in_force' ? '実施中' : '開始予定'}${x.start ? '：' + esc(fmtDate(x.start)) : ''}）</span>` : ''}`).join('<br>') : esc((m.labor_detail || []).join('、') || '未確認')],
        ['就労・留学・研修などの区別', esc(accTypes.join('、') || (m._relation === 'general' ? '該当なし' : '未確認'))],
        ['法的拘束力', `${esc(LEGAL[m.legal_binding])}${m.legal_nature ? `<br><span class="small">${esc(m.legal_nature)}</span>` : ''}${m.legal_binding_note ? `<br><span class="small">${esc(m.legal_binding_note)}</span>` : ''}`],
        (m.related_ids || []).length ? ['関連する文書', m.related_ids.map(r => db.mouById.get(r)).filter(Boolean).map(r => `<a href="#/mou/${encodeURIComponent(r.id)}">${esc(r.title_ja)}</a>（${esc(DOC_CATEGORY[r.doc_category]?.ja || '')}）`).join('<br>')] : null,
      ])}
    </section>

    ${S(4)}
      <p>${validityBadge(g.validity, { prefix: false })} <span class="small">${esc(v.desc)}</span></p>
      ${validityDetail(db, m, g)}
    </section>

    ${S(5)}
      ${kvTable([
        ['原文', esc(ORIGINAL[m.original_text] || ORIGINAL.unconfirmed)],
        ['確認の根拠', esc(EVIDENCE[m.evidence_level])],
      ])}
      ${primary.length ? `<h3 class="h-sm">原文・公式の資料</h3>${sourceList(primary)}` : '<p>原文・公式発表の資料は登録されていません（下の「出典・調査状況」に、確認に使った資料があります）。</p>'}
    </section>

    ${S(6)}
      <p>${statusBadge(m.status)} ${esc(m.status_note || '')}</p>
      <p class="small muted">協定が有効かどうか（④）とは別に、協定に基づく具体的な事業（人材の受入れ・研修・説明会など）が公式資料で確認できたかを示しています。</p>
      ${g.projects.length || implemented.length ? `<div class="table-wrap"><table><thead><tr><th>行われたこと</th><th>時期</th><th>担当</th></tr></thead><tbody>
        ${g.projects.map(p => `<tr><td><b>${esc(p.name)}</b>${p.detail ? `<br>${esc(p.detail)}` : ''}</td><td class="nowrap">${p.fiscal_year ? esc(fyLabel(p.fiscal_year)) : '未確認'}</td><td>${esc(p.agency || '未確認')}</td></tr>`).join('')}
        ${implemented.map(i => `<tr><td>${esc(i.text)}${i.causality === 'unconfirmed' ? '<br><span class="causal">協定との関連性は未確認</span>' : ''}</td><td class="nowrap">${i.fiscal_year ? esc(fyLabel(i.fiscal_year)) : '未確認'}</td><td>—</td></tr>`).join('')}
      </tbody></table></div>` : '<p>この協定に基づく具体的な事業は、公式資料ではまだ確認できていません（未確認）。</p>'}
      ${(m.agencies || []).length ? `<p class="small">担当機関：${esc(m.agencies.join('、'))}</p>` : ''}
    </section>

    ${S(7)}
      <h3 class="h-sm">人数（目標・上限・実績）</h3>
      ${numbersSection(m)}
      ${resultNums.length ? `<p class="small">受入れ実績の記録：${resultNums.map(n => `${esc(n.label)} ${n.value == null ? '数値未確認' : esc(Number(n.value).toLocaleString('ja-JP') + (n.unit || '人'))}${n.period ? `（${esc(n.period)}）` : ''}`).join('／')}</p>` : ''}
      <h3 class="h-sm">予算・支出</h3>
      ${budgetSection(db, g)}
    </section>

    ${S(8)}
      <ul class="imp-sum">${impactSummary}</ul>
      <p class="small">「合意した内容」「実際に行われたこと」「地域で確認された変化」を分けています。統計の変化は、協定との関連性が確認できない限り「関連性は未確認」と表示します。</p>
      <details><summary>6分野×3段階の整理表を開く</summary>${impactGrid(db, g)}</details>
    </section>

    ${S(9)}
      ${systems.some(x => x.sources?.length) ? `<p><b>関連する国内制度の資料：</b>${systems.filter(x => x.sources?.length).map(x => x.sources.map(y => `<a href="${esc(y.url)}" target="_blank" rel="noopener">${esc(y.title || x.name)}</a>`).join('、')).join('、')}</p>` : ''}
      ${g.versions.map(x => `${g.versions.length > 1 ? `<h3 class="h-sm">${esc(fmtDate(x.signed_date))}の版</h3>` : ''}${sourceList(x.sources)}`).join('')}
      <p class="small muted">最終確認日：${esc(fmtDate(m.last_checked))}／有効性の確認日：${esc(fmtDate(m.validity_checked, '未確認'))}／データID：<code>${esc(m.id)}</code></p>
      <details><summary>項目ごとの調査状況（確認済み・調査したが確認できず・未調査）</summary>${researchTable(m)}</details>
      ${m.notes ? `<h3 class="h-sm">備考（分析・注意）</h3><p>${esc(m.notes)}</p>` : ''}
      ${(m.unconfirmed || []).length ? `<h3 class="h-sm">調べたが確認できなかったこと</h3><ul>${m.unconfirmed.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    </section>

    <div class="btn-row">
      <button type="button" class="btn btn-outline" id="png-sum">要約を画像で保存</button>
      <button type="button" class="btn btn-outline" id="png-imp">影響の整理図を画像で保存</button>
      <button type="button" class="btn btn-outline" id="csv">CSVで保存</button>
      ${back}
    </div>`;

  app.querySelectorAll('#back').forEach(b => b.addEventListener('click', () => history.back()));
  app.querySelector('#csv').addEventListener('click', async () => {
    const csv = await import('./csv.js');
    csv.downloadMouCSV(db, g.versions, `mou_${m.id}.csv`, `協定1件「${m.title_ja}」の全文書（更新・後継の版を含む）`);
  });
  const region = m.japan_level === 'national' ? '日本（国）' : m.japan_level === 'organization' ? jpName : prefName(db, m.pref_code);
  const meta = {
    region: `${region} × ${countryName(db, m.country_code)}`,
    period: `締結 ${fmtDate(m.signed_date)}〜${fmtDate(db.config.data_as_of)}時点`,
    source: m.sources.slice(0, 2).map(x => x.publisher + '「' + (x.title || '') + '」').join('、') + (m.sources.length > 2 ? ' ほか' : ''),
    checked: fmtDate(m.last_checked || db.config.data_as_of),
  };
  app.querySelector('#png-sum').addEventListener('click', async () => {
    const ex = await import('./export.js');
    ex.exportMouSummary({
      who: `${jpName} ⇄ ${countryName(db, m.country_code)}・${m.partner_org}`,
      title: m.title_ja,
      facts: [
        ['締結日・文書の種類', `${fmtDate(m.signed_date)}／${DOC_CATEGORY[m.doc_category]?.ja || m.doc_type}`],
        ['現在の有効性', `${VALIDITY[g.validity].ja}（${fmtDate(m.validity_checked, '確認日不明')}確認）`],
        ['事業の実施状況', STATUS[g.status]?.ja || '未確認'],
        ['法的拘束力', LEGAL[m.legal_binding]],
        ['関連予算', g.budgets.some(b => typeof b.amount_yen === 'number') ? g.budgets.filter(b => typeof b.amount_yen === 'number').map(b => `${fyLabel(b.fiscal_year)} ${fmtYenShort(b.amount_yen)}`).slice(0, 2).join('、') : '未確認'],
      ],
      purpose: m.purpose || summary[0], points: (m.numbers.length ? m.numbers.slice(0, 2).map(n => `${NUMBER_KINDS.find(k => k.code === n.kind)?.ja || n.kind}：${n.label} ${n.value == null ? '未確認' : Number(n.value).toLocaleString('ja-JP') + (n.unit || '人')}`) : []).concat(m.content).slice(0, 4), meta, filename: `mou_${m.id}_summary.png`,
    });
  });
  app.querySelector('#png-imp').addEventListener('click', async () => {
    const ex = await import('./export.js');
    const stats = autoStatsFor(db, g).map(x => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    ex.exportImpactGrid({
      title: `地域への影響の整理：${jpName}×${countryName(db, m.country_code)}`,
      sub: m.title_ja,
      stages: STAGES.map(x => x.ja),
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
