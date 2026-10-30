# biu · “Biu” App Icon

## Direction

Bilibili's icon language is reduced to the essentials:

- full-bleed squircle;
- hot-pink field;
- flat, heavy white wordmark;
- soft luminous horizon for depth;
- no secondary copy, no mascot, no extra logo.

The app icon is now **biu** and the Biu mark sits inside a central 60% safe area (20% minimum padding on every side) and contains exactly one word inside the
artwork: **Biu**. The blue lower field, `BUSIC` label, soundwave bars and every
other piece of lettering have been removed.

## Palette

| Role | Hex |
| --- | --- |
| Light pink | `#FFA6C7` |
| Mid pink | `#FF66A0` |
| Hot pink | `#FF488F` |
| Deep rose | `#CF185B` |
| Warm white | `#FFFFFF` |

## Files

- `biu-icon-1024-rounded.png` — main app icon, 1024×1024
- `biu-icon-1024.png` — full-bleed master for platform masking
- `biu-icon-512.png` / `-192` / `-180` / `-128` / `-64` / `-48`
- `biu-foreground-1024.png` — Android adaptive foreground, only Biu
- `biu-background-1024.png` — Android adaptive pink background
- `biu-notification-192.png` — white-alpha notification silhouette
- `biu-icon.svg` — editable vector approximation
- `biu-preview.png` — presentation sheet
- `biu-icon-master-2048.png` — supersampled master
- `generate-biu-icon.py` — reproducible Pillow generator

## Usage

Android resources have already been wired into:

- `res/mipmap-*/ic_launcher.png`
- `res/mipmap-*/ic_launcher_round.png`
- `res/mipmap-anydpi-v26/ic_launcher.xml`
- `res/drawable-nodpi/ic_launcher_foreground.png`
- `res/drawable-nodpi/ic_launcher_background.png`
- `res/drawable-nodpi/ic_stat_biu.png`

The app package is `com.unsunsk8er.biu`; local storage keys use the `biu_*` namespace. This is a separate install identity, so it does not overwrite the previous package.

## Regenerate

```bash
python3 -m venv .icon-venv
.icon-venv/bin/pip install pillow
.icon-venv/bin/python icons/generate-biu-icon.py
```


## Flat icon refresh (v77)

- Solid hot-pink field (`#FF5C93`), no gradients, glow, texture or inner shadow.
- White **Biu** wordmark.
- The icon is **note-only** (no text): a clean vector trace of the supplied
  beamed double eighth note — two heads, two stems, top beam and right hook.
  Source reference: `biu-note-source.jpg`.
- Regenerate with `.icon-venv/bin/python icons/generate-biu-icon.py`.
- Synced to `electron/icon.png`, tray, `src/assets/icon.png`, Linux icon sizes,
  Android legacy/round/adaptive resources and the notification icon.
