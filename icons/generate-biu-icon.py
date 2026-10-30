#!/usr/bin/env python3
"""Build the watermark-free biu logo and sync it to every platform.

Source: icons/source-logo-ai.png (AI reference with a bottom-right watermark).
The white b / ring / dot is extracted, the watermark corner is ignored, and a
clean 45-degree long shadow is rebuilt from the mark's silhouette.
"""
from __future__ import annotations

import base64
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
S = 1024
BG = (251, 114, 153, 255)      # #FB7299
SHADOW = (224, 81, 124, 255)   # #E0517C
WHITE = (255, 255, 255, 255)


def squircle_mask(size: int, ratio: float = 0.225) -> Image.Image:
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1),
        radius=int(size * 4 * ratio),
        fill=255,
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def extract_mark() -> Image.Image:
    a = np.array(Image.open(ROOT / "source-logo-ai.png").convert("RGBA")).astype(np.float32)
    r, g, b, al = [a[:, :, i] for i in range(4)]
    mn = np.minimum(np.minimum(r, g), b)
    alpha = np.clip((mn - 175) / 80, 0, 1)
    # The watermark lives in the bottom-right; the mark ends well before it.
    alpha[900:, 840:] = 0
    alpha *= np.clip(al / 255, 0, 1)
    return Image.fromarray((alpha * 255).astype(np.uint8))


def silhouette(mark: Image.Image) -> Image.Image:
    hard = mark.point(lambda v: 255 if v > 128 else 0)
    inv = hard.point(lambda v: 255 - v)
    flood = inv.copy()
    ImageDraw.floodfill(flood, (0, 0), 128)
    holes = flood.point(lambda v: 255 if v == 255 else 0)
    return Image.fromarray(np.maximum(np.array(hard), np.array(holes)).astype(np.uint8))


def long_shadow(mark: Image.Image) -> Image.Image:
    shadow = Image.new("L", (S, S), 0)
    body = silhouette(mark)
    for d in range(1, 260):
        shadow.paste(body, (d, d), body)
    return shadow.filter(ImageFilter.GaussianBlur(0.65))


def build() -> tuple[Image.Image, Image.Image, Image.Image]:
    mark = extract_mark()
    shadow = long_shadow(mark)

    shadow_layer = Image.new("RGBA", (S, S), SHADOW)
    shadow_layer.putalpha(shadow)

    white = Image.new("RGBA", (S, S), WHITE)
    white.putalpha(mark)
    foreground = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    foreground.alpha_composite(shadow_layer)
    foreground.alpha_composite(white)

    background = Image.new("RGBA", (S, S), BG)
    full = Image.alpha_composite(background, foreground)
    rounded = full.copy()
    rounded.putalpha(squircle_mask(S))
    return full, rounded, foreground


def notification(mark: Image.Image) -> Image.Image:
    cut = mark.crop(mark.getbbox())
    target = int(S * 0.78)
    cut = cut.resize((target, target), Image.Resampling.LANCZOS)
    white = Image.new("RGBA", (target, target), WHITE)
    white.putalpha(cut)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.alpha_composite(white, ((S - target) // 2, (S - target) // 2))
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
    full, rounded, foreground = build()
    mark = extract_mark()
    background = Image.new("RGBA", (S, S), BG)

    write_png(full, ROOT / "biu-icon-master-2048.png", 2048)
    write_png(full, ROOT / "biu-icon-1024.png", 1024)
    write_png(rounded, ROOT / "biu-icon-1024-rounded.png", 1024)
    for size in (512, 192, 180, 128, 64, 48):
        write_png(rounded, ROOT / f"biu-icon-{size}.png", size)
    write_png(background, ROOT / "biu-background-1024.png", 1024)
    write_png(foreground, ROOT / "biu-foreground-1024.png", 1024)
    write_png(notification(mark), ROOT / "biu-notification-192.png", 192)
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
    write_png(foreground, res / "drawable-nodpi" / "ic_launcher_foreground.png", 1024)
    write_png(background, res / "drawable-nodpi" / "ic_launcher_background.png", 1024)
    write_png(notification(mark), res / "drawable-nodpi" / "ic_stat_biu.png", 192)

    harmony = PROJECT / "platform" / "HarmonyOSPhone"
    for media in (
        harmony / "AppScope" / "resources" / "base" / "media",
        harmony / "entry" / "src" / "main" / "resources" / "base" / "media",
    ):
        write_png(rounded, media / "app_icon.png", 1024)
        write_png(background, media / "background.png", 1024)
        write_png(foreground, media / "foreground.png", 1024)
        write_png(rounded, media / "startIcon.png", 152)

    svg = embedded_svg(ROOT / "biu-icon-1024-rounded.png")
    (ROOT / "biu-icon.svg").write_text(svg)
    for name in ("icon.svg", "icon-small.svg", "icon-micro.svg"):
        (PROJECT / "electron" / name).write_text(svg)

    print("biu negative-space b logo generated")


if __name__ == "__main__":
    main()
