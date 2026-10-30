#!/usr/bin/env python3
"""Generate the flat biu icon.

Design:
- one flat hot-pink field, no gradients, glows or shadows
- no text: a single centered Apple Music-like beamed eighth note
  (two heads on top, descending stems, beam at the bottom).
"""
from __future__ import annotations

import base64
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
S = 2048
PINK = (255, 92, 147, 255)
WHITE = (255, 255, 255, 255)
FONT = "/usr/share/fonts/abattis-cantarell-vf-fonts/Cantarell-VF.otf"


def squircle_mask(size: int, ratio: float = 0.225) -> Image.Image:
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1),
        radius=int(size * 4 * ratio),
        fill=255,
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def word_font(size: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(FONT, size)
    try:
        font.set_variation_by_axes([800])
    except Exception:
        pass
    return font


def note_head(radius_x: int, radius_y: int, angle: float = -24) -> Image.Image:
    w, h = max(2, radius_x * 2), max(2, radius_y * 2)
    layer = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((w // 2, h // 2, w // 2 + w, h // 2 + h), fill=WHITE)
    layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    return layer


def quad_curve(p0, p1, p2, steps: int = 18):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        points.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return points


def build_wordmark() -> Image.Image:
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font_size = int(S * 0.53)
    font = word_font(font_size)
    tracking = int(font_size * 0.015)
    baseline = int(S * 0.635)

    b_width = d.textlength("B", font=font)
    i_width = d.textlength("i", font=font)
    note_w = font_size * 0.62
    note_h = font_size * 0.64
    total = b_width + tracking + i_width + tracking + note_w
    x = (S - total) / 2

    d.text((x, baseline), "B", font=font, anchor="ls", fill=WHITE)
    x_i = x + b_width + tracking
    d.text((x_i, baseline), "i", font=font, anchor="ls", fill=WHITE)
    x_note = x_i + i_width + tracking

    # Apple Music-like beamed double eighth note in place of u: two tilted
    # note heads, two stems and a slanted beam.
    top = baseline - note_h
    stroke = int(note_w * 0.085)
    left_head_cx = x_note + note_w * 0.20
    right_head_cx = x_note + note_w * 0.70
    # Flip the beamed note vertically: heads at the top, stems descending,
    # and the beam at the bottom.
    left_head_cy = top + note_h * 0.12
    right_head_cy = top + note_h * 0.24
    left_stem_x = left_head_cx + note_w * 0.065
    right_stem_x = right_head_cx + note_w * 0.065
    beam_left_y = top + note_h * 0.72
    beam_right_y = top + note_h * 0.82

    d.line([(left_stem_x, left_head_cy), (left_stem_x, beam_left_y)], fill=WHITE, width=stroke)
    d.line([(right_stem_x, right_head_cy), (right_stem_x, beam_right_y)], fill=WHITE, width=stroke)

    beam = [
        (left_stem_x - note_w * 0.065, beam_left_y),
        (right_stem_x + note_w * 0.055, beam_right_y),
        (right_stem_x + note_w * 0.055, beam_right_y + note_h * 0.13),
        (left_stem_x - note_w * 0.065, beam_left_y + note_h * 0.13),
    ]
    d.polygon(beam, fill=WHITE)

    for cx, cy in ((left_head_cx, left_head_cy), (right_head_cx, right_head_cy)):
        head = note_head(int(note_w * 0.165), int(note_h * 0.095), angle=20)
        layer.alpha_composite(head, (int(cx - head.width / 2), int(cy - head.height / 2)))

    return layer

def build_note_only() -> Image.Image:
    """Extract the supplied note silhouette and render it white on transparent."""
    source = ROOT / "biu-note-source.jpg"
    gray = Image.open(source).convert("L")
    # Keep the black note, drop the near-white paper and its light border.
    lut = [0 if v > 205 else min(255, round((205 - v) * 255 / 150)) for v in range(256)]
    alpha = gray.point(lut).filter(ImageFilter.GaussianBlur(0.8))
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("note source is empty")
    alpha = alpha.crop(bbox)

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glyph = Image.new("RGBA", alpha.size, WHITE)
    glyph.putalpha(alpha)
    layer.alpha_composite(glyph, ((S - glyph.width) // 2, (S - glyph.height) // 2))
    return layer



def fit_mark(mark: Image.Image, ratio: float = 0.60) -> Image.Image:
    bbox = mark.getbbox()
    if not bbox:
        return mark
    cut = mark.crop(bbox)
    scale = min((S * ratio) / cut.width, (S * ratio) / cut.height)
    cut = cut.resize(
        (max(1, round(cut.width * scale)), max(1, round(cut.height * scale))),
        Image.Resampling.LANCZOS,
    )
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.alpha_composite(cut, ((S - cut.width) // 2, (S - cut.height) // 2))
    return out


def flat_background(size: int = S) -> Image.Image:
    return Image.new("RGBA", (size, size), PINK)


def notification_icon(mark: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cut = mark.crop(mark.getbbox())
    target = S * 0.54
    scale = min(target / cut.width, target / cut.height)
    cut = cut.resize((round(cut.width * scale), round(cut.height * scale)), Image.Resampling.LANCZOS)
    white = Image.new("RGBA", cut.size, WHITE)
    white.putalpha(cut.getchannel("A"))
    layer.alpha_composite(white, ((S - cut.width) // 2, (S - cut.height) // 2))
    return layer


def write_png(image: Image.Image, path: Path, size: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if size:
        image = image.resize((size, size), Image.Resampling.LANCZOS)
    image.save(path)


def embedded_svg(png: Path, width: int = 1024) -> str:
    b64 = base64.b64encode(png.read_bytes()).decode("ascii")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{width}" '
        f'viewBox="0 0 {width} {width}">\n'
        f'  <image href="data:image/png;base64,{b64}" width="{width}" height="{width}"/>\n'
        '</svg>\n'
    )


def main() -> None:
    mark = fit_mark(build_note_only(), 0.4256)
    bg = flat_background()
    full = Image.alpha_composite(bg, mark)
    rounded = full.copy()
    rounded.putalpha(squircle_mask(S))

    write_png(full, ROOT / "biu-icon-master-2048.png")
    write_png(full, ROOT / "biu-icon-1024.png", 1024)
    write_png(rounded, ROOT / "biu-icon-1024-rounded.png", 1024)
    for size in (512, 192, 180, 128, 64, 48):
        write_png(rounded, ROOT / f"biu-icon-{size}.png", size)
    write_png(bg, ROOT / "biu-background-1024.png", 1024)
    write_png(mark, ROOT / "biu-foreground-1024.png", 1024)
    write_png(notification_icon(mark), ROOT / "biu-notification-192.png", 192)

    write_png(rounded, PROJECT / "electron" / "icon.png", 1024)
    write_png(rounded, PROJECT / "electron" / "tray.png", 64)
    write_png(rounded, PROJECT / "src" / "assets" / "icon.png", 512)
    build_icons = PROJECT / "build" / "icons"
    for size in (16, 22, 24, 32, 48, 64, 128, 256, 512, 1024):
        write_png(rounded, build_icons / f"{size}x{size}.png", size)

    res = PROJECT / "android" / "app" / "src" / "main" / "res"
    write_png(rounded, res / "drawable" / "ic_launcher.png", 1024)
    for density, size in {
        "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
    }.items():
        write_png(rounded, res / f"mipmap-{density}" / "ic_launcher.png", size)
        write_png(rounded, res / f"mipmap-{density}" / "ic_launcher_round.png", size)
    write_png(mark, res / "drawable-nodpi" / "ic_launcher_foreground.png", 1024)
    write_png(bg, res / "drawable-nodpi" / "ic_launcher_background.png", 1024)
    write_png(notification_icon(mark), res / "drawable-nodpi" / "ic_stat_biu.png", 192)

    icon_svg = embedded_svg(ROOT / "biu-icon-1024-rounded.png")
    (ROOT / "biu-icon.svg").write_text(icon_svg)
    (PROJECT / "electron" / "icon.svg").write_text(icon_svg)
    (PROJECT / "electron" / "icon-small.svg").write_text(icon_svg)
    (PROJECT / "electron" / "icon-micro.svg").write_text(icon_svg)

    print("biu flat icon generated")


if __name__ == "__main__":
    main()
