<div align="center">
  <img src="./src/assets/icon.png" width="112" height="112" alt="biu Logo" />
  <h1>biu</h1>
  <p>
    <strong>Turn Bilibili into a polished, Huawei Music-inspired desktop music library.</strong>
  </p>
  <p>
    <a href="./README.md">中文</a>
    ·
    <a href="#-getting-started">Getting Started</a>
    ·
    <a href="#-harmonyos-pc">HarmonyOS PC</a>
    ·
  </p>
  <p>
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-45-47848F?style=for-the-badge&logo=electron&logoColor=fff" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=fff" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=fff" />
    <img alt="HarmonyOS" src="https://img.shields.io/badge/HarmonyOS-PC-D81E06?style=for-the-badge" />
  </p>
</div>

<br />

<div align="center">
  <table>
    <tr>
      <td align="center" width="25%">
        <h3>Huawei Music Inspired</h3>
        <p>Huawei red, rounded cards, dark immersive player, custom frameless title bar with a square outer frame.</p>
      </td>
      <td align="center" width="25%">
        <h3>Bilibili Source</h3>
        <p>Search, recommendations, rankings, creators, music-like tracks.</p>
      </td>
      <td align="center" width="25%">
        <h3>Desktop Player</h3>
        <p>Tray, queue, playlists, lyrics, persisted playback state.</p>
      </td>
      <td align="center" width="25%">
        <h3>HarmonyOS PC</h3>
        <p>Dedicated Electron adaptation for HarmonyOS desktop behavior.</p>
      </td>
    </tr>
  </table>
</div>

<br />

<div align="center">
  <pre>
┌──────────────────────────────────────────────────────────────┐
│                        biu                             │
│  Recommend · Search · Queue · Lyrics · Playlists · HarmonyOS  │
└──────────────────────────────────────────────────────────────┘
  </pre>
</div>

## Table of Contents

- [Vision](#-vision)
- [Experience Highlights](#-experience-highlights)
- [Feature Map](#-feature-map)
- [Interface Design](#-interface-design)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Desktop Packaging](#-desktop-packaging)
- [HarmonyOS PC](#-harmonyos-pc)
- [Project Structure](#-project-structure)
- [Persistence](#-persistence)
- [Development Notes](#-development-notes)
- [Roadmap](#-roadmap)
- [Disclaimer](#-disclaimer)

## Vision

biu is not just a simple video player wrapped in a desktop shell. Its goal is more specific: take the huge, loose, title-noisy, music-rich universe of Bilibili and shape it into something that feels like a real desktop music app.

Video titles are cleaned before lyric search. Search results become music-like track lists. Creator pages can be browsed like artist pages. Queues, favorites, recent tracks, and playlists gradually become a local library. The interface takes cues from Huawei Music: dark content surfaces, rounded cards, soft shadows, Huawei red, an optional light theme, and a custom frameless title bar with a square outer frame instead of the KDE decoration.

The project is also a cross-platform experiment. Besides regular Electron desktop packaging, it includes a HarmonyOS PC Electron project under `platform/HarmonyOS` with dedicated adaptations for tray behavior, native title buttons, frameless windows, fullscreen player interactions, and resource packaging.

## Experience Highlights

### 1. Feels Like a Music App

- Recommendations, search, playlists, and settings share one Huawei Music-inspired visual language.
- Page transitions, card hover states, player expansion, and lyric movement are animated.
- The bottom player stays compact, while the expanded player becomes immersive.
- Covers, the immersive player, rotating discs, and animated lyrics work together as one listening scene.

### 2. Turns Bilibili Videos Into Music

- Search Bilibili videos.
- Search users and browse creator spaces.
- Browse recommendations and music rankings.
- Convert video results into a unified track model that works with queue, playlists, favorites, and history.

### 3. Built for Long-Term Listening

- Recently played tracks are recorded automatically.
- Favorite tracks have their own library page.
- Custom playlists are persisted locally.
- Playlists can be imported and exported as JSON.
- Playback queue and state are restored after restart.
- The current track automatically matches its song name, artist, and album cover (NetEase / QQ Music / iTunes); it can also be re-matched manually from the player.

### 4. Deep Desktop Integration

- Bilibili search, detail, and play URLs are fetched in the renderer with WBI signing; the main process handles cookies and CORS, while login, favourites sync, lyrics, and cover lookups go through IPC.
- Closing the main window hides to tray.
- Tray state follows current playback.
- Packaging is configured for Windows, macOS, and Linux.
- HarmonyOS PC resources can be synced and prepared for HAP builds.

## Feature Map

### Search

The search page is designed as a music discovery surface, not just an input box:

- Video search and user search.
- Rounded list cards with clear hover and current-track states.
- User results can open creator-space browsing.
- Dedicated empty, loading, and error states.
- Each track supports play, play next, add to queue, and add to playlist.

### Recommendations

- Recommendation page uses Bilibili music-related content.
- Hero sections use cover art as the visual anchor.
- Track lists stay dense, readable, and quick to scan.

### Player

The bottom player includes:

- Play / pause.
- Previous / next.
- Shuffle.
- Repeat modes.
- Seekable progress.
- Volume and mute.
- Queue drawer.
- Add current track to playlist.
- Expand into the immersive player.

The immersive player includes:

- Large cover art and dynamic background.
- Rotating disc decoration.
- Lyric panel with manual lyric matching.
- Fullscreen toggle.
- Close to tray.
- Collapse back to the main interface.

### Lyrics

Bilibili titles often contain noisy words such as official MV, full version, cover, live, high quality, and more. biu processes titles before lyric search:

- Removes common video-title noise.
- Extracts quoted and bracketed candidate titles.
- Removes upload descriptions, collections, rankings, and livestream hints.
- Builds multiple search candidates.
- Scores lyric candidates by title similarity, artist, album, and duration.
- Caches both successful and failed matches.
- Supports manual lyric search and version selection.

### Playlists

- Create playlists from the sidebar.
- Configure playlist name and description.
- Playlists appear under the playlist area and in the playlist overview page.
- Tracks from any page can be added through a reusable modal.
- Playlist detail pages support play all, delete playlist, remove one track, and batch remove.
- Batch selection is only shown in edit mode to keep the default interface clean.

### Queue

- View the current queue.
- Current track has a live equalizer indicator.
- Add queued tracks to playlists.
- Remove one track from the queue.
- Enter selection mode for batch removal.

### Settings

The settings page follows Huawei Music / system-settings card groups:

- Appearance defaults to dark and supports light, dark, and system mode; Linux uses a custom frameless title bar, window controls, and a square outer frame.
- Expanded / collapsed / automatic sidebar.
- Playback quality (standard / high / lossless; the requested tier is preferred and falls back automatically).
- Auto play.
- Lyric display.
- Playlist import and export.
- Account status and QR login entry.

## Interface Design

biu aims to be expressive without becoming noisy.

| Design Element | Usage                                                          |
| -------------- | -------------------------------------------------------------- |
| Huawei Music   | Huawei red, rounded cards, dark-first, immersive player, custom frameless rounded frame |
| App Icon       | Soft squircle, cream B, star accent, simplified at small sizes |
| Typography     | Inter (OFL) for Latin, Noto Sans CJK for Chinese               |
| Surfaces       | Square edge-to-edge software frame in windowed and fullscreen modes; no outer border/shadow; inner cards stay rounded |
| Motion         | Player expansion, lyric scrolling, restrained hover feedback   |
| Dense Lists    | Track lists optimized for scanning; actions reveal on hover    |

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         React UI                              │
│ Pages · Components · Contexts · Hooks · Services              │
└──────────────────────────────┬───────────────────────────────┘
                               │ window.electronAPI
┌──────────────────────────────▼───────────────────────────────┐
│                    Electron Preload Bridge                    │
│ Bili API · Lyrics API · Window Control · Tray Control         │
└──────────────────────────────┬───────────────────────────────┘
                               │ IPC
┌──────────────────────────────▼───────────────────────────────┐
│                    Electron Main Process                      │
│ Protocol · BrowserWindow · Tray · API Proxy · Persistence     │
└──────────────────────────────┬───────────────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
┌───────▼────────┐                          ┌─────────▼─────────┐
│ Desktop Builds │                          │ HarmonyOS PC HAP   │
│ Win/macOS/Linux│                          │ platform/HarmonyOS │
└────────────────┘                          └───────────────────┘
```

### Frontend Layer

- `pages/` contains route-level pages.
- `components/` contains player, lyrics, queue, layout, and shared UI.
- `contexts/` manages playback, auth, now-playing, and add-to-playlist state.
- `services/` encapsulates Bilibili data, lyric matching, and local library storage.
- `hooks/` provides settings, theme, and lyric state logic.

### Electron Layer

- The main process registers Bilibili API, lyric API, and window-control IPC handlers.
- A custom `app://` protocol is used in production to avoid ESM/CORS issues under `file://`.
- Tray and main-window lifecycle are managed in the main process.
- `preload.cjs` exposes a limited bridge to the renderer.

### HarmonyOS PC Layer

- `scripts/prepare-harmony.mjs` syncs build outputs into the HarmonyOS project.
- `scripts/build-harmony.mjs` tries to run Hvigor to build a HAP.
- `platform/HarmonyOS/web_engine` contains HarmonyOS Electron adaptation code.
- HarmonyOS-specific behavior is guarded by `process.platform === "openharmony"`.

## Getting Started

### Requirements

- Node.js 22.12 or newer (24 LTS recommended).
- npm.
- A matching OS environment for desktop packaging.
- DevEco Studio and the HarmonyOS Electron environment for HarmonyOS PC builds.

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Start Electron

```bash
npm run electron:start
```

## Desktop Packaging

```bash
npm run electron:build
```

Artifacts are written to:

```text
release/
```

Configured targets:

- Windows: NSIS installer.
- macOS: DMG and ZIP.
- Linux: AppImage and DEB.

## HarmonyOS PC

The HarmonyOS PC Electron project is located at:

```text
platform/HarmonyOS
```

### Prepare Resources

```bash
npm run harmony:prepare
```

This command:

1. Runs `npm run build`.
2. Clears the previous HarmonyOS app resource directory.
3. Copies `dist/`.
4. Copies `dist-electron/`.
5. Writes a minimal runtime `package.json`.

Target directory:

```text
platform/HarmonyOS/web_engine/src/main/resources/resfile/resources/app
```

### Build HAP

```bash
npm run harmony:build
```

If `hvigor` or `hvigorw` is unavailable in your shell, open:

```text
platform/HarmonyOS
```

in DevEco Studio and run:

```text
Build -> Build Hap(s)/APP(s) -> Build Hap(s)
```

### HarmonyOS-Specific Behavior

| Scenario            | Handling                                                                               |
| ------------------- | -------------------------------------------------------------------------------------- |
| Platform check      | `process.platform === "openharmony"`                                                   |
| Tray icon           | Uses `electron/tray.png`                                                               |
| Tray context window | Disabled on HarmonyOS to avoid black floating popups                                   |
| Main window         | Frameless, with HarmonyOS native title buttons enabled by the adapter                  |
| Player view         | Hides native HarmonyOS title buttons and restores them afterward                       |
| Fullscreen          | Keeps player state and system fullscreen state in sync                                 |
| Resources           | AppScope and electron-module icons, splash icons, tray icons, and names are customized |

## Scripts

| Command                   | Description                              |
| ------------------------- | ---------------------------------------- |
| `npm run dev`             | Start Vite dev server                    |
| `npm run build`           | Build frontend and Electron main process |
| `npm run typecheck`       | Type-check renderer and main process     |
| `npm run verify`          | IPC/window/security static gate          |
| `npm run lint`            | ESLint (zero errors, warnings capped)    |
| `npm test`                | Vitest unit tests                        |
| `npm run check`           | typecheck + verify + lint + tests        |
| `npm run preview`         | Preview frontend build                   |
| `npm run electron:start`  | Build and start Electron                 |
| `npm run electron:build`  | Package desktop installers               |
| `npm run harmony:prepare` | Build and sync HarmonyOS resources       |
| `npm run harmony:build`   | Sync resources and try building HAP      |

## Project Structure

```text
biu
├─ electron/
│  ├─ main.ts                Electron main process
│  ├─ updater.ts             electron-updater integration
│  ├─ preload.cjs            Renderer bridge
│  ├─ biliApi.ts             Bilibili API proxy
│  ├─ lyricsApi.ts           Lyrics API proxy
│  ├─ icon.png               Desktop app icon
│  └─ tray.png               HarmonyOS tray icon
├─ src/
│  ├─ assets/                Frontend assets
│  ├─ components/            Player, queue, lyrics, layout, shared UI
│  ├─ contexts/              Playback, auth, now-playing, playlist modal state
│  ├─ hooks/                 Theme, settings, lyrics hooks
│  ├─ pages/                 Search, recommendations, playlists, downloads, settings
│  ├─ services/              Bilibili data, lyric matching, local storage
│  ├─ styles/                Global styles and Huawei Music design system
│  └─ types/                 Electron bridge and domain types
├─ scripts/
│  ├─ prepare-harmony.mjs    Sync HarmonyOS app resources
│  └─ build-harmony.mjs      Try Hvigor HAP build
├─ platform/HarmonyOS/       HarmonyOS PC Electron project
├─ dist/                     Frontend build output
├─ dist-electron/            Electron build output
└─ release/                  Desktop package output
```

## Persistence

biu stores:

- Current track.
- Playback queue.
- Playback progress.
- Volume, mute, shuffle, repeat.
- Recently played tracks.
- Favorites.
- Custom playlists.
- Lyric cache and manually selected matches.
- Theme and settings.
- Basic logged-in user display information.

Storage locations:

- `localStorage`: frontend state, library data, playlists, lyric cache.
- Electron `userData`: desktop data such as downloads.

## Development Notes

### Title Cleaning and Lyric Matching

Lyric matching lives in `src/services/lyrics.ts`. It performs:

- Unicode normalization.
- Common video-noise removal.
- Quoted-title extraction.
- Upload-description, collection, ranking, and livestream hint removal.
- Multiple keyword generation.
- Candidate scoring by similarity, artist, album, and duration.

### Playback State

Playback state lives in `src/contexts/PlayerContext.tsx`:

- Queue.
- Current track.
- Playing state.
- Volume.
- Progress.
- Shuffle and repeat.
- Auto play.
- Tray state sync.

### Playlists

Playlist behavior is split across services and UI:

- `src/utils/storage.ts` persists playlists (with a HarmonyOS persistent mirror).
- `Sidebar` creates playlists.
- `AddToPlaylistContext` provides the reusable add modal.
- `Playlists` handles overview, detail, and batch editing.

### Window Strategy

Window behavior lives mainly in `electron/main.ts`:

- Regular platforms use custom window buttons.
- HarmonyOS PC uses native title buttons.
- Closing the window hides it to tray.
- Production loads the renderer from `app://local/index.html`.
- The immersive player requests native title buttons to be hidden.

## Roadmap

- [ ] More complete local download management.
- [ ] Configurable lyric sources and fallback.
- [ ] More accurate Bilibili audio-quality selection.
- [ ] Editable playlist covers.
- [ ] Listening statistics.
- [ ] Mini player.
- [ ] Further HarmonyOS PC behavior refinement.
- [ ] More complete automated tests.

## Contributing

Issues, suggestions, and pull requests are welcome. This project is strongly experience-driven, so UI quality, motion, cross-platform behavior, lyric matching, and stability all matter.

Before submitting changes, at least run:

```bash
npm run build
```

If you changed HarmonyOS resources or adapters:

```bash
npm run harmony:prepare
```

Then rebuild and verify in DevEco Studio.

## Disclaimer

### SteamOS stability mode

On some SteamOS 3.9 / AMD Radeon 680M / Mesa 26.x / KWin 6.7 combinations, Electron GPU composition and KWin's OpenGL context can conflict: VSync failures, lost GL context, and in the worst case a full-system black-screen freeze. Since biu 1.2.1 Linux defaults to a stability profile:

- On Wayland sessions the app uses a native Wayland window with Chromium `text-input-v3`, so IBus and Fcitx5 Rime can enter CJK text in the search box; Linux uses the custom frameless title bar; KWin only manages the window.
- Electron hardware acceleration is disabled; the app uses software rendering.
- The Linux tray uses a native menu instead of a transparent always-on-top popup window.
- Background rendering is throttled while hidden.
- Expensive blur/backdrop effects are disabled in software mode.
- Diagnostics are written to `~/.config/biu/logs/biu.log`.
- Set `BIU_ENABLE_GPU=1` only for debugging; it is not recommended for daily use.

If the IME candidate window does not appear, make sure Plasma's input method is set to the IBus/Fcitx5 instance you are running. To troubleshoot a native Wayland window, force XWayland with `BIU_OZONE_PLATFORM=x11`.

If a black screen still occurs, inspect `journalctl -b -1 -k | grep -iE "amdgpu|drm|gpu|timeout|reset"` and the KWin logs; the local logs showed KWin GL warnings before biu started and a freeze after opening KWin Overview, which points to a KWin/Mesa-level issue as well.

biu is intended for learning, research, and personal use. It is not affiliated with, endorsed by, or commercially connected to Bilibili, Huawei, Huawei Music, or any related service provider. The interface is an independent implementation with no official assets. The project does not bundle audio, video, or lyric resources.

Please respect platform terms, copyright rules, and local laws. Do not use this project for copyright infringement, platform abuse, or bypassing service restrictions.

## License

biu source code is released under the [MIT License](./LICENSE). Third-party components, fonts, and Huawei-provided materials under `platform/HarmonyOS` are described in [NOTICE](./NOTICE).

## Author

Designed and built by MikannQAQ.

