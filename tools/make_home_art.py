# トップページのイラスト（日本地図・世界地図）とファビコンを作る
# 使い方: python -I tools/make_home_art.py [世界地図の形のファイル]
#   日本地図: data/build/geo.json（このサイトの地図。国土数値情報をもとにしたもの）を大きく省略して描く
#   世界地図: ビザのサイトの world.json（Natural Earth・日本の見方の国境の版・太平洋が真ん中）の陸地を1つにまとめて描く
#     既定の場所: ../../ビザ/site_assets/map/world.json（このファイルから見た場所）
#   作るもの: assets/img/home-japan.svg・home-world.svg（トップの2つの入口の絵。飾りなので件数などの意味はない）
#             assets/img/favicon.svg・favicon-32.png・apple-touch-icon.png（ターコイズの地に白い地球）
# 一度作れば、データを直しても作り直す必要はありません（形を変えたいときだけ実行）
import json
import math
import os
import re
import sys

from PIL import Image, ImageDraw
from shapely.geometry import Polygon
from shapely.ops import unary_union

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
WORLD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "..", "ビザ", "site_assets", "map", "world.json")

BRAND = "#007f93"
BRAND_DARK = "#005f6e"
# 世界地図で線を結ぶ相手国（登録が多い国のうち、日本から離れていて線が見やすい国。飾りなので件数は表さない）
PARTNERS = ["ベトナム", "インドネシア", "フィリピン", "インド", "ウズベキスタン", "ドイツ", "米国"]


def rings(d):
    """SVG の path（M・L・H・V・Z とその小文字だけ）を、点の並びの一覧にする。円弧（a）の部分は省く"""
    out, cur, x, y, cmd = [], [], 0.0, 0.0, None
    toks = re.findall(r"[MmLlHhVvZzAa]|-?\d*\.?\d+(?:e-?\d+)?", d)
    i = 0
    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if len(cur) >= 3:
                    out.append(cur)
                cur = []
            elif cmd in "Aa":
                i += 7  # 円弧（小さな国の丸）は使わない
                cmd = None
            continue
        if cmd in ("M", "L"):
            x, y = float(toks[i]), float(toks[i + 1]); i += 2
        elif cmd in ("m", "l"):
            x, y = x + float(toks[i]), y + float(toks[i + 1]); i += 2
        elif cmd == "H":
            x = float(t); i += 1
        elif cmd == "h":
            x += float(t); i += 1
        elif cmd == "V":
            y = float(t); i += 1
        elif cmd == "v":
            y += float(t); i += 1
        else:
            i += 1
            continue
        if cmd in ("M", "m") and cur:
            if len(cur) >= 3:
                out.append(cur)
            cur = []
        cur.append((x, y))
        if cmd == "M":
            cmd = "L"
        elif cmd == "m":
            cmd = "l"
    if len(cur) >= 3:
        out.append(cur)
    return out


def to_poly(rs, s=1.0, dx=0.0, dy=0.0):
    ps = []
    for r in rs:
        p = Polygon([(px * s + dx, py * s + dy) for px, py in r]).buffer(0)
        if not p.is_empty:
            ps.append(p)
    return unary_union(ps) if ps else None


def parts(geom):
    return [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))


def path_of(geom, tol, min_area):
    """形を省略して、相対座標の短い path にする（小さな島は省く）"""
    g = geom.simplify(tol, preserve_topology=True)
    out = []
    for p in parts(g):
        if p.area < min_area:
            continue
        pts = [(round(x, 1), round(y, 1)) for x, y in p.exterior.coords[:-1]]
        if len(pts) < 3:
            continue
        seg = [f"M{pts[0][0]:g} {pts[0][1]:g}"]
        px, py = pts[0]
        for x, y in pts[1:]:
            ddx, ddy = round(x - px, 1), round(y - py, 1)
            if ddx or ddy:
                seg.append(f"l{ddx:g} {ddy:g}")
            px, py = x, y
        out.append("".join(seg) + "z")
    return "".join(out).replace(" -", "-")


def write(name, text):
    with open(os.path.join(IMG, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"{name}: {len(text.encode('utf-8')) / 1024:.1f}KB")


def japan():
    geo = json.load(open(os.path.join(ROOT, "data", "build", "geo.json"), encoding="utf-8"))
    s = 0.5  # 600×640 → 300×320
    W, H = geo["w"] * s, geo["h"] * s
    paths, shapes = [], {}
    for code, p in sorted(geo["prefs"].items()):
        g = to_poly(rings(p["d"]), s)
        if g is None:
            continue
        if code == "47":
            # 沖縄県（左上の枠の中）は、そのままでは点にしか見えないので1.35倍にして、左上の空いた所に置く。
            # 白い境界線を引くと小さな島が消えるので、線を引かずに別に描く
            x0, y0 = g.bounds[0], g.bounds[1]
            g = to_poly([[((x - x0) * 1.35 + 12, (y - y0) * 1.35 + 14) for x, y in q.exterior.coords] for q in parts(g)])
            okinawa = g.bounds
            okinawa_d = path_of(g, 0.35, 0.4)
            shapes[code] = g
            continue
        shapes[code] = g
        d = path_of(g, 0.5, 1.0)
        if d:
            paths.append(d)
    ox0, oy0, ox1, oy1 = okinawa
    frame = (f'<rect x="{ox0 - 7:.1f}" y="{oy0 - 7:.1f}" width="{ox1 - ox0 + 14:.1f}" height="{oy1 - oy0 + 14:.1f}" rx="6" '
             'fill="#fff" fill-opacity=".75" stroke="#7cc6d1" stroke-width="1.2" stroke-dasharray="4 3"/>')
    # 場所を表すピン（飾り。特定の地域の件数を示すものではない）。東京都・大阪府・福岡県の上に立てる
    def pin(code, r=11):
        pt = max(parts(shapes[code]), key=lambda q: q.area).representative_point()
        x, y = round(pt.x, 1), round(pt.y, 1)
        return (f'<g transform="translate({x} {y})"><path d="M0 0c-{r * .55:g}-{r * .75:g}-{r:g}-{r * 1.2:g}-{r:g}-{r * 1.75:g}a{r:g} {r:g} 0 1 1 {r * 2:g} 0c0 {r * .55:g}-{r * .45:g} {r:g}-{r:g} {r * 1.75:g}z" '
                f'fill="{BRAND_DARK}" stroke="#fff" stroke-width="2"/><circle cy="-{r * 1.75:g}" r="{r * .38:g}" fill="#fff"/></g>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}">'
           f'<defs><linearGradient id="jp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fb0c0"/><stop offset="1" stop-color="{BRAND}"/></linearGradient></defs>'
           f'{frame}<path d="{okinawa_d}" fill="#2a9fb0"/><path d="{"".join(paths)}" fill="url(#jp)" stroke="#fff" stroke-width=".7" stroke-linejoin="round"/>'
           f'{pin("13")}{pin("27", 9.5)}{pin("40", 8.5)}</svg>\n')
    write("home-japan.svg", svg)


def world():
    data = json.load(open(WORLD, encoding="utf-8"))
    s = 0.36  # 1000×439 → 360×158
    W = data["w"] * s
    top, bottom = 18 * s, 380 * s  # 南の端（南極の近く）は描かない
    land, shapes = [], {}
    for name, d in data["areas"].items():
        g = to_poly(rings(d), s, 0, -top)
        if g is None:
            continue
        shapes[name] = g
        land.append(g)
    allland = unary_union(land)
    jp = shapes["none:日本"]
    jx, jy = jp.centroid.x + 1, jp.centroid.y + 2
    arcs, dots = [], []
    for name in PARTNERS:
        g = shapes.get(name)
        if g is None:
            print(f"見つからない国：{name}")
            continue
        big = max(parts(g), key=lambda p: p.area)
        x, y = big.representative_point().x, big.representative_point().y
        # 2点を結ぶ弧（上にふくらませる）
        mx, my = (jx + x) / 2, (jy + y) / 2 - max(14, abs(x - jx) * .28)
        arcs.append(f"M{jx:.1f} {jy:.1f}Q{mx:.1f} {my:.1f} {x:.1f} {y:.1f}")
        dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.4" fill="{BRAND_DARK}" stroke="#fff" stroke-width="1.4"/>')
    H = bottom - top
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}">'
           f'<path d="{path_of(allland, .8, 2)}" fill="#bfe3e9"/>'
           f'<path d="{path_of(jp, .3, .05)}" fill="{BRAND}"/>'
           f'<path d="{"".join(arcs)}" fill="none" stroke="{BRAND}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1 4.2"/>'
           f'{"".join(dots)}<circle cx="{jx:.1f}" cy="{jy:.1f}" r="9" fill="{BRAND}" fill-opacity=".18"/>'
           f'<circle cx="{jx:.1f}" cy="{jy:.1f}" r="4.2" fill="{BRAND}" stroke="#fff" stroke-width="1.6"/></svg>\n')
    write("home-world.svg", svg)


# ---------- ファビコン：ターコイズの地に白い地球（外の円・経線・赤道だけの簡単な形。16pxでも見分けられる太さ） ----------
# 緯線を増やすと16pxでは格子に見えて地球と分からなくなるので、赤道だけにしている
FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
           f'<rect width="32" height="32" rx="7" fill="{BRAND}"/>'
           '<g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round">'
           '<circle cx="16" cy="16" r="11.5"/>'
           '<ellipse cx="16" cy="16" rx="5.2" ry="11.5"/>'
           '<path d="M4.5 16h23"/></g></svg>\n')


def favicon_png(size):
    """ファビコンを大きく描いてから縮める（なめらかにするため）"""
    k = 16  # 1単位 = 16px で描く（32×16 = 512px）
    S = 32 * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([0, 0, S - 1, S - 1], radius=7 * k, fill=BRAND)
    w = round(2.8 * k)
    c = 16 * k
    r = 11.5 * k
    dr.ellipse([c - r, c - r, c + r, c + r], outline="white", width=w)
    # 経線（縦長のだ円）と赤道（緯線）
    rx = 5.2 * k
    dr.ellipse([c - rx, c - r, c + rx, c + r], outline="white", width=w)
    dr.line([c - r, c, c + r, c], fill="white", width=w)
    return im.resize((size, size), Image.LANCZOS)


def favicons():
    write("favicon.svg", FAVICON)
    favicon_png(32).save(os.path.join(IMG, "favicon-32.png"))
    # ホーム画面に追加したときのアイコン（角は端末が丸めるので、四角いまま）
    t = favicon_png(180)
    bg = Image.new("RGBA", t.size, BRAND)
    bg.alpha_composite(t)
    bg.convert("RGB").save(os.path.join(IMG, "apple-touch-icon.png"))
    print("favicon-32.png・apple-touch-icon.png を作りました")


if __name__ == "__main__":
    os.makedirs(IMG, exist_ok=True)
    japan()
    world()
    favicons()
