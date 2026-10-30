#!/usr/bin/env python3
"""Generate the biu icon: a luminous sound-wave signal on a rose field.

The wave is intentionally full-bleed: it enters beyond the left edge and leaves
beyond the right edge. A same-hue gradient, a soft deep-rose shadow and a white
bloom give it depth; notification icons use the crisp core only.
"""
from __future__ import annotations

import base64
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
S = 2048
PINK = (255, 92, 147, 255)
DEEP = (176, 20, 74, 255)
WHITE = (255, 255, 255, 255)
WAVE_STROKE = 0.049  # fine core, relative to canvas
WAVE_X0 = -0.06
WAVE_X1 = 1.06
WAVE_AMPLITUDE = 0.181
WAVE_CYCLES = 2.2
WAVE_CHIRP = 0.8
WAVE_ENVELOPE = 0.70
WAVE_EDGE_ENERGY = 0.55


def squircle_mask(size: int, ratio: float = 0.225) -> Image.Image:
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1),
        radius=int(size * 4 * ratio),
        fill=255,
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def gradient_background(size: int = S) -> Image.Image:
    # Four corner colours in the same rose family; resizing gives a smooth
    # diagonal light field while the original #FF5C93 remains the centre tone.
    field = Image.new("RGBA", (2, 2), PINK)
    field.putpixel((0, 0), (255, 123, 164, 255))
    field.putpixel((1, 0), (255, 92, 147, 255))
    field.putpixel((0, 1), (249, 64, 126, 255))
    field.putpixel((1, 1), (231, 39, 105, 255))
    return field.resize((size, size), Image.Resampling.BICUBIC)


def wave_samples(size: int, steps: int = 1600):
    x0 = size * WAVE_X0
    x1 = size * WAVE_X1
    center = size / 2
    amplitude = size * WAVE_AMPLITUDE
    radius = size * WAVE_STROKE / 2
    for i in range(steps + 1):
        t = i / steps
        envelope = WAVE_EDGE_ENERGY + (1 - WAVE_EDGE_ENERGY) * math.sin(math.pi * t) ** WAVE_ENVELOPE
        x = x0 + (x1 - x0) * t
        angle = 2 * math.pi * (WAVE_CYCLES * t + WAVE_CHIRP * t * t)
        y = center + amplitude * envelope * math.sin(angle)
        yield x, y, radius


def core_mask(size: int) -> Image.Image:
    scale = 2
    mask = Image.new("L", (size * scale, size * scale), 0)
    draw = ImageDraw.Draw(mask)
    for x, y, radius in wave_samples(size):
        r = radius * scale
        cx, cy = x * scale, y * scale
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def core_mark(size: int = S) -> Image.Image:
    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    white = Image.new("RGBA", (size, size), WHITE)
    white.putalpha(core_mask(size))
    mark.alpha_composite(white)
    return mark


def glow_mark(size: int = S) -> Image.Image:
    core = core_mask(size)
    wide = core.filter(ImageFilter.GaussianBlur(size * 0.037))
    tight = core.filter(ImageFilter.GaussianBlur(size * 0.014))
    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for mask, alpha in ((wide, 0.30), (tight, 0.72)):
        layer = Image.new("RGBA", (size, size), WHITE)
        layer.putalpha(mask.point(lambda v: int(v * alpha)))
        mark.alpha_composite(layer)
    white = Image.new("RGBA", (size, size), WHITE)
    white.putalpha(core)
    mark.alpha_composite(white)
    return mark


def shadow_mark(size: int = S) -> Image.Image:
    core = core_mask(size)
    shadow = core.filter(ImageFilter.GaussianBlur(size * 0.014))
    layer = Image.new("RGBA", (size, size), DEEP)
    layer.putalpha(shadow.point(lambda v: int(v * 0.38)))
    shifted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shifted.alpha_composite(layer, (int(size * 0.010), int(size * 0.018)))
    return shifted


def notification_icon(core: Image.Image) -> Image.Image:
    cut = core.crop(core.getbbox())
    target = int(core.width * 0.78)
    cut = cut.resize((target, target), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", core.size, (0, 0, 0, 0))
    layer.alpha_composite(cut, ((core.width - target) // 2, (core.height - target) // 2))
    return layer


def write_png(image: Image.Image, path: Path, size: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if size:
        image = image.resize((size, size), Image.Resampling.LANCZOS)
    image.save(path)


def embedded_svg(png: Path) -> str:
    data = base64.b64encode(png.read_bytes()).decode("ascii")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        'viewBox="0 0 1024 1024">\n'
        f'  <image href="data:image/png;base64,{data}" width="1024" height="1024"/>\n'
        "</svg>\n"
    )


def main() -> None:
    bg = gradient_background()
    core = core_mark()
    lit = glow_mark()
    full = bg.copy()
    full.alpha_composite(shadow_mark())
    full.alpha_composite(lit)
    rounded = full.copy()
    rounded.putalpha(squircle_mask(S))

    write_png(full, ROOT / "biu-icon-master-2048.png")
    write_png(full, ROOT / "biu-icon-1024.png", 1024)
    write_png(rounded, ROOT / "biu-icon-1024-rounded.png", 1024)
    for size in (512, 192, 180, 128, 64, 48):
        write_png(rounded, ROOT / f"biu-icon-{size}.png", size)
    write_png(bg, ROOT / "biu-background-1024.png", 1024)
    write_png(lit, ROOT / "biu-foreground-1024.png", 1024)
    write_png(notification_icon(core), ROOT / "biu-notification-192.png", 192)
    write_png(rounded, ROOT / "biu-preview.png", 1024)

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
    write_png(lit, res / "drawable-nodpi" / "ic_launcher_foreground.png", 1024)
    write_png(bg, res / "drawable-nodpi" / "ic_launcher_background.png", 1024)
    write_png(notification_icon(core), res / "drawable-nodpi" / "ic_stat_biu.png", 192)

    harmony = PROJECT / "platform" / "HarmonyOSPhone"
    for media in (
        harmony / "AppScope" / "resources" / "base" / "media",
        harmony / "entry" / "src" / "main" / "resources" / "base" / "media",
    ):
        write_png(rounded, media / "app_icon.png", 1024)
        write_png(bg, media / "background.png", 1024)
        write_png(lit, media / "foreground.png", 1024)
        write_png(rounded, media / "startIcon.png", 152)

    svg = embedded_svg(ROOT / "biu-icon-1024-rounded.png")
    (ROOT / "biu-icon.svg").write_text(svg)
    for name in ("icon.svg", "icon-small.svg", "icon-micro.svg"):
        (PROJECT / "electron" / name).write_text(svg)

    print("biu luminous sound-wave icon generated")


if __name__ == "__main__":
    main()

