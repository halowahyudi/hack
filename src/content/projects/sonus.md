---
title: "Sonus"
description: "A free, local-first music player in Rust that streams audio from YouTube Music via yt-dlp, with a retro pixel-art desktop GUI — no ads, no accounts, no cost."
pubDate: 2026-10-15
updated: 2026-10-19
featured: true
icon: 🎵
status: active
type: webapp
tags:
  - rust
  - desktop
  - audio
  - open-source
  - yt-dlp
  - egui
stack:
  - Rust
  - egui / eframe
  - rodio
  - SQLite (rusqlite)
  - yt-dlp
  - ffmpeg
repo: https://github.com/halowahyudi/sonus-music
---

Sonus is a local-first desktop music player that streams audio from YouTube Music
using yt-dlp — no ads, no accounts, no cost. It features a retro pixel-art GUI
built with egui, a 10-band equalizer, recommendation radio, and a SQLite-backed
library. Cross-platform: Linux, Windows, and macOS.

## Features

- **YouTube Music search** — music only, no vlogs or random videos
- **Recommendation radio** — keeps playing after your queue ends, falling back
  to your listening history when the network radio fails
- **Native desktop GUI** — egui + eframe with pixel-art styling, no browser engine
- **8 built-in themes** — Winamp Green, Osaka Jade, Amber CRT, C64, Midnight,
  Tokyo Night, Solarized Dark, Gruvbox — plus custom TOML themes
- **10-band equalizer** — with presets, running in the audio pipeline
- **Library** — SQLite-backed tracks, playlists, favourites, play history
- **Low memory** — streams instead of hoarding; audio is never fully downloaded

## Architecture

A Cargo workspace of 8 crates, each with a single responsibility:

```
crates/
  sonus-core/     Shared types: Track, Queue, Playlist, Theme
  sonus-deps/     Downloads/verifies/updates yt-dlp & ffmpeg binaries
  sonus-ytdlp/    yt-dlp subprocess: search, radio, metadata, streaming
  sonus-audio/    Playback engine (rodio), ring buffer, EQ, spectrum
  sonus-library/  SQLite library: tracks, playlists, history, favourites
  sonus-cache/    LRU file cache for audio data
  sonus-gui/      GUI: pixel-art widgets, views, theme manager
  sonus/          Binary entry point and CLI
```

### How playback works

Audio flows `yt-dlp → ffmpeg → ring buffer → rodio`. The GUI owns the queue and
decides what plays next; `AudioEngine` is not `Send` (rodio's output stream holds
platform-specific handles), so it lives on a dedicated audio thread and the GUI
talks to it over a channel. A pre-roll gate holds the sink until enough audio has
buffered, so the clock never runs ahead of the sound.

## Distribution

Prebuilt packages for every release: Windows installer (Inno Setup) + portable
zip, Debian `.deb`, Fedora `.rpm`, macOS `.app` bundle, and an AUR `PKGBUILD`.
The GUI can also self-install `yt-dlp` and `ffmpeg` on first launch — no terminal
required.

## Engineering highlights

- Custom pixel-art widget set (seven-segment display, spectrum analyzer, beveled
  panels, retro sliders) rendered entirely through egui's paint API
- SHA-256 verification of downloaded dependency binaries
- Offline-aware radio that degrades gracefully from network recommendations to
  local listening history
- Custom TOML theme format with automatic derivation of bevel/dim/shade variants
