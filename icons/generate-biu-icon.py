#!/usr/bin/env python3
"""Generate the flat biu icon: hot-pink field + one white wave line.

The mark is deliberately one continuous line so it stays readable at 48 px and
still feels like motion/sound at 1024 px. No gradients, shadows or text.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
S = 2048
PINK = (255, 92, 147, 255)
WHITE = (255, 255, 255, 255)
WAVE_STROKE = 0.064  # relative to the canvas
WAVE_X0 = 0.16
WAVE_X1 = 0.84
WAVE_AMPLITUDE = 0.098
WAVE_CYCLES = 2.0


def squircle_mask(size: int, ratio: float = 0.225) -> Image.Image:
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1),
        radius=int(size * 4 * ratio),
        fill=255,
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def wave_points(size: int, steps: int = 240) -> list[tuple[float, float]]:
    x0 = size * WAVE_X0
    x1 = size * WAVE_X1
    center = size / 2
    amplitude = size * WAVE_AMPLITUDE
    points: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        points.append((
            x0 + (x1 - x0) * t,
            center + amplitude * math.sin(2 * math.pi * WAVE_CYCLES * t),
        ))
    return points


def wave_mask(size: int) -> Image.Image:
    scale = 2
    stroke = max(2, int(size * WAVE_STROKE))
    mask = Image.new("L", (size * scale, size * scale), 0)
    draw = ImageDraw.Draw(mask)
    points = [(round(x * scale), round(y * scale)) for x, y in wave_points(size)]
    draw.line(points, fill=255, width=stroke * scale, joint="curve")
    radius = stroke * scale / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def wave_mark(size: int = S) -> Image.Image:
    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    white = Image.new("RGBA", (size, size), WHITE)
    white.putalpha(wave_mask(size))
    mark.alpha_composite(white)
    return mark


def flat_background(size: int = S) -> Image.Image:
    return Image.new("RGBA", (size, size), PINK)


def notification_icon(mark: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", mark.size, (0, 0, 0, 0))
    cut = mark.crop(mark.getbbox())
    layer.alpha_composite(cut, ((mark.width - cut.width) // 2, (mark.height - cut.height) // 2))
    return layer


def write_png(image: Image.Image, path: Path, size: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if size:
        image = image.resize((size, size), Image.Resampling.LANCZOS)
    image.save(path)


def svg_icon() -> str:
    view = 1024
    points = wave_points(view)
    path = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in points)
    stroke = round(view * WAVE_STROKE)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{view}" height="{view}" viewBox="0 0 {view} {view}">
  <rect width="{view}" height="{view}" rx="225" fill="#FF5C93"/>
  <path d="{path}" fill="none" stroke="#FFFFFF" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''


def main() -> None:
    bg = flat_background()
    mark = wave_mark()
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
    write_png(mark, res / "drawable-nodpi" / "ic_launcher_foreground.png", 1024)
    write_png(bg, res / "drawable-nodpi" / "ic_launcher_background.png", 1024)
    write_png(notification_icon(mark), res / "drawable-nodpi" / "ic_stat_biu.png", 192)

    harmony = PROJECT / "platform" / "HarmonyOSPhone"
    for media in (
        harmony / "AppScope" / "resources" / "base" / "media",
        harmony / "entry" / "src" / "main" / "resources" / "base" / "media",
    ):
        write_png(rounded, media / "app_icon.png", 1024)
        write_png(bg, media / "background.png", 1024)
        write_png(mark, media / "foreground.png", 1024)
        write_png(rounded, media / "startIcon.png", 152)

    svg = svg_icon()
    (ROOT / "biu-icon.svg").write_text(svg)
    for name in ("icon.svg", "icon-small.svg", "icon-micro.svg"):
        (PROJECT / "electron" / name).write_text(svg)

    print("biu wave icon generated")


if __name__ == "__main__":
    main()
