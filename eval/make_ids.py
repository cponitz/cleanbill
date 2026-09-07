"""Generate a synthetic ID-card eval set for the DL extraction prompt.

These are deliberately *generic* ID-style cards (plain layout, no state artwork) — the point is to test
field extraction under real-world photo conditions: rotation, blur, glare, low light, noise, odd crops.
Ground truth is written to eval/ids/labels.json. Names and addresses are fictional.

Usage: python eval/make_ids.py [--n 30] [--seed 7]
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

OUT = Path(__file__).parent / "ids"
FONTS = {
    "sans": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "sans_b": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "mono": "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "lib": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "lib_b": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
}

FIRST = ["Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Barbara", "William", "Elizabeth", "David",
         "Jennifer", "Richard", "Susan", "Joseph", "Karen", "Thomas", "Nancy", "Charles", "Lisa", "Daniel",
         "Guadalupe", "Nguyen", "Priya", "Marcus", "Aiko", "Dmitri", "Rosa", "Kwame", "Hannah", "Luis"]
LAST = ["Garcia", "Johnson", "Nguyen", "Smith", "Rodriguez", "Williams", "Martinez", "Brown", "Hernandez", "Jones",
        "Lopez", "Miller", "Gonzalez", "Davis", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson",
        "O'Brien", "De La Cruz", "Van Dyke", "St. James", "Kim", "Patel", "Okafor", "Silva", "Chen", "Reyes"]
STREETS = ["Shoal Creek Blvd", "Burnet Rd", "Manchaca Rd", "Brodie Ln", "Duval St", "Woodrow Ave", "Bluebonnet Ln",
           "Justin Ln", "Payne Ave", "Koenig Ln", "Rutland Dr", "Braker Ln", "Slaughter Ln", "Dittmar Rd",
           "Menchaca Rd", "Pleasant Valley Rd", "Berkman Dr", "Cameron Rd", "Rundberg Ln", "Anderson Mill Rd"]
ZIPS = ["78704", "78745", "78748", "78749", "78757", "78758", "78723", "78741", "78731", "78759", "78702", "78721"]
CITIES = ["AUSTIN", "AUSTIN", "AUSTIN", "PFLUGERVILLE", "MANOR", "DEL VALLE"]


def rand_dob(rng: random.Random) -> date:
    # mix of ages; ~25% over 65 so the OV65 flag gets exercised
    if rng.random() < 0.25:
        yrs = rng.randint(66, 88)
    else:
        yrs = rng.randint(24, 64)
    return date.today() - timedelta(days=int(yrs * 365.25) + rng.randint(0, 364))


def make_record(rng: random.Random, i: int) -> dict:
    first, last = rng.choice(FIRST), rng.choice(LAST)
    middle = rng.choice(["", "", "A", "L", "MARIE", "JAMES", "R"])
    dob = rand_dob(rng)
    exp = date.today() + timedelta(days=rng.randint(-200, 6 * 365))  # some expired on purpose
    num = str(rng.randint(10_000_000, 99_999_999))
    street_num = rng.randint(100, 12999)
    unit = rng.choice(["", "", "", " APT 204", " UNIT B", " #12"])
    street = rng.choice(STREETS)
    zipc = rng.choice(ZIPS)
    city = rng.choice(CITIES)
    return {
        "id": f"id_{i:02d}",
        "first_name": first.upper(),
        "middle_name": middle,
        "last_name": last.upper(),
        "dob": dob.isoformat(),
        "expiry": exp.isoformat(),
        "dl_number": num,
        "address_line1": f"{street_num} {street.upper()}{unit}",
        "city": city,
        "state": "TX",
        "zip": zipc,
        "sex": rng.choice(["M", "F"]),
        "height": f"{rng.randint(4, 6)}'-{rng.randint(0, 11):02d}\"",
        "eyes": rng.choice(["BRO", "BLU", "GRN", "HAZ", "BLK"]),
        "class": rng.choice(["C", "C", "C", "A", "CM"]),
    }


def draw_card(rec: dict, rng: random.Random) -> Image.Image:
    w, h = 1012, 638  # ~ID-1 ratio at 300 dpi-ish
    bg = rng.choice([(245, 245, 240), (232, 236, 244), (250, 246, 232), (236, 244, 236)])
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    fam = rng.choice(["sans", "lib"])
    f_h = ImageFont.truetype(FONTS[fam + "_b"], 40)
    f_l = ImageFont.truetype(FONTS[fam], 20)
    f_v = ImageFont.truetype(FONTS[rng.choice([fam + "_b", "mono"])], 30)
    f_big = ImageFont.truetype(FONTS[fam + "_b"], 34)

    # header band
    band = rng.choice([(28, 52, 100), (70, 70, 70), (40, 90, 60)])
    d.rectangle([0, 0, w, 90], fill=band)
    d.text((30, 22), "TEXAS  DRIVER LICENSE", font=f_h, fill=(255, 255, 255))
    d.text((w - 260, 30), rng.choice(["CLASS " + rec["class"], "DL", "IDENTIFICATION"]), font=f_l, fill=(230, 230, 230))

    # portrait placeholder
    d.rectangle([30, 120, 290, 440], fill=(200, 205, 215), outline=(120, 120, 130), width=3)
    d.ellipse([110, 160, 210, 260], fill=(160, 165, 175))
    d.pieslice([70, 250, 250, 470], 180, 360, fill=(160, 165, 175))

    x, y = 320, 110
    d.text((x, y), "DL", font=f_l, fill=(90, 90, 90)); d.text((x + 60, y - 6), rec["dl_number"], font=f_v, fill=(20, 20, 20)); y += 48
    d.text((x, y), "EXP", font=f_l, fill=(90, 90, 90)); d.text((x + 60, y - 6), date.fromisoformat(rec["expiry"]).strftime("%m/%d/%Y"), font=f_v, fill=(20, 20, 20)); y += 48
    d.text((x, y), "DOB", font=f_l, fill=(90, 90, 90)); d.text((x + 60, y - 6), date.fromisoformat(rec["dob"]).strftime("%m/%d/%Y"), font=f_v, fill=(20, 20, 20)); y += 58
    d.text((x, y), "1", font=f_l, fill=(90, 90, 90)); d.text((x + 30, y - 6), rec["last_name"], font=f_big, fill=(20, 20, 20)); y += 44
    d.text((x, y), "2", font=f_l, fill=(90, 90, 90)); d.text((x + 30, y - 6), (rec["first_name"] + " " + rec["middle_name"]).strip(), font=f_big, fill=(20, 20, 20)); y += 56
    d.text((x, y), "8", font=f_l, fill=(90, 90, 90)); d.text((x + 30, y - 6), rec["address_line1"], font=f_v, fill=(20, 20, 20)); y += 40
    d.text((x + 30, y - 6), f"{rec['city']}, {rec['state']} {rec['zip']}", font=f_v, fill=(20, 20, 20)); y += 60
    d.text((x, y), f"SEX {rec['sex']}   HGT {rec['height']}   EYES {rec['eyes']}", font=f_l, fill=(40, 40, 40))
    d.text((30, 470), "ISS " + (date.today() - timedelta(days=rng.randint(30, 2000))).strftime("%m/%d/%Y"), font=f_l, fill=(60, 60, 60))
    d.text((30, 560), rec["last_name"].title() + " " + rec["first_name"].title(), font=ImageFont.truetype(FONTS[fam], 26), fill=(30, 30, 90))
    return img


def photo_conditions(img: Image.Image, rng: random.Random) -> tuple[Image.Image, list[str]]:
    """Simulate a phone photo: table background, rotation, perspective-ish crop, blur, glare, low light, noise."""
    tags = []
    # place on a background with margin
    W, H = int(img.width * 1.35), int(img.height * 1.45)
    bgc = rng.choice([(90, 70, 55), (200, 200, 200), (40, 40, 45), (170, 150, 130)])
    canvas = Image.new("RGB", (W, H), bgc)
    canvas.paste(img, ((W - img.width) // 2, (H - img.height) // 2))
    angle = rng.uniform(-9, 9)
    if abs(angle) > 3:
        tags.append("rotated")
    out = canvas.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=bgc)
    r = rng.random()
    if r < 0.30:
        out = out.filter(ImageFilter.GaussianBlur(rng.uniform(1.0, 2.2))); tags.append("blur")
    if rng.random() < 0.30:
        out = ImageEnhance.Brightness(out).enhance(rng.uniform(0.45, 0.7)); tags.append("low_light")
    if rng.random() < 0.30:  # glare streak
        g = ImageDraw.Draw(out, "RGBA")
        gx = rng.randint(int(W * 0.2), int(W * 0.7))
        g.polygon([(gx, 0), (gx + 140, 0), (gx + 320, H), (gx + 180, H)], fill=(255, 255, 255, rng.randint(90, 150)))
        tags.append("glare")
    if rng.random() < 0.30:  # sensor noise
        px = out.load()
        for _ in range(int(W * H * 0.02)):
            xx, yy = rng.randrange(W), rng.randrange(H)
            v = rng.randint(-40, 40)
            p = px[xx, yy]
            px[xx, yy] = tuple(max(0, min(255, c + v)) for c in p)
        tags.append("noise")
    if rng.random() < 0.20:  # tight/odd crop
        cx = rng.randint(0, int(W * 0.08)); cy = rng.randint(0, int(H * 0.08))
        out = out.crop((cx, cy, W - rng.randint(0, int(W * 0.08)), H - rng.randint(0, int(H * 0.08)))); tags.append("crop")
    # downscale like a compressed phone upload
    scale = rng.uniform(0.55, 0.9)
    out = out.resize((int(out.width * scale), int(out.height * scale)), Image.LANCZOS)
    return out, tags


def main(n: int, seed: int) -> None:
    rng = random.Random(seed)
    OUT.mkdir(parents=True, exist_ok=True)
    labels = []
    for i in range(n):
        rec = make_record(rng, i)
        img, tags = photo_conditions(draw_card(rec, rng), rng)
        path = OUT / f"{rec['id']}.jpg"
        img.save(path, "JPEG", quality=rng.randint(55, 85))
        rec["file"] = path.name
        rec["conditions"] = tags
        labels.append(rec)
    (OUT / "labels.json").write_text(json.dumps(labels, indent=2))
    print(f"wrote {n} images + labels.json to {OUT}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    main(a.n, a.seed)
