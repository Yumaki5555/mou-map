// トップページ：①3分でわかる（大きな帯）→ ②2つの入口（日本の地域から探す／相手国・協定から探す）→ ③協定をどう見る？（約束→実施→影響の図と、有効・終了・確認中の件数）→ ④さらに詳しく調べる
// 文章は短くし、図・アイコン・地図で伝える。件数はすべてデータから数える（固定の数字は書かない）
import { esc, fmtDate, norm } from './util.js';
import { validityCounts, levelCounts, countryName, loadSummary } from './data.js';
import { ILL } from './icons.js';

// 地図・一覧は「登録済み」と同じ範囲（締結済みすべて・すべての文書）で開く（条件はあとから絞れる）
const WIDE = { v: 'all', doc: 'all' };
const MAP_URL = '#/map?focus=map&v=all&doc=all';
const ARROW = '<svg class="arw" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOUPE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

// 3分でわかる の帯の絵（本・電球・地球・まち並み）
const GUIDE_ART = `<svg viewBox="0 0 300 170" aria-hidden="true" focusable="false">
  <circle cx="150" cy="94" r="74" fill="#d3eef2"/><circle cx="268" cy="38" r="18" fill="#e3f4f7"/><circle cx="30" cy="44" r="11" fill="#e3f4f7"/>
  <g transform="translate(50 108)" fill="none" stroke="#007f93"><circle r="33" fill="#fff" stroke-width="4"/><ellipse rx="13" ry="33" stroke-width="3"/><path d="M-33 0h66M-29-15h58M-29 15h58" stroke-width="3"/></g>
  <path d="M84 72v76c26-8 52-6 76 4 24-10 50-12 76-4V72z" fill="#007f93"/>
  <path d="M160 72c-20-12-46-14-68-6v74c22-8 48-6 68 6zM160 72c20-12 46-14 68-6v74c-22-8-48-6-68 6z" fill="#fff" stroke="#007f93" stroke-width="4" stroke-linejoin="round"/>
  <path d="M104 88c14-4 28-4 42 2M104 102c14-4 28-4 42 2M104 116c14-4 28-4 42 2M174 90c14-6 28-6 42-2M174 104c14-6 28-6 42-2M174 118c10-4 20-5 30-3" fill="none" stroke="#7cc6d1" stroke-width="3.2" stroke-linecap="round"/>
  <g transform="translate(160 34)"><path d="M0-22v-7M-21-12l-6-4M21-12l6-4M-25 4h-7M25 4h7" stroke="#007f93" stroke-width="3.2" stroke-linecap="round"/><circle r="16" fill="#ffd45c" stroke="#007f93" stroke-width="3.5"/><path d="M-5 3l5 5 5-5" fill="none" stroke="#9a6a00" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="-8" y="14" width="16" height="9" rx="2.5" fill="#007f93"/></g>
  <g><path d="M240 150v-24l11-9 11 9v24z" fill="#2a9fb0"/><rect x="259" y="94" width="18" height="56" rx="2" fill="#4fb3c2"/><rect x="275" y="76" width="21" height="74" rx="2" fill="#007f93"/>
  <path d="M247 134h8M264 104h8M264 116h8M264 128h8M280 88h11M280 100h11M280 112h11M280 124h11" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M236 150h62" stroke="#005f6e" stroke-width="4" stroke-linecap="round"/></g>
</svg>`;

// 地域の名前から行き先を決める（入力欄の文字・候補から選んだ文字のどちらでもよい）
//   都道府県 → { pref: '04' }、市区町村 → { city: '041009' }、どちらでもない → { q: 入力した文字 }
// cities：[{ code, name, pref_code }]（索引の協定と data/build/summary.json の市区町村）
export function resolveRegion(db, text, cities = []) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  // 候補の「仙台市（宮城県）」の形は、かっこの中の都道府県で同じ名前の市区町村を見分ける
  const m = raw.match(/^(.+?)[（(]([^）)]+)[）)]$/);
  const name = norm(m ? m[1] : raw);
  const inPref = m ? db.prefs.find(p => norm(p.name) === norm(m[2]))?.code : null;
  // 都道府県は「宮城」のように 都・道・府・県 を省いてもよい（「京都」と「東京都」は区別される）
  const bare = s => norm(s).replace(/(都|道|府|県)$/, '');
  const pref = db.prefs.find(p => norm(p.name) === name || bare(p.name) === name);
  if (pref) return { pref: pref.code };
  const hits = cities.filter(c => norm(c.name) === name && (!inPref || c.pref_code === inPref));
  if (hits.length === 1) return { city: hits[0].code };
  return { q: m ? m[1].trim() : raw };
}

// 索引にある市区町村（協定が登録されているところ）
function citiesFromCore(db) {
  const map = new Map();
  for (const m of db.mous) if (m.japan_level === 'municipality' && /^\d{6}$/.test(m.municipality_code || '') && m.municipality_name) map.set(m.municipality_code, { code: m.municipality_code, name: m.municipality_name, pref_code: m.municipality_code.slice(0, 2) });
  return map;
}

export function homePage(ctx) {
  const { db, app } = ctx;
  // 登録済み：公式資料で締結を確認できた協定（文書の種類を問わない。同じ協定の更新・後継は1件）。締結予定・報道のみは含めない
  const official = db.groups.filter(g => g.official);
  const signed = official.filter(g => !g.planned);
  const vc = validityCounts(official);
  const lc = levelCounts(signed);
  const news = db.groups.filter(g => !g.official && !g.planned).length;
  // 相手国：登録済みの協定が多い国から
  const cMap = new Map();
  for (const g of signed) for (const c of g.countries) cMap.set(c, (cMap.get(c) || 0) + 1);
  const countries = [...cMap].sort((a, b) => b[1] - a[1] || countryName(db, a[0]).localeCompare(countryName(db, b[0]), 'ja'));
  const cities = citiesFromCore(db);
  const cityOpts = () => [...cities.values()].sort((a, b) => a.code.localeCompare(b.code)).map(c => `<option value="${esc(c.name)}（${esc(db.prefByCode.get(c.pref_code)?.name || '')}）"></option>`).join('');
  const VS = (params, label, n, cls) => `<li><a class="vs ${cls}" href="#/map?${new URLSearchParams({ ...params, doc: 'all', ev: 'official' })}"><span class="vs-k">${esc(label)}</span><span class="vs-n"><b>${n}</b>件</span></a></li>`;

  app.innerHTML = `
    <h1 class="visually-hidden">日本と世界のMOU・協定マップ</h1>

    <section class="gb-wrap" aria-labelledby="gb-h">
      <a class="guide-banner" href="#/guide">
        <span class="gb-text">
          <h2 id="gb-h" class="gb-h"><span class="gb-3">3分</span>でわかる<span class="gb-mou">MOU・協定</span></h2>
          <span class="gb-d"><span>海外との約束を</span><span>図でやさしく解説</span></span>
          <span class="gb-go">図で見る${ARROW}</span>
        </span>
        <span class="gb-art">${GUIDE_ART}</span>
      </a>
    </section>

    <section class="gates2" aria-label="探し方を選ぶ">
      <div class="gate2">
        <div class="g2-head">
          <h2>日本の地域から探す</h2>
          <p>都道府県・市区町村ごとの協定を調べられます。</p>
        </div>
        <a class="g2-art" href="${MAP_URL}" tabindex="-1" aria-hidden="true"><img src="assets/img/home-japan.svg" alt="" width="300" height="320" decoding="async"></a>
        <form class="g2-q" role="search" id="h-region">
          <label class="visually-hidden" for="h-region-q">都道府県・市区町村の名前</label>
          <span class="g2-q-in">${LOUPE}<input id="h-region-q" type="search" list="h-region-list" placeholder="都道府県・市区町村を入力" autocomplete="off" enterkeyhint="search"></span>
          <button class="btn" type="submit">探す</button>
          <datalist id="h-region-list">${db.prefs.map(p => `<option value="${esc(p.name)}"></option>`).join('')}${cityOpts()}</datalist>
        </form>
        <div class="g2-btns">
          <a class="btn btn-big" href="${MAP_URL}">${ILL.map}地図から探す</a>
        </div>
        <p class="g2-alt"><label for="h-pref">都道府県から探す</label><select id="h-pref"><option value="">選んでください</option>${db.prefs.map(p => `<option value="${p.code}">${esc(p.name)}</option>`).join('')}</select></p>
      </div>

      <div class="gate2">
        <div class="g2-head">
          <h2>相手国・協定から探す</h2>
          <p>どの国・組織と、どんな協定を結んでいるか調べられます。</p>
        </div>
        <a class="g2-art" href="#/country" tabindex="-1" aria-hidden="true"><img src="assets/img/home-world.svg" alt="" width="360" height="130" decoding="async"></a>
        <form class="g2-q" role="search" id="h-world">
          <label class="visually-hidden" for="h-world-q">国名・協定名・キーワード</label>
          <span class="g2-q-in">${LOUPE}<input id="h-world-q" type="search" list="h-world-list" placeholder="国名・協定名・キーワード" autocomplete="off" enterkeyhint="search"></span>
          <button class="btn" type="submit">探す</button>
          <datalist id="h-world-list">${countries.map(([c]) => `<option value="${esc(countryName(db, c))}"></option>`).join('')}</datalist>
        </form>
        <div class="g2-btns g2-btns-2">
          <a class="btn btn-big" href="#/country">${ILL.globe}相手国から探す</a>
          <a class="btn btn-big" href="#/types">${ILL.doc}協定の種類から探す</a>
        </div>
      </div>
    </section>

    <section class="look" aria-labelledby="look-h">
      <h2 id="look-h">協定をどう見る？</h2>
      <ol class="look3">
        <li><a href="#/map"><span class="l3-ic">${ILL.signed}</span><b>何を約束？</b><span class="l3-d">協定の内容</span></a></li>
        <li><a href="#/map?v=all&amp;doc=all&amp;focus=status"><span class="l3-ic">${ILL.people}</span><b>実際に実施？</b><span class="l3-d">事業の実施状況</span></a></li>
        <li><a href="#/impact"><span class="l3-ic">${ILL.town}</span><b>地域への影響は？</b><span class="l3-d">人数・予算・住民への説明</span></a></li>
      </ol>
      <div class="vsbox">
        <p class="vs-h">有効・終了・確認中を区別<span class="vs-asof">${esc(fmtDate(db.config.data_as_of))}時点</span></p>
        <ul class="vs-list">
          ${VS({ v: 'valid' }, '有効確認', vc.valid_confirmed, 'vs-valid')}
          ${VS({ vs: 'unconfirmed' }, '有効性未確認', vc.unconfirmed, 'vs-unk')}
          ${VS({ vs: 'ended_confirmed' }, '終了確認', vc.ended_confirmed, 'vs-ended')}
          ${VS({ v: 'all' }, '登録済み（合計）', vc.signed_total, 'vs-total')}
        </ul>
        <details class="howcount" id="howcount"><summary>件数の数え方</summary>
          <ul>
            <li>登録済みの内訳：都道府県が締結 ${lc.prefecture}件・国・省庁（全国が対象）${lc.national}件${lc.municipality ? `・市区町村 ${lc.municipality}件` : ''}${lc.organization ? `・団体・企業など ${lc.organization}件` : ''}${vc.signed_not_started ? `／締結済みで開始前 ${vc.signed_not_started}件（登録済みに含む）` : ''}</li>
            <li>同じ協定の更新・再締結・後継の文書はまとめて<b>1件</b>と数えます。</li>
            <li>協定は、締結した主体（国・省庁／都道府県／市区町村／団体など）のところで1回だけ数えます。<b>国・省庁の協定は全国が対象ですが、各都道府県の件数には入れません。</b>団体・企業の協定を、本部のある都道府県の件数に入れることもしません。</li>
            <li>「登録済み」は、公式資料で締結を確認できた協定（有効確認・有効性未確認・終了確認・締結済みで開始前）の合計です。締結予定（予定の発表だけ）${vc.planned ? `${vc.planned}件` : ''}と、報道のみで公式資料を確認できていない記録${news ? `${news}件` : ''}は含めません。</li>
            <li>「有効確認」は、今も効力があると公式資料で確認できたもの（有効期間内・更新を確認・現在の一覧に掲載など）です。期限を過ぎて更新を確認できないものは、自動的に「有効性未確認」になります。</li>
            <li>「有効性未確認」は、今も有効かを確かめられていないもの（確認中）で、終了したという意味ではありません。</li>
            <li>協定に基づく事業が行われているか（事業の実施状況）は、有効性とは別に確認しています。有効な協定でも、事業が確認できていないものがあります。</li>
            <li>上の件数は、MOU（覚書）だけでなく、EPA・交換公文・R/D（討議議事録）・ワーキング・ホリデーの取決めなども含めた数です。「協定を探す」の地図と一覧は、最初は「有効確認のみ・MOU・MOCのみ」で表示します（条件は変えられます）。</li>
            <li>このサイトに登録した件数で、全国の実際の総数ではありません（<a href="#/about">調査の範囲</a>）。</li>
          </ul>
        </details>
      </div>
    </section>

    <section class="more4" aria-labelledby="more4-h">
      <h2 id="more4-h">さらに詳しく調べる</h2>
      <ul class="m4">
        <li><span class="m4-ic">${ILL.gov}</span><span class="m4-b"><a class="m4-t" href="#/actors">締結主体・分野</a><span class="m4-s"><a href="#/field">分野・省庁</a><a href="#/national">国・省庁の協定</a></span></span></li>
        <li><span class="m4-ic">${ILL.chart}</span><span class="m4-b"><a class="m4-t" href="#/compare">比較グラフ</a><span class="m4-s"><a href="#/impact">地域への影響</a><a href="#/issues">制度の課題</a></span></span></li>
        <li><span class="m4-ic">${ILL.source}</span><span class="m4-b"><a class="m4-t" href="#/about">調査状況・出典</a><span class="m4-s"><a href="#/about?to=ab-clair">CLAIRの一覧との照合</a></span></span></li>
        <li><span class="m4-ic">${ILL.table}</span><span class="m4-b"><a class="m4-t" href="#/data">データ</a><span class="m4-s"><a href="#/data">CSVのダウンロード</a><a href="#/list">有効性の区分で一覧</a></span></span></li>
      </ul>
    </section>`;

  // 地域から探す：市区町村の候補は、入力欄を使い始めたときに件数のまとめ（summary.json）から足す（最初の表示を軽くするため）
  let summary = null;
  const moreCities = () => summary || (summary = loadSummary().then(s => {
    for (const [code, c] of Object.entries(s.municipalities || {})) if (!cities.has(code) && c.name) cities.set(code, { code, name: c.name, pref_code: c.pref_code });
    const list = app.querySelector('#h-region-list');
    if (list) list.innerHTML = db.prefs.map(p => `<option value="${esc(p.name)}"></option>`).join('') + cityOpts();
  }).catch(() => {}));
  const rq = app.querySelector('#h-region-q');
  rq.addEventListener('focus', moreCities, { once: true });
  app.querySelector('#h-region').addEventListener('submit', async e => {
    e.preventDefault();
    if (!rq.value.trim()) { ctx.go('/map', { focus: 'map', ...WIDE }); return; }
    await moreCities();
    const to = resolveRegion(db, rq.value, [...cities.values()]);
    if (to.pref) ctx.go('/map', { p: to.pref, ...WIDE });
    else if (to.city) ctx.go('/city/' + to.city);
    else ctx.go('/search', { q: to.q });
  });
  app.querySelector('#h-pref').addEventListener('change', e => { if (e.target.value) ctx.go('/map', { p: e.target.value, ...WIDE }); });
  // 相手国・協定から探す：国名そのものなら、その国で地図と一覧を開く。それ以外はキーワード検索
  app.querySelector('#h-world').addEventListener('submit', e => {
    e.preventDefault();
    const q = app.querySelector('#h-world-q').value.trim();
    if (!q) { ctx.go('/country'); return; }
    const c = db.countries.find(x => [x.ja, x.en, ...(x.aliases || [])].some(n => n && norm(n) === norm(q)));
    if (c) ctx.go('/map', { c: c.code, ...WIDE });
    else ctx.go('/search', { q });
  });
}
