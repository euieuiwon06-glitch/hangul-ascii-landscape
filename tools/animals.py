"""동물 15종 → 배경과 같은 문자 격자(정사각 칸)의 실루엣 패턴 → animals.js

각 동물은 칸 단위 좌표(가로 w, 세로 h, 왼쪽 위 0,0, 발 = 맨 아래 줄)에
기본 도형으로 그린 뒤 칸마다 덮인 비율로 마스크를 만든다.
  - 외곽 칸: 윤곽 방향에 맞는 기호(- _ | / \\)
  - 내부 칸: 면 채우기 버전에서 쓰는 칸
  - 선(S): 귀·날개 같은 안쪽 선
  - 눈: *
사용: python tools/animals.py [미리보기.png]
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = 16          # 칸 하나를 몇 px로 그려서 덮임 비율을 잴지
COVER = 0.38      # 이 비율 이상 덮인 칸 = 동물 칸
SCALE = 1.3       # 전체 크기 배율(칸 수 자체가 바뀜 — 글자 크기는 그대로)

# 장면별 지평선(이 줄부터 땅). 땅 동물의 발은 이 줄 아래에만 놓임
SCENES = {"32": {"horizon": 68, "mode": "line"}, "30": {"horizon": 63, "mode": "fill"}}


def E(cx, cy, rx, ry): return ("e", cx, cy, rx, ry)
def C(cx, cy, r): return ("e", cx, cy, r, r)
def P(*pts): return ("p", pts)
def L(*pts, w=1.2): return ("l", pts, w)           # 굵은 선(다리·뿔·꼬리)
def S(*pts): return ("s", pts)                     # 안쪽 선(외곽 기호로 그림)


ANIMALS = {
    "rabbit": dict(ko="토끼", w=17, h=15, eye=(3.6, 7.2), shapes=[
        E(10.5, 10.3, 5.6, 4.4), C(4.8, 7.6, 3.1),
        L((4.4, 5.2), (4.6, 0.6), w=1.9), L((6.0, 5.4), (8.4, 1.2), w=1.9),
        L((5.4, 10.5), (5.2, 14.4), w=1.7), E(10.6, 13.9, 4.2, 1.1), C(16.0, 10.0, 1.2)]),
    "cat": dict(ko="고양이", w=15, h=17, eye=[(3.9, 4.6), (6.2, 4.6)], shapes=[
        C(5.0, 4.8, 3.3), P((1.9, 3.6), (2.2, 0.0), (4.6, 2.0)), P((5.4, 2.0), (7.8, 0.0), (8.1, 3.6)),
        E(7.0, 11.4, 4.3, 5.2), L((4.2, 10.0), (4.2, 16.4), w=1.8),
        L((10.6, 16.0), (13.4, 14.4), (14.0, 11.0), (13.0, 8.2), w=1.6)]),
    "dog": dict(ko="강아지", w=18, h=15, eye=(3.8, 3.8), shapes=[
        E(4.8, 4.4, 3.4, 2.9), E(1.8, 5.6, 1.9, 1.3), E(6.9, 5.4, 1.5, 2.7),
        E(9.6, 10.0, 4.6, 4.3), L((5.2, 8.5), (5.0, 14.4), w=1.9), E(12.0, 11.8, 3.0, 2.8),
        E(11.0, 14.0, 3.6, 0.9), L((14.0, 11.4), (16.0, 9.6), (17.2, 7.4), w=1.3)]),
    "deer": dict(ko="사슴", w=19, h=25, eye=(3.2, 7.4), shapes=[
        L((5.0, 6.0), (4.0, 3.0), (2.8, 0.4), w=0.9), L((4.4, 3.4), (2.2, 2.6), w=0.9),
        L((6.0, 6.0), (7.0, 3.0), (8.4, 0.6), w=0.9), L((7.0, 3.2), (9.0, 2.6), w=0.9),
        E(3.9, 7.8, 2.4, 1.6), P((4.6, 6.6), (6.8, 7.0), (8.2, 13.0), (5.2, 13.2)),
        E(11.6, 13.4, 6.4, 3.2),
        L((6.8, 14.0), (6.6, 24.5), w=1.2), L((8.6, 14.0), (8.8, 24.5), w=1.2),
        L((15.0, 14.0), (15.4, 24.5), w=1.2), L((16.8, 13.6), (17.4, 24.5), w=1.2),
        E(18.0, 11.6, 0.9, 1.3)]),
    "elephant": dict(ko="코끼리", w=27, h=19, eye=(5.6, 6.2), shapes=[
        E(15.6, 9.0, 9.8, 6.8), C(7.2, 7.0, 4.6),
        L((3.6, 8.6), (2.2, 12.4), (2.4, 15.6), (3.8, 16.4), w=2.2),
        P((7.8, 12.0), (11.2, 12.0), (11.0, 18.6), (8.0, 18.6)), P((12.4, 12.6), (15.4, 12.6), (15.2, 18.6), (12.6, 18.6)),
        P((18.8, 12.6), (21.8, 12.6), (21.8, 18.6), (19.0, 18.6)), P((22.6, 11.6), (25.2, 11.0), (25.4, 18.6), (22.8, 18.6)),
        L((25.0, 8.0), (26.4, 12.6), w=0.8),
        S((9.6, 3.4), (12.6, 3.6), (13.6, 7.4), (12.2, 11.0), (9.8, 10.4))]),
    "fox": dict(ko="여우", w=18, h=15, eye=(4.4, 5.2), shapes=[
        E(5.2, 5.6, 3.0, 2.6), P((2.8, 5.0), (0.2, 6.8), (3.2, 7.6)),
        P((3.0, 4.0), (3.4, 0.2), (5.2, 3.0)), P((5.6, 3.0), (7.6, 0.4), (7.8, 4.4)),
        E(8.2, 10.6, 3.9, 4.0), L((5.6, 9.6), (5.4, 14.4), w=1.7),
        E(13.8, 11.4, 3.6, 2.4), P((15.6, 10.0), (17.8, 8.2), (17.0, 11.6))]),
    "bear": dict(ko="곰", w=25, h=14, eye=(3.6, 6.0), shapes=[
        E(13.6, 6.8, 9.4, 5.2), E(4.8, 6.8, 3.7, 3.1), E(1.8, 7.8, 1.7, 1.4), C(5.8, 3.4, 1.3),
        P((6.6, 8.0), (9.8, 8.0), (9.6, 13.6), (6.8, 13.6)), P((11.0, 9.6), (13.8, 9.6), (13.6, 13.6), (11.2, 13.6)),
        P((16.2, 9.6), (19.0, 9.6), (18.8, 13.6), (16.4, 13.6)), P((19.8, 8.4), (22.8, 7.6), (22.6, 13.6), (20.0, 13.6))]),
    "squirrel": dict(ko="다람쥐", w=17, h=16, eye=(3.8, 5.2), shapes=[
        C(4.8, 5.6, 2.9), P((4.0, 3.2), (4.6, 0.6), (6.0, 3.0)),
        E(7.2, 10.6, 3.3, 4.3), E(7.6, 14.6, 2.8, 1.0), L((4.6, 9.0), (3.4, 10.4), w=1.2),
        E(12.4, 10.0, 2.9, 5.6), C(13.4, 4.6, 3.4),
        S((13.0, 2.6), (14.8, 4.0), (13.6, 6.4), (12.2, 5.6))]),
    "hedgehog": dict(ko="고슴도치", w=19, h=10, eye=(3.2, 6.0), shapes=[
        E(10.4, 6.0, 7.6, 3.6),
        P((3.4, 5.4), (4.4, 2.6), (5.8, 3.4), (6.8, 1.0), (8.4, 2.4), (9.6, 0.2), (11.0, 2.0), (12.6, 0.4),
          (13.6, 2.4), (15.4, 1.2), (15.8, 3.4), (17.8, 3.0), (17.4, 5.6), (18.6, 6.6), (17.0, 8.0)),
        P((3.4, 5.0), (0.2, 7.4), (4.0, 8.4)),
        L((6.4, 8.4), (6.4, 9.6), w=1.4), L((13.6, 8.4), (13.6, 9.6), w=1.4)]),
    "cow": dict(ko="소", w=25, h=15, eye=(3.2, 4.4), shapes=[
        P((5.8, 3.2), (21.8, 2.8), (22.8, 5.0), (22.4, 10.2), (6.4, 10.4), (5.2, 7.0)),
        E(3.8, 5.0, 2.6, 2.4), E(2.0, 6.8, 1.8, 1.4), P((2.8, 3.0), (2.4, 0.6), (4.0, 2.6)),
        E(6.6, 3.8, 1.4, 0.7),
        P((7.0, 9.6), (9.0, 9.6), (9.0, 14.6), (7.2, 14.6)), P((9.8, 9.6), (11.8, 9.6), (11.8, 14.6), (10.0, 14.6)),
        P((17.6, 9.6), (19.6, 9.6), (19.6, 14.6), (17.8, 14.6)), P((20.4, 9.4), (22.4, 9.2), (22.4, 14.6), (20.6, 14.6)),
        L((22.8, 3.6), (24.2, 9.2), w=0.8),
        S((13.0, 3.4), (15.6, 4.6), (15.0, 7.4), (12.6, 6.6), (13.0, 3.4))]),
    "horse": dict(ko="말", w=23, h=19, eye=(3.4, 2.8), shapes=[
        E(13.6, 9.0, 7.2, 3.6), P((4.4, 2.0), (7.2, 1.4), (10.0, 7.2), (6.8, 9.6)),
        P((3.4, 1.4), (5.8, 0.8), (6.0, 4.0), (1.4, 6.8), (0.2, 5.6)), P((5.2, 1.6), (5.8, 0.0), (6.6, 1.4)),
        L((8.4, 10.4), (7.8, 18.6), w=1.4), L((10.4, 10.6), (10.8, 18.6), w=1.4),
        L((17.4, 10.6), (16.8, 18.6), w=1.4), L((19.4, 10.2), (20.2, 18.6), w=1.4),
        P((20.0, 6.4), (22.6, 8.4), (22.2, 14.6), (21.0, 14.2), (20.8, 9.6)),
        S((6.2, 1.4), (8.4, 3.6), (9.8, 6.6))]),
    "sheep": dict(ko="양", w=19, h=13, eye=(2.6, 5.0), shapes=[
        E(10.6, 6.0, 7.4, 4.0), C(5.4, 4.0, 2.2), C(8.6, 2.6, 2.4), C(12.2, 2.4, 2.4), C(15.4, 3.4, 2.2),
        C(17.2, 6.4, 1.8), C(15.2, 9.2, 1.9), C(10.6, 9.6, 2.0), C(6.2, 8.8, 2.0),
        E(3.0, 5.6, 2.5, 2.2), E(4.6, 4.2, 1.4, 0.7),
        L((6.4, 9.4), (6.4, 12.6), w=1.2), L((8.6, 10.2), (8.6, 12.6), w=1.2),
        L((12.8, 10.2), (12.8, 12.6), w=1.2), L((15.0, 9.6), (15.0, 12.6), w=1.2)]),
    "pig": dict(ko="돼지", w=19, h=12, eye=(3.2, 5.0), shapes=[
        E(10.6, 5.8, 7.6, 4.2), E(4.0, 5.8, 2.9, 2.6), P((0.2, 5.0), (1.8, 5.0), (1.8, 7.4), (0.2, 7.4)),
        P((3.6, 3.6), (4.6, 1.0), (6.4, 3.2)),
        P((5.6, 8.4), (7.4, 8.4), (7.4, 11.6), (5.6, 11.6)), P((8.6, 9.0), (10.4, 9.0), (10.4, 11.6), (8.6, 11.6)),
        P((13.4, 9.0), (15.2, 9.0), (15.2, 11.6), (13.4, 11.6)), P((15.8, 8.4), (17.6, 8.0), (17.6, 11.6), (15.8, 11.6)),
        L((18.0, 4.6), (18.8, 3.4), (18.2, 2.6), w=0.8)]),
    "bird": dict(ko="새", w=15, h=12, eye=(4.4, 3.2), shapes=[
        E(8.0, 6.2, 4.6, 3.3), C(5.2, 3.8, 2.6), P((2.8, 3.4), (0.4, 4.4), (2.9, 5.0)),
        P((11.4, 6.4), (14.8, 9.6), (13.2, 10.2), (10.6, 8.4)),
        L((7.4, 9.0), (7.2, 11.6), w=0.8), L((9.0, 9.0), (9.2, 11.6), w=0.8),
        S((6.8, 6.0), (10.0, 5.0), (12.0, 7.2))], sky=True),
    "duck": dict(ko="오리", w=17, h=15, eye=(4.6, 3.2), shapes=[
        C(5.2, 3.8, 2.7), P((2.8, 3.6), (0.2, 4.4), (2.8, 5.4)), P((4.0, 5.0), (6.6, 5.0), (6.8, 9.6), (4.4, 9.4)),
        E(9.6, 10.4, 6.4, 3.0), P((14.0, 8.6), (16.8, 7.6), (15.6, 11.4)),
        L((8.4, 13.0), (8.4, 14.6), w=0.8), L((10.6, 13.0), (10.6, 14.6), w=0.8),
        S((8.0, 9.6), (11.6, 9.0), (13.6, 10.6))]),
}


def raster(spec):
    w, h = spec["w"], spec["h"]
    W, H = int(round(w * SCALE)), int(round(h * SCALE))
    k = RES * SCALE
    im = Image.new("L", (W * RES, H * RES), 0)
    lines = Image.new("L", im.size, 0)
    d, dl = ImageDraw.Draw(im), ImageDraw.Draw(lines)
    for s in spec["shapes"]:
        if s[0] == "e":
            _, cx, cy, rx, ry = s
            d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=255)
        elif s[0] == "p":
            d.polygon([(x * k, y * k) for x, y in s[1]], fill=255)
        elif s[0] == "l":
            pts = [(x * k, y * k) for x, y in s[1]]
            r = s[2] * k / 2
            d.line(pts, fill=255, width=int(s[2] * k))
            for x, y in pts:
                d.ellipse([x - r, y - r, x + r, y + r], fill=255)
        elif s[0] == "s":
            dl.line([(x * k, y * k) for x, y in s[1]], fill=255, width=max(2, int(0.5 * k)))
    a = np.asarray(im, np.float32) / 255
    cov = a.reshape(H, RES, W, RES).mean((1, 3))
    mask = cov >= COVER
    # 방향: 흐린 마스크의 기울기
    blur = np.asarray(im.filter(ImageFilter.GaussianBlur(RES * 0.7)), np.float32)
    gy, gx = np.gradient(blur)
    lcov = (np.asarray(lines, np.float32) / 255).reshape(H, RES, W, RES).mean((1, 3))
    lgy, lgx = np.gradient(np.asarray(lines.filter(ImageFilter.GaussianBlur(RES * 0.4)), np.float32))

    def dir_char(vx, vy, top_hint):
        # (vx, vy) = 윤곽에 수직인 방향(안쪽) → 선 방향은 수직
        tx, ty = -vy, vx
        a = math.degrees(math.atan2(-ty, tx)) % 180
        if a < 22.5 or a >= 157.5:
            return "-" if top_hint else "_"
        if a < 67.5:
            return "/"
        if a < 112.5:
            return "|"
        return "\\"

    outline = [[" "] * W for _ in range(H)]
    fill = [["0"] * W for _ in range(H)]
    for r in range(H):
        for c in range(W):
            if not mask[r, c]:
                continue
            nb = [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)]
            edge = any(not (0 <= y < H and 0 <= x < W) or not mask[y, x] for y, x in nb)
            py, px = int((r + 0.5) * RES), int((c + 0.5) * RES)
            if edge:
                vx, vy = gx[py, px], gy[py, px]
                if abs(vx) + abs(vy) < 1e-3:
                    vx, vy = 0.0, 1.0
                outline[r][c] = dir_char(vx, vy, vy > 0)
            elif lcov[r, c] > 0.12:
                outline[r][c] = dir_char(lgx[py, px], lgy[py, px], True)
            else:
                fill[r][c] = "1"
    eyes = spec["eye"] if isinstance(spec["eye"], list) else [spec["eye"]]
    for ex, ey in eyes:
        r, c = int(ey * SCALE), int(ex * SCALE)
        if mask[r, c]:
            outline[r][c] = "*"
            fill[r][c] = "0"
    return {"ko": spec["ko"], "w": W, "h": H, "sky": bool(spec.get("sky")),
            "o": ["".join(x) for x in outline], "f": ["".join(x) for x in fill]}


def preview(data, out):
    font = ImageFont.truetype("C:/Windows/Fonts/NotoSansKR-Bold.ttf", 15)
    cell, pad = 12, 3
    names = list(data)
    colw = max(d["w"] for d in data.values()) + pad
    rowh = max(d["h"] for d in data.values()) + pad
    sheet = Image.new("RGB", (colw * cell * 5 * 2, rowh * cell * 3), "white")
    dr = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        d = data[n]
        for mode in (0, 1):
            ox = ((i % 5) * 2 + mode) * colw * cell + cell
            oy = (i // 5) * rowh * cell + (rowh - d["h"] - 1) * cell
            for r in range(d["h"]):
                for c in range(d["w"]):
                    ch = d["o"][r][c]
                    if ch == " " and mode == 1 and d["f"][r][c] == "1":
                        ch = "ㅁ"
                    if ch != " ":
                        dr.text((ox + c * cell + cell / 2, oy + r * cell + cell / 2), ch,
                                fill="#2a3a2a", font=font, anchor="mm")
    sheet.save(out)


def main():
    data = {n: raster(s) for n, s in ANIMALS.items()}
    with open(os.path.join(ROOT, "animals.js"), "w", encoding="utf-8") as f:
        f.write("// tools/animals.py 로 생성 — 직접 수정하지 말 것\n")
        f.write("window.ANIMALS = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("window.ZOO_SCENES = " + json.dumps(SCENES) + ";\n")
    if len(sys.argv) > 1:
        preview(data, sys.argv[1])
    for n, d in data.items():
        print(n, d["w"], "x", d["h"])


if __name__ == "__main__":
    main()
