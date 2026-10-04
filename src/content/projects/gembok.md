---
title: "Gembok"
description: "A privacy-first Android app that locks sensitive applications behind the device's own biometric gate."
pubDate: 2026-03-01
updated: 2026-09-10
featured: true
icon: 🔒
status: maintained
type: tool
tags:
  - android
  - kotlin
  - privacy
  - biometric
stack:
  - Kotlin
  - Jetpack Compose
  - AndroidX Biometric
  - Room
link: https://gembok.dev
---

Gembok (Indonesian for *padlock*) protects the apps you don't want anyone else to open —
messaging, banking, gallery — behind an overlay that re-arms the device biometric gate
when a protected app is launched.

## What it does

- Scans installed apps and lets you pick what to lock with a single tap.
- Uses the system `BiometricPrompt` rather than a custom lock screen — no stored
  credentials beyond the Android keystore.
- Detects when a protected app comes to the foreground and intercepts it instantly.
- Barely any memory footprint by design: the overlay is a lightweight
  `Service` + composition of the launcher activity.

## Security properties

- No PIN/password stored by the app itself; authentication is delegated to the
  hardware-backed keystore.
- Protected apps are hidden from the recent-apps carousel while locked.
- Offer support on rooted devices kept minimal — the threat model is casual access,
  not a compromised device.

It started as a personal itch (a hand-me-down phone with curious siblings) and became a
good exercise in Android lifecycle, `UsageStatsManager`, and keeping a `Service` polite
to the system's battery police.
