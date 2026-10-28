"""公開の前に実行する：ブラウザが古いプログラム（JavaScript・CSS）を使い続けないよう、index.html の版番号を新しくします。

使い方（mou-map フォルダで実行）:
    python tools/set_version.py

しくみ：公開サーバー（GitHub Pages）はブラウザに「10分間は前に読み込んだファイルを使ってよい」と伝えるため、
更新直後に開くと、新しい画面と古いプログラムが混ざることがあります。ファイル名のうしろに版番号（?v=…）を付けると、
版番号が変わったときにブラウザが必ず新しいファイルを読み込みます。assets/js の中のファイルはすべて自動で一覧にします
（index.html の importmap。プログラムどうしの読み込みにも同じ版番号が付きます）。
最初の画面で必ず使うプログラム（PRELOAD）は、読み込みの順番待ちが起きないよう index.html で先に読み込みを始めます（modulepreload）。
"""
import glob
import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
# どのページを開いても最初に必要になるプログラム（それ以外は、そのページを開いたときに読み込みます）
PRELOAD = ['app.js', 'data.js', 'util.js', 'shared.js', 'components.js']


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    v = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime('%Y%m%d%H%M')
    files = sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, 'assets', 'js', '*.js')))
    imports = {f'./assets/js/{f}': f'./assets/js/{f}?v={v}' for f in files}
    block = ('<!-- version:start（tools/set_version.py が書き換えます） -->\n'
             '<script type="importmap">\n' + json.dumps({'imports': imports}, ensure_ascii=False, indent=1) + '\n</script>\n'
             + ''.join(f'<link rel="modulepreload" href="assets/js/{f}?v={v}">\n' for f in PRELOAD if f in files)
             + f'<script type="module" src="assets/js/app.js?v={v}"></script>\n'
             '<!-- version:end -->')
    with open(INDEX, encoding='utf-8') as f:
        s = f.read()
    s, n = re.subn(r'<!-- version:start.*?<!-- version:end -->', lambda m: block, s, flags=re.S)
    if n != 1:
        sys.exit('index.html に <!-- version:start --> ～ <!-- version:end --> の目印が見つかりません')
    s = re.sub(r'href="assets/css/style\.css(\?v=[^"]*)?"', f'href="assets/css/style.css?v={v}"', s)
    with open(INDEX, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)
    print(f'版番号を {v} にしました（JavaScript {len(files)}ファイル・CSS）')


if __name__ == '__main__':
    main()
