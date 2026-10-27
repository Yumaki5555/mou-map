# 日本と世界のMOU・協定マップ

**どの国と、何を約束した？ 私たちの地域に何が起こる？**

日本の国（省庁）・47都道府県・政令指定都市・団体などが、海外の国・機関と結んだMOU（覚書）や、外国人の受入れに関係するEPA・交換公文・ワーキング・ホリデーの取決め・アクションプランを、日本地図・相手国・文書の種類・分野・地域への影響から調べられるサイトです。
トップページの「まず3分でわかる」で、5つの図を使って仕組みを説明しています。
公開された公式資料と統計で確認できる範囲だけを載せ、分からないものは「未確認」と表示します（0件・0円とはしません）。
協定が今も有効かどうか（有効確認・有効性未確認・終了確認・開始前・締結予定）を公式資料で判定し、件数は初期設定で「有効確認のみ」を数えます。

## ファイルの構成

```
mou-map/
├─ index.html                 … サイトの入口（この1ページの中で画面が切り替わります）
├─ assets/
│   ├─ css/style.css          … 見た目（色・文字の大きさ）
│   ├─ js/                    … 動き（地図・グラフ・CSV・画像出力。トップページと5つの図解は home.js、サイト内検索は search.js と page-search.js）
│   └─ vendor/                … 地図とグラフの部品（d3、topojson-client。ライセンス同梱）
├─ data/                      … ★データはすべてここ（HTMLには埋め込んでいません）
│   ├─ mous/                  … MOUデータ（都道府県ごと・国のファイル）
│   │   ├─ index.json         … 読み込むファイルの一覧
│   │   ├─ pref-08.json など  … 都道府県のMOU
│   │   ├─ national.json      … 国・省庁のMOU（協力覚書）
│   │   ├─ city-141003.json など … 政令指定都市など市区町村のMOU（都道府県の件数とは別）
│   │   ├─ orgs.json          … 団体・企業・公的機関などのMOU（国・都道府県の件数とは別）
│   │   └─ agreements.json    … MOU以外の国際文書（EPA・交換公文・ワーキング・ホリデー・アクションプラン）
│   ├─ survey.json            … 調査の進み具合（段階・都道府県・政令指定都市・団体ごとの調査状況・調べた範囲）
│   ├─ clair_check.json       … CLAIR（自治体国際化協会）の協定等締結状況の一覧との照合結果
│   ├─ systems.json           … 関連する国内制度（特定技能・技能実習・育成就労・EPA看護介護・ワーキング・ホリデー）
│   ├─ countries.json         … 国・地域の名前（日本語・英語・別名）
│   ├─ prefectures.json       … 47都道府県の一覧
│   ├─ excluded.json          … 調べたがMOUの範囲外として登録しなかったもの
│   ├─ config.json            … 最終更新日など
│   ├─ stats/foreign_residents.json … 参考統計（在留外国人数・特定技能外国人数）
│   └─ geo/japan_prefectures.topojson … 都道府県の境界（地図）
├─ docs/データの追加方法.md   … データの追加・修正のしかた
└─ tools/
    ├─ serve.py               … 手元のパソコンで表示を確認するためのもの
    ├─ check_links.py         … 出典URLが開けるかの確認
    ├─ test_site.mjs          … 有効期限の境界・件数の一致などの自動テスト（node tools/test_site.mjs）
    ├─ audit_data.mjs         … 取り違えやすいデータの洗い出し（node tools/audit_data.mjs）
    ├─ summary.mjs            … 有効性の5区分の件数・調査状況の概要（node tools/summary.mjs）
    ├─ search.mjs             … サイト内検索と同じ仕組みで検索を試す（node tools/search.mjs "宮城県 ベトナム"）
    ├─ set_version.py         … プログラムを直して公開する前に実行（ブラウザに新しいプログラムを読み込ませる）
    └─ template_mou.json      … MOU1件分のひな形
```

## 手元のパソコンで見る

ファイルをダブルクリックして開くと、ブラウザの安全機能でデータを読み込めません。次のコマンドを `mou-map` フォルダで実行し、表示されたアドレス（http://127.0.0.1:8000/）をブラウザで開いてください。

```bash
python tools/serve.py
```

## GitHub Pages で公開する

### 方法A：GitHubのWeb画面だけで行う（コマンド不要）

1. GitHub にログインし、右上の「＋」→「New repository」を押します。
2. Repository name に `mou-map` と入れ、「Public」を選んで「Create repository」を押します。
3. 作成された画面の「uploading an existing file」を押し、**mou-map フォルダの中身すべて**（index.html、assets、data、docs、tools、README.md、.nojekyll）をドラッグして、「Commit changes」を押します。
   - `.nojekyll` は名前が「.」で始まるため、Windowsのエクスプローラーで見えないことがあります。見えない場合は、エクスプローラーの「表示」→「隠しファイル」にチェックを入れてください。
4. リポジトリの「Settings」→ 左の「Pages」を開きます。
5. 「Build and deployment」の Source を「Deploy from a branch」、Branch を「main」「/(root)」にして「Save」を押します。
6. 1〜2分待つと、`https://（GitHubのユーザー名）.github.io/mou-map/` で見られるようになります。

### 方法B：コマンドで行う（git と gh が使える場合）

`mou-map` フォルダで、次のコマンドを1つずつ実行します。

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "日本と世界のMOUマップを公開"
```

```bash
gh repo create mou-map --public --source=. --push
```

そのあと、方法Aの4〜6と同じようにSettings → Pages で公開設定をします。

### 画面のプログラム（assets/js・assets/css）を直したとき

公開する前に、mou-map フォルダで次を実行してください。index.html の版番号が新しくなり、見ている人のブラウザが古いプログラムを使い続けて画面が崩れる（新しいメニューと古い動きが混ざる）のを防ぎます。データ（data フォルダ）だけを直したときは不要です。

```bash
python tools/set_version.py
```

### データを更新したとき

- 方法A：変更したファイル（例：`data/mous/pref-08.json`）を、GitHubの同じ場所に再度アップロードします。
- 方法B：`git add .` → `git commit -m "データ更新"` → `git push` を実行します。

数分で公開中のサイトにも反映されます（ブラウザに古い表示が残っていたら再読み込みしてください）。

## 地図データと部品の出典・利用条件

- 地図：「国土数値情報（行政区域データ）」（国土交通省）https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html をもとに、スマートニュース メディア研究所が簡略化したデータ（https://github.com/smartnews-smri/japan-topography 、商用・非商用を問わず無償で利用可）を加工して作成。国土数値情報の行政区域データはオープンデータ（出典の記載が必要）。
- 参考統計：出入国在留管理庁「在留外国人統計」（e-Stat）、同「特定技能在留外国人数」。
- d3.js（ISCライセンス）、topojson-client（ISCライセンス）。ライセンス文は `assets/vendor/` にあります。
