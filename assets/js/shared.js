// ページ間で共有する設定と小物
import { fmtDate, yearOf } from './util.js';

// 「報道のみ（公式資料未確認）の情報も含める」設定。初期値は含めない。
export const settings = { includeNews: false };
try { settings.includeNews = localStorage.getItem('mou.includeNews') === '1'; } catch (e) { /* 保存できない環境では初期値のまま */ }

export function newsToggleHTML() {
  return `<label class="small"><input type="checkbox" class="news-toggle" ${settings.includeNews ? 'checked' : ''}> 報道のみで公式資料が未確認の情報も含める</label>`;
}
export function bindNewsToggle(root, onChange) {
  root.querySelectorAll('.news-toggle').forEach(cb => cb.addEventListener('change', () => {
    settings.includeNews = cb.checked;
    try { localStorage.setItem('mou.includeNews', cb.checked ? '1' : '0'); } catch (e) { /* 無視 */ }
    onChange();
  }));
}

// 画像の下に入れる「対象地域・対象期間・出典・確認日」
export function metaFor(db, groups, region) {
  const years = groups.flatMap(g => g.versions.map(v => yearOf(v.signed_date))).filter(Boolean);
  const from = years.length ? Math.min(...years) : null;
  const asOf = db.config.data_as_of;
  return {
    region,
    period: from ? `${from}年〜${fmtDate(asOf)}時点` : `${fmtDate(asOf)}時点`,
    source: '各都道府県・省庁・相手国政府の公式発表、協定原文ほか（個別の出典はサイトの各MOUページに掲載）',
    checked: fmtDate(asOf),
  };
}
