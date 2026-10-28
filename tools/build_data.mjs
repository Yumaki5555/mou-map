// 公開用の軽いデータを作る（データを直したら、公開の前に必ず実行してください）
// 使い方（mou-map フォルダで実行）： node tools/build_data.mjs
//
// 作るもの（data/build/ フォルダ。手で直さないでください）
//   core.json … 最初の画面・地図・一覧に必要な項目だけを集めたもの（全協定の索引）。詳しい内容（出典・合意内容・予算など）は
//               協定のページを開いたときに data/mous/*.json から読み込みます。
//   geo.json  … 日本地図の形（画面の座標に変換し、見た目が変わらない程度に点を減らしたもの）。
// あわせて index.html の「data:start〜data:end」の目印の間に、データの版番号を書き込みます（古いデータが使われ続けないように）。
//
// 正本は data/mous/*.json などの元のデータです。core.json は元のデータから毎回作り直します。
// 元のデータを直したのに core.json を作り直さないと、地図・一覧に反映されません（node tools/test_site.mjs で検出できます）。
// --src フォルダ を付けると、そのフォルダの data を元にします（コミット済みの版だけで作るときなど）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildDB } from '../assets/js/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argSrc = process.argv.indexOf('--src');
const SRC = argSrc > 0 ? resolve(process.argv[argSrc + 1]) : ROOT;
const OUT = join(ROOT, 'data', 'build');
const readText = p => readFileSync(join(SRC, p), 'utf8');
const J = p => JSON.parse(readText(p));
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

// ---------- 元のデータを読み込み、サイトと同じ方法で集計の土台を作る ----------
// 元のファイルの指紋（改行や空白の違いでは変わらないよう、JSONとして読み直した形で計算）。
// core.json に記録し、node tools/test_site.mjs で「元のデータを直したのに作り直していない」ことを見つけます
export function sourceHashes(root = SRC) {
  const r = p => JSON.stringify(JSON.parse(readFileSync(join(root, p), 'utf8')));
  const index = JSON.parse(r('data/mous/index.json'));
  const files = {};
  for (const f of index.files) files['data/mous/' + f] = sha(r('data/mous/' + f));
  for (const p of ['data/config.json', 'data/prefectures.json', 'data/countries.json', 'data/survey.json', 'data/systems.json', 'data/mous/index.json']) files[p] = sha(r(p));
  return files;
}

function main() {
  const index = J('data/mous/index.json');
  const records = [];
  for (const f of index.files) {
    const d = J('data/mous/' + f);
    for (const m of (Array.isArray(d) ? d : d.mous || [])) records.push({ ...m, _file: f });
  }
  const config = J('data/config.json');
  const prefs = J('data/prefectures.json').prefectures;
  const countries = J('data/countries.json').countries;
  const survey = J('data/survey.json');
  const systems = J('data/systems.json').systems || [];
  const db = buildDB({ config, prefs, countries, survey, records, stats: null, warnings: [], systems });

  // ---------- 1. core.json ----------
  const files = index.files;
  const fileNo = new Map(files.map((f, i) => [f, i]));
  const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; return r; };
  // 有効性は開いた日の日付で判定し直すため、判定に使う元の項目（validity_state・開始日・期限・終了日など）をそのまま入れる
  const KEEP = ['id', 'group_key', 'title_ja', 'doc_type', 'doc_category', 'japan_level', 'japan_org', 'japan_org_type', 'pref_code', 'municipality_code', 'municipality_name',
    'country_code', 'partner_org', 'partner_type', 'fields', 'status', 'evidence_level', 'validity_state', 'effective_date', 'valid_until', 'renewed_until', 'ended_date',
    'signed_date', 'announced_date'];
  const mous = db.mous.map(m => {
    const raw = m._raw;
    const r = pick(raw, KEEP);
    r.file = fileNo.get(m._file);
    if (m.additional_partners.length) r.additional_partners = m.additional_partners.map(a => pick(a, ['country_code', 'partner_org']));
    if (m.related_regions.length) r.related_regions = m.related_regions.map(x => ({ pref_code: x.pref_code }));
    if (m.blurb) r.blurb = m.blurb;
    // 元のデータから決めた分類（文書の種類の詳しい区分・日本側の種別・当事者の組み合わせ・受入れとの関係）と、
    // 地域への影響の記録の有無（分野×段階だけ）。詳しい内容は協定のページで元のデータから表示します
    const imp = [...new Set(m.impacts.map(i => `${i.category}|${i.stage}`))].map(s => s.split('|'));
    const aimp = [...new Set(m._autoImpacts.map(i => i.category))];
    r._d = { kind: m._kind, orgType: m._orgType, pairKind: m._pairKind, relation: m._relation };
    if (imp.length) r._d.imp = imp;
    if (aimp.length) r._d.aimp = aimp;
    return r;
  });
  const sv = survey.prefectures || {};
  const core = {
    _note: 'tools/build_data.mjs が data/mous/*.json などから作ったファイルです。手で直さず、元のデータを直してから作り直してください。',
    src: sourceHashes(),
    config,
    prefs,
    countries,
    systems: systems.map(s => pick(s, ['key', 'name', 'kind', 'start', 'state'])),
    survey: {
      last_updated: survey.last_updated,
      stages: survey.stages || [],
      coverage: survey.coverage || [],
      prefectures: Object.fromEntries(Object.entries(sv).map(([k, v]) => [k, {
        stage1: pick(v.stage1 || {}, ['result', 'recheck']),
        stage2: pick(v.stage2 || {}, ['result', 'recheck']),
      }])),
    },
    files,
    mous,
  };
  mkdirSync(OUT, { recursive: true });
  const coreText = JSON.stringify(core);
  writeFileSync(join(OUT, 'core.json'), coreText);

  // ---------- 2. geo.json ----------
  const geoText = JSON.stringify(buildGeo());
  writeFileSync(join(OUT, 'geo.json'), geoText);

  // ---------- 3. index.html に版番号 ----------
  const ver = sha(coreText + geoText);
  const indexPath = join(ROOT, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const block = '<!-- data:start（tools/build_data.mjs が書き換えます） -->' + nl
    + `<meta name="data-version" content="${ver}">` + nl
    + `<link rel="preload" href="data/build/core.json?v=${ver}" as="fetch" crossorigin>` + nl
    + '<!-- data:end -->';
  const before = html;
  html = html.replace(/<!-- data:start.*?<!-- data:end -->/s, () => block);
  if (html === before && !before.includes(block)) {
    console.error('index.html に <!-- data:start --> ～ <!-- data:end --> の目印が見つかりません');
    process.exit(1);
  }
  if (html !== before) writeFileSync(indexPath, html);

  const groups = db.groups.length;
  console.log(`作成しました：core.json（${mous.length}文書・${groups}協定、${Math.round(coreText.length / 1024)}KB）、geo.json（${Math.round(geoText.length / 1024)}KB）、データの版 ${ver}`);
  if (SRC !== ROOT) console.log(`元のデータ：${SRC}`);
}

// ---------- 日本地図 ----------
// 画面の地図と同じ座標（幅600×高さ640）に変換し、0.2画素より細かい凹凸を省いて小さくします。
// 隣どうしの県の境界線は同じ線を使うので、すき間や重なりはできません。沖縄県は左上の枠に別の縮尺で入れます。
const MAP_W = 600, MAP_H = 640;
const LABEL_NUDGE = { '13': [2, 3], '14': [0, 4], '11': [0, -2], '12': [6, 4], '27': [-3, 2], '26': [-2, -6], '28': [-6, -2], '29': [2, 6], '25': [2, 0], '23': [0, 4], '34': [0, 2], '40': [0, -2] };
function buildGeo() {
  const require = createRequire(import.meta.url);
  const d3 = require('../assets/vendor/d3.min.js');
  const topo = JSON.parse(readFileSync(join(ROOT, 'data/geo/japan_prefectures.topojson'), 'utf8'));
  const pad = Math.min(MAP_W, MAP_H) * 0.02;
  const main = d3.geoMercator().fitExtent([[pad, pad], [MAP_W - pad, MAP_H - pad]], { type: 'MultiPoint', coordinates: [[128.0, 26.9], [148.9, 45.6]] });
  const ib = { x: MAP_W * 0.03, y: MAP_H * 0.03, w: MAP_W * 0.36, h: MAP_H * 0.2 };
  const inset = d3.geoMercator().fitExtent([[ib.x + 6, ib.y + 18], [ib.x + ib.w - 6, ib.y + ib.h - 6]], { type: 'MultiPoint', coordinates: [[122.9, 24.0], [128.35, 26.95]] });
  const tr = topo.transform;
  const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; }); });
  const cache = new Map();
  const arcPts = (i, proj, tag) => {
    const k = tag + i;
    if (!cache.has(k)) cache.set(k, simplify(arcs[i].map(p => proj(p)), 0.2));
    return cache.get(k);
  };
  const out = {};
  for (const g of topo.objects.prefectures.geometries) {
    const code = g.properties.code;
    const oki = code === '47';
    const proj = oki ? inset : main;
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    let d = '';
    let best = null, bestA = -1;
    for (const poly of polys) {
      poly.forEach((ring, ri) => {
        const pts = [];
        for (const ai of ring) {
          let p = arcPts(ai < 0 ? ~ai : ai, proj, oki ? 'o' : 'm');
          if (ai < 0) p = [...p].reverse();
          pts.push(...(pts.length ? p.slice(1) : p));
        }
        const area = ringArea(pts);
        // 0.3平方画素より小さい島は、拡大しても見分けられないので省く
        if (Math.abs(area) < 0.3) return;
        const q = [];
        for (const [x, y] of pts) { const p = [Math.round(x * 10), Math.round(y * 10)]; const l = q[q.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) q.push(p); }
        if (q.length < 3) return;
        let s = `M${q[0][0] / 10} ${q[0][1] / 10}`;
        for (let i = 1; i < q.length; i++) { const dx = (q[i][0] - q[i - 1][0]) / 10, dy = (q[i][1] - q[i - 1][1]) / 10; s += `l${dx}${dy < 0 ? '' : ' '}${dy}`; }
        d += s + 'z';
        if (ri === 0 && Math.abs(area) > bestA) { bestA = Math.abs(area); best = pts; }
      });
    }
    // 県名・件数を書く位置：いちばん大きい島の重心（混み合う県は少しずらす）
    const c = centroid(best);
    const n = LABEL_NUDGE[code] || [0, 0];
    out[code] = { name: g.properties.name, d, lx: Math.round((c[0] + n[0]) * 10) / 10, ly: Math.round((c[1] + n[1]) * 10) / 10 };
  }
  return { w: MAP_W, h: MAP_H, inset: ib, prefs: out };
}
function ringArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  return a ? [cx / (3 * a), cy / (3 * a)] : p[0];
}
// 線の単純化（ダグラス・ポイカー法）。両端の点は必ず残す（隣の県と同じ境界線になるように）
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      const d = L < 1e-6 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
