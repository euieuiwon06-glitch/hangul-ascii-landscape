"""사진 → 한글·기호 아스키 아트 (SVG 텍스트 + PNG 미리보기).

사용: python tools/ascii_art.py            (웹페이지 폴더에서 실행)
조절값은 아래 CONFIG.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageEnhance
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_WEIGHT = 700   # index.html은 scenes.js의 weight를 따라감
FONT_PATH = r"C:/Windows/Fonts/NotoSansKR-Bold.ttf"
FONT_FAMILY = "'Noto Sans KR', sans-serif"

CONFIG = {
    "images": ["image 25.png", "image 30.png", "image 31.png", "image 32.png"],
    "cols": int(os.environ.get("ASCII_COLS", 150)),         # 가로 글자 수
    "cell": 12,           # SVG 상 한 칸 크기(px). 글자 크기 = cell
    "sub": 8,             # 칸 하나를 몇×몇 픽셀로 보고 글자 모양과 비교할지
    "edge": 0.7,          # 윤곽선 강조 정도
    "gamma": 1.0,         # 작을수록 밝은 부분이 더 비어 보임
    "clahe": 2.0, "clahe_mix": 0.35,  # 국소 대비 세기 / 섞는 비율
    "dither": 0.45,        # 글자 농도 오차 확산(톤 단계 표현)
    "contrast": 1.8,      # S커브 대비(1=그대로)
    "min_tone": 0.42,     # 가장 밝은 곳에도 이 농도 이상 글자(빈칸 없이 꽉 채움)
    "max_tone": 0.82,     # 가장 어두운 곳의 글자 농도 상한(1=가장 빽빽한 글자)
    "blank": 0.0,         # 이 농도 이하면 빈칸
    "variety": 6,         # 같은 농도에서 고를 후보 수
    "edge_thr": 9.0,      # 이 이상이면 윤곽선 기호 사용
    "edge_only": set(r"/\|ㅣ!-~_=ㅡ"),
    "low_pct": 2, "high_pct": 99.5,  # 명암 늘이기 범위
    "saturate": 1.3,      # 글자색 채도 배율(흰 틈에 묻히는 만큼 보정)
    "brightness": 1.0,    # 글자색 밝기 배율(1=그대로)
    "font_scale": 1.22,   # 칸 대비 글자 크기
    "ink": "#111111", "paper": "#ffffff",
}

# 낱자 자음·모음 위주(빈틈 있는 결) + 받침 없는 글자 조금. 받침 글자는 너무 빽빽해서 제외
JAMO = list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"   # 쌍자음(ㄲㄸㅃㅆㅉ)은 사용자 요청으로 제외
            
            "ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅔㅘㅝㅢ")
SYLLABLE = list("고노루무스수으")
HANGUL = JAMO + SYLLABLE

SYMBOLS = list(".,·‥…'\"`^~-_=+*:;!?/\\|()[]{}<>#%&@※¨˚°´˝")


def supported(chars):
    cmap = TTFont(FONT_PATH).getBestCmap()
    return [c for c in dict.fromkeys(chars) if ord(c) in cmap]


def glyph_bank(chars, sub):
    R = 64  # 렌더 해상도
    font = ImageFont.truetype(FONT_PATH, R)
    # '한' 박스로 세로 중앙 맞추는 baseline 계산
    l, t, r, b = font.getbbox("한", anchor="ls")
    base = R / 2 - (t + b) / 2          # cell 위쪽에서 baseline 까지 (R 기준)
    vecs = []
    for c in chars:
        im = Image.new("L", (R, R), 0)
        ImageDraw.Draw(im).text((R / 2, base), c, fill=255, font=font, anchor="ms")
        vecs.append(np.asarray(im.resize((sub, sub), Image.BOX), np.float32) / 255)
    vecs = [np.zeros((sub, sub), np.float32)] + vecs
    chars = [" "] + chars
    V = np.stack([v.ravel() for v in vecs])
    return chars, V, base / R


def darkness_map(path, cols, sub, cfg):
    import cv2
    im = Image.open(path).convert("RGB")
    W, H = im.size
    rows = round(cols * H / W)
    g0 = np.asarray(ImageOps.grayscale(im))
    # 국소 대비(CLAHE): 구름·암벽·풀 결을 살림
    cl = cv2.createCLAHE(clipLimit=cfg["clahe"], tileGridSize=(8, 8)).apply(g0)
    g0 = cv2.addWeighted(g0, 1 - cfg["clahe_mix"], cl, cfg["clahe_mix"], 0)
    g = Image.fromarray(g0).resize((cols * sub, rows * sub), Image.LANCZOS)
    a = np.asarray(g, np.float32) / 255
    lo, hi = np.percentile(a, cfg["low_pct"]), np.percentile(a, cfg["high_pct"])
    a = np.clip((a - lo) / (hi - lo + 1e-6), 0, 1) ** cfg["gamma"]
    d = 1 - a
    # 윤곽선
    gb = g.filter(ImageFilter.GaussianBlur(sub * 0.35))
    e = np.asarray(gb.filter(ImageFilter.FIND_EDGES), np.float32) / 255
    e = np.clip(e / (np.percentile(e, 99) + 1e-6), 0, 1)
    d = np.clip(d + cfg["edge"] * e * 0.6, 0, 1)
    k = cfg["contrast"]
    d = d ** k / (d ** k + (1 - d) ** k)
    d = cfg["min_tone"] + d * (cfg["max_tone"] - cfg["min_tone"])
    return d, rows


def convert(path, chars, V, base_ratio, cfg):
    """농도 단계별 글자 묶음 + 윤곽선은 방향 기호 + 오차 확산."""
    import cv2
    cols, sub = cfg["cols"], cfg["sub"]
    d, rows = darkness_map(path, cols, sub, cfg)
    cellmean = d.reshape(rows, sub, cols, sub).mean((1, 3))
    m, g = ground_mask(os.path.basename(path), rows)
    if g:
        cellmean = np.clip(cellmean + g["tone_add"] * m[:, None], 0, 1).astype(np.float32)
    # 칸 단위 그라디언트(윤곽 방향)
    sm = cv2.GaussianBlur(cellmean, (0, 0), 0.8)
    gx = cv2.Sobel(sm, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(sm, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    mag = mag / (np.percentile(mag, 99) + 1e-6)
    ang = (np.degrees(np.arctan2(gy, gx)) + 180) % 180   # 그라디언트 방향 → 선은 수직

    Vm = V.mean(1)
    ci = {c: i for i, c in enumerate(chars)}
    tone_chars = [c for c in chars if c not in cfg["edge_only"]]
    tone_idx = np.array([ci[c] for c in tone_chars])
    order = tone_idx[np.argsort(Vm[tone_idx])]
    tm = Vm[order] / Vm[order].max()                   # 0..1 농도
    rng = np.random.default_rng(7)

    def edge_glyph(theta):
        # 그라디언트 각 theta → 선 방향은 theta+90
        line = (theta + 90) % 180
        if line < 22.5 or line >= 157.5:
            return rng.choice(["ㅡ", "-", "~", "_", "="])
        if line < 67.5:
            return rng.choice(["\\", "ヽ" if False else "\\"])
        if line < 112.5:
            return rng.choice(["|", "ㅣ", "!", ":"])
        return "/"

    err = np.zeros((rows + 1, cols + 2), np.float32)
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            t = np.clip(cellmean[r, c] + err[r, c + 1] * cfg["dither"], 0, 1.2)
            if t < cfg["blank"]:
                row.append(" ")
                err[r, c + 2] += t * 0.25
                continue
            if mag[r, c] > cfg["edge_thr"] and 0.12 < t < 0.85:
                ch = edge_glyph(ang[r, c])
                out = Vm[ci[ch]] / Vm[order].max()
            else:
                # 가까운 농도 후보들 중 무작위 → 결이 생김
                k = np.argsort(np.abs(tm - t))[: cfg["variety"]]
                k = k[np.abs(tm[k] - t) <= np.abs(tm[k[0]] - t) + 0.04]
                j = int(rng.choice(k))
                ch, out = chars[order[j]], tm[j]
            row.append(ch)
            e = t - out
            err[r, c + 2] += e * 7 / 16
            err[r + 1, c] += e * 3 / 16
            err[r + 1, c + 1] += e * 5 / 16
            err[r + 1, c + 2] += e * 1 / 16
        grid.append(row)
    return grid, rows


def esc(c):
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}.get(c, c)


# 장면별 땅 보정: 지평선(from, 높이 비율) 아래를 어둡게·빽빽하게. fade 구간에서 서서히 적용
GROUND = {
    "image 31.png": {"from": 0.77, "fade": 0.05, "brightness": 0.55, "saturate": 1.15, "tone_add": 0.0},
}


def ground_mask(name, rows):
    g = GROUND.get(name)
    if not g:
        return None, None
    y = (np.arange(rows) + 0.5) / rows
    m = np.clip((y - g["from"]) / g["fade"], 0, 1)
    return m, g


def cell_colors(path, cols, rows):
    """칸마다 원본 사진의 평균색 (#rrggbb)."""
    im = Image.open(path).convert("RGB").resize((cols, rows), Image.BOX)
    im = ImageEnhance.Color(im).enhance(CONFIG["saturate"])
    im = ImageEnhance.Brightness(im).enhance(CONFIG["brightness"])
    a = np.asarray(im).astype(np.float32)
    m, g = ground_mask(os.path.basename(path), rows)
    if g:
        gi = ImageEnhance.Color(im).enhance(g["saturate"])
        gi = np.asarray(ImageEnhance.Brightness(gi).enhance(g["brightness"])).astype(np.float32)
        a = a * (1 - m[:, None, None]) + gi * m[:, None, None]
    a = np.clip(a.round(), 0, 255).astype(np.uint8)
    return [["%02x%02x%02x" % tuple(px) for px in row] for row in a]


def write_svg(grid, colors, out, cfg, base_ratio):
    cell = cfg["cell"]
    rows, cols = len(grid), len(grid[0])
    W, H = cols * cell, rows * cell
    L = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<rect width="100%" height="100%" fill="{cfg["paper"]}"/>',
         f'<g font-family="{FONT_FAMILY}" font-size="{cell * cfg['font_scale']:g}" font-weight="{FONT_WEIGHT}" text-anchor="middle">']
    for r, row in enumerate(grid):
        y = r * cell + base_ratio * cell
        spans = [f'<tspan x="{c * cell + cell / 2:g}" fill="#{colors[r][c]}">{esc(ch)}</tspan>'
                 for c, ch in enumerate(row) if ch != " "]
        if spans:
            L.append(f'<text y="{y:.2f}">{"".join(spans)}</text>')
    L += ["</g>", "</svg>"]
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def write_png(grid, colors, out, cfg, base_ratio, scale=2):
    cell = cfg["cell"] * scale
    rows, cols = len(grid), len(grid[0])
    im = Image.new("RGB", (cols * cell, rows * cell), cfg["paper"])
    dr = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT_PATH, round(cell * cfg["font_scale"]))
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch != " ":
                dr.text((c * cell + cell / 2, r * cell + base_ratio * cell), ch,
                        fill="#" + colors[r][c], font=font, anchor="ms")
    im.save(out)


def main():
    import json
    cfg = CONFIG
    chars = supported(HANGUL + SYMBOLS)
    chars, V, base_ratio = glyph_bank(chars, cfg["sub"])
    outdir = os.path.join(ROOT, "ascii")
    os.makedirs(outdir, exist_ok=True)
    preview_dir = os.environ.get("ASCII_PREVIEW_DIR")  # 확인용 PNG는 프로젝트 밖에만
    scenes = []
    for name in cfg["images"]:
        path = os.path.join(ROOT, name)
        grid, rows = convert(path, chars, V, base_ratio, cfg)
        colors = cell_colors(path, len(grid[0]), rows)
        stem = "ascii_" + os.path.splitext(name)[0].replace("image ", "")
        write_svg(grid, colors, os.path.join(outdir, stem + ".svg"), cfg, base_ratio)
        if preview_dir:
            write_png(grid, colors, os.path.join(preview_dir, stem + ".png"), cfg, base_ratio)
        scenes.append({
            "id": stem.replace("ascii_", ""),
            "cols": len(grid[0]), "rows": rows,
            "chars": ["".join(r) for r in grid],
            "colors": ["".join(r) for r in colors],
        })
        print(stem, f"{len(grid[0])}x{rows}")
    with open(os.path.join(ROOT, "scenes.js"), "w", encoding="utf-8") as f:
        f.write("// tools/ascii_art.py 로 생성 — 직접 수정하지 말 것\n")
        f.write("window.ASCII = " + json.dumps({"base": round(base_ratio, 4), "weight": FONT_WEIGHT, "scenes": scenes},
                                               ensure_ascii=False, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main()
