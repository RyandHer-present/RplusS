// Home-screen icons.
//
// iOS ignores SVG for `apple-touch-icon`, so the PNGs have to exist as files.
// They are generated rather than hand-drawn so the brand colours stay in one
// place: change the gradient here and re-run, rather than editing binaries.
//
//   node scripts/make-icons.mjs
//
// Needs Python with Pillow, which is how the drawing is actually done — see
// the script it writes below. Output goes to public/.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PY = String.raw`
import os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]

# The two ends of the app's accent ramp, --a1 and --a3 in src/index.css.
START = (0x7b, 0x5c, 0xff)
END   = (0xff, 0x5c, 0xf0)

def font_for(size):
    # Whichever of these Windows ships; all are heavy enough to hold up small.
    for name in ('seguibl.ttf', 'segoeuib.ttf', 'arialbd.ttf', 'ariblk.ttf'):
        path = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def render(px, pad_ratio=0.0):
    """A diagonal gradient with R+S over it.

    pad_ratio shrinks the artwork toward the middle, for Android's maskable
    icons where the outer edge can be cropped to any shape.
    """
    img = Image.new('RGB', (px, px), START)
    draw = ImageDraw.Draw(img)

    # Top-left to bottom-right, stepped along the diagonal.
    for i in range(px * 2):
        t = i / (px * 2 - 1)
        c = tuple(round(START[k] + (END[k] - START[k]) * t) for k in range(3))
        draw.line([(i, 0), (0, i)], fill=c, width=2)

    text = 'R+S'
    inset = pad_ratio * px
    box = px - inset * 2

    # Grow the type until it fills the available width, then centre it on its
    # real ink extents rather than the font's line box, which is padded.
    size = int(box * 0.42)
    while size > 8:
        f = font_for(size)
        l, t, r, b = draw.textbbox((0, 0), text, font=f)
        if r - l <= box * 0.72 and b - t <= box * 0.6:
            break
        size -= 2

    f = font_for(size)
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    x = (px - (r - l)) / 2 - l
    y = (px - (b - t)) / 2 - t

    # A soft drop shadow keeps the white legible over the lighter pink corner.
    draw.text((x + px * 0.012, y + px * 0.012), text, font=f, fill=(0x2a, 0x10, 0x50))
    draw.text((x, y), text, font=f, fill=(0xff, 0xff, 0xff))
    return img

# 180 is what iOS actually asks for; 192 and 512 are the manifest sizes.
for px in (180, 192, 512):
    render(px).save(os.path.join(OUT, f'icon-{px}.png'), optimize=True)

# Android crops maskable icons to whatever shape the launcher wants, so the
# artwork sits inside the safe zone.
render(512, pad_ratio=0.14).save(os.path.join(OUT, 'icon-maskable-512.png'), optimize=True)

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
