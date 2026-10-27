"""サイトに表示される外部リンク（出典・調査記録・統計の出典など）が開けるかを確認するスクリプト。

使い方（mou-map フォルダで実行）:
    python tools/check_links.py
結果は画面に表示され、開けなかったURLは tools/link_report.json に保存されます。
・「リンク切れ」… ページが見つからない（404、「お探しのページは見つかりません」と表示されるページを含む）
・「要確認」… 一時的なエラーや、プログラムからのアクセスだけを断るサイト（ブラウザで開いて確かめてください）
（役所のサイトは混み合うと一時的にエラーになることがあるので、エラーが出たら時間をおいて再確認してください）
"""
import concurrent.futures
import glob
import http.cookiejar
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
# 文章の中のURL（サイトの linkify と同じく、URLに使える半角文字だけ）
TEXT_URL = re.compile(r"https?://[\w\-.~:/?#\[\]@!$&*+,;=%]+")
# 「ページが見つかりません」を本文で知らせるページ（状態は200のこともある）
NOT_FOUND = re.compile(r"<title>[^<]*(見つかりません|見つかりませんでした|404|Not Found|not found|ページが存在しません)[^<]*</title>", re.I)


def collect():
    """サイトがリンクとして表示するURLを集める（項目の値がURLのもの＋調査記録の文章中のURL）"""
    urls = {}

    def walk(o, where, in_text_list):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, where, k == "searched")
        elif isinstance(o, list):
            for v in o:
                walk(v, where, in_text_list)
        elif isinstance(o, str):
            if re.fullmatch(r"https?://\S+", o):
                urls.setdefault(o, []).append(where)
            elif in_text_list:
                for u in TEXT_URL.findall(o):
                    urls.setdefault(u.rstrip(".,;:"), []).append(where)

    for f in glob.glob(os.path.join(ROOT, "data", "**", "*.json"), recursive=True):
        data = json.load(open(f, encoding="utf-8"))
        name = os.path.relpath(f, ROOT).replace("\\", "/")
        for m in data.get("mous", []) if isinstance(data, dict) else []:
            for s in m.get("sources", []):
                urls.setdefault(s["url"], []).append(f"{m['id']}:{s['id']}")
        if not (isinstance(data, dict) and "mous" in data):
            walk(data, name, False)
    return urls


def encode(url):
    """日本語などを含むURLを、ブラウザと同じように %xx の形に直す"""
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((p.scheme, p.netloc, urllib.parse.quote(p.path, safe="/%:@!$&'()*+,;=-._~"),
                                    urllib.parse.quote(p.query, safe="=&%:/?+,;@!$'()*-._~"), p.fragment))


def fetch(url, verify=True):
    ctx = ssl.create_default_context()
    if not verify:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    # クッキーを受け取れるようにする（クッキーがないと転送をくり返すサイトがあるため）
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
                                         urllib.request.HTTPSHandler(context=ctx))
    req = urllib.request.Request(encode(url), headers={"User-Agent": UA, "Accept-Language": "ja,en;q=0.8",
                                                       "Accept": "text/html,application/pdf,*/*;q=0.8"})
    with opener.open(req, timeout=40) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read(300000)


def check(url, retry=2):
    try:
        try:
            status, ctype, body = fetch(url)
        except urllib.error.URLError as e:
            reason = str(getattr(e, "reason", e))
            if "CERTIFICATE_VERIFY_FAILED" not in reason:
                raise
            if "expired" in reason:
                return url, "リンク切れ", "サイトの証明書の期限切れ（ブラウザでは警告が出て開けません）"
            # 中間証明書を送らないサイト。ブラウザでは開けることが多いので、証明書を確かめずに中身だけ確認する
            status, ctype, body = fetch(url, verify=False)
        if "html" in ctype and NOT_FOUND.search(body.decode("utf-8", "ignore") + body.decode("shift_jis", "ignore")):
            return url, "リンク切れ", "「ページが見つかりません」と表示される"
        return url, "OK", status
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return url, "リンク切れ", f"HTTP {e.code}"
        if e.code in (429, 503) and retry:  # 「アクセスが多すぎる」などの一時的な断り。少し待ってやり直す
            time.sleep(20)
            return check(url, retry - 1)
        return url, "要確認", f"HTTP {e.code}（ブラウザで開いて確かめてください）"
    except Exception as e:  # noqa: BLE001
        return url, "要確認", str(e)[:120]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    urls = collect()
    bad = []
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for url, result, msg in ex.map(check, urls):
            if result != "OK":
                bad.append({"url": url, "result": result, "msg": msg, "used_by": urls[url]})
    broken = [b for b in bad if b["result"] == "リンク切れ"]
    print(f"確認したURL：{len(urls)}件　リンク切れ：{len(broken)}件　要確認：{len(bad) - len(broken)}件")
    for b in bad:
        print(b["result"], b["msg"], b["url"], b["used_by"][:3])
    json.dump(bad, open(os.path.join(ROOT, "tools", "link_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
