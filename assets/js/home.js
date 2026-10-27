// トップページ（題名・2つの入口・まず3分でわかる・詳しく調べる・制度の課題を考える）と「制度の課題を考える」ページ
import { esc, fmtDate, fmtNum, fmtYen, fmtYenShort } from './util.js';
import {
  FIELDS, DOC_CATEGORIES, IMPACTS, VALIDITY, VALIDITY_SCOPE,
  filterGroups, countByPref, validityCounts, residentChange, countryName, prefName,
} from './data.js';
import { JapanMap, swatchStyle } from './map.js';
import { legendHTML, validityTiles, term } from './components.js';
import { computeMapModel, countriesWithData, bindSuggest } from './page-map.js';
import { settings, baseFilter, scopeBarHTML, bindScopeBar, scopeLabel } from './shared.js';
import { ILL } from './icons.js';

// 図解で例に使う記録（すべて公式資料で確認済みの登録データ。見つからないときはその例を表示しない）
const EX = {
  natId: 'JP-NAT-024', // 日本政府⇄インドネシア政府（特定技能の協力覚書）
  prefMinistry: 'JP-04-003', // 宮城県⇄インドネシア労働省事務総局
  prefSub: 'JP-46-003', // 鹿児島県⇄ハイズオン省
  prefUniv: 'JP-01-002', // 北海道⇄インド工科大学ボンベイ校
  nonBinding: 'JP-NAT-041', // スリランカとの育成就労の協力覚書（法的拘束力がないと明記）
  broker: 'JP-NAT-022', // ベトナムとの特定技能の協力覚書（悪質な仲介機関の情報共有）
};

const link = (db, id, text) => db.mouById.has(id) ? `<a href="#/mou/${encodeURIComponent(id)}">${text}</a>` : text;
const ym = d => fmtDate(d).replace(/\d+日$/, '');

export function homePage(ctx) {
  const { db, app } = ctx;
  const asOf = fmtDate(db.config.data_as_of);
  app.innerHTML = `
    <section class="hero2">
      <h1>日本と世界のMOU・協定マップ</h1>
      <p class="catch"><span>どの国と、何を約束した？</span> <span>私たちの地域に何が起こる？</span></p>
      <p class="hero-desc">日本政府や都道府県が海外と結んだ覚書・協定を、地図と公式資料から調べられます。外国人材の受入れや地域への影響も確認できます。</p>
      <p class="asof">掲載内容：<b>${esc(asOf)}時点</b>　<a href="#/about">調査範囲・ご利用にあたって</a></p>
    </section>

    <div class="gates">
      <a class="gate-a" href="#/?to=sanpun" data-jump="sanpun">
        <span class="gate-k">初めての方はこちら</span>
        <span class="gate-illu">${ILL.openbook}</span>
        <b>まず3分でわかる</b>
        <span class="gate-d">5つの図で海外との約束の仕組みを解説</span>
        <span class="gate-go" aria-hidden="true">↓ このページで読む</span>
      </a>
      <nav class="gate-b" aria-labelledby="gate-b-h">
        <p class="gate-k" id="gate-b-h">詳しく調べたい方はこちら</p>
        <ul class="doors">
          ${door(1, '#/map', ILL.japan, '日本地図から探す', '都道府県ごとの件数')}
          ${door(2, '#/country', ILL.globe, '相手国から探す', '国名で逆引き')}
          ${door(3, '#/types', ILL.doc, '協定の種類・分野から探す', 'MOU・EPA・取決め')}
          ${door(4, '#/impact', ILL.house, '地域への影響を調べる', '受入れ・予算・事業')}
        </ul>
      </nav>
    </div>

    ${sanpunHTML(db)}

    <section class="home-sec" id="explore" aria-labelledby="explore-h">
      <div class="band"><span class="band-k">詳しく調べる</span><h2 id="explore-h">地図・相手国・協定の種類から調べる</h2></div>
      ${scopeBarHTML()}
      ${exploreHTML(db)}
    </section>

    <section class="home-sec" id="kadai" aria-labelledby="kadai-h">
      <div class="band"><span class="band-k">最後に</span><h2 id="kadai-h">制度の課題を考える（6つの問い）</h2></div>
      <p>制度を知ったうえで、次に何を確かめればよいか。6つの問いと、確かめるためのページをまとめました。答えを決めつけず、資料を見てご自身で考えるための入口です。</p>
      ${issuesList(db, { compact: true })}
      <p><a class="btn btn-outline" href="#/issues">「制度の課題を考える」のページを開く</a></p>
    </section>

    <section class="home-sec" id="more" aria-labelledby="more-h">
      <h2 id="more-h">出典・調査状況・データ</h2>
      <div class="more-links">
        <a class="more-link" href="#/about"><b>出典・調査状況・詳しい資料</b><span>どこまで調べたか、何がまだ調べられていないか、有効性の判定のしかた</span></a>
        <a class="more-link" href="#/data"><b>データダウンロード（CSV）</b><span>登録したすべての協定を表計算ソフトで開ける形で保存</span></a>
        <a class="more-link" href="#/compare"><b>比較グラフ</b><span>都道府県・相手国・年ごと・有効性の内訳</span></a>
      </div>
    </section>`;

  drawStepMap(ctx);
  drawExplore(ctx);
  bindScopeBar(app.querySelector('#explore'), () => homePage(ctx));
}

function door(n, href, ill, title, desc) {
  return `<li><a class="door" href="${href}"><span class="door-n" aria-hidden="true">${n}</span><span class="illu">${ill}</span><b>${esc(title)}</b><span class="door-d">${esc(desc)}</span></a></li>`;
}

// ================= まず3分でわかる =================
function sanpunHTML(db) {
  const steps = [
    ['step1', 'MOUって何？'], ['step2', '誰が、どの国と結んでいる？'], ['step3', '何を約束している？'],
    ['step4', '外国人の受入れはMOUだけで決まる？'], ['step5', '地域にはどんな影響がある？'],
  ];
  return `<section class="home-sec sanpun" id="sanpun" aria-labelledby="sanpun-h">
    <div class="band"><span class="band-k">まず3分でわかる</span><h2 id="sanpun-h">MOUとは？ 5つの図で、海外との約束の仕組みをつかむ</h2></div>
    <ol class="s3-toc" aria-label="5つのステップの目次">${steps.map(([id, t], i) => `<li><a href="#/?to=${id}" data-jump="${id}"><span>STEP ${i + 1}</span>${esc(t)}</a></li>`).join('')}</ol>
    <div class="s3-list">
      ${step1(db)}${step2(db)}${step3(db)}${step4(db)}${step5(db)}
    </div>
    <p class="s3-end">ここまでで「まず3分でわかる」はおしまいです。下の「詳しく調べる」から、地図や相手国で実際の協定を調べられます。</p>
  </section>`;
}

function stepShell(n, id, title, lead, fig, desc, note) {
  return `<article class="s3" id="${id}" aria-labelledby="${id}-h">
    <span class="s3-no" aria-hidden="true">${n}</span>
    <h3 id="${id}-h"><span class="visually-hidden">STEP ${n}　</span>${title}</h3>
    <p class="s3-lead">${lead}</p>
    <div class="s3-fig">${fig}</div>
    <div class="s3-desc">${desc}</div>
    ${note ? `<p class="s3-note">${note}</p>` : ''}
  </article>`;
}

function step1(db) {
  const nb = db.mouById.get(EX.nonBinding);
  const fig = `<figure class="fig-mou" aria-label="図：MOUは、日本側と海外の相手の間で協力の内容を文書にしたもの">
      <div class="fm-side"><span class="fm-ic">${ILL.gov}</span><b>日本政府・自治体</b><small>省庁・都道府県など</small></div>
      <div class="fm-mid"><span class="fm-arrow" aria-hidden="true">⇄</span><span class="fm-doc">${ILL.doc}<b>MOU<br>（覚書）</b></span><span class="fm-arrow" aria-hidden="true">⇄</span></div>
      <div class="fm-side"><span class="fm-ic">${ILL.globe}</span><b>外国政府・海外機関</b><small>省庁・州・大学など</small></div>
      <figcaption class="fm-cap">書かれている内容の例：協力する分野／情報の共有／連絡の窓口／有効期間</figcaption>
    </figure>`;
  const desc = `<ul class="s3-points">
      <li><b>MOU</b>は Memorandum of Understanding の略で、「覚書」「了解覚書」とも呼ばれます。国の「協力覚書（MOC）」も同じ種類です。</li>
      <li>経済・教育・観光・人材など、<b>幅広い分野</b>で使われます。</li>
      <li>「法的拘束力がない」と明記したものも、書いていないものもあり、<b>名前だけでは法的拘束力の有無は決まりません</b>。</li>
    </ul>
    <p class="s3-conclusion">MOUを結んだからといって、直ちに法律が変わったり、外国人の入国が決まったりするわけではありません。</p>`;
  const note = nb ? `例：${link(db, nb.id, 'スリランカとの育成就労の協力覚書')}（${esc(ym(nb.signed_date))}）は、法的拘束力のある義務を生じないと明記（出典：厚生労働省・出入国在留管理庁）。` : '';
  return stepShell(1, 'step1', 'MOUは、海外との協力を文書にしたもの', '国や自治体が、海外の相手と「何について協力するか」を確かめ合った文書です。', fig, desc, note);
}

function step2(db) {
  const ex = [
    { id: EX.natId, jp: '日本政府', kind: '外国政府', fallback: 'インドネシア政府' },
    { id: EX.prefMinistry, jp: null, kind: '外国政府の省庁' },
    { id: EX.prefSub, jp: null, kind: '外国の地方政府（州・省など）' },
    { id: EX.prefUniv, jp: null, kind: '海外の大学・団体・企業' },
  ].map(e => ({ ...e, m: db.mouById.get(e.id) })).filter(e => e.m);
  const all = filterGroups(db, baseFilter({ level: 'prefecture', docScope: 'mou' }));
  const byType = t => all.filter(g => t.includes(g.latest.partner_type)).length;
  const fig = `<figure class="fig-who" aria-label="図：日本側と海外の相手の組み合わせの例">
      <ul class="who-rows">
        ${ex.map(e => `<li class="who-row">
          <span class="who-jp ${e.m.japan_level === 'national' ? 'is-nat' : 'is-pref'}">${e.m.japan_level === 'national' ? ILL.gov : ILL.pin}<b>${esc(e.m.japan_level === 'national' ? '日本政府' : prefName(db, e.m.pref_code))}</b></span>
          <span class="who-line" aria-hidden="true"></span>
          <span class="who-pt"><small>${esc(e.kind)}</small><b>${link(db, e.m.id, esc(partnerLabel(db, e.m)))}</b><small>${esc(ym(e.m.signed_date))}</small></span>
        </li>`).join('')}
      </ul>
      <div class="who-map"><div id="step2-map"></div><div id="step2-legend"></div></div>
    </figure>`;
  const desc = `<ul class="s3-points">
      <li><b>国（省庁）</b>は、特定技能などの協力覚書を<b>外国政府</b>と結んでいます。</li>
      <li><b>都道府県</b>の相手は、<b>外国政府の省庁 ${byType(['national_gov', 'national_ministry'])}件</b>・<b>外国の地方政府 ${byType(['subnational_gov'])}件</b>・<b>大学・団体・企業など ${byType(['public_agency', 'university', 'organization', 'company', 'international_org'])}件</b>（${esc(scopeLabel(false))}）。</li>
      <li>国の協定は全国が対象で、<b>都道府県の件数には含めていません</b>。</li>
    </ul>`;
  return stepShell(2, 'step2', '日本の国や都道府県も、海外とMOUを結んでいる', '都道府県も、外国の政府・地方政府・大学などと結んでいます。締結の状況は県によって大きく違います。', fig, desc,
    '地図の色は、都道府県が結んだMOUの件数（いまの数え方）。タップするとその県のページが開きます。');
}
function shortOrg(s) { return String(s || '').replace(/（.*?）/g, '').slice(0, 26); }
// 相手の名前に国名が含まれていれば国名を重ねない
function partnerLabel(db, m) {
  const cn = countryName(db, m.country_code), org = shortOrg(m.partner_org);
  return org.startsWith(cn) ? org : `${cn}・${org}`;
}

function step3(db) {
  const all = filterGroups(db, baseFilter({ docScope: 'mou' }));
  const n = codes => all.filter(g => g.fields.some(f => codes.includes(f))).length;
  const cards = [
    ['people', '外国人材', '送出しや受入れに関する協力', ['labor']],
    ['factory', '経済', '投資・企業の交流', ['economy']],
    ['book', '教育', '留学・研究の交流', ['education']],
    ['camera', '観光', '観光の振興・文化の交流', ['tourism']],
    ['medical', '医療', '専門人材・医療の協力', ['medical']],
    ['sprout', 'その他', '農業・技術・防災など', ['agri', 'disaster_env', 'other']],
  ];
  const mg = db.mouById.get(EX.prefMinistry);
  const br = db.mouById.get(EX.broker);
  const fig = `<figure class="fig-fields" aria-label="図：協力する分野の6つのカード">
      <ul class="field-cards">${cards.map(([ic, t, d, codes]) => `<li><span class="fc-ic">${ILL[ic]}</span><b>${esc(t)}</b><span class="fc-d">${esc(d)}</span><span class="fc-n">${n(codes)}<small>件</small></span></li>`).join('')}</ul>
      <figcaption class="small muted">件数はいまの数え方（${esc(scopeLabel(false))}）。1つの覚書が複数の分野にまたがる場合は、それぞれで数えています。</figcaption>
    </figure>`;
  const desc = `${mg ? `<div class="ex-box">
      <p class="ex-k">外国人材の覚書の例</p>
      <p class="ex-t">${link(db, mg.id, '宮城県とインドネシア労働省事務総局の覚書')}（${esc(ym(mg.signed_date))}）</p>
      <ul>
        <li>人材の育成、送り出し・受け入れの支援</li>
        <li>日本語学習の支援</li>
        <li>認定された送り出し団体などのリストの共有</li>
        <li>相談窓口の設置など、生活の支援</li>
      </ul>
      ${br ? `<p class="small">国の協力覚書には、<b>悪質な仲介機関の情報の共有</b>も書かれています（例：${link(db, br.id, 'ベトナムとの特定技能の覚書')}）。</p>` : ''}
    </div>` : ''}
    <div class="vs-box">
      <div><b>MOUの締結</b><span>「協力すること」を確かめ合う</span></div>
      <span class="vs-ne" aria-label="とは別">≠</span>
      <div><b>受入れ人数の確定</b><span>企業の採用と国の審査を経て決まる（人数の目標が書かれていても目標です）</span></div>
    </div>`;
  return stepShell(3, 'step3', '協力する分野は、人材だけではない', '経済・教育・観光・医療など、分野はさまざまです。外国人材の覚書でも、決めているのは「協力のしかた」です。', fig, desc,
    '出典：宮城県（覚書の本文）、出入国在留管理庁。');
}

function step4(db) {
  const sys = key => db.systemByKey?.get(key);
  const esd = sys('ESD');
  const esdLabel = esd ? `育成就労（${esd.state === 'in_force' ? `${ym(esd.start)}から実施` : `${ym(esd.start)}に開始予定`}）` : '育成就労（開始予定）';
  const docs = [
    ['mou_moc', 'MOU・MOC', '協力の方針。多くは法的拘束力がないと明記'],
    ['epa_treaty', 'EPA', '国会の承認を経た条約'],
    ['exchange_of_notes', '交換公文', '政府どうしの書簡による約束'],
    ['bilateral_arrangement', '二国間取決め', 'ワーキング・ホリデーなど'],
    ['joint_statement', '共同声明・アクションプラン', '目標や協力事業を示す政治的な文書'],
  ];
  const cnt = c => filterGroups(db, baseFilter({ docScope: 'all', category: c, level: 'national' })).length;
  const fig = `<figure class="fig-tiers" aria-label="図：海外との合意文書、日本国内の制度、実際の入国・在留・就労の3段階">
      <div class="tier tier-1"><p class="tier-h"><span>①</span>海外との合意文書</p>
        <ul class="tier-chips">${docs.map(([c, t, d]) => `<li><a href="#/types?c=${c}"><b>${esc(t)}</b><small>${esc(d)}</small></a></li>`).join('')}</ul></div>
      <p class="tier-arrow" aria-hidden="true">↓</p>
      <div class="tier tier-2"><p class="tier-h"><span>②</span>日本国内の制度・条件</p>
        <ul class="tier-chips">
          <li><b>在留資格</b><small>何をするために滞在できるか</small></li>
          <li><b>入国・在留の審査</b><small>出入国在留管理庁が審査</small></li>
          <li><b>特定技能</b><small>人手不足の分野で働く</small></li>
          <li><b>${esc(esdLabel)}</b><small>技能実習に代わる制度</small></li>
          <li><b>EPAに基づく受入れ</b><small>看護師・介護福祉士の候補者</small></li>
          <li><b>その他の制度</b><small>留学・ワーキング・ホリデーなど</small></li>
        </ul></div>
      <p class="tier-arrow" aria-hidden="true">↓</p>
      <div class="tier tier-3"><p class="tier-h"><span>③</span>実際の入国・在留・就労</p>
        <p class="tier-p">企業の採用、本人の試験の合格、国の審査を経て、はじめて決まります。</p></div>
    </figure>`;
  const desc = `<ul class="s3-points s3-cautions">
      <li>文書の種類によって、<b>守る義務があるか（法的な性質）</b>が違います。</li>
      <li>共同声明などの<b>人数の目標は、受入れの義務ではありません</b>。「双方向の交流」の人数は日本から行く人も含み、<b>移住・定住の人数ではありません</b>。</li>
      <li>都道府県がMOUを結んでも、<b>在留資格を出すのは国</b>です。</li>
      <li>${term('特定技能')}は覚書のない国からも受け入れられますが、${term('育成就労')}は原則として覚書のある国からだけです（出入国在留管理庁）。</li>
    </ul>
    <details class="s3-more"><summary>制度ごとの組み合わせを表で見る</summary>${comboTable(db)}</details>`;
  const counts = docs.map(([c, t]) => `${t} ${cnt(c)}件`).join('・');
  return stepShell(4, 'step4', 'MOU以外にも、海外との協定・取決めがある', '受入れはMOUだけでは決まりません。「海外との合意」「日本の制度」「実際の受入れ」は別の段階です。', fig, desc,
    `登録した国の文書（いまの数え方）：${esc(counts)}。種類を押すと一覧が開きます。`);
}

// 制度ごとの「海外との合意文書」と「日本の制度」の組み合わせ（登録データと国内制度の資料から）
function comboTable(db) {
  const nat = filterGroups(db, { level: 'national' });
  const nCountries = re => new Set(nat.filter(g => g.category === 'mou_moc' && re.test(g.latest.title_ja)).map(g => g.country_code)).size;
  const sys = key => db.systemByKey?.get(key);
  const wh = nat.filter(g => g.category === 'bilateral_arrangement' && /ワーキング・ホリデー/.test(g.latest.title_ja));
  const rows = [
    ['特定技能', `国ごとの協力覚書（${nCountries(/特定技能/)}か国と作成。終了したものを含む）`, sys('SSW')?.law || '出入国管理及び難民認定法', sys('SSW')?.needs_bilateral],
    ['技能実習', `国ごとの協力覚書（${nCountries(/技能実習/)}か国と作成。同上）`, sys('TITP')?.law || '技能実習法', sys('TITP')?.needs_bilateral],
    ['育成就労', `国ごとの協力覚書（${nCountries(/育成就労/)}か国と作成）`, sys('ESD')?.law || '育成就労法', sys('ESD')?.needs_bilateral],
    ['EPAの看護師・介護福祉士候補者', 'EPA（インドネシア・フィリピン）、交換公文（ベトナム）', sys('EPA-NCW')?.law || '在留資格「特定活動」', sys('EPA-NCW')?.needs_bilateral],
    ['ワーキング・ホリデー', `国・地域ごとの取決め（${wh.filter(g => !g.planned).length || '—'}か国・地域）`, sys('WH')?.law || '国・地域ごとの取決め', sys('WH')?.needs_bilateral],
  ];
  return `<div class="table-wrap combo"><table><thead><tr><th>受入れの仕組み</th><th>海外との合意文書</th><th>日本の制度（根拠）</th></tr></thead>
    <tbody>${rows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}${r[3] ? `<br><span class="small muted">${esc(r[3])}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function step5(db) {
  const mg = db.mouById.get(EX.prefMinistry);
  const items = [
    ['chart', '人口・外国人受入れ', '何人受け入れる予定なのか'],
    ['factory', '雇用・産業', '地元企業や仕事への影響'],
    ['house', '住宅・生活', '住まい・生活支援・地域環境'],
    ['school', '教育・医療', '学校・日本語教育・医療の体制'],
    ['yen', '税金・財政', '行政がいくら支出しているか'],
    ['talk', '地域社会', '住民への説明や実施後の課題'],
  ];
  let ex = '';
  if (mg) {
    const imp = mg.impacts.find(i => i.stage === 'implemented');
    const bud = mg.budgets.find(b => typeof b.amount_yen === 'number');
    const rc = residentChange(db, mg.pref_code, mg.country_code);
    ex = `<p class="flow-ex-t">例：${link(db, mg.id, '宮城県とインドネシア労働省事務総局の覚書')}</p>
      <ol class="flow3 flow3-ex">
        <li class="st-agreed"><span class="flow-k">合意したこと</span><p>人材の育成と送り出し・受け入れの支援（${esc(ym(mg.signed_date))}）</p></li>
        <li class="st-implemented"><span class="flow-k">実際に行われたこと</span><p>${imp ? `${esc(imp.fiscal_year)}年度にジャカルタで就職説明会。県は「150人程度の採用」と説明。` : '県の資料で確認'}${bud ? `<br>委託の上限額：${esc(fmtYenShort(bud.amount_yen))}（県）` : ''}</p></li>
        <li class="st-observed"><span class="flow-k">地域で確認された変化</span><p>${rc && rc.a != null && rc.b != null ? `県内のインドネシア国籍の人：${esc(fmtNum(rc.a))}人（${esc(rc.from.slice(0, 4))}年）→ ${esc(fmtNum(rc.b))}人（${esc(rc.to.slice(0, 4))}年）` : '統計で確認'}<br><span class="causal">覚書との関係は未確認（ほかの理由も含む）</span></p></li>
      </ol>`;
  }
  const fig = `<figure class="fig-impacts" aria-label="図：地域への影響を確かめる6つの項目">
      <ul class="imp6">${items.map(([ic, t, q], i) => `<li><span class="imp6-n">${i + 1}</span><span class="imp6-ic">${ILL[ic]}</span><b>${esc(t)}</b><span>${esc(q)}</span></li>`).join('')}</ul>
      <ol class="flow3" aria-label="確かめる順番">
        <li class="st-agreed"><span class="flow-k">合意したこと</span></li>
        <li class="st-implemented"><span class="flow-k">実際に行われたこと</span></li>
        <li class="st-observed"><span class="flow-k">地域で確認された変化</span></li>
      </ol>
    </figure>`;
  const desc = `${ex}
    <div class="check-box"><p class="ex-k">「外国人材の受入れで協力する」覚書があったら、こう調べる</p>
      <ul class="check-list">
        <li>何人を受け入れる計画だったのか</li>
        <li>実際に何人を受け入れたのか</li>
        <li>県がいくら予算を使ったのか</li>
        <li>日本語教育や生活支援を行ったのか</li>
        <li>住民への説明はあったのか</li>
      </ul></div>
    <p class="s3-conclusion">大切なのは、何を合意したかだけでなく、その後に何が行われたかを確かめること。</p>`;
  return stepShell(5, 'step5', '海外との約束で、私たちの地域はどう変わる？', '6つの面から確かめます。「合意したこと」と「実際に起きたこと」を分けて見るのがポイントです。', fig, desc,
    '出典：宮城県（覚書・事業の説明・委託の公告）、出入国在留管理庁「在留外国人統計」。地域の変化が覚書によるものか判断できないときは、因果関係を決めつけません。');
}

function drawStepMap(ctx) {
  const { db, app } = ctx;
  const el = app.querySelector('#step2-map');
  if (!el) return;
  const st = { mode: 'count', countries: [], field: 'labor', status: 'in_progress', impact: 'population', pref: null };
  const model = computeMapModel(db, st);
  const map = new JapanMap(el, db, { ariaLabel: '都道府県別のMOU件数（小さな地図）', onClick: code => ctx.go('/pref/' + code) });
  map.update({ fill: model.fill, label: () => null, tip: c => `<b>${esc(db.prefByCode.get(c).name)}</b><br>${esc(model.tipLine(c))}`, selected: null });
  el.querySelector('.map-zoom')?.remove();
  app.querySelector('#step2-legend').innerHTML = legendHTML(null, model.legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })));
}

// ================= 詳しく調べる（トップの中の入口） =================
function exploreHTML(db) {
  const pref = filterGroups(db, baseFilter({ level: 'prefecture' }));
  const nat = filterGroups(db, baseFilter({ level: 'national' }));
  const prefAll = filterGroups(db, { ...baseFilter({ level: 'prefecture' }), validity: 'all', includePlanned: true });
  const plannedN = prefAll.filter(g => g.planned).length;
  const top = countriesWithData(db).slice(0, 10);
  const catsAll = filterGroups(db, { ...baseFilter(), docScope: 'all' });
  const cats = DOC_CATEGORIES.map(c => ({ c, n: catsAll.filter(g => g.category === c.code).length }));
  const fieldsN = FIELDS.map(f => ({ f, n: filterGroups(db, baseFilter()).filter(g => g.fields.includes(f.code)).length }));
  const all = filterGroups(db, baseFilter());
  const withImpact = all.filter(g => g.impacts.some(i => !i._auto && i.stage !== 'agreed')).length;
  const withBudget = all.filter(g => g.budgets.some(b => typeof b.amount_yen === 'number')).length;
  return `<div class="explore">
    <section class="ex-card ex-map" id="ex-map" aria-labelledby="ex-map-h">
      <h3 id="ex-map-h"><span class="ex-n">4</span>日本地図から探す</h3>
      <div class="grid-2">
        <div><div id="mini-map"></div><div id="mini-legend"></div></div>
        <div>
          <p class="small muted" style="margin:0 0 4px">都道府県が結んだMOU（${esc(VALIDITY_SCOPE[settings.validity].ja)}）</p>
          ${validityTiles(prefAll.filter(g => !g.planned), { planned: plannedN })}
          <p style="margin-top:10px"><b>国・省庁の協定（全国が対象）：${nat.length}件</b><br><span class="small muted">都道府県の件数とは別に数えています。</span> <a href="#/national">一覧</a></p>
          <p><a class="btn" href="#/map">大きな地図で詳しく見る</a></p>
        </div>
      </div>
    </section>
    <section class="ex-card" aria-labelledby="ex-c-h">
      <h3 id="ex-c-h"><span class="ex-n">5</span>相手国から逆引き</h3>
      <div class="suggest"><input type="search" id="home-cq" placeholder="国名を入力（例：インドネシア / Indonesia）" autocomplete="off" aria-label="国名で検索（日本語・英語）"><ul id="home-cs" hidden></ul></div>
      <div class="country-list" style="margin-top:10px">${top.map(([c, n]) => `<a href="#/country/${c}"><span class="country-btn">${esc(countryName(db, c))} ${n}</span></a>`).join('')}<a href="#/country"><span class="country-btn">すべての国・地域</span></a></div>
    </section>
    <section class="ex-card" aria-labelledby="ex-t-h">
      <h3 id="ex-t-h"><span class="ex-n">6</span>協定・取決めの種類から探す</h3>
      <div class="chip-links">${cats.map(x => `<a class="chip-link" href="#/types?c=${x.c.code}">${esc(x.c.ja)}<b>${x.n}</b></a>`).join('')}</div>
      <p class="small muted">件数は文書の種類を問わず数えたもの（有効性：${esc(VALIDITY_SCOPE[settings.validity].ja)}）。</p>
    </section>
    <section class="ex-card" aria-labelledby="ex-f-h">
      <h3 id="ex-f-h"><span class="ex-n">7</span>分野別・省庁別の一覧</h3>
      <div class="chip-links">${fieldsN.map(x => `<a class="chip-link" href="#/map?mode=field&f=${x.f.code}">${esc(x.f.ja)}<b>${x.n}</b></a>`).join('')}</div>
      <p><a href="#/field">分野から探す</a>　／　<a href="#/national">国・省庁の協定（制度ごと）</a></p>
    </section>
    <section class="ex-card" aria-labelledby="ex-i-h">
      <h3 id="ex-i-h"><span class="ex-n">8</span>地域への影響・受入実績・税金</h3>
      <p>実施された事業や受入れの実績が記録された協定 <b>${withImpact}件</b>、金額が確認できた予算の記録がある協定 <b>${withBudget}件</b>（いまの数え方）。</p>
      <p><a class="btn btn-outline" href="#/impact">地域への影響を調べる</a></p>
    </section>
    <section class="ex-card" aria-labelledby="ex-g-h">
      <h3 id="ex-g-h"><span class="ex-n">9</span>比較グラフ</h3>
      <p>都道府県別・相手国別・年ごとの件数、有効性の内訳、予算をグラフで比べられます（画像で保存できます）。</p>
      <p><a class="btn btn-outline" href="#/compare">比較グラフを開く</a></p>
    </section>
  </div>`;
}

function drawExplore(ctx) {
  const { db, app } = ctx;
  const st = { mode: 'count', countries: [], field: 'labor', status: 'in_progress', impact: 'population', pref: null };
  const model = computeMapModel(db, st);
  const map = new JapanMap(app.querySelector('#mini-map'), db, { ariaLabel: '都道府県別MOU件数の地図', onClick: code => ctx.go('/map', { mode: 'count', p: code }) });
  map.update({ fill: model.fill, label: c => model.counts.get(c) ? String(model.counts.get(c)) : null, tip: c => `<b>${esc(db.prefByCode.get(c).name)}</b><br>${esc(model.tipLine(c))}`, selected: null });
  app.querySelector('#mini-legend').innerHTML = legendHTML(model.legendTitle, model.legend.map(l => ({ label: l.label, style: swatchStyle(l.fill) })));
  bindSuggest(app.querySelector('#home-cq'), app.querySelector('#home-cs'), db, c => ctx.go('/country/' + c.code));
}

// ================= 制度の課題を考える =================
function issueData(db) {
  const all = filterGroups(db, baseFilter({ docScope: 'all' }));
  const withNumbers = all.filter(g => g.versions.some(v => v.numbers.length)).length;
  const community = all.filter(g => g.impacts.some(i => i.category === 'community' && !i._auto)).length;
  const budgets = all.filter(g => g.budgets.length).length;
  const budgetsN = all.filter(g => g.budgets.some(b => typeof b.amount_yen === 'number')).length;
  const results = all.filter(g => g.impacts.some(i => i.category === 'population' && i.stage !== 'agreed' && !i._auto) || g.versions.some(v => v.numbers.some(n => ['actual_entry', 'actual_employed', 'current_residents'].includes(n.kind)))).length;
  const changes = all.filter(g => g.impacts.some(i => i.stage === 'observed')).length;
  return [
    { q: '誰が、どの国・機関と何を合意した？', a: '相手が外国政府なのか、外国の地方政府なのか、海外の団体・企業なのかで、約束の範囲は変わります。まず、日本側の締結者・相手・合意内容を原文や公式発表で確かめます。',
      data: `登録した国際文書：${all.length}件（いまの数え方）`, links: [['相手国から探す', '#/country'], ['協定の種類から探す', '#/types'], ['日本地図から探す', '#/map']] },
    { q: '受入れ人数の目標や上限はある？', a: '人数が書かれていても、それが「目標」なのか「上限」なのか「実績」なのかで意味がまったく違います。双方向の交流人数は、日本に来る人数ではありません。',
      data: `人数の記載を整理した文書：${withNumbers}件`, links: [['共同声明・アクションプラン', '#/types?c=joint_statement'], ['EPA等の条約・協定', '#/types?c=epa_treaty'], ['その他の二国間取決め', '#/types?c=bilateral_arrangement']] },
    { q: '議会や住民への説明は行われた？', a: '議会での質疑や、住民向けの説明の記録があるかを、自治体の資料（議会の会議録・記者発表・説明会の資料など）で確かめます。記録が見つからないことは「説明がなかった」という意味ではありません。',
      data: `住民生活・地域社会の記録がある協定：${community}件`, links: [['地域への影響（住民生活・地域社会）', '#/map?mode=impact&i=community'], ['地域への影響を調べる', '#/impact']] },
    { q: '税金はいくら使われた？', a: '多くの場合、覚書そのものではなく、関連する事業（就職説明会・研修・日本語教育など）に予算が使われます。予算（計画）と決算（実際の支出）は別の数字です。未確認は0円ではありません。',
      data: `予算の記録がある協定：${budgets}件（うち金額を確認：${budgetsN}件）`, links: [['予算の比較グラフ', '#/compare?to=c6-sec'], ['地域への影響を調べる', '#/impact']] },
    { q: '計画と実際の受入れ人数はどう違う？', a: '計画・目標の人数と、実際に入国・就労した人数を並べて確かめます。統計の増減には覚書以外の理由も含まれるため、覚書の成果と決めつけないことが大切です。',
      data: `受入れ実績などが記録された協定：${results}件`, links: [['EPAの受入れ実績', '#/types?c=epa_treaty'], ['地域への影響を調べる', '#/impact']] },
    { q: '地域の雇用・住宅・教育・医療に何が起こった？', a: '自治体の資料や統計で確認できた変化だけを記録しています。行政資料が覚書の成果と明記していない変化は「関連性は未確認」として区別しています。',
      data: `地域で確認された変化の記録がある協定：${changes}件`, links: [['地図で影響の記録を見る', '#/map?mode=impact'], ['地域への影響を調べる', '#/impact']] },
  ];
}

export function issuesList(db, opts = {}) {
  const items = issueData(db);
  return `<ol class="qa">${items.map((x, i) => `<li class="qa-item">
      <details${opts.open ? ' open' : ''}>
        <summary><span class="qa-q" aria-hidden="true">${i + 1}</span><span class="qa-t">${esc(x.q)}</span></summary>
        <div class="qa-body">
          <p>${esc(x.a)}</p>
          <p class="small muted">${esc(x.data)}</p>
          <p class="qa-links">${x.links.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join('')}</p>
        </div>
      </details>
    </li>`).join('')}</ol>`;
}

export function issuesPage(ctx) {
  const { db, app } = ctx;
  app.innerHTML = `<div class="page-head">
      <div class="crumbs"><a href="#/">トップ</a> ＞ 制度の課題を考える</div>
      <h1>制度の課題を考える</h1>
      <p class="lead">制度の仕組みを知ったうえで、次に確かめたい6つの問いです。このサイトは結論を示しません。各問いのリンクから公式資料にもとづくデータを開き、ご自身で考えるための材料にしてください。</p>
    </div>
    ${scopeBarHTML()}
    ${issuesList(db, { open: true })}
    <div class="info"><b>読むときの注意</b>：このサイトの数字は、公式資料で確認できた範囲のものです。記録がないことは「なかった」ことを意味しません。外国人の人数の増減は、制度の変更や景気など、協定以外の理由でも起こります。</div>
    <p><a href="#/about">出典・調査状況（どこまで調べたか）</a>　／　<a href="#/?to=sanpun">まず3分でわかる（5つの図解）</a></p>`;
  bindScopeBar(app, () => issuesPage(ctx));
}
