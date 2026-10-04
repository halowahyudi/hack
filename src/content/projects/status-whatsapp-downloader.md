---
title: "WhatsApp Status Downloader"
description: "An offline-first Android app that saves view-once and regular WhatsApp statuses to local storage."
pubDate: 2025-08-19
updated: 2026-05-30
icon: 📥
status: archived
type: tool
tags:
  - android
  - whatsapp
  - javascript
  - webview
stack:
  - Java
  - WebView
  - AndroidManifest
repo: https://github.com/halowahyudi/status-whatsapp-downloader
---

A small utility that watches the WhatsApp Media folder and mirrors non-expiring
statuses into the user's own storage. Everything stays on-device — no accounts, no
uploads, no analytics.

## Lessons

This was the project that taught me the most about Android's storage permissions
drama across Android versions, and why the platform keeps tightening access to
shared media. Porting it taught me to plan for `MediaStore` as the one blessed path
and to stop depending on raw path access.

## Status

Archived — view-once statuses were removed from what this can reach, and chasing
WhatsApp's constant format changes stopped being worth the effort. The interesting
bits (background watching, `FileObserver`, gallery-style UI from `RecyclerView`)
live on in other projects.