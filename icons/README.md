# biu · Wave App Icon

## Direction

- Full-bleed / squircle hot-pink field (`#FF5C93`), no gradients or shadows.
- One continuous white **sound-wave pulse**:
  - amplitude envelope: quiet at both tails, strong through the middle;
  - three oscillations with a gentle frequency rise;
  - variable stroke weight: thin tails, bold center.
- No text, note glyph, mascot or secondary marks.
- The pulse remains readable at 48 px and feels like motion/sound at 1024 px.

## Palette

| Role | Hex |
| --- | --- |
| Background | `#FF5C93` |
| Wave | `#FFFFFF` |

## Files

- `biu-icon-1024-rounded.png` — main app icon, 1024×1024
- `biu-icon-1024.png` — full-bleed master for platform masking
- `biu-icon-512.png` / `-192` / `-180` / `-128` / `-64` / `-48`
- `biu-foreground-1024.png` — adaptive foreground, wave only
- `biu-background-1024.png` — adaptive pink background
- `biu-notification-192.png` — white-alpha notification wave
- `biu-icon.svg` — vector rounded icon with wave path
- `biu-icon-master-2048.png` — supersampled master
- `generate-biu-icon.py` — reproducible Pillow generator

## Usage

The generator syncs the wave into:

- Electron `electron/icon.png`, `tray.png`, `icon*.svg`
- Web `src/assets/icon.png`
- Linux `build/icons/*`
- Android legacy/round/adaptive resources and `ic_stat_biu.png`
- HarmonyOS `app_icon.png`, `background.png`, `foreground.png`, `startIcon.png`

## Regenerate

```bash
python3 -m venv .icon-venv
.icon-venv/bin/pip install pillow
.icon-venv/bin/python icons/generate-biu-icon.py
```
