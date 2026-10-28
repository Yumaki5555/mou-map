// 画面の部品（MOUカード、バッジ、出典一覧、影響の表、予算の表など）
import { esc, fmtDate, fmtYen, fmtNum, today } from './util.js';
import {
  FIELD, STATUS, IMPACTS, STAGES, CAUSALITY, PARTNER_TYPES, LEGAL, EVIDENCE, PAYERS, BUDGET_KIND, SOURCE_TYPES,
  VALIDITY, VALIDITIES, VALIDITY_SCOPE, VALIDITY_REASONS, DOC_CATEGORY, DOC_KIND, RELATION, NUMBER_KIND, ACCEPTANCE_TYPES, RESEARCH_STATES, AUTO_RENEWAL,
  JAPAN_ORG_TYPE, PAIR_KIND, LEVEL_ORDER, LEVEL_SHORT,
  countryName, prefName, japanSideName, residentChange, sswCount, validityCounts, validityInfo, termEnd, researchStatus,
} from './data.js';

// 用語の説明（タップでも読めるよう、クリックで小さく表示）
export const GLOSSARY = {
  'MOU': 'Memorandum of Understanding（了解覚書）。お互いの考えや協力の方針を文書にしたもの。多くは法的な義務を生まない約束です。',
  'MOC': 'Memorandum of Cooperation（協力覚書）。MOUとほぼ同じ種類の、協力の方針を確認する文書です。',
  '覚書': '協力の内容や方針を確認するための文書。条約とは違い、ふつうは国会の承認を必要としません。',
  '法的拘束力': '守らなかった場合に法的な責任を問えるかどうか。MOUの多くは「法的拘束力はない」と明記しています。',
  '特定技能': '人手不足の分野で、一定の技能と日本語力がある外国人が働ける在留資格（2019年4月に始まった制度）。',
  '技能実習': '開発途上国の人が日本で技能を学ぶための制度。2027年から「育成就労」制度に変わる予定です。',
  '育成就労': '技能実習に代わる新しい制度。人材の育成と確保を目的とし、2027年4月に始まる予定です。',
  '在留資格': '外国人が日本に住み、活動するための資格（就労・留学・家族滞在など）。',
  '送出機関': '外国人材を日本へ送り出す、相手国側の機関・会社。',
  '決算額': 'その年度に実際に使われたお金の額。計画（予算）とは違うことがあります。',
  '当初予算': '年度の初めに議会で決まった予算。年度の途中で補正されることがあります。',
  '一次資料': '協定の原文、役所の発表、議会の記録、統計など、元になった公式の資料。',
  'EPA': '経済連携協定。貿易だけでなく人の移動なども含む条約で、国会の承認を経て結びます。インドネシア・フィリピン・ベトナムからの看護師・介護福祉士候補者の受入れの根拠になっています。',
  '交換公文': '政府どうしが書簡（公文）を交わして合意する国際約束。',
  'ワーキング・ホリデー': '若い人が相手国で休暇を過ごしながら、旅行費用を補うために働くことも認める制度。国・地域ごとの取決めに基づきます。',
  '共同声明': '首脳会談などで、両国の考えや目標を示す文書。人数の目標などは政治的なもので、法的な受入れ義務ではありません。',
  '有効性': 'その協定が今も効力を持っているか。このサイトでは、公式資料で確認できたものだけを「有効確認」とし、分からないものは「有効性未確認」としています。',
};

// ---------- 有効性・文書の種類・受入れとの関係のバッジ ----------
export function validityBadge(code, opts = {}) {
  const v = VALIDITY[code] || VALIDITY.unconfirmed;
  return `<span class="badge vb vb-${esc(v.code)}" title="${esc(v.desc)}">${opts.prefix === false ? '' : '有効性：'}${esc(v.ja)}</span>`;
}
export function categoryBadge(code) {
  const c = DOC_CATEGORY[code] || DOC_CATEGORY.mou_moc;
  return `<span class="badge b-cat b-cat-${esc(c.code)}" title="${esc(c.desc)}">${esc(c.ja)}</span>`;
}
// 文書の種類の詳しい区分（MOU／MOC／協定書・合意書など／R/D／EPA…）
export function kindBadge(code) {
  const k = DOC_KIND[code] || DOC_KIND.mou_other;
  return `<span class="badge b-cat b-cat-${esc(k.cat)}" title="${esc(k.desc)}">${esc(k.ja)}</span>`;
}
export function relationBadge(code) {
  const r = RELATION[code] || RELATION.unconfirmed;
  return `<span class="badge b-rel b-rel-${esc(r.code)}" title="${esc(r.desc)}">外国人の受入れ：${esc(r.ja)}</span>`;
}

// 有効性の5区分の件数（トップ・都道府県・相手国・国の一覧で同じ部品）
// groups に締結予定を含めてもよい（opts.planned で別に件数を足すこともできる）。
// opts.split：都道府県と国・省庁の件数を分けて表示／opts.link(code)：区分ごとの一覧へのリンク／
// opts.scope：いまの数え方に入る区分に「表示中」の印を付ける
const VT_ORDER = ['valid_confirmed', 'ended_confirmed', 'unconfirmed', 'signed_not_started', 'planned'];
const VT_DESC = {
  valid_confirmed: '今も有効と公式資料で確認できた',
  ended_confirmed: '終了・失効・後継への置き換えを確認',
  unconfirmed: '今も有効か確かめられていない（終了とは限らない）',
  signed_not_started: '締結済みで、開始日がまだ来ていない',
  planned: '予定の発表だけ（締結済み累計に含めない）',
};
export function validityTiles(groups, opts = {}) {
  const lv = l => groups.filter(g => g.level === l);
  const c = validityCounts(groups);
  c.planned += opts.planned || 0;
  // split：締結主体ごとに分けて表示（都道府県・国は常に、市区町村・団体などは登録があるときだけ）
  const lvs = opts.split ? LEVEL_ORDER.filter(l => ['prefecture', 'national'].includes(l) || lv(l).length).sort((a, b) => (a === 'prefecture' ? -1 : b === 'prefecture' ? 1 : 0)) : [];
  const per = Object.fromEntries(lvs.map(l => [l, validityCounts(lv(l))]));
  const on = opts.scope ? new Set(VALIDITY_SCOPE[opts.scope].states) : null;
  const tile = code => {
    const tag = opts.link ? 'a' : 'div';
    const href = opts.link ? ` href="${opts.link(code)}"` : '';
    const nums = opts.split
      ? `<span class="vt-split">${lvs.map(l => `<span>${esc(LEVEL_SHORT[l])} <b>${per[l][code]}</b>件</span>`).join('')}</span>`
      : `<span class="vt-n">${c[code]}<small>件</small></span>`;
    return `<${tag} class="vt vt-${code}${on && on.has(code) ? ' is-on' : ''}"${href}>
      <span class="vt-k">${esc(VALIDITY[code].ja)}${on && on.has(code) ? '<span class="vt-on">表示中</span>' : ''}</span>${nums}
      ${opts.desc === false ? '' : `<span class="vt-d">${esc(VT_DESC[code])}</span>`}</${tag}>`;
  };
  const codes = VT_ORDER.filter(code => code !== 'planned' || c.planned || opts.split);
  const total = opts.split ? lvs.map(l => `${esc(LEVEL_SHORT[l])} <b>${per[l].signed_total}</b>件`).join('／') : `<b>${c.signed_total}</b>件`;
  return `<div class="vtiles${opts.split ? ' vtiles-split' : ''}" role="list" aria-label="協定の有効性の内訳">${codes.map(code => `<div role="listitem">${tile(code)}</div>`).join('')}</div>
  <p class="vt-total">締結済み累計：${total}<span class="small muted">（有効確認＋終了確認＋有効性未確認＋開始前。締結予定は含みません。同じ協定の更新・再締結は1件）</span></p>
  ${opts.note === false ? '' : '<p class="small muted" style="margin:2px 0 0">「有効性未確認」は、今も有効かどうかを公式資料で確かめられていないもので、終了したという意味ではありません。</p>'}`;
}

// 項目ごとの調査状況（確認済み／調査したが確認できず／未調査）
export function researchTable(m) {
  const rows = researchStatus(m);
  return `<div class="table-wrap"><table class="research"><thead><tr><th>項目</th><th>調査状況</th><th>内容</th></tr></thead><tbody>
    ${rows.map(r => `<tr><th scope="row">${esc(r.ja)}</th><td><span class="rs rs-${r.state}">${esc(RESEARCH_STATES[r.state].ja)}</span></td><td>${esc(String(r.value || '').slice(0, 120))}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="small muted">「調査したが確認できず」は調べたが公式資料で見つからなかったもの、「未調査」はまだ調べていないものです。どちらも「ない」という意味ではありません。</p>`;
}

// 人数の意味（「この数字は何を意味する？」）
export function numbersSection(m, opts = {}) {
  const ns = m.numbers || [];
  if (!ns.length) return opts.empty === false ? '' : '<p>この文書に関係する人数（目標・上限・実績）は、公式資料では確認できていません（未確認）。</p>';
  const rows = ns.map(n => {
    const k = NUMBER_KIND[n.kind] || { ja: n.kind, desc: '' };
    const val = n.value === null || n.value === undefined ? '数値は未確認' : `${Number(n.value).toLocaleString('ja-JP')}${esc(n.unit || '人')}`;
    return `<li class="num-item num-${esc(n.kind)}">
      <div class="num-head"><span class="num-kind">${esc(k.ja)}</span><b class="num-val">${val}</b></div>
      <div class="num-label">${esc(n.label || '')}${n.period ? `<span class="small muted">（${esc(n.period)}）</span>` : ''}</div>
      ${n.definition ? `<div class="small">資料の書き方：${esc(n.definition)}</div>` : ''}
      <div class="small muted">${esc(k.desc)}${n.direction === 'to_japan' && n.kind !== 'two_way_exchange' ? '。相手国から日本へ来る人の数です' : ''}${n.note ? `。${esc(n.note)}` : ''}</div>
      ${srcRefs(m, n.sources)}
    </li>`;
  }).join('');
  return `<div class="num-box"><h3 class="num-title">この数字は何を意味する？</h3>
    <ul class="num-list">${rows}</ul>
    <p class="small muted" style="margin:6px 0 0">目標・上限・実績は別の数字です。足し合わせたり、目標の人数がそのまま日本に移り住むと考えたりしないでください。</p></div>`;
}

// 有効性の詳細（個別の協定のページ）
export function validityDetail(db, m, g) {
  const v = VALIDITY[g.validity] || VALIDITY.unconfirmed;
  const vOwn = VALIDITY[m._validity] || VALIDITY.unconfirmed;
  const srcs = (m.validity_sources || []).map(id => m.sources.find(s => s.id === id)).filter(Boolean);
  const succ = m.successor_id && db.mouById.get(m.successor_id);
  const prev = m.renewal_of && db.mouById.get(m.renewal_of);
  const info = validityInfo(m);
  const end = termEnd(m);
  const endNote = e => e.precision === 'month' ? `（年月までの記載のため、${fmtDate(e.date)}まで有効として判定）` : e.precision === 'year' ? `（年までの記載のため、${fmtDate(e.date)}まで有効として判定）` : '';
  const rows = [
    ['現在の有効性', `${validityBadge(g.validity, { prefix: false })}${g.versions.length > 1 && m._validity !== g.validity ? `<br><span class="small">この版（${esc(fmtDate(m.signed_date))}）だけで見ると：${esc(vOwn.ja)}。同じ協定の更新・後継の文書を含めて判定しています。</span>` : ''}${info.reason !== 'recorded' ? `<br><span class="causal">判定の理由：${esc(VALIDITY_REASONS[info.reason])}${info.reason === 'lapsed' && m.validity_checked ? `（${esc(fmtDate(m.validity_checked))}の確認時点では有効）` : ''}</span>` : ''}<br><span class="small muted">${esc(v.desc)}</span>`],
    ['発効日・開始日', esc(fmtDate(m.effective_date, '未確認'))],
    ['当初の有効期限', m.valid_until ? `${esc(fmtDate(m.valid_until))}${m.valid_until_note ? `<br><span class="small muted">${esc(m.valid_until_note)}</span>` : ''}` : esc(m.term_text ? '期限の日付は資料から決められない' : '未確認')],
    m.renewed_until ? ['更新・延長後の有効期限', `<b>${esc(fmtDate(m.renewed_until))}</b>（判定にはこちらを使います）${m.renewed_until_note ? `<br><span class="small muted">${esc(m.renewed_until_note)}</span>` : ''}`] : null,
    end ? ['判定に使った期限', `${esc(fmtDate(end.date))}まで${esc(endNote(end))}${end.date < today() ? '<br><span class="causal">この期限は過ぎています（期限後の更新・延長は公式資料で確認できていません）</span>' : ''}`] : null,
    ['有効期間の定め', esc(m.term_text || m.validity || '未確認')],
    ['自動更新', `${esc(AUTO_RENEWAL[m.auto_renewal] || '未確認')}${m.renewal_text || (m.renewal_terms && m.renewal_terms !== '未確認') ? `<br><span class="small">${esc(m.renewal_text || m.renewal_terms)}</span>` : ''}${m.auto_renewal === 'yes' ? '<br><span class="small muted">自動更新の条項があるだけでは「有効確認」にしません（更新されたことを公式資料で確認できたときだけ）。</span>' : ''}`],
    ['最終更新・延長日', esc(fmtDate(m.last_renewed, '確認できず'))],
    m.ended_date || m.end_reason ? ['終了日・終了理由', `${esc(fmtDate(m.ended_date, '日付不明'))}${m.end_reason ? `<br>${esc(m.end_reason)}` : ''}`] : null,
    prev ? ['更新前・前の文書', `<a href="#/mou/${encodeURIComponent(prev.id)}">${esc(prev.title_ja)}（${esc(fmtDate(prev.signed_date))}）</a> ${validityBadge(prev._validity, { prefix: false })}<br><span class="small muted">同じ協力関係の文書として1件で数えています（同時に有効な別の協定として二重に数えません）</span>`] : null,
    succ ? ['後継・更新後の文書', `<a href="#/mou/${encodeURIComponent(succ.id)}">${esc(succ.title_ja)}（${esc(fmtDate(succ.signed_date))}）</a> ${validityBadge(succ._validity, { prefix: false })}<br><span class="small muted">件数は同じ協定として1件で数えています</span>`] : null,
    ['判定の根拠', `${esc(m.validity_basis || (m._validity === 'unconfirmed' ? '現在も有効であることを示す公式資料を確認できていません。' : '—'))}${srcs.length ? `<br><span class="small"><b>根拠の資料：</b></span>${srcs.map(s => `<br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`).join('')}` : '<br><span class="small muted">根拠の資料：この協定の出典（下の「原文・出典」）を確認した結果です</span>'}`],
    m.validity_research_note ? ['調べたこと・確認できなかったこと', esc(m.validity_research_note)] : null,
    ['有効性の最終確認日', esc(fmtDate(m.validity_checked, '未確認'))],
  ];
  return kvTable(rows);
}
export function term(word, label) {
  const t = GLOSSARY[word];
  if (!t) return esc(label || word);
  return `<button type="button" class="term linklike" data-term="${esc(word)}" title="${esc(t)}" style="text-decoration:none;color:inherit">${esc(label || word)}</button>`;
}

export function fieldBadges(fields) {
  return (fields || []).map(f => `<span class="badge b-field">${esc(FIELD[f]?.ja || f)}</span>`).join(' ');
}
export function statusBadge(code) {
  const s = STATUS[code] || STATUS.unknown;
  return `<span class="badge b-status-${esc(s.code)}" title="${esc(s.desc)}">${code === 'planned' ? '' : '事業：'}${esc(s.ja.replace(/^事業は/, ''))}</span>`;
}
export function evidenceBadge(m) {
  if (m.evidence_level === 'news_only') return '<span class="badge b-news">報道のみ・公式資料未確認</span>';
  return '';
}

// 日本側 → 相手側 の表示
export function whoLine(db, m) {
  const jp = japanSideName(db, m);
  const partners = [{ country_code: m.country_code, partner_org: m.partner_org }, ...(m.additional_partners || [])]
    .map(a => `${countryName(db, a.country_code)}・${a.partner_org || '相手機関不明'}`);
  return `${esc(jp)} ⇄ ${esc(partners.join(' ／ '))}`;
}

export function mouCard(db, g, opts = {}) {
  // 一覧では最初に結んだ協定の名前を見出しにし、更新・修正があればその日付を添える
  const m = g.first;
  const H = opts.h || 'h3';
  const renewals = g.versions.length > 1 ? `<span class="badge b-level">更新・修正を含む（全${g.versions.length}文書）</span>` : '';
  let signed = m.signed_date ? `締結日：${fmtDate(m.signed_date)}` : `締結日：不明${m.announced_date ? `（発表：${fmtDate(m.announced_date)}）` : m.effective_date ? `（開始：${fmtDate(m.effective_date)}）` : ''}`;
  if (g.latest !== m && g.latest.signed_date) signed += `（最新の更新・修正：${fmtDate(g.latest.signed_date)}）`;
  const impactCats = [...new Set(g.impacts.map(i => i.category))];
  return `<article class="mou-card">
    <div class="who">${whoLine(db, m)}</div>
    <${H}><a href="#/mou/${encodeURIComponent(m.id)}">${esc(m.title_ja)}</a></${H}>
    <div class="meta">
      <span>${esc(signed)}</span>
      ${validityBadge(g.validity)} ${kindBadge(g.kind)} ${statusBadge(g.status)} ${fieldBadges(g.fields)}
      <span class="badge b-doc">${esc(m.doc_type)}</span>
      ${opts.showActor || !['national', 'prefecture'].includes(g.level) ? actorBadges(g) : ''}
      <span class="badge b-level">相手：${esc(PARTNER_TYPES[m.partner_type] || '種別不明')}</span>
      ${renewals} ${evidenceBadge(m)}
    </div>
    ${m.purpose ? `<p class="purpose">${esc(m.purpose)}</p>` : ''}
    ${(m.numbers || []).length ? `<p class="small" style="margin:6px 0 0"><b>人数の記載：</b>${m.numbers.slice(0, 3).map(n => `${esc(NUMBER_KIND[n.kind]?.ja || n.kind)} ${n.value == null ? '未確認' : esc(Number(n.value).toLocaleString('ja-JP') + (n.unit || '人'))}`).join('／')}${m.numbers.length > 3 ? ' ほか' : ''}（<a href="#/mou/${encodeURIComponent(m.id)}">数字の意味</a>）</p>` : ''}
    ${impactCats.length ? `<p class="small muted" style="margin:6px 0 0">地域への影響の記録：${impactCats.map(c => esc(IMPACTS.find(i => i.code === c)?.ja || c)).join('、')}</p>` : ''}
    ${g.level === 'organization' ? '<p class="small muted" style="margin:6px 0 0">団体・企業などが締結した協定です。日本政府・都道府県が締結した件数には含めていません。</p>' : ''}
    ${opts.showSources ? sourceLine(g) : ''}
    ${opts.extra || ''}
  </article>`;
}

// 締結主体と情報源を分けて書く1行（検索結果などで、資料を出しただけの機関を当事者と取り違えないように）
export function sourceLine(g) {
  const pubs = [...new Set(g.versions.flatMap(v => v.sources.map(s => s.publisher)).filter(Boolean))];
  if (!pubs.length) return '';
  return `<p class="src-line"><span class="src-k">情報源</span>${esc(pubs.slice(0, 4).join('、'))}${pubs.length > 4 ? ` ほか${pubs.length - 4}` : ''}<span class="small muted">（出典の資料を出した機関。締結主体とは限りません）</span></p>`;
}

// 日本側の締結主体の種別と、当事者の組み合わせ（政府間・自治体間・官民間・団体間など）
export function actorBadges(g) {
  const t = JAPAN_ORG_TYPE[g.orgType], p = PAIR_KIND[g.pairKind];
  return `${t ? `<span class="badge b-actor" title="${esc(t.desc)}">日本側：${esc(t.ja)}</span>` : ''} ${p ? `<span class="badge b-pair" title="${esc(p.desc)}">${esc(p.ja)}</span>` : ''}`;
}

export function mouList(db, groups, opts = {}) {
  if (!groups.length) return `<p class="muted">${esc(opts.empty || '条件に合うMOUは登録されていません。')}</p>`;
  return `<div class="mou-list">${groups.map(g => mouCard(db, g, opts)).join('')}</div>`;
}

export function sourceList(sources, ids) {
  const list = ids ? sources.filter(s => ids.includes(s.id)) : sources;
  if (!list.length) return '<p class="muted">情報源の記録がありません。</p>';
  return `<ol class="source-list">${list.map(s => `<li>
    <span class="src-title">${esc(s.title || '(題名なし)')}</span>（${esc(s.publisher || '発行元不明')}／${esc(SOURCE_TYPES[s.type] || s.type || '')}）<br>
    <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>${linkWarn(s)}<br>
    <span class="small muted">確認日：${esc(fmtDate(s.checked))}${s.note ? `／${esc(s.note)}` : ''}</span>
  </li>`).join('')}</ol>`;
}
// 元のページが削除されるなどして開けず、保存版（ウェブアーカイブ）にリンクしているときの説明
const ARCHIVES = [
  ['warp.ndl.go.jp', '国立国会図書館インターネット資料収集保存事業（WARP）'],
  ['web.archive.org', 'インターネットアーカイブ（Wayback Machine）'],
];
export function linkWarn(s) {
  if (s.archived_from) {
    const name = ARCHIVES.find(([host]) => s.url.includes(host))?.[1] || 'ウェブアーカイブ';
    return `<br><span class="small muted">※元のページ（${esc(s.archived_from)}）は発行元のサイトで削除されるなどして開けないため、${esc(name)}の保存版にリンクしています。</span>`;
  }
  if (s.link_status === 'not_found') return `<br><span class="badge b-news">リンク切れ（${esc(fmtDate(s.link_checked))}時点。ページが移動・削除された可能性）</span>`;
  if (s.link_status === 'error') return `<br><span class="badge b-news">開けない状態（${esc(fmtDate(s.link_checked))}時点。サイト側の証明書エラー等）</span>`;
  return '';
}
function srcRefs(m, ids) {
  if (!ids || !ids.length) return '';
  return ids.map(id => {
    const s = m.sources.find(x => x.id === id);
    return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">[出典]</a>` : '';
  }).join(' ');
}

// 地域への影響：6分野×3段階の表
export function impactGrid(db, g, opts = {}) {
  const stats = opts.autoStats !== false ? autoStatsFor(db, g) : [];
  let html = `<div class="impact-grid" role="table" aria-label="地域への影響（6分野×3段階）">
    <div class="h" role="columnheader">分野</div>
    ${STAGES.map(s => `<div class="h" role="columnheader">${esc(s.ja)}<br><span class="small muted" style="font-weight:400">${esc(s.desc)}</span></div>`).join('')}`;
  for (const cat of IMPACTS) {
    html += `<div class="cat" role="rowheader">${esc(cat.letter)}. ${esc(cat.ja)}</div>`;
    for (const st of STAGES) {
      const items = g.impacts.filter(i => i.category === cat.code && i.stage === st.code);
      const extra = cat.code === 'population' && st.code === 'observed' ? stats : [];
      if (!items.length && !extra.length) {
        html += `<div class="cell empty" data-stage="${esc(st.ja)}">記録なし（未確認）</div>`;
        continue;
      }
      html += `<div class="cell" data-stage="${esc(st.ja)}"><ul>${items.map(i => `<li>
        ${esc(i.text)}${i.fiscal_year ? `<span class="small muted">（${esc(i.fiscal_year)}年度）</span>` : ''}${i._auto ? '<br><span class="small muted">（協定の合意内容から自動で分類）</span>' : ''}
        ${i.stage !== 'agreed' && i.causality ? `<br><span class="causal">${esc(CAUSALITY[i.causality] || '')}</span>` : ''}
        ${srcRefs(i._mou, i.sources)}
      </li>`).join('')}${extra.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
    }
  }
  return html + '</div>';
}

// 統計から自動で出す「参考」（MOUとの関連性は未確認と必ず明記）
export function autoStatsFor(db, g) {
  const out = [];
  if (g.level !== 'prefecture') return out;
  const rc = residentChange(db, g.pref_code, g.country_code);
  const pn = prefName(db, g.pref_code), cn = countryName(db, g.country_code);
  if (rc && (rc.a != null || rc.b != null)) {
    out.push(`<span class="small">【参考統計】${esc(pn)}に住む${esc(cn)}国籍の人：${esc(fmtDate(rc.from))}末 ${esc(fmtNum(rc.a))}人 → ${esc(fmtDate(rc.to))}末 ${esc(fmtNum(rc.b))}人</span>
      <br><span class="causal">関連性は未確認（MOU以外の要因も含む全体の数）</span>
      ${rc.source?.url ? `<a href="${esc(rc.source.url)}" target="_blank" rel="noopener">[出典：${esc(rc.publisher)}]</a>` : ''}`);
  }
  const ss = sswCount(db, g.pref_code, g.country_code);
  if (ss) {
    out.push(`<span class="small">【参考統計】${esc(pn)}の${esc(cn)}国籍の特定技能外国人：${esc(fmtNum(ss.value))}人（${esc(fmtDate(ss.period))}末）</span>
      <br><span class="causal">関連性は未確認</span>
      ${ss.source?.url ? `<a href="${esc(ss.source.url)}" target="_blank" rel="noopener">[出典]</a>` : ''}`);
  }
  return out;
}

// 予算・支出の表（不明は「未確認」、0円にはしない）
export function budgetSection(db, g) {
  const rows = g.budgets;
  if (!rows.length) {
    if (g.versions.some(v => v.budget_status === 'none_confirmed')) {
      return `<p>この協定に関連する予算は、<b>該当なし</b>（公式資料で、関連する予算がないことを確認）です。</p>${budgetLegend()}`;
    }
    return `<p>この協定に関連する予算・支出は、<b>公式資料ではまだ確認できていません（未確認）</b>。「0円」という意味ではありません。</p>
      <p class="small muted">協定そのものには予算がなくても、関連する事業（人材確保の支援、研修、日本語教育など）に予算が付いている場合があります。見つかり次第ここに追加します。</p>${budgetLegend()}`;
  }
  const KNOWN = ['national', 'prefecture', 'municipal', 'private'];
  const match = (b, payer) => payer === 'other' ? !KNOWN.includes(b.payer) : (!payer || b.payer === payer);
  const sum = (kind, payer) => {
    const xs = rows.filter(b => b.kind === kind && match(b, payer) && typeof b.amount_yen === 'number');
    return xs.length ? xs.reduce((a, b) => a + b.amount_yen, 0) : null;
  };
  const planned = sum('planned'), settled = sum('settled');
  // 負担者ごと（国費・都道府県費・市町村費・民間負担）。記録がなければ「未確認」、金額不明の記録だけなら「金額不明」
  const cell = (kind, payer) => {
    const v = sum(kind, payer);
    if (v !== null) return fmtYen(v);
    return rows.some(b => b.kind === kind && match(b, payer)) ? '金額不明' : '未確認';
  };
  const payers = [['national', '国費'], ['prefecture', '都道府県費'], ['municipal', '市町村費'], ['private', '民間負担']];
  return `<div class="stats">
      <div class="stat"><div class="label">確認できた予算額の合計</div><div class="value" style="font-size:1.3rem">${esc(planned == null ? '未確認' : fmtYen(planned))}</div><div class="sub">金額が分かったものだけの合計（年度は資料ごとに異なる）</div></div>
      <div class="stat"><div class="label">確認できた決算額の合計</div><div class="value" style="font-size:1.3rem">${esc(settled == null ? '未確認' : fmtYen(settled))}</div><div class="sub">実際に使われた額</div></div>
    </div>
    <div class="table-wrap"><table class="pay-table"><thead><tr><th>負担</th><th class="num">予算額</th><th class="num">決算額</th></tr></thead>
      <tbody>${payers.map(([p, ja]) => `<tr><th scope="row">${ja}</th><td class="num">${esc(cell('planned', p))}</td><td class="num">${esc(cell('settled', p))}</td></tr>`).join('')}
      ${rows.some(b => !KNOWN.includes(b.payer)) ? `<tr><th scope="row">負担者が分からない・複数</th><td class="num">${esc(cell('planned', 'other'))}</td><td class="num">${esc(cell('settled', 'other'))}</td></tr>` : ''}</tbody></table></div>
    ${budgetLegend()}
    <h4 style="margin:14px 0 6px">資料ごとの内訳</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>年度</th><th>種類</th><th>事業名</th><th class="num">金額</th><th>負担</th><th>MOUとの関係</th><th>出典</th></tr></thead>
      <tbody>${rows.map(b => `<tr>
        <td class="nowrap">${esc(fyLabel(b.fiscal_year))}</td>
        <td>${esc(BUDGET_KIND[b.kind] || b.kind)}</td>
        <td>${esc(b.item || '')}</td>
        <td class="num">${esc(fmtYen(b.amount_yen))}${b.original_text ? `<br><span class="small muted">資料の表記：${esc(b.original_text)}</span>` : ''}</td>
        <td>${esc(PAYERS[b.payer] || '未確認')}</td>
        <td>${esc(b.relation || '')}</td>
        <td>${srcRefs(b._mou, b.sources)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">金額は資料に書かれた数字をそのまま円に直したものです（千円単位の資料は×1,000）。年度や事業の範囲が資料ごとに違うため、単純に足し合わせて比べられない場合があります。</p>`;
}

export function fyLabel(fy) { return /^\d{4}$/.test(fy || '') ? `${fy}年度` : '年度不明'; }

// 「未確認」「該当なし」「0円」「金額不明」のちがい
export function budgetLegend() {
  return `<p class="small muted legend-words"><b>未確認</b>＝公式資料で確認できていない（0円ではない）／<b>該当なし</b>＝公式資料で、該当する予算がないことを確認／<b>0円</b>＝資料に0円と書かれている／<b>金額不明</b>＝予算の記録はあるが金額が資料から分からない</p>`;
}

export function legendHTML(title, items) {
  return `<div class="legend" aria-label="凡例">
    ${title ? `<span class="legend-title">${esc(title)}</span>` : ''}
    ${items.map(i => `<span><span class="sw" style="${i.style}"></span>${esc(i.label)}</span>`).join('')}
  </div>`;
}

export function statTile(label, value, sub, unit) {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
}

export function kvTable(rows) {
  return `<div class="table-wrap"><table class="kv"><tbody>${rows.filter(Boolean).map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</tbody></table></div>`;
}

export { LEGAL, EVIDENCE, PARTNER_TYPES };
