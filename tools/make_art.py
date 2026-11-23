#!/usr/bin/env python3
"""Cover art + Hero Mode background for Classics songs.

Source picture (public domain): J.S. Bach by Elias Gottlob Haussmann, 1748 — Wikimedia Commons, File:Johann_Sebastian_Bach.jpg
Run:  python3 tools/make_art.py      -> media/LJS001/cover.jpg (A) cover_b.jpg cover_c.jpg hero.jpg  + tools/art_src/contact.jpg
Three treatments of one portrait so the look can be chosen once and reused for every composer:
  A  Neon Duotone  — shadows indigo, highlights Litejam lime; rings like a struck string behind the head
  B  Pop Poster    — flat cartoon colours, halftone, sunburst
  C  Old Master    — the oil painting itself, gold rule and serif type
"""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageChops, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SRC = Image.open(os.path.join(HERE, 'art_src', 'bach_haussmann_1748.jpg')).convert('RGB')
HEAD = (690, 430)            # centre of the face in the source
FS = '/System/Library/Fonts/Supplemental/'
def font(name, size, index=0):
    try: return ImageFont.truetype(FS + name, size, index=index)
    except Exception: return ImageFont.truetype(FS + 'Didot.ttc', size)

def place(w, h, scale, cx, cy):
    """Portrait scaled and positioned so the face sits at (cx, cy); the dark studio wall is extended to fill the canvas."""
    im = SRC.resize((round(SRC.width * scale), round(SRC.height * scale)), Image.LANCZOS)
    wall = SRC.crop((20, 20, 220, 220)).resize((1, 1), Image.BOX).getpixel((0, 0))
    out = Image.new('RGB', (w, h), wall)
    x, y = round(cx - HEAD[0] * scale), round(cy - HEAD[1] * scale)
    # feather the picture's edges into the wall colour
    m = Image.new('L', im.size, 255); d = ImageDraw.Draw(m); f = round(90 * scale / .65)
    for i in range(f):
        a = round(255 * i / f); d.rectangle((i, i, im.width - 1 - i, im.height - 1 - i), outline=a)
    out.paste(im, (x, y), m.filter(ImageFilter.GaussianBlur(f / 6)))
    return out

def gradmap(gray, stops):
    lut = []
    for ch in range(3):
        for i in range(256):
            t = i / 255
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t <= t1: k = (t - t0) / (t1 - t0) if t1 > t0 else 0; lut.append(round(c0[ch] + (c1[ch] - c0[ch]) * k)); break
    return Image.merge('RGB', [gray.point(lut[i * 256:(i + 1) * 256]) for i in range(3)])
hexc = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))

def behind(base, layer, gray, thr=70):
    """Screen `layer` onto `base` only where the picture is dark, so graphics read as being behind the sitter."""
    mask = gray.filter(ImageFilter.GaussianBlur(6)).point(lambda v: 255 if v < thr else max(0, 255 - (v - thr) * 9))
    return Image.composite(ImageChops.screen(base, layer), base, mask)

def rings(size, c, col, n=9, r0=150, step=58, width=3):
    im = Image.new('RGB', size, 0); d = ImageDraw.Draw(im)
    for i in range(n):
        r = r0 + i * step; k = 1 - i / n
        d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), outline=tuple(round(v * k) for v in col), width=width)
    return im

def halftone(size, gray, col, cell=9):
    im = Image.new('RGB', size, 0); d = ImageDraw.Draw(im); g = gray.resize((size[0] // cell, size[1] // cell)).load()
    for j in range(size[1] // cell):
        for i in range(size[0] // cell):
            r = cell * .55 * g[i, j] / 255
            if r > .6: x, y = i * cell + (cell / 2 if j % 2 else 0), j * cell; d.ellipse((x - r, y - r, x + r, y + r), fill=col)
    return im

def spaced(d, xy, text, f, fill, track):
    x, y = xy
    for ch in text: d.text((x, y), ch, font=f, fill=fill); x += d.textlength(ch, font=f) + track
    return x

def tone(im, contrast=1.25):
    g = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1); return ImageEnhance.Contrast(g).enhance(contrast)

W, H = 1200, 800             # cards crop this; everything that matters stays inside the middle 800 px square
FACE = (835, 300); SCALE = .66

def cover_a():
    p = place(W, H, SCALE, *FACE); g = tone(p)
    im = gradmap(g, [(0, hexc('#05040f')), (.28, hexc('#1d1158')), (.6, hexc('#6a35e0')), (.86, hexc('#c6f432')), (1, hexc('#f4ffd0'))])
    im = behind(im, rings((W, H), FACE, hexc('#c6f432')), g)
    im = Image.blend(im, ImageChops.screen(im, halftone((W, H), g, (40, 30, 90))), .5)
    d = ImageDraw.Draw(im)
    spaced(d, (226, 96), 'J.S.', font('Futura.ttc', 30, 0), hexc('#c6f432'), 10)
    d.text((220, 122), 'BACH', font=font('Didot.ttc', 126, 2), fill=(255, 255, 255))
    d.rectangle((226, 276, 300, 281), fill=hexc('#c6f432'))
    spaced(d, (226, 298), 'PRELUDE IN C', font('Futura.ttc', 27, 0), (255, 255, 255), 5)
    spaced(d, (226, 336), 'BWV 846 · NEO-CLASSIC ROCK', font('Futura.ttc', 17, 0), (200, 190, 255), 3)
    return im

def cover_b():
    p = place(W, H, SCALE, *FACE).filter(ImageFilter.MedianFilter(9)); g = tone(p, 1.5).filter(ImageFilter.GaussianBlur(1.2))
    pal = [hexc('#17103a'), hexc('#e6397a'), hexc('#ffb400'), hexc('#fff3d6')]
    lut = [pal[0 if v < 70 else 1 if v < 128 else 2 if v < 190 else 3] for v in range(256)]
    im = Image.merge('RGB', [g.point([c[i] for c in lut]) for i in range(3)])
    sun = Image.new('RGB', (W, H), 0); d = ImageDraw.Draw(sun)
    for k in range(18):
        a = k * math.tau / 18; b = a + math.tau / 36
        d.polygon([FACE, (FACE[0] + 1500 * math.cos(a), FACE[1] + 1500 * math.sin(a)), (FACE[0] + 1500 * math.cos(b), FACE[1] + 1500 * math.sin(b))], fill=hexc('#143c8c'))
    d.ellipse((FACE[0] - 330, FACE[1] - 330, FACE[0] + 330, FACE[1] + 330), fill=hexc('#00b8c4'))
    im = behind(im, sun, tone(p, 1.5), 64)
    im = Image.composite(ImageChops.multiply(im, ImageOps.invert(halftone((W, H), ImageOps.invert(g), (70, 70, 70), 8))), im, g.point(lambda v: 255 if 70 <= v < 190 else 0))
    d = ImageDraw.Draw(im); f = font('Futura.ttc', 150, 4)
    d.text((228, 108), 'BACH', font=f, fill=hexc('#e6397a')); d.text((220, 100), 'BACH', font=f, fill=hexc('#ffe94a'))
    d.rectangle((220, 280, 520, 322), fill=hexc('#ffe94a')); spaced(d, (230, 286), 'PRELUDE IN C', font('Futura.ttc', 26, 0), hexc('#17103a'), 4)
    spaced(d, (224, 336), 'BWV 846', font('Futura.ttc', 24, 4), (255, 255, 255), 6)
    return im

def cover_c():
    im = ImageEnhance.Color(ImageEnhance.Contrast(place(W, H, SCALE, *FACE)).enhance(1.12)).enhance(1.1)
    vig = Image.new('L', (W, H), 0); ImageDraw.Draw(vig).ellipse((120, -180, W + 160, H + 240), fill=255)
    im = Image.composite(im, Image.new('RGB', (W, H), (8, 7, 5)), vig.filter(ImageFilter.GaussianBlur(170)))
    d = ImageDraw.Draw(im); gold = hexc('#d9b662')
    d.rectangle((214, 14, W - 15, H - 15), outline=gold, width=2); d.rectangle((222, 22, W - 23, H - 23), outline=(120, 96, 44), width=1)
    spaced(d, (250, 96), 'JOHANN SEBASTIAN', font('Bodoni 72.ttc', 21, 0), gold, 6)
    d.text((246, 118), 'Bach', font=font('Bodoni 72.ttc', 150, 1), fill=(246, 236, 212))
    d.line((252, 300, 470, 300), fill=gold, width=2)
    spaced(d, (252, 316), 'PRELUDE IN C MAJOR', font('Bodoni 72.ttc', 23, 0), (246, 236, 212), 4)
    spaced(d, (252, 350), 'BWV 846 · 1722', font('Bodoni 72.ttc', 18, 0), gold, 4)
    return im

def hero_bg():
    """Hero Mode backdrop, 16:9. No lettering; the face sits top right where the board and HUD leave room, the rest stays dark."""
    w, h, c = 1920, 1080, (1380, 330)
    p = place(w, h, .86, *c); g = tone(p)
    im = gradmap(g, [(0, hexc('#04050a')), (.3, hexc('#150d42')), (.62, hexc('#5a2fc4')), (.88, hexc('#c6f432')), (1, hexc('#f4ffd0'))])
    im = behind(im, rings((w, h), c, hexc('#c6f432'), n=14, r0=220, step=84, width=4), g)
    staff = Image.new('RGB', (w, h), 0); d = ImageDraw.Draw(staff)
    for k in range(6):                                  # six strings sweeping in from the left, bent like a played string
        pts = [(x, 250 + k * 26 + 60 * math.sin(x / 520 + k * .25) * (1 - x / 1500)) for x in range(0, 1100, 12)]
        d.line(pts, fill=(70, 50, 150), width=3)
    im = behind(im, staff.filter(ImageFilter.GaussianBlur(1)), g)
    return Image.blend(im, ImageChops.screen(im, halftone((w, h), g, (36, 28, 84), 10)), .45)

if __name__ == '__main__':
    out = os.path.join(ROOT, 'media', 'LJS001'); q = dict(quality=86, optimize=True, progressive=True)
    a, b, c, hb = cover_a(), cover_b(), cover_c(), hero_bg()
    a.save(os.path.join(out, 'cover.jpg'), **q); b.save(os.path.join(out, 'cover_b.jpg'), **q); c.save(os.path.join(out, 'cover_c.jpg'), **q); hb.save(os.path.join(out, 'hero.jpg'), **q)
    sheet = Image.new('RGB', (W * 2 + 60, H * 2 + 60), (14, 14, 18))
    for im, (x, y) in zip((a, b, c, hb.resize((W, 675))), ((20, 20), (W + 40, 20), (20, H + 40), (W + 40, H + 40 + 62))): sheet.paste(im, (x, y))
    sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save(os.path.join(HERE, 'art_src', 'contact.jpg'), quality=88)
    print('ok')
