// CSV（Excelで開ける表）の書き出し
import { toCSV, downloadBlob, toast } from './util.js';
import { scopeLabel } from './shared.js';
import {
  FIELD, STATUS, IMPACT, STAGE, CAUSALITY, PARTNER_TYPES, LEGAL, EVIDENCE, ORIGINAL, PAYERS, BUDGET_KIND, LEVELS,
  VALIDITY, DOC_CATEGORY, RELATION, NUMBER_KIND, ACCEPTANCE_TYPES, VALIDITY_REASONS, JAPAN_ORG_TYPE, PAIR_KIND,
  countryName, prefName, termEnd,
} from './data.js';

const HEADERS = [
  ['ID', m => m.id],
  ['正式名称', m => m.title_ja],
  ['原語の正式名称', m => m.title_original],
  ['文書の分類', m => DOC_CATEGORY[m.doc_category]?.ja],
  ['文書の種類', m => m.doc_type],
  ['文書の種類（補足）', m => m.doc_type_note],
  ['日本側の区分', m => LEVELS[m.japan_level]],
  ['日本側機関', m => m.japan_org],
  ['日本側の組織種別', m => JAPAN_ORG_TYPE[m._orgType]?.ja],
  ['当事者の組み合わせ', m => PAIR_KIND[m._pairKind]?.ja],
  ['都道府県', m => m.japan_level === 'organization' ? '' : prefName(m._db, m.pref_code)],
  ['市区町村コード', m => m.municipality_code],
  ['市区町村', m => m.municipality_name],
  ['関連事業の地域（締結した地域ではない）', m => (m.related_regions || []).map(r => `${prefName(m._db, r.pref_code)}${r.text ? '：' + r.text : ''}`).join(' / ')],
  ['署名・交換の場', m => m.ceremony_note],
  ['署名者（日本側）', m => m.japan_signatory],
  ['日本側のその他の署名者', m => (m.other_japan_parties || []).join(' / ')],
  ['相手国コード', m => m.country_code],
  ['相手国・地域', m => countryName(m._db, m.country_code)],
  ['相手機関', m => m.partner_org],
  ['相手機関（英語）', m => m.partner_org_en],
  ['相手機関の種別', m => PARTNER_TYPES[m.partner_type]],
  ['締結日', m => m.signed_date],
  ['発表日', m => m.announced_date],
  ['日付の補足', m => m.date_note],
  ['分野', m => m.fields.map(f => FIELD[f]?.ja || f).join(' / ')],
  ['関連する在留資格・分野', m => (m.labor_detail || []).join(' / ')],
  ['目的', m => m.purpose],
  ['合意内容', m => m.content.join(' / ')],
  ['現在の有効性（この文書）', m => VALIDITY[m._validity]?.ja],
  ['現在の有効性（同じ協定の更新・後継を含めた判定）', m => VALIDITY[m._group?.validity]?.ja],
  ['有効性の判定の理由', m => VALIDITY_REASONS[m._validityReason]],
  ['有効性の判定の根拠', m => m.validity_basis],
  ['有効性の根拠資料', m => (m.validity_sources || []).map(id => m.sources.find(s => s.id === id)?.url).filter(Boolean)],
  ['有効性の確認日', m => m.validity_checked],
  ['発効日・開始日', m => m.effective_date],
  ['当初の有効期限', m => m.valid_until],
  ['更新・延長後の有効期限', m => m.renewed_until],
  ['判定に使った有効期限（月・年だけのものは末日）', m => termEnd(m)?.date],
  ['有効期間', m => m.term_text || m.validity],
  ['更新条件', m => m.renewal_text || m.renewal_terms],
  ['最終更新・延長日', m => m.last_renewed],
  ['終了日', m => m.ended_date],
  ['終了理由', m => m.end_reason],
  ['後継の文書のID', m => m.successor_id],
  ['外国人の受入れとの関係', m => RELATION[m._relation]?.ja],
  ['対象となる制度', m => m.related_systems],
  ['就労・留学・研修などの区別', m => m.acceptance_types.map(t => ACCEPTANCE_TYPES[t] || t)],
  ['人数（種類別）', m => m.numbers.map(n => `[${NUMBER_KIND[n.kind]?.ja || n.kind}] ${n.label}：${n.value == null ? '数値未確認' : n.value + (n.unit || '人')}${n.period ? '（' + n.period + '）' : ''}`)],
  ['法的拘束力', m => LEGAL[m.legal_binding]],
  ['法的拘束力（補足）', m => m.legal_binding_note],
  ['事業の実施状況', m => STATUS[m.status]?.ja],
  ['事業の実施状況（補足）', m => m.status_note],
  ['関連事業', m => m.projects.map(p => `${p.fiscal_year ? p.fiscal_year + '年度 ' : ''}${p.name}${p.detail ? '：' + p.detail : ''}`).join(' / ')],
  ['予算情報', m => m.budgets.map(b => `${/^\d{4}$/.test(b.fiscal_year) ? b.fiscal_year + '年度' : '年度不明'} ${BUDGET_KIND[b.kind] || b.kind} ${b.item || ''} ${typeof b.amount_yen === 'number' ? b.amount_yen + '円' : '金額未確認'}（負担：${PAYERS[b.payer] || '未確認'}／${b.relation || ''}／根拠：${(b.sources || []).join(',')}）`).join(' / ')],
  ['地域への影響', m => m.impacts.map(i => `[${IMPACT[i.category]?.ja || i.category}・${STAGE[i.stage]?.ja || i.stage}${i.fiscal_year ? '・' + i.fiscal_year + '年度' : ''}] ${i.text}${i.causality && i.causality !== 'n/a' ? '（' + CAUSALITY[i.causality] + '）' : ''}（根拠：${(i.sources || []).join(',')}）`).join(' / ')],
  ['原文の公開', m => ORIGINAL[m.original_text]],
  ['確認の根拠', m => EVIDENCE[m.evidence_level]],
  ['情報源', m => m.sources.map(s => `${s.id}：${s.title}（${s.publisher}）${s.url}［確認日 ${s.checked}］`).join(' / ')],
  ['最終確認日', m => m.last_checked],
  ['更新元のID', m => m.renewal_of],
  ['同一協定のグループ', m => m.group_key],
  ['備考', m => m.notes],
].map(([label, get]) => ({ label, get }));

// 1行目の前に「件数の条件・対象時点」を書いた行を入れる（画面と同じ条件で出力したことが分かるように）
export function mouCSV(db, mous, cond) {
  const rows = mous.map(m => Object.assign(Object.create(m), { _db: db }));
  const csv = toCSV(HEADERS, rows);
  if (!cond) return csv;
  const head = `# 日本と世界のMOU・協定マップ／${cond}／掲載内容：${db.config.data_as_of}時点／${mous.length}文書（同じ協定の更新・再締結は別の行）`;
  return csv.replace(/^\uFEFF/, '\uFEFF' + head.replace(/[\r\n]/g, ' ') + '\r\n');

}
// cond を省略すると、いま画面で使っている数え方（有効性の範囲・数える文書）を書く
export function downloadMouCSV(db, mous, filename, cond) {
  downloadBlob(filename, new Blob([mouCSV(db, mous, cond ?? `件数の条件：${scopeLabel()}`)], { type: 'text/csv;charset=utf-8' }));
  toast(`${mous.length}件をCSVで保存しました`);
}

export function groupsToMous(groups) {
  return groups.flatMap(g => g.versions);
}

export const CSV_COLUMNS = HEADERS.map(h => h.label);
