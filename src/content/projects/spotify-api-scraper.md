---
title: "Spotify API Scraper"
description: "A lightweight Spotify metadata scraper used to power music discovery experiments without heavy SDK overhead."
pubDate: 2025-11-12
updated: 2026-08-02
featured: true
icon: ♫
status: maintained
type: automation
tags:
  - spotify
  - scraping
  - api
  - data
stack:
  - Node.js
  - TypeScript
  - Puppeteer
repo: https://github.com/halowahyudi/spotify-api-scraper
---

A pragmatic middle ground between the official Spotify Web API and raw scraping:
it talks to endpoint surfaces that are effectively public, normalizes the responses,
and hands back typed data for artists, tracks, albums, and playlists.

## Why

The official Web API is rate-limited and strictly scoped, which is fine for a product
app — but annoying for throwaway experiments like "what do trending playlists have in
common right now". This project answers that question with a tiny cache layer instead
of a streaming data pipeline.

## Design

- Pooled token handling with automatic refresh to stay under the public limits.
- Normalized response shape so downstream tools never break when Spotify moves fields.
- Ships with a `--stats` mode that summarizes a playlist's genres and energy profile.

It's a research tool, not an SDK — and it was a useful excuse to exercise
TypeScript generics with messy real-world JSON.