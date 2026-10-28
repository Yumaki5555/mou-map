// 「3分でわかるMOU」（初めての方向けの5つの図解）と「制度の課題を考える」のページ
// 3分でわかる：索引と、例に使う宮城県の協定のデータ（pref-04.json）・参考統計だけで表示します（全データは読みません）
import { esc, fmtDate, fmtNum, fmtYenShort } from './util.js';
import { VALIDITY_SCOPE, filterGroups, residentChange, countryName, prefName } from './data.js';
import { settings, baseFilter, scopeBarHTML, bindScopeBar } from './shared.js';
import { ILL } from './icons.js';

// 図解で例に使う記録（すべて公式資料で確認済みの登録データ。見つからないときはその例を表示しない）
const EX = {
  natId: 'JP-NAT-024', // 日本政府⇄インドネシア政府（特定技能の協力覚書）
  prefMinistry: 'JP-04-003', // 宮城県⇄インドネシア労働省事務総局
  prefSub: 'JP-46-003', // 鹿児島県⇄ハイズオン省
  prefUniv: 'JP-01-002', // 北海道⇄インド工科大学ボンベイ校
  nonBinding: 'JP-NAT-041', // スリランカとの育成就労の協力覚書（法的拘束力がないと明記）
};

const link = (db, id, text) => db.mouById.has(id) ? `<a href="#/mou/${encodeURIComponent(id)}">${text}</a>` : text;
const ym = d => fmtDate(d).replace(/\d+日$/, '');

export function guidePage(ctx) {
  const { db, app } = ctx;
  app.innerHTML = `<div class="page-head">
      <div class="crumbs"><a href="#/">トップ</a> ＞ 3分でわかるMOU</div>
    </div>
    <section class="sanpun" id="sanpun" aria-labelledby="sanpun-h">
      <div class="band"><span class="band-k">初めての方へ</span><h1 id="sanpun-h">3分でわかるMOUとは？</h1><p class="band-sub">5つの図で、海外との約束の仕組みをつかむ</p></div>
      <div class="s3-list">
        ${step1(db)}${step2(db)}${step3(db)}${step4(db)}${step5(ctx.parts || db)}
      </div>
      <p class="s3-end">ここまでで「3分でわかるMOU」はおしまいです。実際の協定は、地域や相手国から調べられます。</p>
      <p class="btn-row"><a class="btn" href="#/map">協定を探す（地図と一覧）</a><a class="btn btn-outline" href="#/issues">制度の課題を考える</a></p>
    </section>`;
}

function stepShell(n, id, title, lead, fig, desc, note) {
  return `<article class="s3" id="${id}" aria-labelledby="${id}-h">
    <span class="s3-no" aria-hidden="true">${n}</span>
    <h2 id="${id}-h" class="s3-h"><span class="visually-hidden">STEP ${n}　</span>${title}</h2>
    <p class="s3-lead">${lead}</p>
    <div class="s3-fig">${fig}</div>
    <div class="s3-desc">${desc}</div>
    ${note ? `<p class="s3-note">${note}</p>` : ''}
  </article>`;
}

function step1(db) {
  const nb = db.mouById.get(EX.nonBinding);
  const fig = `<figure class="fig-mou" aria-label="図：MOUは、日本側と海外の相手の間で協力の内容を文書にしたもの">
      <div class="fm-side"><span class="fm-ic">${ILL.gov}</span><b>日本の国・自治体</b><small>省庁・都道府県など</small></div>
      <div class="fm-mid"><span class="fm-arrow" aria-hidden="true">⇄</span><span class="fm-doc">${ILL.doc}<b>MOU<br>（覚書）</b></span><span class="fm-arrow" aria-hidden="true">⇄</span></div>
      <div class="fm-side"><span class="fm-ic">${ILL.globe}</span><b>海外の政府・機関</b><small>省庁・州・大学など</small></div>
      <figcaption class="fm-cap">書かれていること：協力する分野・情報の共有・連絡の窓口・有効期間</figcaption>
    </figure>`;
  const desc = `<p>「覚書」「協力覚書（MOC）」とも呼ばれます。多くは「法的な義務は生じない」と書かれていて、<b>結んだだけで法律が変わったり、外国人の入国が決まったりはしません。</b></p>`;
  const note = nb ? `例：${link(db, nb.id, 'スリランカとの育成就労の協力覚書')}（${esc(ym(nb.signed_date))}）は、法的拘束力のある義務を生じないと明記。出典：厚生労働省・出入国在留管理庁` : '';
  return stepShell(1, 'step1', 'MOUは、海外との協力を文書にしたもの', '国や自治体が、海外の相手と「何に協力するか」を確かめ合った文書です。', fig, desc, note);
}

function step2(db) {
  const ex = [
    { id: EX.natId, kind: '外国の政府' },
    { id: EX.prefMinistry, kind: '外国の省庁' },
    { id: EX.prefSub, kind: '外国の州・省' },
    { id: EX.prefUniv, kind: '海外の大学' },
  ].map(e => ({ ...e, m: db.mouById.get(e.id) })).filter(e => e.m);
  const fig = `<figure class="fig-who" aria-label="図：日本側と海外の相手の組み合わせの例">
      <ul class="who-rows">
        ${ex.map(e => `<li class="who-row">
          <span class="who-jp ${e.m.japan_level === 'national' ? 'is-nat' : 'is-pref'}">${e.m.japan_level === 'national' ? ILL.gov : ILL.pin}<b>${esc(e.m.japan_level === 'national' ? '日本政府' : prefName(db, e.m.pref_code))}</b></span>
          <span class="who-line" aria-hidden="true"></span>
          <span class="who-pt"><small>${esc(e.kind)}</small><b>${link(db, e.m.id, esc(partnerLabel(db, e.m)))}</b></span>
        </li>`).join('')}
      </ul>
    </figure>`;
  const desc = `<p>国（省庁）は外国の政府と、都道府県は外国の省庁・州・大学などと結んでいます。<b>国の協定は全国が対象なので、都道府県の件数とは分けて数えています。</b></p>
    <p>市（政令指定都市など）や、団体・企業が海外と結んだ協定もあります。これらも国・都道府県の件数には入れず、別に数えています（<a href="#/actors">締結主体から探す</a>）。</p>`;
  return stepShell(2, 'step2', '国も都道府県も、海外とMOUを結んでいる', '相手は外国の政府だけでなく、州や大学のこともあります。', fig, desc,
    '例はいずれも登録した協定（名前を押すと詳しいページが開きます）。');
}
function shortOrg(s) { return String(s || '').replace(/（.*?）/g, '').slice(0, 24); }
// 相手の名前に国名が含まれていれば国名を重ねない
function partnerLabel(db, m) {
  const cn = countryName(db, m.country_code), org = shortOrg(m.partner_org);
  return org.startsWith(cn) ? org : `${cn}・${org}`;
}

function step3(db) {
  const all = filterGroups(db, baseFilter({ docScope: 'mou' }));
  const n = codes => all.filter(g => g.fields.some(f => codes.includes(f))).length;
  const cards = [
    ['people', '外国人材', ['labor']], ['factory', '経済', ['economy']], ['book', '教育', ['education']],
    ['camera', '観光', ['tourism']], ['medical', '医療', ['medical']], ['sprout', 'その他', ['agri', 'disaster_env', 'other']],
  ];
  const mg = db.mouById.get(EX.prefMinistry);
  const fig = `<figure class="fig-fields" aria-label="図：協力する分野の6つのカード">
      <ul class="field-cards">${cards.map(([ic, t, codes]) => `<li><span class="fc-ic">${ILL[ic]}</span><b>${esc(t)}</b><span class="fc-n">${n(codes)}<small>件</small></span></li>`).join('')}</ul>
      <figcaption>件数は登録したMOUのうち「${esc(VALIDITY_SCOPE[settings.validity].ja)}」（1つの覚書が複数の分野にまたがるときはそれぞれで数える）</figcaption>
    </figure>`;
  const desc = `<p>外国人材の覚書でも、決めているのは<b>送り出し・受け入れの「協力のしかた」</b>です。人数の目標が書かれていても目標で、受け入れる人数が決まるわけではありません。</p>`;
  return stepShell(3, 'step3', '協力する分野は、人材だけではない', '経済・教育・観光・医療など、分野はさまざまです。', fig, desc,
    mg ? `例：${link(db, mg.id, '宮城県とインドネシア労働省事務総局の覚書')}（${esc(ym(mg.signed_date))}）は、人材の育成、送り出し・受け入れの支援、日本語学習の支援などに協力すると書いています。出典：宮城県` : '');
}

function step4(db) {
  const esd = db.systemByKey?.get('ESD');
  const esdLabel = esd ? `育成就労（${esd.state === 'in_force' ? `${ym(esd.start)}から` : `${ym(esd.start)}開始予定`}）` : '育成就労（開始予定）';
  const fig = `<figure class="fig-tiers" aria-label="図：海外との合意、日本の在留制度、実際の入国・就労の3つの段階">
      <div class="tier tier-1"><p class="tier-h"><span>①</span>海外との合意（国どうし・自治体）</p>
        <ul class="tier-chips">
          <li><b>MOU・MOC</b><small>協力の方針。多くは法的な義務なし</small></li>
          <li><b>EPA（条約）</b><small>国会の承認を経た、守る義務のある約束</small></li>
          <li><b>交換公文・取決め</b><small>政府どうしの約束（ワーキング・ホリデーなど）</small></li>
          <li><b>共同声明</b><small>目標を示す政治的な文書</small></li>
        </ul></div>
      <p class="tier-arrow" aria-hidden="true">↓</p>
      <div class="tier tier-2"><p class="tier-h"><span>②</span>日本の在留制度（国内の法律）</p>
        <ul class="tier-chips">
          <li><b>在留資格・入国審査</b><small>出入国在留管理庁</small></li>
          <li><b>特定技能</b><small>人手不足の分野で働く</small></li>
          <li><b>${esc(esdLabel)}</b><small>技能実習に代わる制度</small></li>
          <li><b>EPAの候補者</b><small>看護師・介護福祉士を目指す</small></li>
        </ul></div>
      <p class="tier-arrow" aria-hidden="true">↓</p>
      <div class="tier tier-3"><p class="tier-h"><span>③</span>実際の入国・在留・就労</p>
        <p class="tier-p">企業の採用、本人の試験の合格、国の審査を経て、一人ずつ決まります。</p></div>
    </figure>`;
  const desc = `<p>外国人が日本で暮らし、働けるかどうかは、<b>日本の法律（在留制度）にもとづく国の審査</b>で決まります。海外との合意は、受入れの枠組みや協力のしかたを相手国と決めるものです。<b>都道府県がMOUを結んでも、在留資格は出せません。</b></p>`;
  return stepShell(4, 'step4', 'MOUのほかの約束と、日本の在留制度は別のもの', '「海外との合意」「日本の制度」「実際の受入れ」は3つの別の段階です。', fig, desc,
    '特定技能は協力覚書のない国からも受け入れられますが、育成就労は原則として協力覚書のある国からだけです。EPAの候補者は、EPA・交換公文を結んだインドネシア・フィリピン・ベトナムからだけです。出典：出入国在留管理庁・厚生労働省');
}

function step5(db) {
  const mg = db.mouById.get(EX.prefMinistry);
  const imp = mg?.impacts.find(i => i.stage === 'implemented');
  const bud = mg?.budgets.find(b => typeof b.amount_yen === 'number');
  const rc = mg ? residentChange(db, mg.pref_code, mg.country_code) : null;
  const fig = `<figure class="fig-flow" aria-label="図：合意したこと、実際に行われたこと、地域で確認された変化の3段階">
      ${mg ? `<p class="flow-ex-t">例：${link(db, mg.id, '宮城県とインドネシア労働省事務総局の覚書')}</p>` : ''}
      <ol class="flow3 flow3-ex">
        <li class="st-agreed"><span class="flow-k"><span class="flow-no">①</span>合意したこと</span><p>${mg ? `人材の育成と、送り出し・受け入れの支援に協力（${esc(ym(mg.signed_date))}）` : '協定の原文に書かれていること'}</p></li>
        <li class="st-implemented"><span class="flow-k"><span class="flow-no">②</span>実際に行われたこと</span><p>${imp ? `${esc(imp.fiscal_year)}年度にジャカルタで就職説明会${bud ? `（委託の上限額 ${esc(fmtYenShort(bud.amount_yen))}）` : ''}` : '予算・事業・受入れの実績'}</p></li>
        <li class="st-observed"><span class="flow-k"><span class="flow-no">③</span>地域で確認された変化</span><p>${rc && rc.a != null && rc.b != null ? `県内のインドネシア国籍の人 ${esc(fmtNum(rc.a))}人 → ${esc(fmtNum(rc.b))}人（${esc(rc.from.slice(0, 4))}→${esc(rc.to.slice(0, 4))}年）` : '統計などで確認できる変化'}</p><span class="causal">覚書との関係は未確認</span></li>
      </ol>
    </figure>`;
  const desc = `<p>①を見ただけでは、地域で何が起きたかは分かりません。<b>③の変化は、協定以外の理由（制度の変更、景気、企業の採用など）でも起こります。</b>行政の資料が協定の成果と書いていないものは「関係は未確認」と表示しています。</p>`;
  return stepShell(5, 'step5', '「約束したこと」と「地域で起きたこと」は分けて見る', '合意 → 実施 → 変化の順に、別々に確かめます。', fig, desc,
    '出典：宮城県（覚書・事業の説明・委託の公告）、出入国在留管理庁「在留外国人統計」。地域への影響は、人口・雇用・住宅・教育医療・税金・住民生活の6つの面から確かめられます（<a href="#/impact">地域への影響</a>のページ）。');
}

// ================= 制度の課題を考える（全データで表示） =================
function issueData(db) {
  const all = filterGroups(db, baseFilter({ docScope: 'all' }));
  const withNumbers = all.filter(g => g.versions.some(v => v.numbers.length)).length;
  const community = all.filter(g => g.impacts.some(i => i.category === 'community' && i.stage !== 'agreed' && !i._auto)).length;
  const budgets = all.filter(g => g.budgets.length).length;
  const budgetsN = all.filter(g => g.budgets.some(b => typeof b.amount_yen === 'number')).length;
  const results = all.filter(g => g.impacts.some(i => i.category === 'population' && i.stage !== 'agreed' && !i._auto) || g.versions.some(v => v.numbers.some(n => ['actual_entry', 'actual_employed', 'current_residents'].includes(n.kind)))).length;
  const changes = all.filter(g => g.impacts.some(i => i.stage === 'observed')).length;
  return [
    { q: '誰が、どの国・機関と何を合意した？', a: '相手が外国政府なのか、外国の地方政府なのか、海外の団体・企業なのかで、約束の範囲は変わります。まず、日本側の締結者・相手・合意内容を原文や公式発表で確かめます。',
      data: `登録した国際文書：${all.length}件（いまの数え方）`, links: [['協定を探す（地図と一覧）', '#/map'], ['相手国から探す', '#/country'], ['協定の種類から探す', '#/types']] },
    { q: '受入れ人数の目標や上限はある？', a: '人数が書かれていても、それが「目標」なのか「上限」なのか「実績」なのかで意味がまったく違います。双方向の交流人数は、日本に来る人数ではありません。',
      data: `人数の記載を整理した文書：${withNumbers}件`, links: [['共同声明・アクションプラン', '#/types?c=joint_statement'], ['EPA等の条約・協定', '#/types?c=epa_treaty'], ['その他の二国間取決め', '#/types?c=bilateral_arrangement']] },
    { q: '議会や住民への説明は行われた？', a: '議会での質疑や、住民向けの説明の記録があるかを、自治体の資料（議会の会議録・記者発表・説明会の資料など）で確かめます。記録が見つからないことは「説明がなかった」という意味ではありません。',
      data: `住民への説明・議会審議などの記録がある協定：${community ? community + '件' : '未確認（記録は見つかっていません）'}`, links: [['地域への影響（住民生活・地域社会）', '#/impact?i=community'], ['地域への影響を調べる', '#/impact']] },
    { q: '税金はいくら使われた？', a: '多くの場合、覚書そのものではなく、関連する事業（就職説明会・研修・日本語教育など）に予算が使われます。予算（計画）と決算（実際の支出）は別の数字です。未確認は0円ではありません。',
      data: `予算の記録がある協定：${budgets}件（うち金額を確認：${budgetsN}件）`, links: [['予算の比較グラフ', '#/compare?to=c6-sec'], ['地域への影響を調べる', '#/impact']] },
    { q: '計画と実際の受入れ人数はどう違う？', a: '計画・目標の人数と、実際に入国・就労した人数を並べて確かめます。統計の増減には覚書以外の理由も含まれるため、覚書の成果と決めつけないことが大切です。',
      data: `受入れ実績などが記録された協定：${results}件`, links: [['EPAの受入れ実績', '#/types?c=epa_treaty'], ['地域への影響を調べる', '#/impact']] },
    { q: '地域の雇用・住宅・教育・医療に何が起こった？', a: '自治体の資料や統計で確認できた変化だけを記録しています。行政資料が覚書の成果と明記していない変化は「関連性は未確認」として区別しています。',
      data: `地域で確認された変化の記録がある協定：${changes}件`, links: [['地図で影響の記録を見る', '#/impact'], ['地域への影響を調べる', '#/impact']] },
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
      <div class="crumbs"><a href="#/">トップ</a> ＞ 統計・分析 ＞ 制度の課題を考える</div>
      <h1>制度の課題を考える</h1>
      <p class="lead">制度の仕組みを知ったうえで、次に確かめたい6つの問いです。このサイトは結論を示しません。各問いのリンクから公式資料にもとづくデータを開き、ご自身で考えるための材料にしてください。</p>
    </div>
    ${scopeBarHTML()}
    ${issuesList(db, { open: true })}
    <div class="info"><b>読むときの注意</b>：このサイトの数字は、公式資料で確認できた範囲のものです。記録がないことは「なかった」ことを意味しません。外国人の人数の増減は、制度の変更や景気など、協定以外の理由でも起こります。</div>
    <p><a href="#/about">調査状況（どこまで調べたか）</a>　／　<a href="#/guide">3分でわかるMOU（5つの図解）</a></p>`;
  bindScopeBar(app, () => issuesPage(ctx));
}
