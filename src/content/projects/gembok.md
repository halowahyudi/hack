---
title: "Gembok"
description: "An end-to-end encrypted password manager and authenticator (TOTP) for Android — vaults stay locked on-device, and even the server can't open them."
pubDate: 2026-03-01
updated: 2026-10-05
featured: true
icon: 🔒
status: maintained
type: webapp
tags:
  - android
  - kotlin
  - security
  - encryption
  - password-manager
  - totp
stack:
  - Kotlin
  - Jetpack Compose
  - AndroidX Biometric
  - Room
  - TOTP
link: https://gembok.dev
---

Gembok (Indonesian for *padlock*) is a zero-knowledge password manager and
authenticator for Android. Passwords, PINs, card data, secure notes and TOTP
codes are encrypted on the device **before** they ever leave it — the server
only ever stores ciphertext, and holds no key to open it.

## What it does

- **Password manager** — stores passwords, PINs, card data and notes, all
  encrypted end to end before syncing.
- **Authenticator (TOTP)** — generates 2FA one-time codes in the same vault,
  supporting SHA-1/256/512, 6- or 8-digit codes and 30/60-second periods.
  Add accounts by QR scan or manually.
- **Biometric unlock** — open the vault with the device fingerprint after the
  first sign-in.
- **Category filtering** and fast add flows keep the vault usable day to day.

## Security model

- The **master password never reaches the server** in any form; all locking and
  unlocking happens on-device.
- The master password is run through a deliberately slow KDF, then derives the
  key used to encrypt the vault.
- The server stores only scrambled data — there is **no server-side password
  reset**, because the operator holds no key.
- **Emergency Kit**: on signup, users receive a Security Key and a 24-word
  recovery phrase — the only path back if the master password is lost.
- **No ads, no third-party trackers**; the app is built to be used, not watched.

## Operations

- Independently built and maintained; distributed free on Google Play.
- Multiple encryption algorithms and configurable TOTP parameters supported.
- Recovery flow and in-app master password change handled without exposing keys
  to the backend.

Built as a solo, end-to-end product — spanning Android development, applied
cryptography, key management, backend sync and release operations.
