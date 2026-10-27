"""手元のパソコンでサイトを確認するための簡易サーバー。

使い方（mou-map フォルダで実行）:
    python tools/serve.py
そのあとブラウザで http://127.0.0.1:8000/ を開きます。止めるときは Ctrl+C。
（ファイルを直接ダブルクリックで開くと、ブラウザの安全機能でデータを読み込めません）
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # 変更がすぐ反映されるよう、ブラウザに保存させない
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(ROOT)
    NoCacheHandler.extensions_map[".topojson"] = "application/json"
    print(f"http://127.0.0.1:{PORT}/ で表示できます（Ctrl+C で終了）")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
