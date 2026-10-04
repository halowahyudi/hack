---
title: "Cookies Hacking"
description: "Understanding cookie flags, prefix rules, scope tricks, cookie tossing, session fixation, and decoding session cookies during authorized tests."
phase: Web
order: 22
tags:
  - cookies
  - session
  - authentication
  - web
tools:
  - burp suite
  - browser devtools
updated: 2026-10-01
---

A cookie testing runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: audit flags, scope, and session handling, then prove whether a cookie can be fixed, overwritten, or decoded to a privilege gain.

## 1. Capture the cookie jar

```bash
# Dump Set-Cookie headers and jar
curl -sI "https://target.com/login" | grep -i "set-cookie"
curl -s -c cookies.txt "https://target.com/login" -o /dev/null

# Inspect what was stored
cat cookies.txt | grep -v "^#" | column -t
```

## 2. Audit the flags

Decode each attribute: `Secure`, `HttpOnly`, `SameSite`, `Domain`, `Path`, `Expires`, and any `__Host-` / `__Secure-` prefix.

```bash
# Pull every Set-Cookie into a flat list
curl -s -D - "https://target.com/" -o /dev/null | grep -i "^set-cookie"

# Highlight the security-relevant attributes
curl -s -D - "https://target.com/" -o /dev/null | grep -i "^set-cookie" \
  | grep -ioE "secure|httponly|samesite=[a-z]+|domain=[^;]+|path=[^;]+|max-age=[0-9]+"
```

Red flags: session cookie without `HttpOnly`/`Secure`, `SameSite=None` without `Secure`, a too-broad `Domain`, or a `__Host-` prefixed cookie that nonetheless sets `Domain`.

## 3. Decode and analyze session cookies

Session tokens are frequently base64, JSON, or signed blobs.

```bash
# Base64 round-trip
echo "SESSIONVALUE" | base64 -d 2>/dev/null | jq . 2>/dev/null || echo "not json"

# Try common encodings and structure
printf '%s' "$SESSION" | base64 -d | xxd | head
```

Look for predictable values, timestamps, usernames, or unsigned role fields.

## 4. Scope and prefix abuse

```bash
# Test if a subdomain can set a cookie for the parent
curl -s -D - "https://sub.target.com/" -o /dev/null | grep -i "^set-cookie"

# Check whether the app accepts an attacker-set cookie value
curl -s -b "session=ATTACKERTOKEN" "https://target.com/account"
```

If a subdomain (especially a taken-over one) can set a parent-domain cookie, cookie tossing becomes viable.

## 5. Cookie tossing and fixation

```bash
# Inject a duplicate cookie and observe which one the app trusts
curl -s -b "session=INJECTED; session=LEGIT" "https://target.com/account" -o out.html
grep -io "welcome[^<]*" out.html

# Fixation: get a pre-auth session, then check if it survives login
curl -s -c pre.txt "https://target.com/" -o /dev/null
curl -s -b pre.txt -c post.txt -d "user=a&pass=b" "https://target.com/login" -o /dev/null
diff <(grep session pre.txt) <(grep session post.txt)
```

## 6. Automate with a script

```bash
# Enumerate response cookies with jq-friendly output
for u in / /login /account; do
  curl -s -D - "https://target.com$u" -o /dev/null | grep -i "^set-cookie"
done | sort -u
```

## Full pipeline

```bash
# 1. Capture cookies
curl -s -D - "https://target.com/" -o /dev/null | grep -i "^set-cookie" | tee cookies_headers.txt
curl -s -c cookies.txt "https://target.com/" -o /dev/null

# 2. Audit attributes
grep -ioE "secure|httponly|samesite=[a-z]+|domain=[^;]+|path=[^;]+" cookies_headers.txt

# 3. Decode session value
SESSION=$(grep -i session cookies.txt | awk '{print $NF}')
echo "$SESSION" | base64 -d 2>/dev/null | jq . 2>/dev/null

# 4. Scope and prefix checks
curl -s -D - "https://sub.target.com/" -o /dev/null | grep -i "^set-cookie"
curl -s -b "session=ATTACKERTOKEN" "https://target.com/account" -o out.html
grep -io "welcome[^<]*" out.html

# 5. Fixation check
curl -s -c pre.txt "https://target.com/" -o /dev/null
curl -s -b pre.txt -c post.txt -d "user=a&pass=b" "https://target.com/login" -o /dev/null
diff <(grep session pre.txt) <(grep session post.txt)
```

## Ethics & legality

- Use accounts and subdomains you control; never fixate a real user's session.
- Only test cookie scope on domains within the authorized scope.
- Do not exfiltrate or reuse live session tokens beyond the proof.
- Preserve raw request/response pairs as evidence.
