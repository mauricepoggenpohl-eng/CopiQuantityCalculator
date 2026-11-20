import subprocess, sys, math, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps

SRC = sys.argv[1]
OUT = sys.argv[2]
W, H, FPS = 1080, 1920, 30
FD = "/usr/share/fonts/opentype/inter/"
def F(name, size): return ImageFont.truetype(FD + name, size)

# ---------- load source frames ----------
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     capture_output=True, check=True).stdout
src = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
NS = len(src)
def sf_raw(t):
    return src[min(NS - 1, max(0, int(round(t * FPS))))]
sys.path.insert(0, __import__('os').path.dirname(__file__) or '.')
from toon import Toon, game_look
TOON = Toon([src[i] for i in range(0, NS, 30)])
def sf(t, line=2):  # comic artwork frame (freeze cards)
    return TOON(sf_raw(t), line=line)
def sg(t):  # in-game render look (gameplay clips)
    return game_look(sf_raw(t))

# ---------- grading ----------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vig = 1 - 0.55 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)
vig = np.clip(vig, 0.35, 1)[..., None]
gy = (yy / H)[..., None]
tint_top = np.array([255, 120, 190], np.float32)   # pink
tint_bot = np.array([255, 170, 60], np.float32)    # orange
tint = tint_top * (1 - gy) + tint_bot * gy

def grade(a):
    f = a.astype(np.float32) / 255
    f = np.clip((f - 0.5) * 1.18 + 0.5, 0, 1)                 # contrast
    l = f.mean(axis=2, keepdims=True)
    f = np.clip(l + (f - l) * 1.05, 0, 1)                      # saturation
    f = f * 255
    f = f * 0.93 + tint * 0.07 * (0.4 + f / 255)               # sunset tint (screen-ish)
    f = f * vig
    return np.clip(f, 0, 255).astype(np.uint8)

def letterbox(img, h=130):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, h], fill=(0, 0, 0)); d.rectangle([0, H - h, W, H], fill=(0, 0, 0))
    return img

def painted(a):
    im = Image.fromarray(a).resize((W // 2, H // 2), Image.LANCZOS)
    im = im.filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.MedianFilter(7))
    im = ImageOps.posterize(im, 5)
    im = ImageEnhance.Color(im).enhance(1.15)
    im = ImageEnhance.Contrast(im).enhance(1.1)
    edges = im.convert("L").filter(ImageFilter.GaussianBlur(2)).filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 10 else 0)
    im = im.resize((W, H), Image.LANCZOS)
    edges = edges.resize((W, H), Image.LANCZOS)
    black = Image.new("RGB", (W, H), (15, 5, 25))
    im = Image.composite(black, im, edges)
    return grade(np.array(im))

def text_shadow(d, xy, s, font, fill, anchor="mm", sh=8, shcol=(20, 0, 30)):
    x, y = xy
    d.text((x + sh, y + sh), s, font=font, fill=shcol, anchor=anchor)
    d.text((x, y), s, font=font, fill=fill, anchor=anchor, stroke_width=4, stroke_fill=(20, 0, 30))

def gradient_text(img, xy, s, font, c1, c2, stroke=6):
    x, y = xy
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    md.text((x, y), s, font=font, anchor="mm", fill=255)
    bbox = mask.getbbox()
    d = ImageDraw.Draw(img)
    d.text((x + 10, y + 12), s, font=font, anchor="mm", fill=(25, 0, 40), stroke_width=stroke, stroke_fill=(25, 0, 40))
    d.text((x, y), s, font=font, anchor="mm", fill=(25, 0, 40), stroke_width=stroke, stroke_fill=(25, 0, 40))
    g = Image.new("RGB", img.size)
    gd = ImageDraw.Draw(g)
    t0, t1 = bbox[1], bbox[3]
    for yy_ in range(t0, t1 + 1):
        k = (yy_ - t0) / max(1, t1 - t0)
        gd.line([(0, yy_), (W, yy_)], fill=tuple(int(c1[i] * (1 - k) + c2[i] * k) for i in range(3)))
    img.paste(g, (0, 0), mask)

def ease(x): x = min(1, max(0, x)); return 1 - (1 - x) ** 3

# ---------- sunset backdrop ----------
def sunset_bg(t):
    k = (yy / H)
    top = np.array([40, 10, 80], np.float32); mid = np.array([255, 70, 140], np.float32); bot = np.array([255, 170, 70], np.float32)
    kk = k[..., None]
    bg = np.where(kk < 0.55, top * (1 - kk / 0.55) + mid * (kk / 0.55), mid * (1 - (kk - 0.55) / 0.45) + bot * ((kk - 0.55) / 0.45))
    img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    # sun with stripes
    cx, cy, r = W // 2, int(H * 0.62 - 30 * ease(t / 2)), 330
    for y_ in range(cy - r, cy + r):
        dy = y_ - cy
        half = int(math.sqrt(max(0, r * r - dy * dy)))
        k2 = (y_ - (cy - r)) / (2 * r)
        stripe = dy > 40 and ((y_ - cy) // 26) % 2 == 1 and (y_ - cy) % 26 < 4 + int(k2 * 14)
        if not stripe:
            col = (255, int(230 - 120 * k2), int(110 - 30 * k2))
            d.line([(cx - half, y_), (cx + half, y_)], fill=col)
    # sea
    d.rectangle([0, int(H * 0.72), W, H], fill=(30, 10, 60))
    for i in range(14):
        y_ = int(H * 0.72) + 20 + i * i * 4
        d.line([(0, y_), (W, y_)], fill=(255, 110, 170), width=2)
    # palm silhouettes
    def palm(x0, y0, h, lean):
        pts = []
        for i in range(31):
            s = i / 30
            pts.append((x0 + lean * s * s * h, y0 - s * h))
        for i in range(len(pts) - 1):
            d.line([pts[i], pts[i + 1]], fill=(20, 0, 30), width=int(34 - 18 * i / 30))
        tx, ty = pts[-1]
        for ang in [-170, -140, -110, -70, -40, -10, 200, 160]:
            a = math.radians(ang)
            L = h * 0.38
            fp = []
            for j in range(16):
                s = j / 15
                fp.append((tx + math.cos(a) * L * s, ty + math.sin(a) * L * s + (L * 0.45) * s * s))
            for j in range(len(fp) - 1):
                d.line([fp[j], fp[j + 1]], fill=(20, 0, 30), width=int(26 - 22 * j / 15))
    palm(110, H, 1250, 0.18)
    palm(1010, H, 1050, -0.25)
    palm(860, H, 700, -0.12)
    return img

# ---------- scenes ----------
scenes = []  # (duration_s, fn(t)->Image)
SUBF = F("Inter-Bold.otf", 46)

def sub(img, s):
    d = ImageDraw.Draw(img)
    d.text((W // 2, H - 430), s, font=SUBF, anchor="mm", fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))

def flash(img, t, dur=0.18):
    if t < dur:
        a = 1 - t / dur
        img = Image.blend(img, Image.new("RGB", img.size, (255, 255, 255)), a * 0.9)
    return img

def fade_black(img, t, total, fin=0.0, fout=0.0):
    a = 0
    if fin and t < fin: a = 1 - t / fin
    if fout and t > total - fout: a = (t - (total - fout)) / fout
    if a > 0: img = Image.blend(img, Image.new("RGB", img.size, (0, 0, 0)), min(1, a))
    return img

# 1 intro
def s_intro(t):
    img = sunset_bg(t)
    d = ImageDraw.Draw(img)
    a = ease((t - 0.4) / 0.6)
    if a > 0:
        gradient_text(img, (W // 2, int(560 - 40 * (1 - a))), "TRANS", F("InterDisplay-BlackItalic.otf", 230), (255, 230, 120), (255, 90, 170), 10)
        gradient_text(img, (W // 2, int(780 - 40 * (1 - a))), "FORMATION", F("InterDisplay-BlackItalic.otf", 175), (255, 160, 220), (140, 80, 255), 10)
    if t > 1.3:
        text_shadow(d, (W // 2, 330), "EIN NEUER LOOK", F("Inter-ExtraBold.otf", 60), (255, 255, 255), sh=5)
    if t > 1.9:
        text_shadow(d, (W // 2, 960), "VORHER  /  NACHHER", F("Inter-Bold.otf", 52), (255, 240, 200), sh=5)
    return fade_black(letterbox(img), t, 3.0, fin=0.4, fout=0.25)
scenes.append((3.0, s_intro))

HUDF = F("Inter-ExtraBold.otf", 40); HUDS = F("Inter-Bold.otf", 34); CASHF = F("InterDisplay-Black.otf", 64)
def hud(img, gt, objective, cash):
    d = ImageDraw.Draw(img, "RGBA")
    # minimap
    cx, cy, r = 175, H - 300, 125
    m = Image.new("RGBA", (2 * r, 2 * r), (0, 0, 0, 0))
    md = ImageDraw.Draw(m)
    md.rectangle([0, 0, 2 * r, 2 * r], fill=(70, 85, 95, 255))
    rot = gt * 6
    import math as _m
    for i in range(-4, 5):
        for ang in (rot, rot + 90):
            a = _m.radians(ang)
            ox, oy = _m.cos(a + _m.pi / 2) * i * 55, _m.sin(a + _m.pi / 2) * i * 55
            dx, dy = _m.cos(a) * 400, _m.sin(a) * 400
            md.line([(r + ox - dx, r + oy - dy), (r + ox + dx, r + oy + dy)], fill=(150, 160, 165, 255), width=9)
    a = _m.radians(rot + 90)
    md.line([(r, r), (r + _m.cos(a) * 90, r + _m.sin(a) * 90)], fill=(255, 80, 170, 255), width=10)
    px, py = r + _m.cos(a) * 90, r + _m.sin(a) * 90
    md.ellipse([px - 20, py - 20, px + 20, py + 20], fill=(255, 80, 170, 255), outline=(255, 255, 255, 255), width=3)
    md.text((px, py), "S", font=F("Inter-Black.otf", 24), anchor="mm", fill=(255, 255, 255, 255))
    md.polygon([(r, r - 22), (r + 15, r + 16), (r, r + 8), (r - 15, r + 16)], fill=(255, 255, 255, 255))
    mask = Image.new("L", (2 * r, 2 * r), 0); ImageDraw.Draw(mask).ellipse([0, 0, 2 * r - 1, 2 * r - 1], fill=255)
    d.ellipse([cx - r - 6, cy - r - 6, cx + r + 6, cy + r + 6], fill=(0, 0, 0, 200))
    img.paste(m, (cx - r, cy - r), mask)
    # bars
    d.rectangle([cx - r, cy + r + 18, cx + r, cy + r + 32], fill=(0, 0, 0, 180))
    d.rectangle([cx - r + 3, cy + r + 21, cx - r + 3 + int((2 * r - 6) * 0.85), cy + r + 29], fill=(110, 220, 120, 255))
    d.rectangle([cx - r, cy + r + 38, cx + r, cy + r + 52], fill=(0, 0, 0, 180))
    d.rectangle([cx - r + 3, cy + r + 41, cx - r + 3 + int((2 * r - 6) * 0.6), cy + r + 49], fill=(90, 170, 255, 255))
    # cash
    d.text((W - 50, 330), f"$ {cash:,}".replace(",", "."), font=CASHF, anchor="rm", fill=(120, 230, 140), stroke_width=4, stroke_fill=(0, 0, 0))
    # objective
    if objective:
        tw = d.textlength(objective, font=HUDF)
        d.rectangle([40, 300, 40 + tw + 50, 430], fill=(0, 0, 0, 170))
        d.text((65, 330), "ZIEL", font=HUDS, anchor="lm", fill=(255, 120, 190))
        d.text((65, 385), objective, font=HUDF, anchor="lm", fill=(255, 255, 255))

GT = [0.0]
def clip(a0, dur, caption=None, cap_from=0.0, objective=None, cash=(1250, 1250)):
    def fn(t):
        img = letterbox(Image.fromarray(sg(a0 + t)))
        c = int(cash[0] + (cash[1] - cash[0]) * ease(t / dur))
        hud(img, a0 + t, objective, c)
        if caption and t >= cap_from: sub(img, caption)
        return flash(img, t)
    return (dur, fn)

def card(at, title, line, color):
    base = grade(sf(at, line=3))
    def fn(t):
        img = Image.fromarray(base)
        # slow push-in
        z = 1 + 0.04 * t
        cw, ch = int(W / z), int(H / z)
        img = img.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H))
        d = ImageDraw.Draw(img)
        a = ease(t / 0.35)
        x_off = int(-W * (1 - a))
        y0 = 1260
        d.polygon([(x_off + 0, y0), (x_off + 980, y0 - 60), (x_off + 1040, y0 + 230), (x_off + 0, y0 + 270)], fill=(20, 0, 30))
        d.polygon([(x_off + 0, y0 + 14), (x_off + 950, y0 - 40), (x_off + 1000, y0 + 210), (x_off + 0, y0 + 250)], fill=color)
        text_shadow(d, (x_off + 70, y0 + 80), title, F("InterDisplay-BlackItalic.otf", 120), (255, 255, 255), anchor="lm", sh=7)
        d.text((x_off + 78, y0 + 185), line, font=F("Inter-ExtraBold.otf", 50), anchor="lm", fill=(25, 0, 40))
        return flash(letterbox(img), t, 0.12)
    return (1.6, fn)

scenes.append(clip(0.0, 2.5, "Dunkles Braun. Kein Glanz. Keine Bewegung.", 0.3, "Fahre zum Salon.", (1250, 1250)))
scenes.append(card(1.0, "DIE KUNDIN", "Bereit für Veränderung.", (255, 95, 170)))
scenes.append(clip(3.0, 2.3, "Ein Plan. Eine Farbe. Kein Zurück.", 0.2, "Setz die Strähnen.", (1250, 1250)))
scenes.append(clip(5.3, 2.7, None, 0, "Setz die Strähnen.", (1250, 1250)))
scenes.append(card(7.6, "DAS ERGEBNIS", "Neue Strähnen. Neuer Glanz.", (255, 180, 60)))
scenes.append(clip(8.0, 2.9, "Jede Strähne sitzt.", 0.4, "Zeig das Ergebnis.", (1250, 5250)))
scenes.append(clip(10.9, 4.83, "Vorher. Nachher. Keine Fragen.", 1.0, "Vergleiche Vorher / Nachher.", (5250, 9999)))

# mission complete
last = sg(14.3)
blur = np.array(Image.fromarray(last).filter(ImageFilter.GaussianBlur(14)))
def s_done(t):
    img = Image.fromarray((blur * 0.8).astype(np.uint8))
    d = ImageDraw.Draw(img)
    a = ease(t / 0.4)
    if a > 0:
        f1 = F("InterDisplay-BlackItalic.otf", int(130 + 40 * (1 - a)))
        gradient_text(img, (W // 2, 820), "LOOK", f1, (255, 230, 120), (255, 120, 60), 9)
        gradient_text(img, (W // 2, 970), "ERLEDIGT!", f1, (255, 230, 120), (255, 120, 60), 9)
    if t > 0.7:
        d.rectangle([0, 1100, W, 1180], fill=(0, 0, 0))
        d.text((W // 2, 1140), "+100% GLANZ     +50 SELBSTBEWUSSTSEIN", font=F("Inter-ExtraBold.otf", 40), anchor="mm", fill=(140, 255, 160))
    return flash(letterbox(img), t, 0.2)
scenes.append((2.6, s_done))

def s_outro(t):
    img = sunset_bg(2 + t)
    d = ImageDraw.Draw(img)
    gradient_text(img, (W // 2, 520), "DEIN", F("InterDisplay-BlackItalic.otf", 200), (255, 230, 120), (255, 90, 170), 10)
    gradient_text(img, (W // 2, 720), "NEXT LEVEL", F("InterDisplay-BlackItalic.otf", 150), (255, 160, 220), (140, 80, 255), 10)
    if t > 0.5:
        d.rounded_rectangle([170, 880, 910, 1000], radius=20, fill=(20, 0, 30))
        d.text((W // 2, 940), "JETZT TERMIN BUCHEN", font=F("Inter-Black.otf", 54), anchor="mm", fill=(255, 255, 255))
    if t > 1.0:
        text_shadow(d, (W // 2, 1080), "Link in Bio", F("Inter-Bold.otf", 46), (255, 240, 200), sh=4)
    return fade_black(letterbox(img), t, 3.2, fin=0.2, fout=0.6)
scenes.append((3.2, s_outro))

# ---------- render ----------
total = sum(s[0] for s in scenes)
n_total = int(round(total * FPS))
print("total", total, "frames", n_total, flush=True)
ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                       "-i", "-", "-i", OUT + ".wav", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                       "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)
fi = 0
t0 = 0.0
for dur, fn in scenes:
    n = int(round((t0 + dur) * FPS)) - int(round(t0 * FPS))
    for i in range(n):
        img = fn(i / FPS)
        ff.stdin.write(np.asarray(img.convert("RGB"), np.uint8).tobytes())
        fi += 1
    t0 += dur
    print("scene done", t0, flush=True)
ff.stdin.close(); ff.wait()
print("frames", fi)
