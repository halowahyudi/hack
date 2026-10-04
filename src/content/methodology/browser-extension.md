---
title: "Browser Extension Pentesting"
description: "Reviewing manifests and permissions, auditing content scripts and message passing, and abusing externally_connectable or extension-page XSS in authorized tests."
phase: Web
order: 13
tags:
  - browser-extension
  - client-side
  - permissions
  - xss
tools:
  - native messaging
  - manifest analysis
  - jq
updated: 2026-10-01
---

A runbook for authorized browser-extension testing. Goal: map the extension's trust boundaries, find where a web page or a message can cross into privileged extension code, and prove a concrete action.

## 1. Unpack and read the manifest

Grab the extension (Web Store CRX or local install) and inspect `manifest.json`.

```bash
# Downloaded CRX from the Chrome Web Store
mkdir ext && cd ext
unzip -o ../extension.crx -d . 2>/dev/null || true

# Summarize the permission surface
jq '{name,version,permissions,host_permissions,
     content_scripts:[.content_scripts[]?.matches],
     externally_connectable,web_accessible_resources,
     content_security_policy}' manifest.json
```

Look for `<all_urls>`, `nativeMessaging`, `cookies`, `webRequest`, `clipboardRead`, and `unsafe-eval`.

## 2. Inventory scripts and files

```bash
# List all JS/source and size, greatest first
find . -name '*.js' -printf '%s %p\n' | sort -rn

# Grep for dangerous sinks across the extension
grep -rnE 'innerHTML|insertAdjacentHTML|eval\(|document\.write|postMessage' --include='*.js' .
```

## 3. Audit content scripts

Content scripts live in an isolated world but share the page DOM.

- Check whether they read page data and forward it to the background worker unsanitized.
- Look for `innerHTML`/`eval` on DOM-derived values.
- Test whether a page can make the content script perform a privileged action.

## 4. Test message passing

The context boundary is where bugs live.

```bash
# Grep senders and receivers
grep -rnE 'onMessage|addListener|sendMessage|postMessage' --include='*.js' .
grep -rnE 'event\.origin|sender\.(id|url|origin)' --include='*.js' .
```

Watch for `postMessage` with a wildcard `targetOrigin`, receivers with no `event.origin` check, and `chrome.runtime.onMessage` handlers that trust `sender` blindly.

## 5. Probe pages, frames, and native messaging

```bash
# External origins allowed to call the extension
jq -r '.externally_connectable.matches[]?' manifest.json

# Native messaging hosts and their allowed origins
jq -r '.permissions[]?' manifest.json | grep -i native
grep -rn 'connectNative\|sendNativeMessage' --include='*.js' .
```

Extension pages (`chrome-extension://`) can host XSS if CSP is loose; `web_accessible_resources` may be framed or read by any page.

## 6. Verify and report

Demonstrate one concrete action: read a secret, issue a request as the extension, or drive a native host. Include the manifest snippet, the boundary crossing, and a minimal PoC. State whether attacker control needs a malicious page, a compromised site, or user interaction.

## Full pipeline

```bash
# 1. Unpack
unzip -o extension.crx -d ext 2>/dev/null || true
cd ext

# 2. Manifest surface
jq '{permissions,host_permissions,externally_connectable,web_accessible_resources,
     content_scripts:[.content_scripts[]?.matches]}' manifest.json

# 3. Dangerous sinks
grep -rnE 'innerHTML|insertAdjacentHTML|eval\(|document\.write' --include='*.js' .

# 4. Message-boundary bugs
grep -rnE 'postMessage|onMessage|connectNative|sendNativeMessage' --include='*.js' .

# 5. Allowed external callers
jq -r '.externally_connectable.matches[]?' manifest.json
```

## Ethics & legality

- Only assess extensions you own, have authored, or are explicitly authorized to test.
- Do not publish, redistribute, or abuse a real user's installed extension.
- Document the exact boundary crossed and keep any PoC non-destructive.
