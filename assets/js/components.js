// 画面の部品（MOUカード、バッジ、出典一覧、影響の表、予算の表など）
import { esc, fmtDate, fmtYen, fmtNum } from './util.js';
import {
  FIELD, STATUS, IMPACTS, STAGES, CAUSALITY, PARTNER_TYPES, LEGAL, EVIDENCE, PAYERS, BUDGET_KIND, SOURCE_TYPES,
  countryName, prefName, japanSideName, residentChange, sswCount,
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
};
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
  return `<span class="badge b-status-${esc(s.code)}" title="${esc(s.desc)}">${esc(s.ja)}</span>`;
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
  let signed = m.signed_date ? `締結日：${fmtDate(m.signed_date)}` : `締結日：不明${m.announced_date ? `（発表：${fmtDate(m.announced_date)}）` : ''}`;
  if (g.latest !== m && g.latest.signed_date) signed += `（最新の更新・修正：${fmtDate(g.latest.signed_date)}）`;
  const impactCats = [...new Set(g.impacts.map(i => i.category))];
  return `<article class="mou-card">
    <div class="who">${whoLine(db, m)}</div>
    <${H}><a href="#/mou/${encodeURIComponent(m.id)}">${esc(m.title_ja)}</a></${H}>
    <div class="meta">
      <span>${esc(signed)}</span>
      ${statusBadge(g.status)} ${fieldBadges(g.fields)}
      <span class="badge b-doc">${esc(m.doc_type)}</span>
      <span class="badge b-level">相手：${esc(PARTNER_TYPES[m.partner_type] || '種別不明')}</span>
      ${renewals} ${evidenceBadge(m)}
    </div>
    ${m.purpose ? `<p class="purpose">${esc(m.purpose)}</p>` : ''}
    ${impactCats.length ? `<p class="small muted" style="margin:6px 0 0">地域への影響の記録：${impactCats.map(c => esc(IMPACTS.find(i => i.code === c)?.ja || c)).join('、')}</p>` : ''}
  </article>`;
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
export function linkWarn(s) {
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
    return `<p>このMOUに関連する予算・支出は、<b>公式資料ではまだ確認できていません（未確認）</b>。「0円」という意味ではありません。</p>
      <p class="small muted">MOUそのものには予算がなくても、MOUに関連する事業（人材確保の支援、研修、日本語教育など）に予算が付いている場合があります。見つかり次第ここに追加します。</p>`;
  }
  const sum = (kind) => {
    const xs = rows.filter(b => b.kind === kind && typeof b.amount_yen === 'number');
    return xs.length ? xs.reduce((a, b) => a + b.amount_yen, 0) : null;
  };
  const planned = sum('planned'), settled = sum('settled');
  return `<div class="stats">
      <div class="stat"><div class="label">確認できた計画予算の合計</div><div class="value" style="font-size:1.3rem">${esc(planned == null ? '未確認' : fmtYen(planned))}</div><div class="sub">金額が分かったものだけの合計</div></div>
      <div class="stat"><div class="label">確認できた決算額の合計</div><div class="value" style="font-size:1.3rem">${esc(settled == null ? '未確認' : fmtYen(settled))}</div><div class="sub">実際に使われた額</div></div>
    </div>
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
