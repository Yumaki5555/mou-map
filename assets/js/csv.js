// CSV（Excelで開ける表）の書き出し
import { toCSV, downloadBlob, toast } from './util.js';
import {
  FIELD, STATUS, IMPACT, STAGE, CAUSALITY, PARTNER_TYPES, LEGAL, EVIDENCE, ORIGINAL, PAYERS, BUDGET_KIND, LEVELS,
  countryName, prefName,
} from './data.js';

const HEADERS = [
  ['ID', m => m.id],
  ['正式名称', m => m.title_ja],
  ['原語の正式名称', m => m.title_original],
  ['文書の種類', m => m.doc_type],
  ['文書の種類（補足）', m => m.doc_type_note],
  ['日本側の区分', m => LEVELS[m.japan_level]],
  ['日本側機関', m => m.japan_org],
  ['都道府県', m => prefName(m._db, m.pref_code)],
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
  ['有効期間', m => m.validity],
  ['更新条件', m => m.renewal_terms],
  ['法的拘束力', m => LEGAL[m.legal_binding]],
  ['法的拘束力（補足）', m => m.legal_binding_note],
  ['実施状況', m => STATUS[m.status]?.ja],
  ['実施状況（補足）', m => m.status_note],
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

export function downloadMouCSV(db, mous, filename) {
  const rows = mous.map(m => Object.assign(Object.create(m), { _db: db }));
  const csv = toCSV(HEADERS, rows);
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  toast(`${mous.length}件をCSVで保存しました`);
}

export function groupsToMous(groups) {
  return groups.flatMap(g => g.versions);
}

export const CSV_COLUMNS = HEADERS.map(h => h.label);
