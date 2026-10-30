# biu · Negative-Space B · Long Shadow

## Direction

- Flat Bilibili-style rose field `#FB7299`.
- White **lowercase b** formed by a thick ring, a straight stem and a
  negative-space counter; a white dot sits in the counter.
- A crisp 45° long shadow in `#E0517C` gives the mark depth without gradients.
- The bottom-right “AI生成” watermark from the reference is removed by
  extracting the white artwork and rebuilding the field/shadow from scratch.

## Palette

| Role | Hex |
| --- | --- |
| Background | `#FB7299` |
| White mark | `#FFFFFF` |
| Long shadow | `#E0517C` |

## Files

- `source-logo-ai.png` — supplied reference (watermarked; generator input)
- `biu-icon-1024-rounded.png` — main app icon
- `biu-icon-1024.png` — full-bleed square master
- `biu-icon-512.png` / `-192` / `-180` / `-128` / `-64` / `-48`
- `biu-foreground-1024.png` — transparent mark + long shadow for adaptive icons
- `biu-background-1024.png` — flat rose background
- `biu-notification-192.png` — white-alpha notification mark
- `biu-icon.svg` — embedded vector wrapper
- `generate-biu-icon.py` — watermark removal + all-platform sync

## Platforms

The generator syncs the logo into:

- Electron `electron/icon.png`, `tray.png`, `icon*.svg`
- Web `src/assets/icon.png`
- Linux `build/icons/*`
- Android legacy/round/adaptive resources and `ic_stat_biu.png`
- HarmonyOS `app_icon.png`, `background.png`, `foreground.png`, `startIcon.png`

## Regenerate

```bash
python3 -m venv .icon-venv
.icon-venv/bin/pip install pillow numpy
.icon-venv/bin/python icons/generate-biu-icon.py
```
