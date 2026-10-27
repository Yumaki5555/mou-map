// 小さな共通関数（文字のエスケープ、日付・金額の表示、CSV作成など）

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "2019-10-02" → "2019年10月2日"、"2019-10" → "2019年10月"、"2019" → "2019年"
export function fmtDate(d, empty = '不明') {
  if (!d) return empty;
  const m = String(d).match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return String(d);
  let s = `${m[1]}年`;
  if (m[2]) s += `${Number(m[2])}月`;
  if (m[3]) s += `${Number(m[3])}日`;
  return s;
}

export function yearOf(d) {
  const m = String(d || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// 日付の比較用（精度が月・年だけのものは、その期間の最初の日として扱う）
export function dateKey(d) {
  if (!d) return '';
  const p = String(d).split('-');
  return `${p[0]}-${(p[1] || '01').padStart(2, '0')}-${(p[2] || '01').padStart(2, '0')}`;
}

export function today() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// 金額：不明は「未確認」。0円とは表示しない
export function fmtYen(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '未確認';
  n = Number(n);
  const full = n.toLocaleString('ja-JP') + '円';
  if (n >= 1e8) return `${full}（約${(n / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}億円）`;
  if (n >= 1e4) return `${full}（約${(n / 1e4).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円）`;
  return full;
}
export function fmtYenShort(n) {
  if (n === null || n === undefined) return '未確認';
  if (n >= 1e8) return `${(n / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}億円`;
  if (n >= 1e4) return `${(n / 1e4).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}万円`;
  return `${n.toLocaleString('ja-JP')}円`;
}
export function fmtNum(n) {
  if (n === null || n === undefined) return '未確認';
  return Number(n).toLocaleString('ja-JP');
}

// 検索用に表記ゆれをそろえる（全角半角・大文字小文字・カタカナ/ひらがな）
export function norm(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･\-‐–—_.,、。（）()「」『』]/g, '');
}

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' / ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(headers, rows) {
  const lines = [headers.map(h => csvCell(h.label)).join(',')];
  for (const r of rows) lines.push(headers.map(h => csvCell(h.get(r))).join(','));
  // Excelで文字化けしないよう先頭にBOMを付ける
  return '﻿' + lines.join('\r\n');
}

export function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function uniq(arr) { return [...new Set(arr)]; }

export function countBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const keys = [].concat(keyFn(x));
    for (const k of keys) if (k !== null && k !== undefined) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
