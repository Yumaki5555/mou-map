// 図解とボタンで使う小さなイラスト（線画。色は文字色を使う）
const svg = (body, vb = '0 0 48 48') => `<svg class="ill" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ILL = {
  // 役所の建物（日本政府・自治体）
  gov: svg('<path d="M6 18 24 8l18 10"/><path d="M9 18h30"/><path d="M12 20v14M20 20v14M28 20v14M36 20v14"/><path d="M7 38h34M5 42h38"/>'),
  // 地球（外国政府・海外機関）
  globe: svg('<circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c5 5 7.5 11 7.5 17S29 36 24 41c-5-5-7.5-11-7.5-17S19 12 24 7Z"/>'),
  // 文書（覚書）
  doc: svg('<path d="M13 5h16l8 8v30H13z"/><path d="M29 5v8h8"/><path d="M18 21h14M18 27h14M18 33h9"/>'),
  // 署名済みの文書
  signed: svg('<path d="M12 5h17l8 8v30H12z"/><path d="M29 5v8h8"/><path d="M17 20h14M17 26h10"/><path d="M17 36c3-4 5 2 8-2s4 1 7-1"/>'),
  // 握手（協力）
  hands: svg('<path d="M4 22l8-8 8 4 6-4 6 2 12 6"/><path d="M12 14v12l8 8a3 3 0 0 0 4-4"/><path d="M20 34l2 2a3 3 0 0 0 4-4l-2-2"/><path d="M26 36a3 3 0 0 0 4-4l-6-6"/><path d="M30 32a3 3 0 0 0 4-4l-8-8"/><path d="M44 22l-6 8"/>'),
  // 日本地図（略図）
  japan: svg('<path d="M30 5l4 2 1 5-2 3 3 2-1 4-4 1-2 3-3 1-1 3-4 2-3 3-4 1-3 3-3-1 2-3 4-2 3-3 4-2 2-3 3-2 1-4 2-4-1-4z"/><path d="M33 3l3-1 3 2-2 2"/><path d="M8 37l-3 3 1 2 3-2z"/><path d="M15 40l-2 4 3 0 1-3z"/>'),
  // 人（外国人材）
  people: svg('<circle cx="17" cy="15" r="6"/><path d="M5 40c0-7 5-12 12-12s12 5 12 12"/><circle cx="33" cy="17" r="5"/><path d="M31 28c7 0 12 4 12 11"/>'),
  // 工場・仕事
  factory: svg('<path d="M5 42V22l10 6v-6l10 6v-6l10 6V10h6v32z"/><path d="M5 42h38"/><path d="M12 34h4M22 34h4M32 34h4"/>'),
  // 本（教育・留学）
  book: svg('<path d="M24 12c-5-4-12-4-18-2v28c6-2 13-2 18 2 5-4 12-4 18-2V10c-6-2-13-2-18 2Z"/><path d="M24 12v28"/>'),
  // 観光（カメラ）
  camera: svg('<path d="M6 16h8l3-5h14l3 5h8v24H6z"/><circle cx="24" cy="27" r="7"/>'),
  // 医療（十字）
  medical: svg('<rect x="7" y="7" width="34" height="34" rx="8"/><path d="M24 15v18M15 24h18"/>'),
  // 農業（芽）
  sprout: svg('<path d="M24 42V24"/><path d="M24 26c0-8-6-13-15-13 0 8 6 13 15 13Z"/><path d="M24 22c0-7 5-12 14-12 0 7-5 12-14 12Z"/><path d="M12 42h24"/>'),
  // 家（住宅・生活）
  house: svg('<path d="M6 22 24 8l18 14"/><path d="M10 19v22h28V19"/><path d="M20 41V29h8v12"/>'),
  // 学校・病院
  school: svg('<path d="M6 18 24 8l18 10-18 10z"/><path d="M14 23v10c6 5 14 5 20 0V23"/><path d="M42 18v12"/>'),
  // お金（税金）
  yen: svg('<circle cx="24" cy="24" r="17"/><path d="M17 14l7 10 7-10"/><path d="M24 24v12M18 27h12M18 32h12"/>'),
  // 話し合い（住民・議会）
  talk: svg('<path d="M6 10h24v16H16l-6 6v-6H6z"/><path d="M34 18h8v16h-4v6l-6-6H22v-4"/>'),
  // 人口（グラフと人）
  chart: svg('<path d="M6 42h36"/><path d="M10 42V30M18 42V22M26 42V26M34 42V14"/>'),
  // 審査（スタンプ・パスポート）
  passport: svg('<rect x="10" y="5" width="26" height="38" rx="3"/><circle cx="23" cy="20" r="6"/><path d="M16 32h14M16 37h10"/><path d="M38 30l6 6-8 8-6-6z"/>'),
  // 飛行機（入国）
  plane: svg('<path d="M4 28l40-14-6 8-14 6-6 12-3-1 2-10-9 3-3 4-2-1 2-6z"/>'),
  // ルール・制度（はかり）
  scale: svg('<path d="M24 6v36M14 42h20"/><path d="M8 14h32"/><path d="M8 14 3 26a5 5 0 0 0 10 0zM40 14l-5 12a5 5 0 0 0 10 0z"/>'),
  // 虫めがね（調べる）
  search: svg('<circle cx="20" cy="20" r="12"/><path d="M29 29l12 12"/>'),
  // 開いた本（まず3分でわかる）
  openbook: svg('<path d="M24 12c-6-4-14-4-20-1v28c6-3 14-3 20 1 6-4 14-4 20-1V11c-6-3-14-3-20 1Z"/><path d="M24 12v28"/><path d="M9 18h9M9 24h9M9 30h6M30 18h9M30 24h9M30 30h6"/>'),
  // 地図ピン
  pin: svg('<path d="M24 44s14-13 14-24a14 14 0 0 0-28 0c0 11 14 24 14 24Z"/><circle cx="24" cy="20" r="5"/>'),
  // 疑問（問い）
  question: svg('<circle cx="24" cy="24" r="18"/><path d="M18 19a6 6 0 1 1 9 5c-2 1-3 2-3 5"/><path d="M24 35v.5"/>'),
  // 折りたたんだ地図（地図から探す）
  map: svg('<path d="M5 12l12-5 14 5 12-5v29l-12 5-14-5-12 5z"/><path d="M17 7v29M31 12v29"/>'),
  // まち並み（地域）
  town: svg('<path d="M4 42h40"/><path d="M7 42V24l8-6 8 6v18"/><path d="M23 42V12h16v30"/><path d="M12 30h6M12 36h6M28 18h6M28 25h6M28 32h6"/>'),
  // 表（データ）
  table: svg('<rect x="6" y="9" width="36" height="30" rx="3"/><path d="M6 18h36M6 26h36M6 33h36M18 9v30M30 9v30"/>'),
  // 出典（文書と虫めがね）
  source: svg('<path d="M10 5h16l7 7v12"/><path d="M26 5v7h7"/><path d="M10 5v34h12"/><path d="M15 17h12M15 23h8"/><circle cx="31" cy="32" r="7"/><path d="M36 37l6 6"/>'),
};
