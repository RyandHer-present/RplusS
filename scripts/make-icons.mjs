// Home-screen icons.
//
// iOS ignores SVG for `apple-touch-icon`, so the PNGs have to exist as files.
// They are generated rather than hand-drawn so the design stays in one place:
// change it here and re-run, rather than editing binaries.
//
//   node scripts/make-icons.mjs
//
// Needs Python with Pillow, which is how the drawing is actually done. Output
// goes to public/.
//
// The design: a dark plate, the two initials quiet in near-white, and the '+'
// between them carrying all the light. The people are the letters and the app
// is what sits between them, so the join is the only lit thing.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PY = String.raw`
import os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
SS = 4

INK = (0x04, 0x04, 0x07)
RAISED = (0x1d, 0x18, 0x30)
HOT = (0xa8, 0x4c, 0xff)   # violet
COLD = (0x33, 0xe6, 0xff)  # cyan


def font_for(size):
    for name in ('seguibl.ttf', 'segoeuib.ttf', 'ariblk.ttf', 'arialbd.ttf'):
        p = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def plate(px):
    """Dark ground: a raised centre falling away to near black at the corners."""
    img = Image.new('RGB', (px, px), INK)
    d = ImageDraw.Draw(img)
    steps = 90
    for i in range(steps, 0, -1):
        t = i / steps
        r = px * 0.95 * t
        c = tuple(round(INK[k] + (RAISED[k] - INK[k]) * (1 - t) ** 1.5) for k in range(3))
        d.ellipse([px / 2 - r, px / 2 - r * 1.05, px / 2 + r, px / 2 + r * 1.05], fill=c)
    img = img.filter(ImageFilter.GaussianBlur(px * 0.05))

    # A hairline along the top edge. Without it a dark icon reads as a hole in
    # the home screen rather than an object on it.
    bevel = Image.new('L', (px, px), 0)
    ImageDraw.Draw(bevel).rectangle([0, 0, px, px * 0.04], fill=64)
    bevel = bevel.filter(ImageFilter.GaussianBlur(px * 0.018))
    return Image.composite(Image.blend(img, Image.new('RGB', (px, px), (120, 120, 150)), 0.5), img, bevel)


def ramp_over(px, box, a, b):
    """A gradient mapped across 'box' rather than the canvas.

    Spanning the full canvas was the bug in the first pass: a mark sitting in
    the middle only ever samples the middle of the ramp, so both ends of the
    gradient fall outside it and everything comes out one flat colour.
    """
    x0, y0, x1, y1 = box
    span = max(1.0, (x1 - x0) + (y1 - y0))
    g = Image.new('RGB', (px, px))
    d = ImageDraw.Draw(g)
    for i in range(px * 2):
        t = min(1.0, max(0.0, (i - (x0 + y0)) / span))
        c = tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))
        d.line([(i, 0), (0, i)], fill=c, width=2)
    return g


def icon(px, pad_ratio=0.0):
    base = plate(px)
    inset = pad_ratio * px
    box_w = px - inset * 2

    size = int(box_w * 0.42)
    probe = ImageDraw.Draw(base)
    while size > 8 and probe.textlength('R+S', font=font_for(size)) > box_w * 0.72:
        size -= 2
    f = font_for(size)

    letters = Image.new('L', (px, px), 0)
    join = Image.new('L', (px, px), 0)
    ld, jd = ImageDraw.Draw(letters), ImageDraw.Draw(join)

    total = probe.textlength('R+S', font=f)
    l, t, r, b = probe.textbbox((0, 0), 'R+S', font=f)
    x = (px - total) / 2
    y = (px - (b - t)) / 2 - t
    for ch in 'R+S':
        (jd if ch == '+' else ld).text((x, y), ch, font=f, fill=255)
        x += probe.textlength(ch, font=f)

    # Letters: cool near-white, brighter at the top so they have a little
    # dimension instead of reading as flat grey.
    shade = Image.new('RGB', (px, px), (0xb8, 0xb6, 0xc8))
    sd = ImageDraw.Draw(shade)
    for i in range(px):
        v = 0xf2 - int((i / px) * 0x48)
        sd.line([(0, i), (px, i)], fill=(v, v, min(255, v + 10)))
    base = Image.composite(shade, base, letters)

    # The lit join. Its gradient is mapped across its own bounds, so the violet
    # end and the cyan end both actually land on it.
    tint = ramp_over(px, join.getbbox() or (0, 0, px, px), HOT, COLD)
    lit = base
    for radius, strength in ((0.008, 0.62), (0.026, 0.55), (0.070, 0.48), (0.160, 0.36), (0.300, 0.20)):
        soft = join.filter(ImageFilter.GaussianBlur(px * radius)).point(lambda v, s=strength: int(v * s))
        lit = ImageChops.add(lit, Image.composite(tint, Image.new('RGB', (px, px), (0, 0, 0)), soft))

    core = Image.blend(tint, Image.new('RGB', (px, px), (255, 255, 255)), 0.34)
    return Image.composite(core, lit, join)


if __name__ == '__main__':
    for px in (180, 192, 512):
        icon(px * SS).resize((px, px), Image.LANCZOS).save(os.path.join(OUT, f'icon-{px}.png'), optimize=True)
    # Android crops maskable icons to any shape, so the art sits in the safe zone.
    icon(512 * SS, pad_ratio=0.14).resize((512, 512), Image.LANCZOS).save(
        os.path.join(OUT, 'icon-maskable-512.png'), optimize=True
    )
    print('wrote icon-180, icon-192, icon-512, icon-maskable-512')
`

const dir = mkdtempSync(join(tmpdir(), 'rpluss-icons-'))
const script = join(dir, 'draw.py')
writeFileSync(script, PY)

try {
  const out = execFileSync('python', [script, 'public'], { encoding: 'utf8' })
  process.stdout.write(out)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
