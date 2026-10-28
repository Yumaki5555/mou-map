// トップページ：①題名と短い説明 → ②登録件数の概要 → ③どこから探すか・何を調べるか → ④初めての方へ（3分でわかる）→ ⑤詳しい機能の入口
// 最初の画面には長い説明を出さず、件数の数え方などは折りたたみにまとめる。件数はすべてデータから数える（固定の数字は書かない）
import { esc, fmtDate } from './util.js';
import { validityCounts, levelCounts, countryName } from './data.js';

const EXAMPLES = ['宮城県 ベトナム', 'インドネシア 介護', 'NAGOMi', '外務省 EPA'];

export function homePage(ctx) {
  const { db, app } = ctx;
  // 登録済み：公式資料で締結を確認できた協定（文書の種類を問わない。同じ協定の更新・後継は1件）。締結予定・報道のみは含めない
  const official = db.groups.filter(g => g.official);
  const signed = official.filter(g => !g.planned);
  const vc = validityCounts(official);
  const lc = levelCounts(signed);
  const news = db.groups.filter(g => !g.official && !g.planned).length;
  const L = (params, label, n, cls = '') => `<li class="kpi ${cls}"><a href="#/map?${new URLSearchParams({ ...params, doc: 'all', ev: 'official' })}"><span class="kpi-k">${esc(label)}</span><span class="kpi-n"><b>${n}</b>件</span></a></li>`;
  // 相手国：登録済みの協定が多い国
  const cMap = new Map();
  for (const g of signed) for (const c of g.countries) cMap.set(c, (cMap.get(c) || 0) + 1);
  const countries = [...cMap].sort((a, b) => b[1] - a[1] || countryName(db, a[0]).localeCompare(countryName(db, b[0]), 'ja'));

  app.innerHTML = `
    <section class="hero3">
      <h1>日本と海外の協定を調べる</h1>
      <p class="hero3-lead">地域や相手国を選んで、協定の内容と実施状況を確認できます。</p>
    </section>

    <section class="home-kpi" aria-labelledby="kpi-h">
      <h2 id="kpi-h" class="kpi-h">このサイトの登録件数<span class="kpi-asof">${esc(fmtDate(db.config.data_as_of))}時点</span></h2>
      <ul class="kpis">
        ${L({ v: 'all' }, '登録済み', vc.signed_total, 'kpi-total')}
        ${L({ v: 'valid' }, '有効確認', vc.valid_confirmed, 'kpi-valid')}
        ${L({ vs: 'unconfirmed' }, '有効性未確認', vc.unconfirmed, 'kpi-unk')}
        ${L({ vs: 'ended_confirmed' }, '終了確認', vc.ended_confirmed, 'kpi-ended')}
      </ul>
      <p class="kpi-sub">登録済みの内訳：都道府県が締結 ${lc.prefecture}件・国・省庁（全国が対象）${lc.national}件${lc.municipality ? `・市区町村 ${lc.municipality}件` : ''}${lc.organization ? `・団体・企業など ${lc.organization}件` : ''}${vc.signed_not_started ? `／締結済みで開始前 ${vc.signed_not_started}件（登録済みに含む）` : ''}</p>
      <details class="howcount" id="howcount"><summary>件数の数え方</summary>
        <ul>
          <li>同じ協定の更新・再締結・後継の文書はまとめて<b>1件</b>と数えます。</li>
          <li>協定は、締結した主体（国・省庁／都道府県／市区町村／団体など）のところで1回だけ数えます。<b>国・省庁の協定は全国が対象ですが、各都道府県の件数には入れません。</b>団体・企業の協定を、本部のある都道府県の件数に入れることもしません。</li>
          <li>「登録済み」は、公式資料で締結を確認できた協定（有効確認・有効性未確認・終了確認・締結済みで開始前）の合計です。締結予定（予定の発表だけ）${vc.planned ? `${vc.planned}件` : ''}と、報道のみで公式資料を確認できていない記録${news ? `${news}件` : ''}は含めません。</li>
          <li>「有効確認」は、今も効力があると公式資料で確認できたもの（有効期間内・更新を確認・現在の一覧に掲載など）です。期限を過ぎて更新を確認できないものは、自動的に「有効性未確認」になります。</li>
          <li>「有効性未確認」は、今も有効かを確かめられていないもので、終了したという意味ではありません。</li>
          <li>協定に基づく事業が行われているか（事業の実施状況）は、有効性とは別に確認しています。有効な協定でも、事業が確認できていないものがあります。</li>
          <li>上の件数は、MOU（覚書）だけでなく、EPA・交換公文・R/D（討議議事録）・ワーキング・ホリデーの取決めなども含めた数です。「協定を探す」の地図と一覧は、最初は「有効確認のみ・MOU・MOCのみ」で表示します（条件は変えられます）。</li>
          <li>このサイトに登録した件数で、全国の実際の総数ではありません（<a href="#/about">調査の範囲</a>）。</li>
        </ul>
      </details>
    </section>

    <section class="home-entry" aria-labelledby="where-h">
      <h2 id="where-h">どこから探しますか？</h2>
      <div class="entry-grid">
        <div class="entry-card">
          <h3><span class="entry-n" aria-hidden="true">1</span>都道府県から探す</h3>
          <label class="visually-hidden" for="h-pref">都道府県を選ぶ</label>
          <select id="h-pref"><option value="">都道府県を選ぶ…</option>${db.prefs.map(p => `<option value="${p.code}">${esc(p.name)}</option>`).join('')}</select>
          <p class="entry-alt"><a href="#/map?focus=map&amp;v=all&amp;doc=all">日本地図から選ぶ</a></p>
        </div>
        <div class="entry-card">
          <h3><span class="entry-n" aria-hidden="true">2</span>相手国から探す</h3>
          <label class="visually-hidden" for="h-country">相手国・地域を選ぶ</label>
          <select id="h-country"><option value="">国・地域を選ぶ…</option>${countries.map(([c, n]) => `<option value="${c}">${esc(countryName(db, c))}（${n}件）</option>`).join('')}</select>
          <p class="entry-alt">${countries.slice(0, 4).map(([c]) => `<a href="#/map?c=${c}&amp;v=all&amp;doc=all">${esc(countryName(db, c))}</a>`).join('　')}　<a href="#/country">国の一覧</a></p>
        </div>
        <div class="entry-card">
          <h3><span class="entry-n" aria-hidden="true">3</span>キーワードで探す</h3>
          <form id="h-search" role="search" class="entry-q">
            <label class="visually-hidden" for="h-q">検索する言葉</label>
            <input type="search" id="h-q" placeholder="例：宮城県 ベトナム" autocomplete="off" enterkeyhint="search"><button class="btn" type="submit">検索</button>
          </form>
          <p class="entry-alt">${EXAMPLES.map(x => `<a href="#/search?q=${encodeURIComponent(x)}">${esc(x)}</a>`).join('　')}</p>
        </div>
      </div>

      <h2 id="what-h">何を調べますか？</h2>
      <ul class="intent-grid" aria-labelledby="what-h">
        <li><a class="intent" href="#/map"><b>協定の内容</b><span>誰が、どの国と、何を約束したか（正式名称・締結日・有効性・原文）</span></a></li>
        <li><a class="intent" href="#/map?v=all&amp;doc=all&amp;focus=status"><b>事業の実施状況</b><span>協定に基づく具体的な事業が行われているか（有効性とは別に確認）</span></a></li>
        <li><a class="intent" href="#/impact"><b>地域への影響</b><span>受入れ人数・予算・住民への説明など、地域で記録されたこと</span></a></li>
      </ul>
    </section>

    <section class="home-guide" aria-label="初めての方へ">
      <a class="guide-link" href="#/guide"><span class="guide-k">初めての方へ</span><b>3分でわかるMOU</b><span>5つの図で、海外との約束（覚書）の仕組みと、地域との関係を説明します</span></a>
    </section>

    <section class="home-more" aria-labelledby="more-h">
      <h2 id="more-h">もっと詳しく</h2>
      <div class="more-cols">
        <div><h3>詳しく調べる</h3><ul>
          <li><a href="#/country">相手国から探す</a></li><li><a href="#/actors">締結主体（国・自治体・団体の名前）</a></li>
          <li><a href="#/types">協定の種類（MOU・EPA・R/Dなど）</a></li><li><a href="#/field">分野・省庁から探す</a></li>
          <li><a href="#/national">国・省庁の協定（全国対象）</a></li><li><a href="#/list">有効性の区分で探す</a></li></ul></div>
        <div><h3>統計・分析</h3><ul>
          <li><a href="#/impact">地域への影響</a></li><li><a href="#/compare">比較グラフ・集計</a></li><li><a href="#/issues">制度の課題を考える</a></li></ul></div>
        <div><h3>資料・出典</h3><ul>
          <li><a href="#/about">調査状況・出典・有効性の判定方法</a></li><li><a href="#/about?to=ab-clair">CLAIRの一覧との照合</a></li>
          <li><a href="#/data">データのダウンロード（CSV）</a></li></ul></div>
      </div>
    </section>`;

  // 都道府県・相手国から探すときは、上の「登録済み」と同じ範囲（締結済みすべて・すべての文書）で開く（条件はあとから絞れる）
  app.querySelector('#h-pref').addEventListener('change', e => { if (e.target.value) ctx.go('/map', { p: e.target.value, v: 'all', doc: 'all' }); });
  app.querySelector('#h-country').addEventListener('change', e => { if (e.target.value) ctx.go('/map', { c: e.target.value, v: 'all', doc: 'all' }); });
  app.querySelector('#h-search').addEventListener('submit', e => {
    e.preventDefault();
    const q = app.querySelector('#h-q').value.trim();
    ctx.go('/search', q ? { q } : {});
  });
}
