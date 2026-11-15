"""배경 고르기 카드용 미리보기: scenes.js의 글자·색을 그대로 그려 thumbs/<id>.jpg 로 저장
사용: python tools/thumbs.py
"""
import json, os, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "C:/Windows/Fonts/NotoSansKR-Bold.ttf"
CELL, OUT_W = 12, 1280


def main():
    src = open(os.path.join(ROOT, "scenes.js"), encoding="utf-8").read()
    data = json.loads(re.search(r"window\.ASCII = (\{.*\});", src, re.S).group(1))
    base = data["base"]
    os.makedirs(os.path.join(ROOT, "thumbs"), exist_ok=True)
    font = ImageFont.truetype(FONT, round(CELL * 1.22))
    for s in data["scenes"]:
        im = Image.new("RGB", (s["cols"] * CELL, s["rows"] * CELL), "white")
        d = ImageDraw.Draw(im)
        for r, line in enumerate(s["chars"]):
            for c, ch in enumerate(line):
                if ch != " ":
                    d.text((c * CELL + CELL / 2, r * CELL + base * CELL), ch,
                           fill="#" + s["colors"][r][c * 6:c * 6 + 6], font=font, anchor="ms")
        h = round(OUT_W * im.height / im.width)
        im.resize((OUT_W, h), Image.LANCZOS).save(os.path.join(ROOT, "thumbs", s["id"] + ".jpg"), quality=82)
        print(s["id"], OUT_W, "x", h)


if __name__ == "__main__":
    main()
