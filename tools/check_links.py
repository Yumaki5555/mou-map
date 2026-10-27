"""登録データの出典URLが開けるかを確認するスクリプト。

使い方（mou-map フォルダで実行）:
    python tools/check_links.py
結果は画面に表示され、開けなかったURLは tools/link_report.json に保存されます。
（役所のサイトは混み合うと一時的にエラーになることがあるので、エラーが出たら時間をおいて再確認してください）
"""
import concurrent.futures
import glob
import json
import os
import ssl
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def collect():
    urls = {}
    for f in glob.glob(os.path.join(ROOT, "data", "mous", "*.json")):
        if f.endswith("index.json"):
            continue
        for m in json.load(open(f, encoding="utf-8")).get("mous", []):
            for s in m.get("sources", []):
                urls.setdefault(s["url"], []).append(f"{m['id']}:{s['id']}")
    return urls


def check(url):
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept-Language": "ja,en"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return url, r.status, ""
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 400, 404, 500, 501):
                continue
            return url, e.code, str(e.reason)
        except ssl.SSLError as e:
            return url, "SSL", str(e)[:120]
        except Exception as e:  # noqa: BLE001
            if method == "HEAD":
                continue
            return url, "ERR", str(e)[:120]
    return url, "ERR", "unknown"


def main():
    urls = collect()
    bad = []
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for url, status, msg in ex.map(check, urls):
            if status != 200:
                bad.append({"url": url, "status": status, "msg": msg, "used_by": urls[url]})
    print(f"確認したURL：{len(urls)}件　開けなかったURL：{len(bad)}件")
    for b in bad:
        print(b["status"], b["url"], b["used_by"][:3])
    json.dump(bad, open(os.path.join(ROOT, "tools", "link_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
