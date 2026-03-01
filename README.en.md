# Lyra Music

English | [繁體中文](README.md)

A desktop music player built with Tauri 2 + Svelte 5 + Rust. Fully local offline playback with no dependency on any online services.

## Screenshots

![Main Interface - Music Library & Player](docs/images/main-player-library.png)

![Mini Player Mode](docs/images/mini-player.png)

## Why Lyra Music?

Lyra's design principles:

**Zero-dependency startup** -- The audio engine uses [rodio](https://github.com/RustAudio/rodio) (pure Rust), requiring no GStreamer, MPV, or FFmpeg. Just download the binary and run.

**Lightweight, not limited** -- Tauri 2 doesn't bundle Chromium, resulting in significantly lower memory usage compared to Electron-based solutions. Yet it retains the features most users actually need: Gapless Playback, resume playback, playlist management, metadata editing, and System Tray.

**Your music stays on your machine** -- No telemetry (no background data collection or transmission), no accounts, no network requests. MIT licensed, fully transparent source code.

## Download

Go to **[GitHub Releases](https://github.com/twtrubiks/lyra-music/releases/latest)** to download the latest version (supports AppImage, deb, rpm).

## Technical Architecture

Further reading: [Why Rust](docs/why-rust.md), [Tauri 2 Introduction](docs/tauri2-introduction.md)

| Layer | Technology | Description |
|-------|------------|-------------|
| Frontend | Svelte 5 + TypeScript | Reactive state management using Svelte 5 runes |
| Build Tool | Vite 7 | Dev server and frontend bundling |
| Desktop Framework | Tauri 2 | Native windows, system tray, IPC communication |
| Backend | Rust | Audio processing, file scanning, database operations |
| Audio Engine | rodio 0.21 | Pure Rust implementation, no need for GStreamer, MPV, or other system audio frameworks |
| Metadata Parsing | lofty 0.23 | Read/write ID3/Vorbis/MP4 tags and cover art |
| File Watching | notify 8 | Real-time folder change detection, automatic music library updates |
| Database | SQLite (rusqlite, bundled) | WAL mode, schema migration management |
| Testing | Vitest + cargo test | 10 frontend test files, 10 backend integration tests |

## Key Features

**Local music playback** -- Supports MP3, FLAC, WAV, OGG, M4A, and AAC formats. The audio engine is based on rodio with full play / pause / stop / seek controls. Volume uses quadratic curve mapping (UI 0.5 maps to actual 0.25) for a more natural listening experience.

**Gapless playback** -- Pre-decodes the next track and appends it to the same sink for seamless transitions. Does not require matching sample rates between consecutive tracks.

**Playlists & resume playback** -- Create, edit, and delete playlists with drag-and-drop reordering. Each playlist records the last played track ID and position in seconds, automatically restoring playback progress when switching playlists.

**Mini Player + System Tray** -- Press `m` to switch to a compact 420x80 window (always-on-top). System tray supports Play/Pause, previous, next, show window, and quit. Closing the window automatically minimizes to the system tray.

**Tauri 2 + Svelte 5 + Rust architecture** -- Frontend and backend communicate through 35 Tauri commands via IPC. The frontend manages state with Svelte 5 runes, while the backend handles audio decoding, file I/O, and database operations in Rust.

Other features:
- Artist / Album browse views (grid covers, search filtering, detail views)
- Track metadata editing (title, artist, album written back to file)
- Real-time folder watching (add/modify/delete automatically syncs music library)
- Column header sorting (preferences persisted), play count tracking (Most Played ranking view)
- Recursive music library scanning with automatic metadata reading and cover art caching
- Playback modes (loop/repeat-one/shuffle), instant search filtering, multi-select operations, context menu, drag-and-drop import

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust toolchain](https://rustup.rs/) (rustup)
- Tauri 2 system dependencies: see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) (macOS/Windows usually require no additional installation)

Linux (Debian/Ubuntu) additionally requires:

```
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev
```

## Installation & Running

```bash
npm install           # Install frontend dependencies
npm run tauri dev     # Development mode (starts both Vite dev server and Tauri window)
npm run tauri build   # Production build
```

Build artifacts are located in `src-tauri/target/release/bundle/`, supporting deb, AppImage (Linux), dmg (macOS), and nsis/msi (Windows).

## Testing

```bash
npm run test                    # Frontend unit tests (Vitest, 10 test files)
npm run check                   # Type checking
cd src-tauri && cargo test      # Backend integration tests (10 test files, audio tests skipped by default)
cd src-tauri && cargo test --features audio-tests  # With audio tests (requires audio device)
npm run quality                 # Code quality checks (ESLint + Prettier + Stylelint + Clippy + rustfmt)
```

## Keyboard Shortcuts

All shortcuts are disabled when an input field is focused.

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `ArrowLeft` / `ArrowRight` | Rewind / Fast-forward 5 seconds |
| `ArrowUp` / `ArrowDown` | Increase / Decrease volume by 5% (when track list is not focused) |
| `n` / `p` | Next / Previous track |
| `s` | Toggle shuffle |
| `r` | Toggle repeat mode (off / repeat-all / repeat-one) |
| `m` / `Escape` | Toggle / Exit Mini Player |
| `Ctrl+F` / `Cmd+F` | Focus search box |
| `Ctrl+A` / `Cmd+A` | Select all tracks |

**When track list is focused:**

| Key | Action |
|-----|--------|
| `ArrowUp` / `ArrowDown` | Previous / Next track |
| `Shift+ArrowUp` / `Shift+ArrowDown` | Extend selection up / down |
| `Enter` | Play focused track |
| `Home` / `End` | Jump to first / last track |

## Project Structure

```
src/                              # Frontend (Svelte 5 + TypeScript)
  lib/
    api/                          # Tauri IPC call wrappers (playback, library, playlist)
    components/                   # UI components (Player, Library, Browse, Playlist, Sidebar, Settings)
    state/                        # Reactive state management (Svelte 5 runes)
    logic/                        # Pure function logic (playback modes, shortcuts, formatting, selection, sorting)
    types/                        # TypeScript type definitions
src-tauri/                        # Backend (Rust)
  src/
    audio/                        # Audio engine (rodio sink, gapless queue)
    scanner/                      # Folder scanning & file watching (walkdir, notify)
    metadata/                     # Metadata read/write & cover art caching (lofty)
    storage/                      # SQLite database (schema v5, WAL mode)
    commands/                     # Tauri command handlers (35 IPC interfaces)
    models/                       # Data structure definitions (track, playlist, player_state)
  tests/                          # 10 integration tests
```
